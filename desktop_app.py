import os
import sys
import time
import atexit
import threading
import webview
from webview import settings as webview_settings

# Ensure src/modules/data-injection is on Python sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_INJECTION_DIR = os.path.join(BASE_DIR, "src", "modules", "data-injection")
if DATA_INJECTION_DIR not in sys.path:
    sys.path.insert(0, DATA_INJECTION_DIR)

try:
    import vault_manager
except Exception as e:
    vault_manager = None
    print(f"[DESKTOP-APP] Warning: vault_manager could not be loaded: {e}", flush=True)

# PRE-FLIGHT PATCH 3: CHROMIUM GPU HARDWARE ACCELERATION
# Eradicate PyWebView2 software rendering fallback across all Windows environments
webview_settings["ALLOW_FILE_URLS"] = True

# Chromium command-line switches to force hardware GPU rasterization
CHROMIUM_GPU_FLAGS = [
    "--enable-gpu-rasterization",
    "--ignore-gpu-blocklist",
    "--disable-software-rasterizer",
    "--enable-zero-copy",
]

# 1. Native Windows WebView2 Runtime Environment Variable Injection
existing_wv2_args = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "")
gpu_args_str = " ".join(CHROMIUM_GPU_FLAGS)
if existing_wv2_args:
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = f"{existing_wv2_args} {gpu_args_str}"
else:
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = gpu_args_str

# 2. PyWebView EdgeChromium CreationProperties Hook
try:
    import webview.platforms.edgechromium as edgechromium
    _orig_edgechrome_init = edgechromium.EdgeChrome.__init__

    def _gpu_accelerated_edgechrome_init(self, form, window, cache_dir):
        _orig_edgechrome_init(self, form, window, cache_dir)
        if hasattr(self, "webview") and hasattr(self.webview, "CreationProperties") and self.webview.CreationProperties:
            props = self.webview.CreationProperties
            existing = getattr(props, "AdditionalBrowserArguments", "") or ""
            props.AdditionalBrowserArguments = f"{existing} {gpu_args_str}".strip()

    edgechromium.EdgeChrome.__init__ = _gpu_accelerated_edgechrome_init
except Exception:
    pass


class VaultJsApi:
    """
    Bridge API exposed to the React/TypeScript frontend via window.pywebview.api.
    Provides native Windows directory/file dialogs and executes vault management commands.
    """
    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def check_vault_status(self):
        if vault_manager:
            return vault_manager.check_vault_status()
        return {
            "status": "ERROR",
            "isHealthy": False,
            "message": "Vault management engine is not available.",
        }

    def select_folder(self, prompt="Select Folder"):
        if not self._window:
            return None
        res = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        if res and len(res) > 0:
            return res[0]
        return None

    def select_file(self, prompt="Select File"):
        if not self._window:
            return None
        file_types = (
            'Backup Files (*.zip;*.duckdb;*.db)',
            'ZIP Archives (*.zip)',
            'DuckDB Databases (*.duckdb;*.db)',
            'All Files (*.*)'
        )
        res = self._window.create_file_dialog(
            webview.OPEN_FILENAME_DIALOG,
            allow_multiple=False,
            file_types=file_types
        )
        if res and len(res) > 0:
            return res[0]
        return None

    def export_full_vault(self, target_dir=None):
        if not vault_manager:
            return {"success": False, "message": "Vault manager backend is offline."}
        if not target_dir:
            target_dir = self.select_folder("Select Destination Drive or Folder for Full Vault Backup")
            if not target_dir:
                return {"success": False, "cancelled": True, "message": "Export cancelled: No destination folder selected."}
        return vault_manager.export_full_vault(target_dir)

    def export_mail_bundle(self, target_dir=None):
        if not vault_manager:
            return {"success": False, "message": "Vault manager backend is offline."}
        if not target_dir:
            target_dir = self.select_folder("Select Destination Folder for Compressed Mail Bundle")
            if not target_dir:
                return {"success": False, "cancelled": True, "message": "Export cancelled: No destination folder selected."}
        return vault_manager.export_mail_bundle(target_dir)

    def restore_vault(self, source_path=None):
        if not vault_manager:
            return {"success": False, "message": "Vault manager backend is offline."}
        if not source_path:
            source_path = self.select_file("Select Backup ZIP Bundle or Database File")
            if not source_path:
                return {"success": False, "cancelled": True, "message": "Restore cancelled: No backup file selected."}
        return vault_manager.restore_vault(source_path)

    def restore_vault_from_folder(self, folder_path=None):
        if not vault_manager:
            return {"success": False, "message": "Vault manager backend is offline."}
        if not folder_path:
            folder_path = self.select_folder("Select Backup Folder (e.g. from Pendrive / External HDD)")
            if not folder_path:
                return {"success": False, "cancelled": True, "message": "Restore cancelled: No backup folder selected."}
        return vault_manager.restore_vault(folder_path)

    def initialize_fresh_vault(self):
        if not vault_manager:
            return {"success": False, "message": "Vault manager backend is offline."}
        return vault_manager.initialize_fresh_vault()

    def query_vault_candles(self, symbol="NIFTY 50", start_date=None, end_date=None, limit=None):
        if not vault_manager:
            return {"success": False, "candles": [], "totalCount": 0, "message": "Vault manager backend is offline."}
        return vault_manager.query_vault_candles(symbol, start_date, end_date, limit)

    def list_vault_series(self):
        if not vault_manager:
            return {"success": False, "series": [], "totalCount": 0, "message": "Vault manager backend is offline."}
        return vault_manager.list_vault_series()

    def check_vault_update(self, symbol="NIFTY 50", current_count=0, current_latest_ts=None):
        if not vault_manager:
            return {
                "success": False,
                "hasUpdate": False,
                "symbol": symbol,
                "currentCount": current_count,
                "newCount": current_count,
                "message": "Vault manager backend is offline."
            }
        return vault_manager.check_vault_update(symbol, int(current_count or 0), current_latest_ts)

    def process_drop_inbox(self):
        if not vault_manager:
            return {"success": False, "processed": 0, "rows": 0, "message": "Vault manager backend is offline."}
        return vault_manager.process_drop_inbox()

    def get_series_version(self, symbol="NIFTY 50"):
        if not vault_manager:
            return {"success": False, "symbol": symbol, "rowCount": 0, "latestTimestamp": None}
        return vault_manager.get_series_version(symbol)


def perform_startup_sync():
    """
    1/3: App Opening / Startup Sync
    Scans 01_DROP_INBOX on launch, ingests any new market data into DuckDB,
    and ensures clean zero-OHL normalization & bullion exclusion.
    """
    if not vault_manager:
        return
    try:
        print("[VAULT-SCHEDULE] Point 1/3: App Opening Sync starting...", flush=True)
        res = vault_manager.process_drop_inbox()
        print(f"[VAULT-SCHEDULE] App Opening Sync completed: {res.get('message', '')}", flush=True)
    except Exception as e:
        print(f"[VAULT-SCHEDULE] Error during startup sync: {e}", flush=True)


def start_3hour_scheduler(window_ref):
    """
    2/3: Every 3 Hours Scheduled Sync
    Runs a low-resource background daemon that waits 3 hours (10,800 seconds)
    between checks, keeping CPU and RAM consumption minimal.
    """
    THREE_HOURS_SECONDS = 3 * 60 * 60

    def _3hour_worker():
        while True:
            try:
                time.sleep(THREE_HOURS_SECONDS)
                print("[VAULT-SCHEDULE] Point 2/3: 3-Hour Scheduled Vault Sync commencing...", flush=True)
                if vault_manager:
                    res = vault_manager.process_drop_inbox()
                    print(f"[VAULT-SCHEDULE] 3-Hour Sync completed: {res.get('message', '')}", flush=True)
                    # Notify frontend if window is open
                    if window_ref and window_ref[0]:
                        try:
                            window_ref[0].evaluate_js(
                                "if (window.DataDisplayCoordinator) { window.DataDisplayCoordinator.pollVaultUpdates(); }"
                            )
                        except Exception:
                            pass
            except Exception as e:
                print(f"[VAULT-SCHEDULE] 3-Hour sync exception: {e}", flush=True)

    t = threading.Thread(target=_3hour_worker, daemon=True, name="3HourVaultSyncDaemon")
    t.start()


_has_performed_close_sync = False

def perform_close_sync():
    """
    3/3: App Closing / Shutdown Sync
    Runs a final sync on 01_DROP_INBOX when the application is closing,
    persisting any pending data before clean exit.
    """
    global _has_performed_close_sync
    if _has_performed_close_sync:
        return
    _has_performed_close_sync = True

    if not vault_manager:
        return
    try:
        print("[VAULT-SCHEDULE] Point 3/3: App Closing / Shutdown Sync starting...", flush=True)
        res = vault_manager.process_drop_inbox()
        print(f"[VAULT-SCHEDULE] App Closing Sync completed: {res.get('message', '')}", flush=True)
    except Exception as e:
        print(f"[VAULT-SCHEDULE] Error during closing sync: {e}", flush=True)


def get_entry_url():
    """
    Locates the compiled React/TypeScript frontend (dist/index.html)
    whether running from source or within a PyInstaller bundle (sys._MEIPASS).
    """
    if getattr(sys, "frozen", False):
        base_dir = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    dist_index = os.path.join(base_dir, "dist", "index.html")

    if not os.path.exists(dist_index):
        # Secondary fallback to project root dist
        fallback = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist", "index.html")
        if os.path.exists(fallback):
            dist_index = fallback
        else:
            raise FileNotFoundError(
                f"Compiled frontend not found at {dist_index}. "
                "Please run `python build_pipeline.py` to compile the TypeScript/React application."
            )

    abs_path = os.path.abspath(dist_index).replace("\\", "/")
    return f"file:///{abs_path}"


def main():
    # 1/3: App Opening / Startup Sync
    perform_startup_sync()

    # Register 3/3: App Closing / Shutdown Sync
    atexit.register(perform_close_sync)

    entry_url = get_entry_url()
    vault_api = VaultJsApi()
    window = webview.create_window(
        title="W.D. Gann Digital Drafting Desk — K&E 8x8 Fixed Coordinate Studio",
        url=entry_url,
        width=1440,
        height=900,
        min_size=(1024, 700),
        resizable=True,
        fullscreen=False,
        js_api=vault_api,
    )
    vault_api.set_window(window)

    # Window closing hook for clean shutdown
    def on_window_closing():
        perform_close_sync()

    window.events.closing += on_window_closing

    # 2/3: Start 3-Hour Scheduled Sync Daemon
    window_container = [window]
    start_3hour_scheduler(window_container)

    webview.start(gui="edgechromium")


if __name__ == "__main__":
    main()

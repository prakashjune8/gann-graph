import os
import sys
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
    webview.start(gui="edgechromium")


if __name__ == "__main__":
    main()

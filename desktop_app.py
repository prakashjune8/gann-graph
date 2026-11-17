import os
import sys
import webview
from webview import settings as webview_settings

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
    window = webview.create_window(
        title="W.D. Gann Digital Drafting Desk — K&E 8x8 Fixed Coordinate Studio",
        url=entry_url,
        width=1440,
        height=900,
        min_size=(1024, 700),
        resizable=True,
        fullscreen=False,
    )
    webview.start(gui="edgechromium")

if __name__ == "__main__":
    main()

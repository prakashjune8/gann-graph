import os
import sys
import webview

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
        fullscreen=False
    )
    webview.start()

if __name__ == "__main__":
    main()

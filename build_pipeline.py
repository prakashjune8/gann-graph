#!/usr/bin/env python3
"""
Modern Self-Bootstrapping Build Pipeline
Unifies the W.D. Gann Digital Drafting Desk architecture:
1. Bootstraps a self-contained portable Node.js LTS runtime (if host has no Node/npm).
2. Compiles TypeScript/React (src/) into an optimized static production bundle (dist/).
3. Bundles the frontend into a native standalone Windows executable with PyInstaller.
"""

import os
import sys
import shutil
import zipfile
import subprocess
import urllib.request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_DIR = os.path.join(ROOT_DIR, ".tools")
NODE_CACHE_DIR = os.path.join(TOOLS_DIR, "node")
NODE_ZIP_URL = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
DIST_DIR = os.path.join(ROOT_DIR, "dist")
ICON_PATH = os.path.join(os.path.dirname(ROOT_DIR), "gann_icon.ico")
FINAL_OUTPUT_DIR = os.path.dirname(ROOT_DIR) # D:\ANTIGRAVITY PROJECT FOLDER

def log(msg: str):
    print(f"[BUILD-PIPELINE] {msg}", flush=True)

def find_system_node():
    """Checks if node and npm are already available on the system PATH."""
    node_path = shutil.which("node")
    npm_path = shutil.which("npm")
    if node_path and npm_path:
        try:
            v = subprocess.check_output([node_path, "--version"], text=True).strip()
            log(f"Found system Node.js: {v} ({node_path})")
            return os.path.dirname(node_path)
        except Exception:
            pass
    return None

def bootstrap_portable_node():
    """Downloads and extracts a portable Node.js LTS binary into .tools/node."""
    os.makedirs(NODE_CACHE_DIR, exist_ok=True)

    # Check if already downloaded and extracted
    for root, dirs, files in os.walk(NODE_CACHE_DIR):
        if "node.exe" in files and "npm.cmd" in files:
            log(f"Using cached portable Node.js runtime: {root}")
            return root

    zip_path = os.path.join(NODE_CACHE_DIR, "node-lts.zip")
    log(f"Downloading portable Node.js LTS from {NODE_ZIP_URL}...")
    
    def reporthook(blocknum, blocksize, totalsize):
        read = blocknum * blocksize
        if totalsize > 0:
            pct = min(100.0, (read / totalsize) * 100)
            sys.stdout.write(f"\r  --> Downloading: {read / (1024*1024):.1f}MB / {totalsize / (1024*1024):.1f}MB ({pct:.1f}%)")
            sys.stdout.flush()

    urllib.request.urlretrieve(NODE_ZIP_URL, zip_path, reporthook)
    print()
    log("Download complete. Extracting archive...")

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(NODE_CACHE_DIR)

    if os.path.exists(zip_path):
        os.remove(zip_path)

    # Find the folder containing node.exe
    for root, dirs, files in os.walk(NODE_CACHE_DIR):
        if "node.exe" in files and "npm.cmd" in files:
            log(f"Extracted portable Node.js successfully to: {root}")
            return root

    raise RuntimeError("Failed to locate node.exe and npm.cmd in extracted files.")

def setup_node_environment():
    """Ensures Node.js and npm are on PATH."""
    node_dir = find_system_node()
    if not node_dir:
        node_dir = bootstrap_portable_node()

    # Prepend to PATH so child processes inherit it
    path_sep = os.pathsep
    os.environ["PATH"] = f"{node_dir}{path_sep}{os.environ.get('PATH', '')}"

    # Verify
    node_bin = shutil.which("node")
    npm_bin = shutil.which("npm")
    log(f"Active Node executable: {node_bin}")
    log(f"Active npm executable:  {npm_bin}")
    
    node_v = subprocess.check_output([node_bin, "-v"], text=True).strip()
    npm_v = subprocess.check_output([npm_bin, "-v"], shell=True, text=True).strip()
    log(f"Runtime verified: Node {node_v}, npm {npm_v}")

def compile_frontend():
    """Installs dependencies and compiles the Vite/React application."""
    log("--- Compiling React/TypeScript Frontend (src/ -> dist/) ---")
    node_modules = os.path.join(ROOT_DIR, "node_modules")

    # Install dependencies if not already present
    if not os.path.exists(node_modules):
        log("node_modules not found. Running npm install...")
        subprocess.run("npm install --no-audit --prefer-offline", shell=True, check=True, cwd=ROOT_DIR)
    else:
        log("node_modules present.")

    # Execute Vite build
    log("Executing: npm run build...")
    subprocess.run("npm run build", shell=True, check=True, cwd=ROOT_DIR)

    dist_index = os.path.join(DIST_DIR, "index.html")
    if not os.path.exists(dist_index):
        raise FileNotFoundError(f"Vite build failed to produce {dist_index}")

    dist_size = sum(
        os.path.getsize(os.path.join(dirpath, filename))
        for dirpath, dirnames, filenames in os.walk(DIST_DIR)
        for filename in filenames
    )
    log(f"[SUCCESS] Frontend compiled into dist/ ({dist_size / 1024:.1f} KB)")

def bundle_executable():
    """Bundles desktop_app.py and dist/ into a standalone Windows executable."""
    log("--- Packaging Standalone Windows Executable with PyInstaller ---")

    # Stop any running instances to avoid [WinError 5] Access is denied
    try:
        subprocess.run(
            ["powershell", "-Command", "Stop-Process -Name 'Gann_Drafting_Desk_v1' -Force -ErrorAction SilentlyContinue"],
            check=False
        )
    except Exception:
        pass

    pyinstaller_cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name=Gann_Drafting_Desk_v1",
        f"--icon={ICON_PATH}",
        f"--distpath={FINAL_OUTPUT_DIR}",
        f"--workpath={os.path.join(ROOT_DIR, 'build')}",
        f"--specpath={ROOT_DIR}",
        f"--paths={os.path.join(ROOT_DIR, 'src', 'modules', 'data-injection')}",
        "--hidden-import=vault_manager",
        "--hidden-import=duckdb",
        "--add-data=dist;dist",
        os.path.join(ROOT_DIR, "desktop_app.py")
    ]

    log(f"Running command: {' '.join(pyinstaller_cmd)}")
    subprocess.run(pyinstaller_cmd, check=True, cwd=ROOT_DIR)

    output_exe = os.path.join(FINAL_OUTPUT_DIR, "Gann_Drafting_Desk_v1.exe")
    if os.path.exists(output_exe):
        size_mb = os.path.getsize(output_exe) / (1024 * 1024)
        log(f"[SUCCESS] Standalone Executable created: {output_exe} ({size_mb:.2f} MB)")
    else:
        raise FileNotFoundError(f"PyInstaller failed to output {output_exe}")

def main():
    log("==================================================================")
    log("  W.D. GANN DRAFTING DESK — UNIFIED BUILD PIPELINE")
    log("==================================================================")
    setup_node_environment()
    compile_frontend()
    bundle_executable()
    log("==================================================================")
    log("  BUILD PIPELINE COMPLETED SUCCESSFULLY!")
    log("==================================================================")

if __name__ == "__main__":
    main()

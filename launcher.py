import os
import sys
import webbrowser
import threading
import time
from pathlib import Path

# Adjust path when running as PyInstaller frozen executable
if getattr(sys, 'frozen', False):
    bundle_dir = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
else:
    bundle_dir = Path(__file__).resolve().parent

# Ensure working directory is correct
os.chdir(bundle_dir)

import uvicorn
from app import app

def open_browser():
    time.sleep(2.5)
    webbrowser.open("http://localhost:8010")

if __name__ == "__main__":
    print("=" * 60)
    print("       ATC HUB - SOEKARNO-HATTA (WIII) SIMULATOR")
    print("=" * 60)
    print("Starting ATC Hub local server at http://localhost:8010 ...")
    
    # Launch default web browser automatically
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Start ASGI Uvicorn Server
    uvicorn.run(app, host="127.0.0.1", port=8010, log_level="info")

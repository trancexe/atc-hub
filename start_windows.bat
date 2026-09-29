@echo off
setlocal enabledelayedexpansion
title ATC Hub - WIII Simulator Launcher

echo ========================================================
echo        ATC HUB - WIII SOEKARNO-HATTA SIMULATOR
echo ========================================================
echo.

:: 1. Check Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan di sistem Windows Anda!
    echo Silakan unduh dan install Python dari: https://www.python.org/downloads/
    echo PENTING: Saat install, pastikan centang "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

:: 2. Set up virtual environment
if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Membuat Virtual Environment Python (venv)...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Gagal membuat virtual environment!
        pause
        exit /b 1
    )
)

:: 3. Activate venv
call venv\Scripts\activate.bat

:: 4. Install / Verify dependencies
echo [INFO] Memeriksa kelengkapan pustaka (dependencies)...
python -c "import fastapi, uvicorn, edge_tts" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Mengunduh dan menginstall dependencies (hanya pada run pertama)...
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Gagal menginstall dependencies! Pastikan koneksi internet aktif.
        pause
        exit /b 1
    )
)

:: 5. Open browser automatically after brief delay
start "" cmd /c "timeout /t 3 >nul && start http://localhost:8010"

:: 6. Launch ATC Hub Server
echo.
echo ========================================================
echo  Server aktif di: http://localhost:8010
echo  Tekan CTRL + C di jendela ini untuk mematikan simulator.
echo ========================================================
echo.

uvicorn app:app --host 0.0.0.0 --port 8010

pause

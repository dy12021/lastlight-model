@echo off
cd /d "%~dp0"
python serve.py --port 8911 --open
pause

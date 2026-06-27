@echo off
REM Start Sagewright via Docker Compose (Windows).

REM Run from the repo root regardless of where the script is invoked.
cd /d "%~dp0"

docker compose up --build -d

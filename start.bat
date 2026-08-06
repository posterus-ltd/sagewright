@echo off
REM Start Sagewright via Docker Compose (Windows).

REM Run from the repo root regardless of where the script is invoked.
cd /d "%~dp0"

REM Optional --reset flag: wipe the database on this startup. It sets DB_RESET,
REM which compose forwards to the control-plane; its migrate step then drops and
REM re-creates the public schema before applying migrations. DESTRUCTIVE: ALL
REM data is lost. Only affects this run — a normal start afterwards keeps the data.
if /i "%~1"=="--reset" goto reset
if /i "%~1"=="reset" goto reset
if not "%~1"=="" (
  echo Unknown argument: %~1 1>&2
  echo Usage: %~nx0 [--reset] 1>&2
  exit /b 1
)
goto run

:reset
set DB_RESET=true
echo WARNING: --reset set - the database will be wiped on startup (ALL data will be lost).

:run
docker compose --profile https up --build -d

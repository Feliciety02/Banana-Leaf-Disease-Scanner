@echo off
REM ============================================================
REM  DahonMD - Mobile API tunnel launcher (free quick tunnel)
REM
REM  1) Starts the Laravel backend on http://127.0.0.1:8001
REM  2) Starts a Cloudflare tunnel (--protocol http2 avoids the
REM     "context deadline exceeded" timeout error)
REM
REM  A fresh random URL is printed each run:
REM     https://<random>.trycloudflare.com
REM  Take it, append /api, put it in mobile-frontend\.env as
REM     EXPO_PUBLIC_API_URL=https://<random>.trycloudflare.com/api
REM  then rebuild the APK:
REM     cd mobile-frontend\android && gradlew.bat assembleRelease
REM ============================================================

where php >nul 2>&1 || (echo [ERROR] php not found in PATH & exit /b 1)
where cloudflared >nul 2>&1 || (echo [ERROR] cloudflared not found in PATH & exit /b 1)

echo Starting Laravel backend on 127.0.0.1:8001 ...
start "dahonmd-backend" /min cmd /k "cd /d "%~dp0backend" && php artisan serve --host 127.0.0.1 --port 8001"

echo.
echo Backend is starting. Now opening the Cloudflare tunnel...
echo The tunnel will keep printing connection logs. Leave this window open.
echo.
cloudflared tunnel --url http://127.0.0.1:8001 --protocol http2 --no-autoupdate
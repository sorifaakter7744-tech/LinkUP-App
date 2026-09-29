@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo LinkUp Android Setup
echo ========================================
echo.

echo [1/4] Installing dependencies...
npm install
if errorlevel 1 goto :error

echo.
echo [2/4] Building LinkUp web app...
npm run build
if errorlevel 1 goto :error

echo.
echo [3/4] Creating Android project...
if not exist android (
  npx cap add android
  if errorlevel 1 goto :error
)

echo.
echo [4/4] Syncing Android project...
npx cap sync android
if errorlevel 1 goto :error

echo.
echo ========================================
echo DONE
echo ========================================
echo Android project created in: android\
echo.
echo Next: install Android Studio, open the android folder,
echo then Build ^> Build APK(s).
echo.
pause
exit /b 0

:error
echo.
echo Setup failed. Read the error above.
pause
exit /b 1

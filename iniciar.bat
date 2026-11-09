@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Xpected necesita Node.js 18 o superior.
  echo  Descargalo gratis en https://nodejs.org, instalalo y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
echo.
echo  Iniciando Xpected en http://localhost:5173
echo  Para cerrarlo, cierra esta ventana.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173"
node server.js
pause

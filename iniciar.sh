#!/bin/sh
# Xpected · inicio en macOS y Linux:  sh iniciar.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Xpected necesita Node.js 18 o superior. Descárgalo en https://nodejs.org"
  exit 1
fi
echo "Iniciando Xpected en http://localhost:5173 (Ctrl+C para cerrar)"
( sleep 3; if command -v open >/dev/null 2>&1; then open http://localhost:5173; elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:5173; fi ) >/dev/null 2>&1 &
exec node server.js

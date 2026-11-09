/*
 * Despliegue · copia los datos actuales a lib/seed/ (datos iniciales para un servidor nuevo).
 *   node tools/actualizar-semilla.js
 * Úsalo antes de subir una versión nueva: así el servidor arranca con el historial y los parámetros al día.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const to = path.join(ROOT, 'lib', 'seed');
fs.mkdirSync(to, { recursive: true });
const pairs = [['data/lab/history.json', 'history.json'], ['data/lab/models.json', 'models.json'], ['data/track-record.json', 'track-record.json']];
let n = 0;
for (const [src, dst] of pairs) {
  const a = path.join(ROOT, src);
  if (!fs.existsSync(a)) { console.log('  · falta ' + src + ' (se omite)'); continue; }
  fs.copyFileSync(a, path.join(to, dst));
  console.log('  · ' + src + ' → lib/seed/' + dst + ' (' + Math.round(fs.statSync(a).size / 1024) + ' KB)');
  n++;
}
console.log('✓ Datos iniciales actualizados: ' + n + ' archivo(s).');

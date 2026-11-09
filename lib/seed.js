/*
 * Despliegue · datos iniciales. En un servidor nuevo, la carpeta data/ está vacía (no va al repositorio porque cambia
 * sola). Si falta algún archivo, se copia desde lib/seed/ para que el primer arranque no tenga que descargar todo el
 * historial ni recalcular los parámetros del laboratorio. Nunca sobrescribe lo que ya existe. (Vive dentro de lib/,
 * que el servidor nunca sirve al público.) Para renovarlos: node tools/actualizar-semilla.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILES = [
  ['history.json', 'lab/history.json'],
  ['models.json', 'lab/models.json'],
  ['track-record.json', 'track-record.json'],
];

module.exports = function seed(root) {
  const from = path.join(root, 'lib', 'seed'), to = path.join(root, 'data');
  if (!fs.existsSync(from)) return [];
  const copied = [];
  for (const [src, dst] of FILES) {
    const a = path.join(from, src), b = path.join(to, dst);
    try {
      if (!fs.existsSync(a) || fs.existsSync(b)) continue;
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.copyFileSync(a, b);
      copied.push(dst);
    } catch (e) { console.error('[datos iniciales] ' + dst + ': ' + e.message); }
  }
  if (copied.length) console.log('[datos iniciales] copiados: ' + copied.join(', '));
  return copied;
};

/*
 * Fase 6 · interruptores por estrategia y liga (equivale a la tabla strategy_flags del plan).
 * Estados: «apagada» (no se muestra) · «educativa» (se muestra para aprender, sin señales de valor ni alertas)
 * · «publicada» (pasó la prueba histórica). La prueba histórica (tools/lab-backtest.js) es la única que escribe aquí.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'strategy-flags.json');
const STATES = ['apagada', 'educativa', 'publicada'];

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '')); }
function save(f) { f.updatedAt = new Date().toISOString(); fs.writeFileSync(FILE, JSON.stringify(f, null, 1) + '\n'); }
/** Estado de una estrategia en una liga (la liga puede sobrescribir el estado general). */
function status(f, id, lg) {
  const s = f.strategies[id];
  if (!s) return 'apagada';
  return (lg && s.leagues && s.leagues[lg]) || s.status;
}
function set(f, id, lg, st, why) {
  if (!STATES.includes(st)) throw new Error('estado inválido: ' + st);
  const s = f.strategies[id];
  if (lg) { s.leagues = s.leagues || {}; s.leagues[lg] = st; } else s.status = st;
  if (why) { s.why = s.why || {}; s.why[lg || 'general'] = why; }
}

module.exports = { load, save, status, set, STATES, FILE };

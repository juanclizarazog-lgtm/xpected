/*
 * Fase 6 · Familia C · cuotas.
 * Estrategia 7 · movimientos fuertes: cambio de probabilidad implícita > 0,005 en 3 o más casas en ≤ 5 minutos, en la
 *   misma dirección, que sigue ahí una hora después; se marca si la casa de referencia también se movió.
 *   Con una sola casa (fuente actual) no se puede detectar: solo se muestra la línea de la casa de referencia.
 *   No hay «movimiento inverso»: requiere el porcentaje de apuestas del público, que ningún proveedor actual entrega.
 * Estrategia 8 · ¿subirá o bajará la cuota?: regresión ridge que predice la probabilidad sin margen al cierre a partir
 *   de la de apertura, la diferencia con nuestro modelo y si es el favorito (adaptación de LightGBM, ADR-002).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Q = require('../../assets/js/quant.js');

const SNAP = path.join(__dirname, '../../data/lab/odds-snapshots.json');

/**
 * snaps: [{ t (ms), book, sharp, q: [p1, pX, p2] (implícitas) }] de un partido.
 * Devuelve las señales detectadas por resultado.
 */
function detectSteam(snaps, opts) {
  const o = Object.assign({ minBooks: 3, dq: 0.005, windowMs: 5 * 60e3, holdMs: 60 * 60e3 }, opts || {});
  const books = [...new Set(snaps.map((s) => s.book))];
  if (books.length < o.minBooks) return { available: false, books: books.length, signals: [] };
  const byBook = {}; snaps.forEach((s) => { (byBook[s.book] = byBook[s.book] || []).push(s); });
  Object.values(byBook).forEach((a) => a.sort((x, y) => x.t - y.t));
  const at = (arr, t) => { let v = null; for (const s of arr) { if (s.t <= t) v = s; else break; } return v; };
  const times = [...new Set(snaps.map((s) => s.t))].sort((a, b) => a - b);
  const signals = [];
  for (let k = 0; k < 3; k++) {
    for (const t of times) {
      const moved = [];
      for (const b of books) {
        const before = at(byBook[b], t - o.windowMs), after = at(byBook[b], t);
        if (!before || !after) continue;
        const d = after.q[k] - before.q[k];
        if (Math.abs(d) > o.dq) moved.push({ b, d, sharp: after.sharp });
      }
      const up = moved.filter((x) => x.d > 0), down = moved.filter((x) => x.d < 0);
      const grp = up.length >= o.minBooks ? up : down.length >= o.minBooks ? down : null;
      if (!grp) continue;
      if (signals.some((s) => s.sel === k && Math.abs(s.t - t) < o.windowMs)) continue;
      // persiste: una hora después la mayoría sigue movida en la misma dirección
      const later = grp.filter((x) => { const a = at(byBook[x.b], t + o.holdMs), b0 = at(byBook[x.b], t - o.windowMs); return a && b0 && Math.sign(a.q[k] - b0.q[k]) === Math.sign(x.d); }).length;
      signals.push({ sel: k, t, books: grp.length, dir: grp[0].d > 0 ? 'baja' : 'sube', sharpMoved: grp.some((x) => x.sharp), persisted: t + o.holdMs <= times[times.length - 1] ? later >= o.minBooks : null });
    }
  }
  return { available: true, books: books.length, signals };
}

// ── instantáneas de la casa de referencia (para la línea de tiempo) ─────────────
let snapCache = null;
function loadSnaps() { if (snapCache) return snapCache; try { snapCache = JSON.parse(fs.readFileSync(SNAP, 'utf8')); } catch (e) { snapCache = {}; } return snapCache; }
function recordSnapshot(ev) {
  const b = (ev.books || [])[0];
  if (!b || !b.h2h || b.prematch || ev.state !== 'pre') return false;
  const db = loadSnaps();
  const arr = db[ev.id] = db[ev.id] || [];
  const q = [b.h2h.home, b.h2h.draw, b.h2h.away].map((o) => +(1 / o).toFixed(4));
  const last = arr[arr.length - 1];
  if (last && last[1] === q[0] && last[2] === q[1] && last[3] === q[2]) return false;
  arr.push([Date.now(), ...q]);
  return true;
}
function saveSnaps() {
  const db = loadSnaps(), cut = Date.now() - 4 * 86400e3;
  Object.keys(db).forEach((id) => { if (!db[id].length || db[id][db[id].length - 1][0] < cut) delete db[id]; });
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify(db));
}
/** Movimientos de la casa de referencia (no son «movimientos fuertes»: es una sola casa). */
function referenceMoves(id) {
  const arr = loadSnaps()[id] || [];
  const moves = [];
  for (let i = 1; i < arr.length; i++) for (let k = 0; k < 3; k++) {
    const d = arr[i][k + 1] - arr[i - 1][k + 1];
    if (Math.abs(d) > 0.005) moves.push({ t: arr[i][0], sel: k, d: +d.toFixed(4) });
  }
  return { points: arr, moves };
}

// ── ¿subirá o bajará? ──────────────────────────────────────────────────────────
function closingFeatures(qOpen, k, pModel) {
  const fav = qOpen.indexOf(Math.max(...qOpen)) === k ? 1 : 0;
  return [1, qOpen[k], pModel != null ? pModel - qOpen[k] : 0, fav, k === 1 ? 1 : 0];
}
function ridgeFit(X, y, lambda) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  X.forEach((x, i) => { for (let a = 0; a < p; a++) { b[a] += x[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += x[a] * x[c]; } });
  for (let a = 1; a < p; a++) A[a][a] += lambda;
  // eliminación gaussiana
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < p; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return b.map((v, i) => v / A[i][i]);
}
/** rows: [{ open: [o1,oX,o2], close: [...], pModel: [..] | null }] → coeficientes del cambio esperado (cierre − apertura). */
function trainClosing(rows) {
  const X = [], y = [];
  rows.forEach((r) => {
    const qo = Q.devigShin(r.open), qc = Q.devigShin(r.close);
    for (let k = 0; k < 3; k++) { X.push(closingFeatures(qo, k, r.pModel && r.pModel[k])); y.push(qc[k] - qo[k]); }
  });
  return X.length ? { coef: ridgeFit(X, y, 0.5), n: rows.length } : null;
}
function forecastClosing(model, odds, pModel) {
  const q = Q.devigShin(odds);
  return q.map((qk, k) => { const x = closingFeatures(q, k, pModel && pModel[k]); const d = x.reduce((s, v, j) => s + v * model.coef[j], 0); return { now: qk, close: qk + d, delta: d }; });
}
/** Frase simple: si la probabilidad sube, la cuota baja. */
function direction(delta, tol) { const t = tol || 0.004; return delta > t ? 'baje' : delta < -t ? 'suba' : 'se mantenga'; }

module.exports = { detectSteam, recordSnapshot, saveSnaps, referenceMoves, trainClosing, forecastClosing, closingFeatures, direction };

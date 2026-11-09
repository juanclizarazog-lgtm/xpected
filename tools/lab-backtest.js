/*
 * Fase 6 · prueba histórica de todas las estrategias, reportes y interruptores.
 *   node tools/lab-backtest.js            usa data/lab/history.json (créalo con: node lib/lab/history.js)
 * Escribe: docs/reports/fase6-p1.md (1, 2, 5, 9, 12, 13) · fase6-p2a.md (3, 4) · fase6-p2b.md (6, 7, 8) · fase6-p3.md (10, 11, 14)
 *          lib/lab/strategy-flags.json (publicada | educativa, semáforo por liga) · data/lab/models.json (parámetros)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../lib/lab/history.js');
const BT = require('../lib/lab/backtest.js');
const F = require('../lib/lab/flags.js');

const ROOT = path.join(__dirname, '..');
const LEAGUES = { 'col.1': 'Liga BetPlay', 'eng.1': 'Premier League', 'esp.1': 'LaLiga', 'conmebol.libertadores': 'Copa Libertadores', 'uefa.champions': 'Champions League' };
const t0 = Date.now();
const db = H.load();
if (!Object.keys(db.events).length) { console.error('✗ No hay historial. Corre primero: node lib/lab/history.js'); process.exit(1); }

const R = {};
for (const lg of Object.keys(LEAGUES)) { process.stdout.write('  · ' + LEAGUES[lg] + '… '); const a = Date.now(); R[lg] = BT.league(db, lg); console.log((Date.now() - a) + ' ms'); }

// ── interruptores ──
const flags = F.load();
const NOT_AVAILABLE = {
  '7': 'La fuente actual trae una sola casa: un movimiento fuerte exige 3 o más casas moviéndose a la vez. Sin porcentaje de apuestas del público tampoco hay movimiento inverso.',
  '14': 'Herramienta de decisión: no produce probabilidades que calificar. Se publicará cuando el historial de selecciones de valor tenga al menos 300 calificadas.',
  '10': 'La app aún no integra datos de baloncesto (NBA).',
};
for (const id of Object.keys(flags.strategies)) {
  const s = flags.strategies[id];
  s.leagues = {}; s.lights = {}; s.why = {}; s.stats = {};
  if (NOT_AVAILABLE[id]) { s.status = id === '10' ? 'apagada' : 'educativa'; s.why.general = NOT_AVAILABLE[id]; continue; }
  s.status = 'educativa';
  for (const lg of Object.keys(LEAGUES)) {
    const r = R[lg].s && R[lg].s[id];
    if (!r) { s.leagues[lg] = 'educativa'; s.lights[lg] = 'educativa'; s.why[lg] = R[lg].skip || 'Sin datos suficientes para la prueba'; continue; }
    s.leagues[lg] = r.published ? 'publicada' : 'educativa';
    s.lights[lg] = r.light;
    if (r.why) s.why[lg] = r.why;
    // números simples para «Cómo lo calculamos» (cuántos partidos se usaron en la prueba, aciertos de dirección)
    s.stats = s.stats || {};
    s.stats[lg] = { n: (r.metrics && r.metrics.n) || r.n || (r.cover && r.cover['0.1'] && r.cover['0.1'].n) || (r.combos && Object.values(r.combos)[0].real.n) || (r.corners && r.corners.n) || null,
      dirHit: r.dirHit != null ? +r.dirHit.toFixed(3) : undefined, dirN: r.dirN };
  }
}
F.save(flags);

// ── parámetros para el servidor ──
const models = { createdAt: new Date().toISOString(), leagues: {} };
Object.entries(R).forEach(([lg, r]) => { models.leagues[lg] = r.art; });
fs.writeFileSync(path.join(ROOT, 'data/lab/models.json'), JSON.stringify(models));

// ── reportes ──
const f4 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(4));
const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + ' %');
const ci = (d) => (d ? f4(d.mean) + ' [' + f4(d.lo) + ', ' + f4(d.hi) + ']' : '—');
const dec = (r) => (r ? (r.published ? '**publicada**' : 'educativa') : '—');
const lights = (id) => Object.keys(LEAGUES).map((lg) => LEAGUES[lg] + ': ' + ((flags.strategies[id].lights || {})[lg] || '—')).join(' · ');
const header = (title, ids) => '# ' + title + '\n\nGenerado por `node tools/lab-backtest.js` el ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC con `data/lab/history.json` ' +
  '(marcadores públicos de ESPN, solo desarrollo).\n\nMétodo: paso a paso en el tiempo (cada pronóstico usa solo lo anterior al partido). Comparación contra el **modelo actual** ' +
  '(`lib/model.js` con la tabla de ese día, sin cuotas). Δ = nuevo − actual (negativo = mejor), con intervalo del 95 % por remuestreo de partidos. ' +
  'Regla: se publica solo si el intervalo de Δ log loss o de Δ RPS queda entero bajo cero; si no, «educativa». Semáforo (Parte 2): alta = ECE ≤ 0,02 y n ≥ 1.000 · ' +
  'media = ECE ≤ 0,04 o 300 ≤ n < 1.000 · baja = lo demás · educativa = no publicada.\n\n' +
  '| Liga | Partición | Entrena | Prueba | Modelo actual: log loss · RPS · ECE | Casa al cierre (log loss, mismos partidos) |\n| --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).map(([lg, r]) => '| ' + LEAGUES[lg] + ' | ' + r.split + ' | ' + r.trainN + ' | ' + r.testN + ' | ' + (r.base ? f4(r.base.logloss) + ' · ' + f4(r.base.rps) + ' · ' + f4(r.base.ece) : r.skip || '—') + ' | ' +
    (r.market ? f4(r.market.logloss) + ' (actual ' + f4(r.marketCur.logloss) + ', n ' + r.market.n + ')' : '—') + ' |').join('\n') + '\n\n';
const probTable = (id) => '| Liga | n | log loss | RPS | ECE | Δ log loss vs actual | Δ RPS vs actual | Δ vs su base | Decisión | Semáforo |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).map(([lg, r]) => { const s = r.s && r.s[id]; return '| ' + LEAGUES[lg] + ' | ' + (s && s.metrics ? s.metrics.n : '—') + ' | ' + (s && s.metrics ? f4(s.metrics.logloss) + ' | ' + f4(s.metrics.rps) + ' | ' + f4(s.metrics.ece) : '— | — | —') + ' | ' + ci(s && s.dLL) + ' | ' + ci(s && s.dRPS) + ' | ' + ci(s && s.vsBase) + ' | ' + dec(s) + ' | ' + ((flags.strategies[id].lights || {})[lg] || '—') + ' |' + (s && s.why ? ' ' + s.why : ''); }).join('\n') + '\n\n';

let p1 = header('Fase 6 · Reporte P1: estrategias 1, 2, 5, 9, 12 y 13', ['1', '2', '5', '9', '12', '13']);
p1 += '## 1 · Fuerza que cambia en el tiempo (filtro de Kalman)\n\nParámetros ajustados solos con las temporadas de entrenamiento (q = deriva diaria, p0 = incertidumbre inicial, ρ = memoria entre temporadas):\n\n' +
  Object.entries(R).map(([lg, r]) => '- ' + LEAGUES[lg] + ': ' + (r.art.kalman ? 'q ' + r.art.kalman.q + ' · p0 ' + r.art.kalman.p0 + ' · ρ ' + r.art.kalman.rho : '—')).join('\n') + '\n\n' + probTable('1');
p1 += '## 2 · Pocos partidos: encogimiento hacia el promedio (Bayes empírico)\n\n' + probTable('2');
p1 += '## 5 · Altura\n\nEfecto δ por cada 1.000 m de diferencia (goles del local, escala logarítmica), estimado con el entrenamiento:\n\n' +
  Object.entries(R).map(([lg, r]) => '- ' + LEAGUES[lg] + ': ' + (r.art.altitude ? 'δ = ' + f4(r.art.altitude.delta) + ' ± ' + f4(r.art.altitude.se) + ' (' + r.art.altitude.n + ' partidos con diferencia positiva)' : 'no aplica')).join('\n') +
  '\n\nSe exige además mejorar a la fuerza en el tiempo sola (columna «Δ vs su base»).\n\n' + probTable('5');
p1 += '## 9 · Apuestas juntas del mismo partido\n\nProbabilidad conjunta sumando la matriz de marcadores (fuerza en el tiempo) frente a multiplicar las probabilidades sueltas. Log loss del evento conjunto.\n\n' +
  '| Liga | Combinación | Aciertos | log loss conjunta | log loss ingenua | Δ (conjunta − ingenua) |\n| --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).flatMap(([lg, r]) => (r.s && r.s['9'] ? Object.entries(r.s['9'].combos).map(([k, c]) => '| ' + LEAGUES[lg] + ' | ' + k + ' | ' + c.hits + '/' + c.real.n + ' | ' + f4(c.real.logloss) + ' | ' + f4(c.naive.logloss) + ' | ' + ci(c.d) + ' |') : [])).join('\n') +
  '\n\nDecisión con las tres combinaciones juntas: ' + Object.entries(R).map(([lg, r]) => LEAGUES[lg] + ' ' + (r.s && r.s['9'] ? ci(r.s['9'].d) + ' → ' + dec(r.s['9']) : '—')).join(' · ') + '\n\n';
p1 += '## 12 · Rangos de confiabilidad (conformal)\n\nSobre la probabilidad que ve el usuario (modelo actual mezclado 35/65 con la cuota de apertura). Criterio: cobertura real a ±2 puntos de la pedida.\n\n' +
  '| Liga | Calibración | n prueba | 80 % → real · tamaño medio | 90 % → real · tamaño | 95 % → real · tamaño | Decisión |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).map(([lg, r]) => { const s = r.s && r.s['12']; if (!s) return '| ' + LEAGUES[lg] + ' | — | — | — | — | — | — |'; const c = s.cover; return '| ' + LEAGUES[lg] + ' | ' + c.split + ' | ' + c['0.2'].n + ' | ' + pct(c['0.2'].coverage) + ' · ' + c['0.2'].avgSize.toFixed(2) + ' | ' + pct(c['0.1'].coverage) + ' · ' + c['0.1'].avgSize.toFixed(2) + ' | ' + pct(c['0.05'].coverage) + ' · ' + c['0.05'].avgSize.toFixed(2) + ' | ' + dec(s) + ' |'; }).join('\n') +
  '\n\nLos rangos de probabilidad («58 % (54–62 %)») salen de la incertidumbre de la fuerza en el tiempo (200 sorteos); no tienen una prueba directa porque la probabilidad verdadera no se observa.\n\n';
p1 += '## 13 · Simulador de temporada\n\n10.000 temporadas por liga con el formato de `lib/lab/formats/*.json`. Criterio: error estándar de cada porcentaje ≤ 0,5 puntos (el peor caso, p = 50 %, da exactamente 0,5). Se publica en las ligas donde su base (la fuerza en el tiempo) está publicada.\n\n' +
  '| Liga | Partidos por jugar | Simulaciones | Error estándar máx. | Tiempo | Decisión |\n| --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).filter(([, r]) => r.s && r.s['13']).map(([lg, r]) => { const s = r.s['13']; return '| ' + LEAGUES[lg] + ' | ' + s.fixtures + ' | ' + s.n + ' | ' + (s.maxSE * 100).toFixed(2) + ' pts | ' + s.ms + ' ms | ' + dec(s) + ' |'; }).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs/reports/fase6-p1.md'), p1);

let p2a = header('Fase 6 · Reporte P2a: estrategias 3 y 4', ['3', '4']);
p2a += '## 3 · Alineaciones (más-menos regularizado)\n\nNotas de jugadores con ridge sobre tramos entre cambios. Partición: ' + Object.entries(R).map(([lg, r]) => LEAGUES[lg] + ': ' + ((r.s && r.s['3'] && r.s['3'].split) || '—')).join(' · ') +
  '. Se exige mejorar al modelo actual **y** a la fuerza en el tiempo sola (Δ vs su base).\n\n' + probTable('3');
p2a += '## 4 · Por qué este porcentaje (pi-ratings + modelo ordenado + Shapley exacto)\n\nFactores: jugar en casa, nivel de los equipos (pi-ratings), forma (últimos 5), días de descanso, altura. Se mezcla con el modelo actual solo si mejora.\n\n' + probTable('4');
fs.writeFileSync(path.join(ROOT, 'docs/reports/fase6-p2a.md'), p2a);

let p2b = header('Fase 6 · Reporte P2b: estrategias 6, 7 y 8', ['6', '7', '8']);
p2b += '## 6 · Peligro de gol ahora (proceso autoexcitado)\n\nPrueba: probabilidad de gol en los 10 minutos siguientes, en los minutos 0, 10, …, 80 de cada partido, contra la misma intensidad sin «calentamiento» tras un gol o una expulsión.\n\n' +
  '| Liga | Ventanas | α · β ajustados | log loss | log loss sin calentamiento | Δ | ECE | Decisión |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).filter(([, r]) => r.s && r.s['6']).map(([lg, r]) => { const s = r.s['6']; return '| ' + LEAGUES[lg] + ' | ' + s.metrics.n + ' | ' + s.fit.alpha + ' · 1/' + Math.round(1 / s.fit.beta) + ' min | ' + f4(s.metrics.logloss) + ' | ' + f4(s.base.logloss) + ' | ' + ci(s.d) + ' | ' + f4(s.metrics.ece) + ' | ' + dec(s) + ' |'; }).join('\n') +
  '\n\nSi α = 0, los datos no muestran que un gol «caliente» el partido más allá de lo que ya explica el marcador; el termómetro queda como herramienta educativa.\n\n';
p2b += '## 7 · Movimientos fuertes de cuota\n\n' + NOT_AVAILABLE['7'] + ' El detector está implementado y probado (`tests/lab.test.js`) y se activa solo cuando haya 3 o más casas. Mientras tanto se muestra la línea de la casa de referencia.\n\n';
p2b += '## 8 · ¿Subirá o bajará la cuota? (apertura → cierre)\n\nRegresión ridge (adaptación de LightGBM). Criterio: error absoluto medio de la probabilidad de cierre menor que «la cuota no se mueve», con intervalo bajo cero.\n\n' +
  '| Liga | Partición | Entrena | Prueba | Error modelo | Error «no se mueve» | Δ | Dirección acertada (movimientos > 0,5 pts) | Decisión |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).filter(([, r]) => r.s && r.s['8'] && r.s['8'].maeModel != null).map(([lg, r]) => { const s = r.s['8']; return '| ' + LEAGUES[lg] + ' | ' + s.split + ' | ' + s.trainN + ' | ' + s.n + ' | ' + f4(s.maeModel) + ' | ' + f4(s.maeNaive) + ' | ' + ci(s.d) + ' | ' + pct(s.dirHit) + ' (n ' + s.dirN + ') | ' + dec(s) + ' |'; }).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs/reports/fase6-p2b.md'), p2b);

let p3 = header('Fase 6 · Reporte P3: estrategias 14, 10 y 11', ['10', '11', '14']);
p3 += '## 14 · Cuánto arriesgar con varias apuestas\n\nKelly con límite de caída (condición de Busseti, Ryu y Boyd evaluada exactamente sobre los 2ⁿ resultados) y luego los topes de la app (por apuesta y exposición total). Probado en `tests/lab.test.js`. ' + NOT_AVAILABLE['14'] + '\n\n';
p3 += '## 10 · Puntos de jugadores (baloncesto)\n\nMódulo preparado y **apagado** (`lib/lab/props-nba.js`): ' + NOT_AVAILABLE['10'] + '\n\n';
p3 += '## 11 · Córners y tarjetas (binomial negativa)\n\nModelo con equipos frente a «solo el promedio de la liga», log loss del total. Sin efecto árbitro: la fuente no publica el árbitro.\n\n' +
  '| Liga | Conteo | n | Δ log loss (equipos − liga) | Cobertura real del rango 80 % | Más de la línea: ECE | Decisión |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
  Object.entries(R).flatMap(([lg, r]) => (r.s && r.s['11'] ? ['corners', 'cards'].filter((k) => r.s['11'][k]).map((k) => { const s = r.s['11'][k]; return '| ' + LEAGUES[lg] + ' | ' + (k === 'corners' ? 'córners' : 'tarjetas') + ' | ' + s.n + ' | ' + ci(s.d) + ' | ' + pct(s.coverage80) + ' | ' + f4(s.over.ece) + ' | ' + (s.published ? 'mejora' : 'no mejora') + ' |'; }) : [])).join('\n') +
  '\n\nDecisión de la estrategia (exige córners y tarjetas): ' + Object.entries(R).map(([lg, r]) => LEAGUES[lg] + ' ' + dec(r.s && r.s['11'])).join(' · ') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs/reports/fase6-p3.md'), p3);

const pub = Object.entries(flags.strategies).map(([id, s]) => id + ': ' + Object.entries(s.leagues).filter(([, v]) => v === 'publicada').map(([lg]) => LEAGUES[lg]).join(', ')).filter((x) => !/: $/.test(x));
console.log('✓ Prueba histórica lista en ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s. Publicadas → ' + (pub.join(' · ') || 'ninguna') + '. Reportes en docs/reports/fase6-*.md');

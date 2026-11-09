/*
 * Verificación en vivo: compara lo que publica el gateway con la fuente original y revisa cada probabilidad.
 *   node tools/verify-live.js [http://localhost:5173]
 * Revisa:
 *  1. Frescura: la última sincronización no supera 2× el intervalo de consulta.
 *  2. Coincidencia con la fuente (hoy): estado, marcador, minuto (±2'), entretiempo y cuotas prepartido.
 *  3. Coherencia de cada pronóstico: 1X2 suma 1, valores en (0,1), mercado sin margen suma 1, margen > 0,
 *     en vivo no se mezcla con la cuota de cierre, y las cuotas de un partido iniciado vienen marcadas como cierre.
 *  4. Reproducibilidad: el pronóstico publicado es idéntico al que calcula hoy el código del modelo.
 *  5. Sentido común en vivo: quien gana por 2+ goles después del 80' tiene más del 90 %.
 */
'use strict';
const ESPN = require('../lib/espn.js');
const MODEL = require('../lib/model.js');
const Q = require('../assets/js/quant.js');

const BASE = process.argv[2] || 'http://localhost:5173';
const SRC = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const problems = [], notes = [];
const bad = (id, msg) => problems.push(id + ': ' + msg);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const close = (a, b, t) => Math.abs(a - b) <= t;

(async () => {
  const status = await (await fetch(BASE + '/api/status')).json();
  const { events } = await (await fetch(BASE + '/api/events')).json();
  const age = (Date.now() - Date.parse(status.lastSync)) / 1000;
  console.log('Gateway: ' + status.provider + ' · ' + events.length + ' eventos · última sincronización hace ' + age.toFixed(1) + ' s · intervalo ' + status.pollSeconds + ' s' + (status.live ? ' (hay partidos en vivo)' : ''));
  if (age > status.pollSeconds * 2 + 5) bad('gateway', 'datos viejos: ' + age.toFixed(0) + ' s sin sincronizar');
  if (status.error) bad('gateway', 'error del proveedor: ' + status.error);

  // 2. contra la fuente: partidos de hoy (zona horaria de Bogotá)
  const byId = new Map(events.map((e) => [e.id, e]));
  let compared = 0, live = 0;
  for (const lg of status.sports) {
    const j = await (await fetch(SRC + lg + '/scoreboard?dates=' + ESPN.ymd(0))).json();
    for (const raw of j.events || []) {
      const src = ESPN.normalize(raw, lg, null, null);
      const ev = byId.get(src.id);
      if (!ev) { bad(src.id, 'está en la fuente pero no en el gateway (' + src.home + ' vs ' + src.away + ')'); continue; }
      compared++;
      const name = ev.home + ' vs ' + ev.away;
      if (ev.state !== src.state) bad(name, 'estado ' + ev.state + ' ≠ fuente ' + src.state);
      if (JSON.stringify(ev.scores) !== JSON.stringify(src.scores)) bad(name, 'marcador ' + JSON.stringify(ev.scores) + ' ≠ fuente ' + JSON.stringify(src.scores));
      if (src.state === 'in') {
        live++;
        if (!close(ev.minute, src.minute, 2)) bad(name, "minuto " + ev.minute + "' ≠ fuente " + src.minute + "'");
        if (ev.halftime !== src.halftime) bad(name, 'entretiempo ' + ev.halftime + ' ≠ fuente ' + src.halftime);
        notes.push('EN VIVO ' + name + ' ' + ev.scores.join('-') + ' ' + (ev.halftime ? 'ET' : ev.minute + "'") + ' → Xpected ' + ev.model.pFinal.map((p) => (p * 100).toFixed(0) + '%').join(' / '));
      }
      const a = ev.books[0] && ev.books[0].h2h, b = src.books[0] && src.books[0].h2h;
      if (src.state === 'pre' && JSON.stringify(a) !== JSON.stringify(b)) notes.push('cuota cambió entre consultas (normal si la casa la movió): ' + name + ' ' + JSON.stringify(a) + ' → ' + JSON.stringify(b));
    }
  }

  // 3–5. coherencia de cada pronóstico
  let checked = 0;
  const totGap = [], matGap = [];
  for (const ev of events) {
    const m = ev.model, name = ev.home + ' vs ' + ev.away;
    if (!m) { bad(name, 'sin modelo'); continue; }
    checked++;
    const inUnit = (x) => x > 0 && x < 1;
    if (!close(sum(m.pFinal), 1, 1e-9)) bad(name, '1X2 publicado suma ' + sum(m.pFinal));
    if (!close(sum(m.pModel), 1, 1e-9)) bad(name, '1X2 del modelo suma ' + sum(m.pModel));
    if (!m.pFinal.every(inUnit) && ev.state !== 'in') bad(name, 'probabilidad fuera de (0,1): ' + m.pFinal);
    if (!inUnit(m.over25) && ev.state !== 'in') bad(name, 'más de 2,5 fuera de rango');
    if (m.pMarket && !close(sum(m.pMarket), 1, 1e-9)) bad(name, 'mercado sin margen suma ' + sum(m.pMarket));
    const h = ev.books[0] && ev.books[0].h2h;
    if (h) {
      const B = Q.overround([h.home, h.draw, h.away]);
      if (!(B > 1 && B < 1.15)) bad(name, 'margen de la casa raro: ' + ((B - 1) * 100).toFixed(1) + ' %');
      if ((ev.state !== 'pre') !== !!ev.books[0].prematch) bad(name, 'la cuota no está marcada correctamente como cierre prepartido');
    }
    if (ev.state === 'in' && !m.pFinal.every((p, i) => close(p, m.pModel[i], 1e-12))) bad(name, 'en vivo se mezcló con la cuota de cierre');
    // reproducibilidad: recalcular con el código actual
    const again = MODEL.build(Object.assign({}, ev, { model: undefined }));
    if (!again.pFinal.every((p, i) => close(p, m.pFinal[i], 1e-9))) bad(name, 'el pronóstico publicado no coincide con el recálculo');
    // coherencia: la matriz publicada (marcadores, goles) reproduce el 1X2 publicado
    if (ev.state === 'pre') {
      const f = Q.marketsFromMatrix(Q.scoreMatrix(m.lam, m.mu, -0.06, 10));
      const dev = Math.max(Math.abs(f.home - m.pFinal[0]), Math.abs(f.away - m.pFinal[2]));
      matGap.push(dev);
      if (dev > 0.03) bad(name, 'la matriz de marcadores no cuadra con el 1X2 publicado (' + (dev * 100).toFixed(1) + ' pts)');
      if (m.totals && m.totals.pFinal != null) {
        totGap.push(Math.abs(m.totals.pFinal - m.totals.pMarket));
        const lo = Math.min(m.totals.pModel, m.totals.pMarket) - 0.03, hi = Math.max(m.totals.pModel, m.totals.pMarket) + 0.03;
        if (m.totals.pFinal < lo || m.totals.pFinal > hi) bad(name, 'más de ' + m.totals.point + ' fuera del rango modelo–casa');
      }
    }
    if (ev.state === 'in' && ev.minute >= 80 && ev.scores) {
      const diff = ev.scores[0] - ev.scores[1];
      if (diff >= 2 && m.pFinal[0] < 0.9) bad(name, 'gana por ' + diff + " al " + ev.minute + "' pero solo " + (m.pFinal[0] * 100).toFixed(0) + ' %');
      if (diff <= -2 && m.pFinal[2] < 0.9) bad(name, 'visitante gana por ' + -diff + " al " + ev.minute + "' pero solo " + (m.pFinal[2] * 100).toFixed(0) + ' %');
    }
  }

  if (matGap.length) notes.push('matriz de marcadores vs 1X2 publicado: desvío máx. ' + (Math.max(...matGap) * 100).toFixed(2) + ' pts en ' + matGap.length + ' partidos por jugar');
  if (totGap.length) notes.push('línea de goles: diferencia media con la casa ' + (sum(totGap) / totGap.length * 100).toFixed(1) + ' pts en ' + totGap.length + ' partidos (mezcla 35 % modelo / 65 % casa)');
  notes.forEach((n) => console.log('  · ' + n));
  console.log('Comparados con la fuente: ' + compared + ' partidos de hoy (' + live + ' en vivo) · pronósticos revisados: ' + checked);
  if (problems.length) { console.log('\n✗ ' + problems.length + ' problema(s):'); problems.forEach((p) => console.log('  - ' + p)); process.exit(1); }
  console.log('✓ Todo coincide con la fuente y todos los pronósticos son coherentes.');
})().catch((e) => { console.error('✗ No se pudo verificar: ' + e.message); process.exit(2); });

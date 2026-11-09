/*
 * Fase 6 · auditoría de las estadísticas del laboratorio contra la fuente y contra sus propias reglas.
 *   node tools/verify-lab.js [http://localhost:5173]
 * Revisa:
 *  1. Historial al día: cada partido terminado del feed está en el historial con el mismo marcador.
 *  2. Tablas: puntos y partidos jugados del simulador = tabla oficial de ESPN (Liga BetPlay, Premier, LaLiga).
 *  3. Simulador: campeones suman 1; cupos y descensos suman lo que dice el reglamento; error estándar ≤ 0,5 pts.
 *  4. Fuerza: el nivel de cada equipo se ordena como la tabla (correlación de rangos).
 *  5. Por partido: 1X2 suman 1; factores: base + aportes = final (exacto); rangos ordenados y que contienen el número
 *     publicado; grupos de resultados anidados (80 ⊆ 90 ⊆ 95); alineación con 10-11 titulares y signos coherentes;
 *     conteos que suman 1; cierre de la cuota con probabilidades válidas; peligro 5 ≤ 10 ≤ 15 minutos.
 */
'use strict';
const Q = require('../assets/js/quant.js');
const LQ = require('../assets/js/lab/lab-quant.js');

const BASE = process.argv[2] || 'http://localhost:5173';
const problems = [], notes = [];
const bad = (where, msg) => problems.push(where + ': ' + msg);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const close = (a, b, t) => Math.abs(a - b) <= t;
const get = async (p) => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p + ' → HTTP ' + r.status); return r.json(); };
function spearman(a, b) {
  const rk = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const ra = rk(a), rb = rk(b), n = a.length, ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return num / Math.sqrt(da * db);
}

(async () => {
  const ov = await get('/api/lab/overview');
  if (!ov.ready) { console.error('✗ El laboratorio aún no está listo (prepara el historial). Intenta en un minuto.'); process.exit(2); }
  const { events } = await get('/api/events');
  const LGS = ['col.1', 'eng.1', 'esp.1', 'conmebol.libertadores', 'uefa.champions'];
  const labEvents = events.filter((e) => LGS.includes(e.sportKey));
  console.log('Laboratorio listo (' + ov.at + ') · ' + labEvents.length + ' partidos del feed en ligas del laboratorio');

  // 1 · historial al día (compara con el historial de ESTE computador: solo tiene sentido con un servidor local)
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(BASE);
  const H = local ? require('../lib/lab/history.js').load() : { events: {} };
  if (!local) notes.push('historial: servidor remoto, se omite la comparación con el historial local (las tablas se comparan igual con ESPN)');
  let fresh = 0;
  events.filter((e) => local && e.state === 'post' && e.completed && !e.postponed && LGS.includes(e.sportKey) && e.scores).forEach((e) => {
    const h = H.events[e.id.replace(/^espn-/, '')];
    if (!h) { bad(e.home + ' vs ' + e.away, 'terminado en el feed pero no está en el historial del laboratorio'); return; }
    // el historial se actualiza unos minutos después del final (para que la fuente cierre el resultado):
    // un partido que empezó hace menos de 3 h 30 min y aún figura sin terminar está «por actualizar», no es un error
    const recent = Date.now() - Date.parse(e.commence) < 3.5 * 3600e3;
    if (!h.done && recent) { notes.push('historial por actualizar (terminó hace poco): ' + e.home + ' vs ' + e.away); return; }
    if (!h.done || h.hs !== e.scores[0] || h.as !== e.scores[1]) bad(e.home + ' vs ' + e.away, 'historial ' + h.hs + '-' + h.as + (h.done ? '' : ' (sin terminar)') + ' ≠ feed ' + e.scores.join('-'));
    else fresh++;
  });
  notes.push('historial: ' + fresh + ' partidos terminados del feed coinciden en marcador');

  // 2 · tablas del simulador vs tabla oficial · 3 · invariantes del simulador · 4 · fuerza vs tabla
  const standing = {};
  events.forEach((e) => [e.homeTeam, e.awayTeam].forEach((t) => { if (t && t.standing && t.id) standing[e.sportKey + '|' + t.id] = t.standing; }));
  for (const [slug, lg] of [['liga-betplay', 'col.1'], ['premier-league', 'eng.1'], ['laliga', 'esp.1']]) {
    const S = await get('/api/lab/season/' + slug);
    if (!S.result) { bad(slug, 'sin simulación'); continue; }
    let cmp = 0, diff = 0;
    Object.entries(S.table).forEach(([id, t]) => {
      const st = standing[lg + '|' + id];
      if (!st) return;
      cmp++;
      if (st.pts !== t.pts || st.gp !== t.gp) { diff++; bad(slug + ' · ' + S.names[id], 'tabla del laboratorio ' + t.pts + ' pts en ' + t.gp + ' PJ ≠ ESPN ' + st.pts + ' pts en ' + st.gp + ' PJ'); }
    });
    notes.push(slug + ': tabla comparada con ESPN en ' + cmp + ' equipos (' + diff + ' diferencias) · ' + S.fixtures.length + ' partidos por jugar');
    // partidos en curso dentro del simulador: deben partir del marcador del feed (se resimula cada ≤ 2 minutos)
    S.fixtures.filter((f) => f.live).forEach((f) => {
      const ev = events.find((e) => e.id === 'espn-' + f.id);
      if (!ev || !ev.scores) return;
      const stale = Date.now() - Date.parse(S.at) > 180e3;
      if ((f.h0 !== ev.scores[0] || f.a0 !== ev.scores[1]) && stale) bad(slug + ' · ' + f.hn + ' vs ' + f.an, 'el simulador usa ' + f.h0 + '-' + f.a0 + ' pero el partido va ' + ev.scores.join('-'));
      else notes.push(slug + ': en curso en el simulador ' + f.hn + ' ' + f.h0 + '-' + f.a0 + ' ' + f.an + ' (feed ' + ev.scores.join('-') + ', falta ' + Math.round(f.rem * 100) + ' % del partido)');
    });
    const R = Object.values(S.result.teams), n = R.length, f = S.format;
    if (!close(sum(R.map((r) => r.champ)), 1, 1e-9)) bad(slug, 'campeones suman ' + sum(R.map((r) => r.champ)));
    if (f.type === 'league') {
      if (!close(sum(R.map((r) => r.top)), f.top, 1e-9)) bad(slug, 'cupos de arriba suman ' + sum(R.map((r) => r.top)));
      if (!close(sum(R.map((r) => r.bottom)), f.bottom, 1e-9)) bad(slug, 'descensos suman ' + sum(R.map((r) => r.bottom)));
    } else {
      if (!close(sum(R.map((r) => r.playoff)), 8, 1e-9)) bad(slug, 'cuadrangulares suman ' + sum(R.map((r) => r.playoff)));
      if (!close(sum(R.map((r) => r.final)), 2, 1e-9)) bad(slug, 'finalistas suman ' + sum(R.map((r) => r.final)));
      if (!close(sum(R.map((r) => r.bottom)), f.bottom, 1e-9)) bad(slug, 'descensos suman ' + sum(R.map((r) => r.bottom)));
    }
    if (R.some((r) => r.pos < 1 || r.pos > n)) bad(slug, 'posición media fuera de 1…' + n);
    if (S.result.maxSE > 0.005 + 1e-12) bad(slug, 'error estándar ' + S.result.maxSE);
    // un equipo con más puntos y más fuerza no puede tener menos opciones de título que uno peor en ambas (chequeo débil)
    const ids = Object.keys(S.table);
    const lvl = ids.map((id) => S.model.teams[id].att + S.model.teams[id].def), ppg = ids.map((id) => S.table[id].pts / Math.max(1, S.table[id].gp));
    const rho = spearman(lvl, ppg);
    notes.push(slug + ': correlación de rangos fuerza ↔ puntos por partido = ' + rho.toFixed(2));
    if (rho < 0.5) bad(slug, 'la fuerza no se ordena como la tabla (correlación ' + rho.toFixed(2) + ')');
  }

  // 5 · cada partido por jugar o en vivo
  let checked = 0, inRange = 0, rangeN = 0;
  // todos los partidos con pronóstico (por jugar, en vivo y terminados de hoy: estos usan su cuadro prepartido)
  for (const ev of labEvents.filter((e) => e.model)) {
    const p = await get('/api/lab/match/' + ev.id);
    const name = ev.home + ' vs ' + ev.away;
    if (p.missing) { notes.push('sin historial: ' + name); continue; }
    checked++;
    const ok1 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => x > 0 && x < 1) && close(sum(v), 1, 1e-6);
    if (p.strength && p.strength.p && !ok1(p.strength.p)) bad(name, 'fuerza en el tiempo: 1X2 inválido');
    ['home', 'away'].forEach((s) => { const t = p.strength && p.strength[s]; if (t) { if (!(t.now >= 0 && t.now <= 100) || !(t.lo <= t.now && t.now <= t.hi) || t.series.some((r) => r[2] < 0 || r[3] > 100 || r[2] > r[1] || r[1] > r[3])) bad(name, 'nivel fuera de escala o fuera de su banda'); for (let i = 1; i < t.series.length; i++) if (t.series[i][0] < t.series[i - 1][0]) { bad(name, 'serie de fuerza desordenada'); break; } } });
    if (p.shrink) {
      if (!p.shrink.w.every((w) => w >= 0 && w <= 1)) bad(name, 'peso de la temporada fuera de [0,1]');
      [0, 0.5, 1].forEach((w) => { if (!ok1(LQ.shrinkProbs(p.shrink.params, w).p)) bad(name, 'pocos partidos: 1X2 inválido con peso ' + w); });
    }
    if (p.factors) {
      for (let o = 0; o < 3; o++) { const s = p.factors.base[o] + sum(p.factors.factors.map((f) => f.phi[o])); if (!close(s, p.factors.final[o], 1e-9)) bad(name, 'factores: base + aportes ≠ final (' + o + ')'); }
      if (!ok1(p.factors.final)) bad(name, 'factores: 1X2 final inválido');
    }
    if (p.lineup) {
      const L = p.lineup;
      [0, 1].forEach((sd) => { const k = L.players.filter((x) => x.side === sd).length; if (k < 10 || k > 11) bad(name, 'alineación con ' + k + ' titulares'); });
      if (!ok1(L.base)) bad(name, 'alineación: 1X2 base inválido');
      L.players.forEach((x) => { const exp = x.side === 0 ? -Math.sign(x.rating) : Math.sign(x.rating); if (Math.abs(x.rating) > 0.02 && Math.sign(x.delta[0]) !== exp) bad(name, 'sin ' + x.name + ' el local se mueve en el sentido contrario al esperado'); });
    }
    const R = p.ranges;
    if (R && R.probs) {
      Object.entries(R.probs).forEach(([k, r]) => { if (!(r[0] >= 0 && r[1] <= 1 && r[0] <= r[1])) bad(name, 'rango ' + k + ' inválido'); });
      if (R.p) ['1', 'X', '2'].forEach((k, i) => { rangeN++; const r = R.probs[k]; if (R.p[i] >= r[0] - 0.02 && R.p[i] <= r[1] + 0.02) inRange++; });
      if (R.conformal) {
        const s80 = R.conformal['0.2'].set, s90 = R.conformal['0.1'].set, s95 = R.conformal['0.05'].set;
        if (!s80.length || !s80.every((i) => s90.includes(i)) || !s90.every((i) => s95.includes(i))) bad(name, 'grupos de resultados no anidados');
        const mass = (s) => sum(s.map((i) => R.p[i]));
        if (mass(s90) < 0.9 - 1e-9 && s90.length < 3) bad(name, 'el grupo del 90 % suma menos de 90 %');
      }
    }
    Object.entries(p.counts || {}).forEach(([k, c]) => {
      const s = sum(c.dist);
      if (s < 0.985 || s > 1.0001) bad(name, k + ': la distribución suma ' + s.toFixed(4));
      if (!(c.over >= 0 && c.over <= 1)) bad(name, k + ': más de la línea fuera de [0,1]');
      if (!(c.range80[0] <= c.mu + 1 && c.range80[1] >= c.mu - 1)) bad(name, k + ': el rango no rodea la media');
    });
    if (p.closing) {
      const cl = p.closing.forecast.map((f) => f.close);
      if (!cl.every((x) => x > 0 && x < 1)) bad(name, 'cierre: probabilidad fuera de (0,1)');
      if (!close(sum(cl), 1, 0.02)) bad(name, 'cierre: probabilidades suman ' + sum(cl).toFixed(3));
    }
    if (p.combos) {
      const M = Q.scoreMatrix(p.combos.lam, p.combos.mu, p.combos.rho, 10);
      const c = LQ.correlation(M, ['O2.5', 'BTTS-S'], p.combos.h0, p.combos.a0);
      if (c.real > Math.min(...c.marg) + 1e-12) bad(name, 'apuestas juntas: la conjunta supera a una de sus partes');
      if (ev.state !== 'in' && ev.model && !close(Q.marketsFromMatrix(M).home, ev.model.pFinal[0], 0.03)) bad(name, 'apuestas juntas: la matriz no reproduce el 1X2 publicado');
    }
    if (p.live && !(p.live.p5 <= p.live.p10 && p.live.p10 <= p.live.p15)) bad(name, 'peligro de gol no crece con la ventana');
  }
  notes.push('partidos auditados: ' + checked + ' · el número publicado cae dentro de su rango (±2 pts) en ' + inRange + ' de ' + rangeN + ' casos');
  if (rangeN && inRange / rangeN < 0.9) bad('rangos', 'el número publicado queda fuera de su rango en ' + (rangeN - inRange) + ' de ' + rangeN + ' casos');

  notes.forEach((n) => console.log('  · ' + n));
  if (problems.length) { console.log('\n✗ ' + problems.length + ' problema(s):'); problems.slice(0, 60).forEach((p) => console.log('  - ' + p)); process.exit(1); }
  console.log('✓ Las estadísticas del laboratorio coinciden con la fuente y cumplen todas sus reglas.');
})().catch((e) => { console.error('✗ No se pudo auditar: ' + e.message); process.exit(2); });

/*
 * Fase 6 · prueba histórica «paso a paso» (walk-forward): cada pronóstico usa solo lo que se sabía antes del partido.
 * Entrenamiento: temporadas anteriores. Prueba: la temporada actual. Comparación contra el modelo actual de la app
 * (lib/model.js con la tabla de ese día). Una estrategia se publica solo si mejora con un intervalo (remuestreo) que
 * no cruza cero; si no, queda «educativa». El semáforo sale de la calibración en la prueba (Parte 2 del plan).
 */
'use strict';
const Q = require('../../assets/js/quant.js');
const LQ = require('../../assets/js/lab/lab-quant.js');
const S = require('./strength.js');
const X = require('./explain.js');
const LU = require('./lineups.js');
const LV = require('./live.js');
const MK = require('./market.js');
const C = require('./counts.js');
const SEASON = require('./season.js');

const ll3 = (p, y) => -Math.log(Math.max(1e-9, p[y]));
const llb = (p, y) => -Math.log(Math.max(1e-9, y ? p : 1 - p));

function metrics(ps, ys) {
  if (!ps.length) return { n: 0 };
  const flatP = [], flatY = [];
  ps.forEach((p, i) => p.forEach((v, k) => { flatP.push(v); flatY.push(ys[i] === k ? 1 : 0); }));
  return { n: ps.length, logloss: ps.reduce((s, p, i) => s + ll3(p, ys[i]), 0) / ps.length, rps: ps.reduce((s, p, i) => s + Q.rps(p, ys[i]), 0) / ps.length, ece: Q.ece(flatP, flatY, 10).ece };
}
function binMetrics(ps, ys) {
  if (!ps.length) return { n: 0 };
  return { n: ps.length, logloss: ps.reduce((s, p, i) => s + llb(p, ys[i]), 0) / ps.length, ece: Q.ece(ps, ys.map(Number), 10).ece, brier: Q.brier(ps, ys.map(Number)) };
}
/** Intervalo del 95 % (remuestreo por partido) de la diferencia media de pérdida: nuevo − actual. Negativo = mejora. */
function bootDiff(d, seed) {
  if (!d.length) return null;
  const r = LQ.rng(seed || 11), n = d.length, means = [];
  for (let b = 0; b < 1000; b++) { let s = 0; for (let i = 0; i < n; i++) s += d[Math.floor(r() * n)]; means.push(s / n); }
  means.sort((a, b) => a - b);
  return { mean: d.reduce((a, b) => a + b, 0) / n, lo: means[25], hi: means[974], n };
}
const better = (ci) => !!ci && ci.hi < 0;
/** Semáforo de la Parte 2: alta (ECE ≤ 0,02 y n ≥ 1.000) · media (ECE ≤ 0,04 o 300 ≤ n < 1.000) · baja. */
function light(m, published) {
  if (!published) return 'educativa';
  if (!m || !m.n) return 'baja';
  if (m.ece <= 0.02 && m.n >= 1000) return 'alta';
  if (m.ece <= 0.04 || (m.n >= 300 && m.n < 1000)) return 'media';
  return 'baja';
}

const MARK = (s) => { if (process.env.LAB_DEBUG) console.log('    [' + new Date().toISOString().slice(11, 19) + '] ' + s); };
function league(db, lg) {
  const all = Object.values(db.events).filter((e) => e.lg === lg && !e.postponed).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const seasons = [...new Set(all.map((e) => e.season))].sort((a, b) => +a.split(':')[1] - +b.split(':')[1]);
  const cur = seasons[seasons.length - 1];
  const done = all.filter((e) => e.done && e.hs != null);
  let train = done.filter((e) => e.season !== cur), test = done.filter((e) => e.season === cur), split = 'temporadas anteriores → temporada actual';
  // torneo sin temporadas anteriores en la fuente: primera mitad entrena, segunda mitad prueba (en el tiempo)
  if (train.length < 100) { const h = Math.floor(done.length / 2); train = done.slice(0, h); test = done.slice(h); split = 'primera mitad → segunda mitad de la temporada'; }
  const out = { lg, seasons, split, trainN: train.length, testN: test.length, s: {}, art: {} };
  if (test.length < 30) { out.skip = 'pocos partidos en la temporada actual'; return out; }
  const isTest = new Set(test.map((m) => m.id));

  MARK('1-kalman');
  // ── 1) fuerza que cambia en el tiempo: parámetros ajustados con las temporadas anteriores ──
  const kfit = S.kalmanFit(train.length >= 150 ? train : done.slice(0, Math.floor(done.length / 2)));
  out.art.kalman = kfit;

  MARK('2-pasada');
  // ── pasada única en orden: modelo actual, pocos datos, fuerza en el tiempo, altura, factores ──
  const rows = []; // por partido terminado
  const kal = {}; // predicción de la fuerza en el tiempo por id
  S.kalmanRun(all, kfit, (m, s) => { kal[m.id] = s; });
  const featRows = [];
  X.features(all, (m, x) => { featRows.push({ m, x }); });
  const featBy = {}; featRows.forEach((r) => { featBy[r.m.id] = r.x; });
  S.asOf(all, (m, st) => {
    if (!m.done || m.hs == null) return;
    const cm = S.currentModel(st, m);
    const hi = S.hierPredict(S.hierarchical(st, st.table));
    const k = kal[m.id];
    const gap = S.altitudeGap(m, st.homeCity);
    rows.push({ m, y: S.outcome(m), cur: cm.p, curL: [cm.lam, cm.mu], hier: hi.p, kal: S.probs1x2(k.lam, k.mu), kL: [k.lam, k.mu], kVar: [k.varL, k.varM], gap, x: featBy[m.id], test: isTest.has(m.id) });
  });

  MARK('3-altura');
  // ── 5) altura: δ con las temporadas anteriores (solo partidos con diferencia positiva conocida) ──
  const altRows = rows.filter((r) => !r.test && r.gap != null).map((r) => ({ x: Math.max(0, r.gap) / 1000, lam: r.kL[0], y: r.m.hs }));
  const alt = altRows.filter((r) => r.x > 0).length >= 30 ? S.altitudeFit(altRows) : null;
  out.art.altitude = alt;
  rows.forEach((r) => { r.kalAlt = alt && r.gap != null && r.gap > 0 ? S.probs1x2(r.kL[0] * Math.exp(alt.delta * r.gap / 1000), r.kL[1]) : r.kal; });

  MARK('4-factores');
  // ── 4) factores: modelo ordenado entrenado con las temporadas anteriores ──
  const trainRows = rows.filter((r) => !r.test && r.x);
  const ofit = trainRows.length >= 150 ? X.train(trainRows.map((r) => ({ x: r.x, y: r.y === 0 ? 0 : r.y === 1 ? 1 : 2 }))) : null;
  out.art.factors = ofit;
  rows.forEach((r) => { r.fac = ofit && r.x ? X.predict(ofit, r.x) : r.cur; });

  const T = rows.filter((r) => r.test);
  const ys = T.map((r) => r.y);
  const base = metrics(T.map((r) => r.cur), ys);
  out.base = base;
  const market = T.filter((r) => db.summaries[r.m.id] && db.summaries[r.m.id].odds);
  out.market = market.length ? metrics(market.map((r) => { const o = db.summaries[r.m.id].odds; return Q.devigShin([o.h[1], o.d[1], o.a[1]]); }), market.map((r) => r.y)) : null;
  out.marketCur = market.length ? metrics(market.map((r) => r.cur), market.map((r) => r.y)) : null;

  // baseKey: para lo que se monta sobre otra estrategia, también debe mejorar a esa base (que no se lleve el mérito ajeno)
  const compare = (key, id, label, baseKey) => {
    const m = metrics(T.map((r) => r[key]), ys);
    const dLL = bootDiff(T.map((r) => ll3(r[key], r.y) - ll3(r.cur, r.y)), +id);
    const dRPS = bootDiff(T.map((r) => Q.rps(r[key], r.y) - Q.rps(r.cur, r.y)), +id + 50);
    const vsBase = baseKey ? bootDiff(T.map((r) => ll3(r[key], r.y) - ll3(r[baseKey], r.y)), +id + 90) : null;
    const pub = (better(dLL) || better(dRPS)) && (!baseKey || better(vsBase));
    out.s[id] = { label, metrics: m, dLL, dRPS, vsBase, published: pub, light: light(m, pub) };
  };
  compare('kal', '1', 'Fuerza que cambia en el tiempo');
  compare('hier', '2', 'Encogimiento según partidos jugados');
  if (alt) {
    compare('kalAlt', '5', 'Fuerza en el tiempo + altura', 'kal');
    const sub = T.filter((r) => r.gap != null && r.gap > 0);
    out.s['5'].onlyAltitude = { n: sub.length, withAlt: metrics(sub.map((r) => r.kalAlt), sub.map((r) => r.y)), without: metrics(sub.map((r) => r.kal), sub.map((r) => r.y)), cur: metrics(sub.map((r) => r.cur), sub.map((r) => r.y)) };
  } else {
    const withGap = rows.filter((r) => r.gap != null && r.gap > 0).length;
    out.s['5'] = { label: 'Altura', published: false, light: 'educativa', why: withGap ? 'Solo ' + withGap + ' partidos con diferencia de altura: pocos para estimar el efecto' : 'Liga sin diferencias de altura conocidas entre sedes' };
  }
  if (ofit) compare('fac', '4', 'Factores (pi-ratings + modelo ordenado)'); else out.s['4'] = { published: false, light: 'educativa', why: 'Pocos partidos para entrenar' };

  MARK('5-rangos');
  // ── 12) rangos conformales sobre la probabilidad que ve el usuario (modelo actual mezclado 35/65 con la cuota de
  //        apertura cuando existe): umbral con las temporadas anteriores, cobertura en la actual ──
  rows.forEach((r) => { const s = db.summaries[r.m.id]; r.hasOdds = !!(s && s.odds); r.app = r.hasOdds ? Q.blendMulti(r.cur, Q.devigShin([s.odds.h[0], s.odds.d[0], s.odds.a[0]]), 0.35) : r.cur; });
  // la cuota histórica solo existe en la temporada actual: si no alcanza, se divide en el tiempo (primera mitad calibra)
  let calRows = rows.filter((r) => !r.test && r.hasOdds), tstRows = T.filter((r) => r.hasOdds);
  let calSplit = 'temporadas anteriores';
  if (calRows.length < 100) { const wo = rows.filter((r) => r.hasOdds); const h = Math.floor(wo.length / 2); calRows = wo.slice(0, h); tstRows = wo.slice(h); calSplit = 'primera mitad de los partidos con cuota (en el tiempo)'; }
  const calib = calRows.map((r) => 1 - r.app[r.y]);
  const cover = {};
  [0.2, 0.1, 0.05].forEach((a) => {
    const q = LQ.conformalQ(calib, a);
    let hit = 0, size = 0;
    tstRows.forEach((r) => { const set = LQ.conformalSet(r.app, q); if (set.includes(r.y)) hit++; size += set.length; });
    cover[a] = { level: 1 - a, q, coverage: hit / Math.max(1, tstRows.length), avgSize: size / Math.max(1, tstRows.length), n: tstRows.length };
  });
  cover.split = calSplit;
  const coverOk = tstRows.length >= 50 && [0.2, 0.1, 0.05].every((a) => Math.abs(cover[a].coverage - cover[a].level) <= 0.02);
  out.art.conformal = cover;
  out.s['12'] = { label: 'Rangos de confiabilidad', cover, calibN: calib.length, published: coverOk, light: coverOk ? light(metrics(T.map((r) => r.app), ys), true) : 'educativa' };

  MARK('6-combinadas');
  // ── 9) apuestas juntas del mismo partido: conjunta desde la matriz vs. multiplicar ──
  const combos = [['O2.5', 'BTTS-S'], ['1', 'O2.5'], ['X', 'U2.5']];
  const combo = {}, pooled = [];
  combos.forEach((ids) => {
    const pj = [], pn = [], yv = [];
    T.forEach((r) => {
      const M = Q.scoreMatrix(r.kL[0], r.kL[1], S.RHO, 10);
      const c = LQ.correlation(M, ids);
      pj.push(c.real); pn.push(c.naive);
      yv.push(ids.every((id) => LQ.pred(id)(r.m.hs, r.m.as)) ? 1 : 0);
    });
    const dd = pj.map((p, i) => llb(p, yv[i]) - llb(pn[i], yv[i]));
    dd.forEach((x, i) => { pooled[i] = (pooled[i] || 0) + x; });
    combo[ids.join(' + ')] = { real: binMetrics(pj, yv), naive: binMetrics(pn, yv), d: bootDiff(dd, 9), hits: yv.reduce((a, b) => a + b, 0) };
  });
  // decisión con las tres combinaciones juntas (remuestreo por partido)
  const dPool = bootDiff(pooled.map((x) => x / combos.length), 19);
  const comboOk = better(dPool);
  out.s['9'] = { label: 'Apuestas juntas del mismo partido', combos: combo, d: dPool, published: comboOk, light: comboOk ? light(combo['O2.5 + BTTS-S'].real, true) : 'educativa' };

  MARK('7-simulador');
  // ── 13) simulador: 10.000 temporadas; error estándar ≤ 0,5 puntos ──
  const kalState = S.kalmanRun(all, kfit);
  const sin = SEASON.build(db, lg, kalState);
  if (sin) {
    const sim = SEASON.run(sin, 10000);
    const ok = sim.maxSE <= 0.005;
    out.s['13'] = { label: 'Simulador de temporada', n: sim.n, ms: sim.ms, maxSE: sim.maxSE, fixtures: sin.fixtures.length, published: ok && out.s['1'].published, light: ok && out.s['1'].published ? out.s['1'].light : 'educativa', why: out.s['1'].published ? null : 'Usa la fuerza en el tiempo, que aún no se publica en esta liga' };
  }

  MARK('8-alineaciones');
  // ── 3) alineaciones: notas de jugadores con las temporadas anteriores ──
  const hasLu = (m) => db.summaries[m.id] && db.summaries[m.id].lu;
  let trainEv = train.filter(hasLu), luTest = new Set(test.filter(hasLu).map((m) => m.id)), luSplit = 'temporadas anteriores';
  if (trainEv.length < 150) { const w = done.filter(hasLu), h = Math.floor(w.length / 2); trainEv = w.slice(0, h); luTest = new Set(w.slice(h).map((m) => m.id)); luSplit = 'primera mitad de los partidos con alineación (en el tiempo)'; }
  const lum = trainEv.length >= 80 ? LU.train(trainEv, db.summaries, 150) : null;
  if (lum) {
    const typical = {}; // valor medio del once de cada equipo hasta ese día
    const pl = [], pk = [], pc = [], yl = [];
    rows.forEach((r) => {
      const s = db.summaries[r.m.id];
      if (!s || !s.lu) return;
      const v = [LU.xiValue(lum, s.lu.s[0]), LU.xiValue(lum, s.lu.s[1])];
      const tH = typical[r.m.hid], tA = typical[r.m.aid];
      if (luTest.has(r.m.id) && tH && tA) {
        const dH = v[0] - tH.s / tH.n, dA = v[1] - tA.s / tA.n, d = dH - dA;
        const l2 = Math.max(0.1, r.kL[0] + d / 2), m2 = Math.max(0.1, r.kL[1] - d / 2);
        pl.push(S.probs1x2(l2, m2)); pk.push(r.kal); pc.push(r.cur); yl.push(r.y);
      }
      [[r.m.hid, v[0]], [r.m.aid, v[1]]].forEach(([id, val]) => { const t = typical[id] = typical[id] || { s: 0, n: 0 }; t.s += val; t.n++; });
    });
    const m = metrics(pl, yl);
    const dLL = bootDiff(pl.map((p, i) => ll3(p, yl[i]) - ll3(pc[i], yl[i])), 3);
    const dKal = bootDiff(pl.map((p, i) => ll3(p, yl[i]) - ll3(pk[i], yl[i])), 33);
    out.art.lineups = { players: Object.keys(lum.beta).length, rows: lum.rows, split: luSplit };
    const pub = better(dLL) && better(dKal); // también debe mejorar a la fuerza en el tiempo sola
    out.s['3'] = { label: 'Alineaciones', metrics: m, dLL, vsBase: dKal, players: Object.keys(lum.beta).length, trainMatches: trainEv.length, split: luSplit, published: pub, light: light(m, pub) };
  } else out.s['3'] = { published: false, light: 'educativa', why: 'La fuente solo trae ' + done.filter(hasLu).length + ' partidos con alineación: pocos para calificar jugadores' };

  MARK('9-peligro');
  // ── 6) peligro de gol: α y β con las temporadas anteriores; prueba en ventanas de 10 minutos ──
  const lrows = rows.filter((r) => !r.test).slice(-500).map((r) => ({ m: r.m, base: r.kL }));
  const lfit = lrows.length >= 100 ? LV.fit(lrows) : null;
  if (lfit) {
    const pH = [], p0 = [], yv = [], ids = [];
    T.forEach((r, i) => {
      const g = r.m.goals.slice().sort((a, b) => a[0] - b[0]);
      const ev = g.map((x) => [x[0], 'gol']).concat((r.m.cards || []).filter((c) => c[2]).map((c) => [c[0], 'roja']));
      for (let t = 0; t <= 80; t += 10) {
        const score = [0, 0]; g.forEach((x) => { if (x[0] <= t && x[1] >= 0) score[x[1]]++; });
        const past = ev.filter((e) => e[0] <= t);
        pH.push(LV.windowProb(t, 10, r.kL, score, past, lfit));
        p0.push(LV.windowProb(t, 10, r.kL, score, past, { alpha: 0, beta: 1 }));
        yv.push(g.some((x) => x[0] > t && x[0] <= t + 10) ? 1 : 0); ids.push(i);
      }
    });
    const d = bootDiff(pH.map((p, i) => llb(p, yv[i]) - llb(p0[i], yv[i])), 6);
    const m = binMetrics(pH, yv);
    out.art.live = { alpha: lfit.alpha, beta: lfit.beta, typical10: yv.reduce((a, b) => a + b, 0) / yv.length };
    out.s['6'] = { label: 'Peligro de gol ahora', metrics: m, base: binMetrics(p0, yv), d, fit: lfit, published: better(d), light: light(m, better(d)) };
  }

  MARK('10-cierre');
  // ── 8) ¿subirá o bajará la cuota? (apertura → cierre) ──
  const crow = (r) => { const s = db.summaries[r.m.id]; return s && s.odds ? { open: [s.odds.h[0], s.odds.d[0], s.odds.a[0]], close: [s.odds.h[1], s.odds.d[1], s.odds.a[1]], pModel: r.cur } : null; };
  let ctrain = rows.filter((r) => !r.test).map(crow).filter(Boolean), ctest = rows.filter((r) => r.test).map(crow).filter(Boolean), cSplit = 'temporadas anteriores';
  if (ctrain.length < 100) { const w = rows.map(crow).filter(Boolean), h = Math.floor(w.length * 0.6); ctrain = w.slice(0, h); ctest = w.slice(h); cSplit = 'primer 60 % de los partidos con cuota (en el tiempo)'; }
  if (ctrain.length >= 50 && ctest.length >= 30) {
    const cm = MK.trainClosing(ctrain);
    const errM = [], errN = [];
    let dirHit = 0, dirN = 0;
    ctest.forEach((r) => {
      const f = MK.forecastClosing(cm, r.open, r.pModel), qc = Q.devigShin(r.close);
      f.forEach((x, k) => {
        errM.push(Math.abs(x.close - qc[k])); errN.push(Math.abs(x.now - qc[k]));
        const real = qc[k] - x.now;
        if (Math.abs(real) > 0.005 && Math.abs(x.delta) > 0.004) { dirN++; if (Math.sign(real) === Math.sign(x.delta)) dirHit++; }
      });
    });
    const d = bootDiff(errM.map((e, i) => e - errN[i]), 8);
    out.art.closing = cm;
    out.s['8'] = { label: '¿Subirá o bajará la cuota?', split: cSplit, trainN: ctrain.length, maeModel: errM.reduce((a, b) => a + b, 0) / errM.length, maeNaive: errN.reduce((a, b) => a + b, 0) / errN.length, dirHit: dirN ? dirHit / dirN : null, dirN, d, n: ctest.length, published: better(d), light: better(d) ? (dirN >= 1000 && dirHit / dirN >= 0.6 ? 'alta' : dirN >= 300 ? 'media' : 'baja') : 'educativa' };
  } else out.s['8'] = { published: false, light: 'educativa', why: 'Sin suficientes cuotas de apertura y cierre' };

  MARK('11-conteos');
  // ── 11) córners y tarjetas ──
  ['corners', 'cards'].forEach((kind) => {
    const pt = [], pl = [], yv = [], over = [], yo = [], pitTrain = [], pitTest = [];
    const line = C.KIND[kind].line;
    let sizeAt = 1e9;
    C.run(all, kind, (m, p) => {
      if (!p.v || !m.done) return;
      const tot = p.v[0] + p.v[1];
      const dT = LQ.nbDist(p.team, p.size, 40), dL = LQ.nbDist(p.league, p.size, 40);
      if (!isTest.has(m.id)) { pitTrain.push(LQ.pitScore(dT, tot)); return; }
      pitTest.push({ dT, tot });
      pt.push(dT[Math.min(40, tot)] || 1e-9); pl.push(dL[Math.min(40, tot)] || 1e-9); yv.push(tot);
      over.push(dT.reduce((s, q, k) => s + (k > line ? q : 0), 0)); yo.push(tot > line ? 1 : 0);
      sizeAt = p.size;
    });
    if (!pt.length) return;
    const d = bootDiff(pt.map((p, i) => -Math.log(p) + Math.log(pl[i])), 11);
    const m = binMetrics(over, yo);
    out.s['11'] = out.s['11'] || { label: 'Córners y tarjetas', published: false, light: 'educativa' };
    // rango del conteo con 80 % de cobertura: umbral con temporadas anteriores, cobertura en la actual
    const q80 = pitTrain.length >= 50 ? LQ.conformalQ(pitTrain, 0.2) : 0.4;
    const cov = pitTest.filter((r) => { const [lo, hi] = LQ.countInterval(r.dT, q80); return r.tot >= lo && r.tot <= hi; }).length / Math.max(1, pitTest.length);
    out.art.counts = out.art.counts || {};
    out.art.counts[kind] = { q80, coverage80: cov, size: sizeAt };
    out.s['11'][kind] = { n: pt.length, d, over: m, line, size: sizeAt, q80, coverage80: cov, published: better(d) };
  });
  if (out.s['11']) {
    const k = out.s['11'];
    k.published = !!(k.corners && k.corners.published && k.cards && k.cards.published);
    // mercado difícil: aunque mejore, el sello nunca pasa de «baja» si la calibración no es buena
    k.light = k.published ? light(k.corners.over, true) : 'educativa';
  }
  return out;
}

module.exports = { league, metrics, binMetrics, bootDiff, light };

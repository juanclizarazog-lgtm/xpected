/*
 * Fase 6 · servicio del laboratorio. Solo agrega: endpoints nuevos bajo /api/lab/* y el mensaje SSE nuevo «intensity».
 * Ningún endpoint ni mensaje existente cambia. Usa el historial (data/lab/history.json) y los parámetros de la prueba
 * histórica (data/lab/models.json); si faltan, se crean en segundo plano.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Q = require('../../assets/js/quant.js');
const LQ = require('../../assets/js/lab/lab-quant.js');
const H = require('./history.js');
const S = require('./strength.js');
const X = require('./explain.js');
const LU = require('./lineups.js');
const LV = require('./live.js');
const MK = require('./market.js');
const C = require('./counts.js');
const SEASON = require('./season.js');
const F = require('./flags.js');

const MODELS = path.join(__dirname, '../../data/lab/models.json');
const LEAGUES = ['col.1', 'eng.1', 'esp.1', 'conmebol.libertadores', 'uefa.champions'];
const SLUGS = { 'liga-betplay': 'col.1', 'premier-league': 'eng.1', laliga: 'esp.1' };
const st = { ready: false, busy: false, error: null, at: null, db: null, models: { leagues: {} }, L: {}, seasons: {}, ranges: {}, lastPost: new Set(), log: () => {} };

const rating = (t) => t.a + t.d; // fuerza total (ataque + defensa) en escala logarítmica
// escala simple 0–100 para la pantalla: 50 = promedio de la liga; curva en S para que nunca se salga de 0–100
const levelRaw = (x) => 100 / (1 + Math.exp(-2.5 * x));
const level = (x) => Math.round(levelRaw(x));
// banda del 90 % en la misma escala (asimétrica cerca de los extremos): [desde, hasta]
const bandOf = (x, sd) => [Math.round(levelRaw(x - 1.645 * sd)), Math.round(levelRaw(x + 1.645 * sd))];

function computeLeague(lg) {
  const db = st.db;
  const all = Object.values(db.events).filter((e) => e.lg === lg && !e.postponed).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!all.length) return null;
  const art = st.models.leagues[lg] || {};
  const done = all.filter((e) => e.done && e.hs != null);
  const prm = art.kalman || S.kalmanFit(done);
  const pred = {};
  const kal = S.kalmanRun(all, prm, (m, s) => { if (!m.done) pred[m.id] = { lam: s.lam, mu: s.mu, varL: s.varL, varM: s.varM }; });
  const feats = {};
  X.features(all, (m, x) => { if (!m.done) feats[m.id] = x; });
  const luEv = done.filter((m) => st.db.summaries[m.id] && st.db.summaries[m.id].lu);
  const lum = luEv.length >= 60 ? LU.train(luEv, st.db.summaries, 150) : null;
  const lastXI = {};
  luEv.forEach((m) => { const lu = st.db.summaries[m.id].lu; lastXI[m.hid] = { ids: lu.s[0], date: m.date }; lastXI[m.aid] = { ids: lu.s[1], date: m.date }; });
  const counts = {};
  ['corners', 'cards'].forEach((k) => { counts[k] = {}; C.run(all, k, (m, p) => { if (!m.done) counts[k][m.id] = p; }); });
  // tabla del torneo actual (para el encogimiento de la estrategia 2)
  let table = null, avg = 1.35, homeCity = {};
  S.asOf(all, (m, s) => { if (!m.done) { table = s.table; avg = s.avg; homeCity = s.homeCity; } });
  return { lg, prm, kal, pred, feats, lum, lastXI, counts, table, avg, homeCity, art, names: Object.fromEntries(all.flatMap((e) => [[e.hid, e.h], [e.aid, e.a]])) };
}

const SIM_LEAGUES = ['col.1', 'eng.1', 'esp.1'];
/** 10.000 temporadas con el estado en vivo del feed (marcador y minuto de los partidos en curso o recién terminados). */
function runSeason(lg) {
  const L = st.L[lg];
  if (!L) return;
  const input = SEASON.build(st.db, lg, L.kal, st.liveNow || {});
  if (input) st.seasons[lg] = { input, result: SEASON.run(input, 10000), at: new Date().toISOString() };
}

function compute() {
  const t0 = Date.now();
  try { st.models = JSON.parse(fs.readFileSync(MODELS, 'utf8')); } catch (e) { st.models = { leagues: {} }; }
  for (const lg of LEAGUES) { try { st.L[lg] = computeLeague(lg); } catch (e) { st.log('error en ' + lg + ': ' + e.message); } }
  for (const lg of SIM_LEAGUES) runSeason(lg);
  st.ranges = {};
  st.ready = true; st.at = new Date().toISOString();
  st.log('listo en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

async function refresh() {
  if (st.busy) return;
  st.busy = true;
  try {
    const r = await H.refresh({});
    st.db = r.db;
    if (!fs.existsSync(MODELS)) st.log('sin data/lab/models.json: corre «node tools/lab-backtest.js» para los parámetros de la prueba histórica');
    compute();
  } catch (e) { st.error = e.message; st.log('no se pudo actualizar el historial: ' + e.message); }
  st.busy = false;
}

function init(opts) {
  st.log = (opts && opts.log) || (() => {});
  st.db = H.load();
  if (Object.keys(st.db.events).length) { setTimeout(compute, 50); setTimeout(refresh, 5 * 60e3); } else refresh();
  setInterval(refresh, 6 * 3600e3).unref();
}

// ── por partido ────────────────────────────────────────────────────────────────
const espnId = (id) => String(id || '').replace(/^x-/, '').replace(/^espn-/, '');
function flagsFor(lg) {
  const f = F.load(), out = {};
  Object.keys(f.strategies).forEach((id) => { const s = f.strategies[id]; out[id] = { status: F.status(f, id, lg), light: (s.lights || {})[lg] || (F.status(f, id, lg) === 'publicada' ? 'media' : 'educativa'), why: (s.why || {})[lg] || (s.why || {}).general || null, stats: (s.stats || {})[lg] || null }; });
  return out;
}
// [fecha, nivel, desde, hasta]
function series(t) { return (t ? t.hist.slice(-38) : []).map(([d, a, de, v]) => [d, level(a + de)].concat(bandOf(a + de, Math.sqrt(v)))); }
function teamStrength(L, id) {
  const t = L.kal.teams[id];
  if (!t) return null;
  const s = series(t);
  const now = s.length ? s[s.length - 1][1] : level(rating(t));
  const before = s.length > 5 ? s[s.length - 6][1] : now;
  const sd = Math.sqrt(t.Pa + t.Pd);
  const [lo, hi] = bandOf(rating(t), sd);
  return { name: L.names[id], series: s, now, lo, hi, change5: now - before, unc: sd < 0.2 ? 'baja' : sd < 0.32 ? 'moderada' : 'alta' };
}
function rangesFor(ev, L, n) {
  const m = ev.model, k = L && L.pred[espnId(ev.id)];
  if (!m) return null;
  const sdL = Math.sqrt(k ? k.varL : 0.08), sdM = Math.sqrt(k ? k.varM : 0.08);
  const live = ev.state === 'in', score = ev.scores || [0, 0];
  const r = LQ.rng(+espnId(ev.id) || 7);
  const draws = { 1: [], X: [], 2: [], 'O2.5': [], 'BTTS-S': [] };
  for (let i = 0; i < (n || 200); i++) {
    const lam = (live ? m.lam : m.lamPre) * Math.exp(sdL * LQ.normal(r)), mu = (live ? m.mu : m.muPre) * Math.exp(sdM * LQ.normal(r));
    const mk = Q.marketsFromMatrix(Q.scoreMatrix(lam, mu, live ? 0 : S.RHO, 10), live ? score[0] : 0, live ? score[1] : 0);
    let p = [mk.home, mk.draw, mk.away];
    if (!live && m.pMarket && m.w < 1) p = Q.blendMulti(p, m.pMarket, m.w);
    draws['1'].push(p[0]); draws.X.push(p[1]); draws['2'].push(p[2]); draws['O2.5'].push(mk.over[2.5]); draws['BTTS-S'].push(mk.btts);
  }
  const out = {};
  // (en vivo «ambos anotan» puede quedar decidido: 1 ± redondeo → se recorta a [0, 1])
  const cl01 = (x) => Math.min(1, Math.max(0, x));
  Object.entries(draws).forEach(([k2, a]) => { a.sort((x, y) => x - y); out[k2] = [cl01(a[Math.floor(a.length * 0.05)]), cl01(a[Math.floor(a.length * 0.95)])]; });
  return out;
}
function matchPayload(ev) {
  const lg = ev.sportKey, L = st.L[lg], id = espnId(ev.id);
  const he = st.db && st.db.events[id];
  const base = { id: ev.id, lg, ready: st.ready, at: st.at, flags: flagsFor(lg), state: ev.state };
  if (!L || !he) return Object.assign(base, { missing: 'Este partido no está en el historial del laboratorio todavía.' });
  const m = ev.model || {};
  const lamA = ev.state === 'in' ? m.lamPre : m.lamPre || m.lam, muA = ev.state === 'in' ? m.muPre : m.muPre || m.mu;
  const k = L.pred[id];
  const out = Object.assign(base, { home: { id: he.hid, name: he.h }, away: { id: he.aid, name: he.a } });
  // 1 · fuerza en el tiempo
  out.strength = { home: teamStrength(L, he.hid), away: teamStrength(L, he.aid), p: k ? S.probs1x2(k.lam, k.mu) : null };
  // 2 · pocos partidos
  if (L.table) {
    const hs = S.hierarchical({ avg: L.avg, home: L.table[he.hid], away: L.table[he.aid] }, L.table);
    out.shrink = { params: { avg: L.avg, home: S.HOME_L, away: S.AWAY_L, hAtt: hs.hAtt, hDef: hs.hDef, aAtt: hs.aAtt, aDef: hs.aDef, rho: S.RHO },
      n: [(L.table[he.hid] || {}).gp || 0, (L.table[he.aid] || {}).gp || 0], w: [(hs.wH[0] + hs.wH[1]) / 2, (hs.wA[0] + hs.wA[1]) / 2], tau2: [hs.tauAtt, hs.tauDef], sigma2: hs.sigma2 };
  }
  // 5 · altura
  const gap = S.altitudeGap(he, L.homeCity);
  const awayCity = S.homeCityOf(L.homeCity, he.aid);
  const alt = L.art.altitude;
  out.altitude = { city: he.city, cityM: S.altitudeOf(he.city), awayCity, awayM: awayCity ? S.altitudeOf(awayCity) : null, gap, delta: alt ? alt.delta : null, se: alt ? alt.se : null,
    extraGoals: alt && gap != null && gap > 0 && lamA ? lamA * (Math.exp(alt.delta * gap / 1000) - 1) : 0 };
  // 4 · factores
  const x = L.feats[id];
  if (x && L.art.factors) { const sh = X.shapley(L.art.factors, x); out.factors = Object.assign(sh, { appP: m.pFinal || null }); }
  // 3 · alineaciones probables (último once de cada equipo)
  if (L.lum && lamA && L.lastXI[he.hid] && L.lastXI[he.aid]) {
    const imp = LU.impacts(L.lum, [L.lastXI[he.hid].ids, L.lastXI[he.aid].ids], lamA, muA, (a, b) => S.probs1x2(a, b));
    out.lineup = Object.assign(imp, { from: [L.lastXI[he.hid].date, L.lastXI[he.aid].date], lam: lamA, mu: muA });
  }
  // 6 · peligro de gol en vivo
  if (ev.state === 'in' && lamA) out.live = LV.now(ev, [lamA, muA], L.art.live || { alpha: 0, beta: 1 / 8 }, (L.art.live || {}).typical10);
  // 7 · cuotas: movimientos
  out.market = { books: (ev.books || []).length, steam: { available: (ev.books || []).length >= 3 }, reference: MK.referenceMoves(ev.id) };
  // 8 · ¿subirá o bajará?
  const b = (ev.books || [])[0];
  if (ev.state === 'pre' && b && b.h2h && !b.prematch && L.art.closing) {
    const fc = MK.forecastClosing(L.art.closing, [b.h2h.home, b.h2h.draw, b.h2h.away], m.pModel);
    out.closing = { odds: [b.h2h.home, b.h2h.draw, b.h2h.away], forecast: fc.map((f) => Object.assign(f, { dir: MK.direction(f.delta) })) };
  }
  // 9 · apuestas juntas (se calculan en el navegador con estos goles esperados)
  out.combos = { lam: ev.state === 'in' ? m.lam : lamA, mu: ev.state === 'in' ? m.mu : muA, rho: ev.state === 'in' ? 0 : S.RHO, h0: ev.state === 'in' && ev.scores ? ev.scores[0] : 0, a0: ev.state === 'in' && ev.scores ? ev.scores[1] : 0 };
  // 12 · rangos
  const conf = L.art.conformal || (st.models.leagues['col.1'] || {}).conformal;
  // El conjunto conformal garantiza la cobertura en promedio de muchos partidos, no en cada uno: para que la frase sea
  // honesta en ESTE partido, el grupo nunca es menor que el que suma esa probabilidad según sus propios números
  // (agregar resultados solo puede subir la cobertura, así que la garantía se mantiene).
  const massSet = (p, level) => { const idx = [0, 1, 2].sort((a, b) => p[b] - p[a]); const out = []; let s = 0; for (const i of idx) { out.push(i); s += p[i]; if (s >= level - 1e-9) break; } return out; };
  out.ranges = { probs: rangesFor(ev, L), conformal: conf && m.pFinal ? Object.fromEntries(['0.2', '0.1', '0.05'].map((a) => {
    const set = [...new Set(LQ.conformalSet(m.pFinal, conf[a].q).concat(massSet(m.pFinal, 1 - +a)))].sort();
    return [a, { level: 1 - +a, set, coverage: conf[a].coverage }];
  })) : null, p: m.pFinal || null };
  // 11 · córners y tarjetas
  out.counts = {};
  ['corners', 'cards'].forEach((kind) => {
    const p = L.counts[kind][id];
    if (!p) return;
    const q80 = ((L.art.counts || {})[kind] || {}).q80 || 0.4;
    const d = C.describe(p.team, p.size, C.KIND[kind].line, q80);
    out.counts[kind] = { mu: d.mu, line: C.KIND[kind].line, over: d.over, range80: d.range, dist: d.dist.slice(0, 25).map((v) => +v.toFixed(4)) };
  });
  const slug = Object.keys(SLUGS).find((s) => SLUGS[s] === lg);
  if (slug) out.season = slug;
  return out;
}

function seasonPayload(key) {
  const lg = SLUGS[key] || key;
  const s = st.seasons[lg];
  if (!s) return { lg, ready: st.ready, missing: 'Simulador no disponible para esta liga.' };
  const i = s.input;
  return { lg, ready: true, at: s.at, flags: flagsFor(lg), format: i.format, season: i.season, names: i.names, table: i.table,
    fixtures: i.fixtures.map((f) => Object.assign({}, f, { hn: i.names[f.h], an: i.names[f.a] })), model: i.model, results: i.results, relegation: i.relegation, result: s.result };
}

function overview(events) {
  const f = F.load();
  const lgs = {};
  LEAGUES.forEach((lg) => { lgs[lg] = flagsFor(lg); });
  // partido sugerido para el laboratorio: el próximo con cuota en una liga con la fuerza en el tiempo publicada
  const pre = events.filter((e) => e.state === 'pre' && e.books && e.books[0] && e.books[0].h2h && st.L[e.sportKey]).sort((a, b) => Date.parse(a.commence) - Date.parse(b.commence));
  const featured = (pre.find((e) => F.status(f, '1', e.sportKey) === 'publicada') || pre[0] || events.find((e) => st.L[e.sportKey]) || {}).id || null;
  return { ready: st.ready, at: st.at, busy: st.busy, error: st.error, featured, leagues: lgs, strategies: Object.keys(f.strategies), seasons: Object.keys(SLUGS), source: 'Marcadores públicos de ESPN (solo desarrollo) · prueba histórica en docs/reports/fase6-*.md', modelsAt: st.models.createdAt || null };
}

function rangesAll(events) {
  const out = {};
  events.forEach((ev) => {
    if (!ev.model || ev.state === 'post') return;
    const key = ev.id + '|' + (ev._sig || '').length + '|' + (ev.minute || 0) + '|' + JSON.stringify(ev.scores);
    if (!st.ranges[ev.id] || st.ranges[ev.id].key !== key) st.ranges[ev.id] = { key, r: rangesFor(ev, st.L[ev.sportKey], 120) };
    out[ev.id] = st.ranges[ev.id].r;
  });
  return out;
}

/** Después de cada consulta: instantáneas de la casa de referencia y mensaje «intensity» para los partidos en vivo. */
function afterPoll(events, broadcast) {
  let snap = false;
  const items = [];
  events.forEach((ev) => {
    try {
      if (MK.recordSnapshot(ev)) snap = true;
      if (ev.state === 'in' && ev.model && st.L[ev.sportKey]) {
        const L = st.L[ev.sportKey];
        const r = LV.now(ev, [ev.model.lamPre, ev.model.muPre], L.art.live || { alpha: 0, beta: 1 / 8 }, (L.art.live || {}).typical10);
        items.push(Object.assign({ eventId: ev.id }, r));
      }
      if (ev.state === 'post' && !st.lastPost.has(ev.id)) { st.lastPost.add(ev.id); if (st.ready) setTimeout(refresh, 10 * 60e3).unref(); }
    } catch (e) { /* el laboratorio nunca rompe el flujo existente */ }
  });
  if (snap) { try { MK.saveSnaps(); } catch (e) { /* noop */ } }
  if (items.length) broadcast('intensity', { type: 'intensity', ts: Date.now(), items });
  // simulador: si cambió un marcador en vivo (o terminó un partido que el historial aún no tiene), se vuelve a simular
  // esa liga, como mucho una vez cada 2 minutos y sin bloquear la respuesta
  try {
    const now = {};
    events.forEach((ev) => { if (SIM_LEAGUES.includes(ev.sportKey) && ev.scores && (ev.state === 'in' || (ev.state === 'post' && ev.completed && !ev.postponed))) now[espnId(ev.id)] = { lg: ev.sportKey, h0: ev.scores[0], a0: ev.scores[1], minute: ev.minute || 0, period: ev.period || 1, post: ev.state === 'post' }; });
    st.liveNow = now;
    if (!st.ready) return;
    st.simAt = st.simAt || {};
    SIM_LEAGUES.forEach((lg) => {
      const sig = JSON.stringify(Object.entries(now).filter(([, v]) => v.lg === lg).map(([id, v]) => [id, v.h0, v.a0, v.post, Math.floor(v.minute / 15)]));
      st.liveSig = st.liveSig || {};
      if (st.liveSig[lg] === sig || Date.now() - (st.simAt[lg] || 0) < 120e3) return;
      st.liveSig[lg] = sig; st.simAt[lg] = Date.now();
      setImmediate(() => { try { runSeason(lg); } catch (e) { st.log('simulador ' + lg + ': ' + e.message); } });
    });
  } catch (e) { /* el laboratorio nunca rompe el flujo existente */ }
}

function handle(url, res, json, events) {
  const parts = url.split('/').filter(Boolean); // api, lab, …
  try {
    if (parts[2] === 'overview') return json(res, 200, overview(events));
    if (parts[2] === 'ranges') return json(res, 200, { ready: st.ready, ranges: st.ready ? rangesAll(events) : {} });
    if (parts[2] === 'season' && parts[3]) return json(res, 200, seasonPayload(parts[3]));
    if (parts[2] === 'match' && parts[3]) {
      const ev = events.find((e) => espnId(e.id) === espnId(parts[3]));
      if (!ev) return json(res, 404, { error: 'Partido no encontrado' });
      if (!st.ready) return json(res, 200, { id: ev.id, ready: false });
      return json(res, 200, matchPayload(ev));
    }
  } catch (e) { return json(res, 500, { error: e.message }); }
  return json(res, 404, { error: 'Ruta del laboratorio no encontrada' });
}

module.exports = { init, handle, afterPoll, compute, matchPayload, seasonPayload, overview, state: st };

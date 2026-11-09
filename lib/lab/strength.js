/*
 * Fase 6 · fuerza de los equipos.
 *  - asOf(): la tabla y la forma tal como estaban ANTES de cada partido (sin mirar el futuro)
 *  - currentModel(): el modelo actual de la app (lib/model.js) alimentado con esa tabla → punto de comparación
 *  - Estrategia 1 · fuerza que cambia en el tiempo: filtro de Kalman extendido para goles de Poisson.
 *      Cada equipo tiene ataque y defensa ocultos con su incertidumbre; entre partidos la incertidumbre crece
 *      (q por día) y tras cada resultado se encoge según lo sorpresivo del marcador. Q, ρ y la incertidumbre inicial
 *      se ajustan solos en las temporadas anteriores.
 *  - Estrategia 2 · pocos partidos: encogimiento hacia el promedio de la liga con peso n·τ²/(n·τ²+σ²) (Bayes empírico)
 *  - Estrategia 5 · altura: efecto δ por cada 1.000 m de diferencia, estimado con los partidos y su error estándar
 */
'use strict';
const Q = require('../../assets/js/quant.js');
const MODEL = require('../model.js');
const ALT = require('./venues.json');

const RHO = -0.06;
const DAY = 86400e3;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
const ALT_BY_CITY = {};
Object.entries(ALT.cities).forEach(([c, v]) => { ALT_BY_CITY[norm(c)] = v.m; });
// ESPN a veces agrega la región («Palmira, Valle Cauca», «El Alto, La Paz.»): se usa solo la ciudad
function altitudeOf(city) { const k = norm(String(city || '').split(',')[0]); return k && k in ALT_BY_CITY ? ALT_BY_CITY[k] : null; }

function probs1x2(lam, mu, rho) { const mk = Q.marketsFromMatrix(Q.scoreMatrix(lam, mu, rho == null ? RHO : rho, 10)); return [mk.home, mk.draw, mk.away]; }
const outcome = (m) => (m.hs > m.as ? 0 : m.hs === m.as ? 1 : 2);

/** Recorre los partidos en orden y llama fn(partido, estado previo) con tabla, forma y promedio de la liga «hasta ese día». */
function asOf(matches, fn) {
  const tables = {}, form = {}, home = {};
  for (const m of matches) {
    const tk = m.season + '|' + m.stage;
    const T = tables[tk] = tables[tk] || { teams: {}, goals: 0, games: 0 };
    const row = (id) => T.teams[id] || { gp: 0, gf: 0, ga: 0 };
    const avg = T.games >= 20 ? T.goals / T.games : 1.35;
    fn(m, { home: row(m.hid), away: row(m.aid), table: T.teams, formH: (form[m.hid] || []).slice(-5).join(''), formA: (form[m.aid] || []).slice(-5).join(''), avg, homeCity: home });
    if (!m.done || m.hs == null) continue;
    [[m.hid, m.hs, m.as], [m.aid, m.as, m.hs]].forEach(([id, f, a]) => {
      const r = T.teams[id] = T.teams[id] || { gp: 0, gf: 0, ga: 0 };
      r.gp++; r.gf += f; r.ga += a;
      (form[id] = form[id] || []).push(f > a ? 'W' : f === a ? 'D' : 'L');
    });
    T.goals += m.hs + m.as; T.games += 2;
    if (!m.neutral && m.city) { const hc = home[m.hid] = home[m.hid] || {}; hc[m.city] = (hc[m.city] || 0) + 1; }
  }
}
/** Ciudad donde más veces jugó de local (hasta ese día). */
function homeCityOf(homeMap, id) { const c = homeMap[id]; if (!c) return null; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }

/** Modelo actual de la app con la tabla de ese día (sin cuotas: solo el componente del modelo). */
function currentModel(st, m) {
  const ev = { state: 'pre', leagueAvg: st.avg, homeTeam: { form: st.formH, standing: st.home }, awayTeam: { form: st.formA, standing: st.away }, books: [] };
  const r = MODEL.build(ev);
  return { p: r.pModel, lam: r.lamModel, mu: r.muModel };
}

// ── Estrategia 2: encogimiento con τ² estimado de la propia liga ────────────────
function hierarchical(st, T) {
  // T: filas de la tabla de ese día (todas), para estimar la variación real entre equipos
  const rows = Object.values(T).filter((r) => r.gp >= 1);
  const avg = st.avg;
  const sigma2 = 1 / avg; // varianza del log de una tasa de Poisson por partido ≈ 1/λ
  const raw = (r, k) => Math.log(Math.max(0.2, r[k] / r.gp) / avg);
  const tau2 = (k) => {
    if (rows.length < 6) return 0.02;
    const xs = rows.map((r) => raw(r, k)), mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
    const noise = rows.reduce((a, r) => a + sigma2 / r.gp, 0) / rows.length;
    return Math.max(0.005, v - noise);
  };
  const tA = tau2('gf'), tD = tau2('ga');
  const eff = (r, k, t) => (r && r.gp ? Q.clamp(raw(r, k), -1.5, 1.5) : 0);
  const w = (r, t) => (r && r.gp ? r.gp * t / (r.gp * t + sigma2) : 0);
  return { avg, sigma2, tauAtt: tA, tauDef: tD,
    hAtt: eff(st.home, 'gf'), hDef: eff(st.home, 'ga'), aAtt: eff(st.away, 'gf'), aDef: eff(st.away, 'ga'),
    wH: [w(st.home, tA), w(st.home, tD)], wA: [w(st.away, tA), w(st.away, tD)] };
}
// localía igual que el modelo actual (×1,12 al local, ×0,90 al visitante)
const HOME_L = Math.log(1.12), AWAY_L = Math.log(0.9);
function hierPredict(h) {
  // ataque propio × defensa rival (en la tabla «ga» alto = defensa mala → suma goles al rival)
  const lam = h.avg * Math.exp(HOME_L + h.wH[0] * h.hAtt + h.wA[1] * h.aDef);
  const mu = h.avg * Math.exp(AWAY_L + h.wA[0] * h.aAtt + h.wH[1] * h.hDef);
  return { lam, mu, p: probs1x2(lam, mu) };
}

// ── Estrategia 1: Kalman ──────────────────────────────────────────────────────
function kalmanRun(matches, prm, onPredict) {
  const P = Object.assign({ q: 0.0002, p0: 0.12, rho: 0.8, season: 0.03 }, prm);
  const T = {};
  let mh = 1.45, ma = 1.15; // goles medios de local y visitante (promedio móvil, sin mirar el futuro)
  const get = (id, m) => {
    let t = T[id];
    if (!t) t = T[id] = { a: -0.08, d: -0.08, Pa: P.p0, Pd: P.p0, last: Date.parse(m.date), season: m.season, hist: [] };
    const now = Date.parse(m.date);
    if (t.season !== m.season) { t.a *= P.rho; t.d *= P.rho; t.Pa += P.season; t.Pd += P.season; t.season = m.season; }
    const dd = Math.min(60, Math.max(0, (now - t.last) / DAY));
    t.Pa += P.q * dd; t.Pd += P.q * dd; t.last = now;
    return t;
  };
  for (const m of matches) {
    const H = get(m.hid, m), A = get(m.aid, m);
    const lam = mh * Math.exp(H.a - A.d), mu = ma * Math.exp(A.a - H.d);
    if (onPredict) onPredict(m, { lam, mu, varL: H.Pa + A.Pd, varM: A.Pa + H.Pd, H, A, mh, ma });
    if (!m.done || m.hs == null) continue;
    const upd = (att, def, y, rate) => {
      const S = rate * rate * (att.Pa + def.Pd) + rate;
      const ka = att.Pa * rate / S, kd = def.Pd * rate / S, e = y - rate;
      att.a += ka * e; def.d -= kd * e;
      att.Pa *= 1 - att.Pa * rate * rate / S; def.Pd *= 1 - def.Pd * rate * rate / S;
    };
    upd(H, A, m.hs, lam); upd(A, H, m.as, mu);
    mh += 0.004 * (m.hs - mh); ma += 0.004 * (m.as - ma);
    const day = m.date.slice(0, 10);
    H.hist.push([day, +H.a.toFixed(4), +H.d.toFixed(4), +(H.Pa + H.Pd).toFixed(5)]);
    A.hist.push([day, +A.a.toFixed(4), +A.d.toFixed(4), +(A.Pa + A.Pd).toFixed(5)]);
  }
  return { teams: T, mh, ma, prm: P };
}
/** Ajusta q, p0 y ρ minimizando el error de pronóstico en las temporadas de entrenamiento. */
function kalmanFit(train) {
  let best = null;
  for (const q of [0.00005, 0.0001, 0.0002, 0.0004, 0.0008]) for (const p0 of [0.05, 0.1, 0.2]) for (const rho of [0.6, 0.8, 0.95]) {
    let ll = 0, n = 0, k = 0;
    kalmanRun(train, { q, p0, rho }, (m, s) => {
      if (!m.done || m.hs == null || k++ < 60) return;
      const p = probs1x2(s.lam, s.mu); ll -= Math.log(Math.max(1e-9, p[outcome(m)])); n++;
    });
    if (n && (!best || ll / n < best.ll)) best = { q, p0, rho, ll: ll / n, n };
  }
  return best;
}

// ── Estrategia 5: altura ──────────────────────────────────────────────────────
/** Diferencia de altura (m) entre la sede y la ciudad de local del visitante; null si no se conoce. */
function altitudeGap(m, homeMap) {
  const hv = altitudeOf(m.city), ac = homeCityOf(homeMap, m.aid), av = ac ? altitudeOf(ac) : null;
  if (hv == null || av == null || m.neutral) return null;
  return hv - av;
}
/** δ por cada 1.000 m (máxima verosimilitud de Poisson sobre los goles del local) y su error estándar. */
function altitudeFit(rows) {
  // rows: { x (miles de m, ≥ 0), lam (tasa base), y (goles del local) }
  let d = 0;
  for (let it = 0; it < 30; it++) {
    let s = 0, info = 0;
    rows.forEach((r) => { const l = r.lam * Math.exp(d * r.x); s += r.x * (r.y - l); info += r.x * r.x * l; });
    if (!info) break;
    const step = s / info; d += step;
    if (Math.abs(step) < 1e-7) break;
  }
  let info = 0; rows.forEach((r) => { info += r.x * r.x * r.lam * Math.exp(d * r.x); });
  return { delta: d, se: info ? 1 / Math.sqrt(info) : null, n: rows.filter((r) => r.x > 0).length };
}

module.exports = { asOf, homeCityOf, currentModel, hierarchical, hierPredict, kalmanRun, kalmanFit, altitudeGap, altitudeFit, altitudeOf, probs1x2, outcome, RHO, HOME_L, AWAY_L };

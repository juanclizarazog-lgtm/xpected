/*
 * Xpected · motor de pronóstico del servidor (las probabilidades salen de aquí, nunca del navegador ni de la IA).
 * 1) Fuerza de ataque y defensa de cada equipo con goles a favor/en contra de la tabla real,
 *    encogidas hacia la media cuando hay pocos partidos.
 * 2) Ajuste pequeño por forma reciente (últimos 5).
 * 3) Dixon-Coles → matriz de marcadores → mercados.
 * 4) Mezcla con la probabilidad sin margen de la casa de referencia (si hay cuotas).
 * 5) En vivo: intensidad restante por minuto y marcador actual.
 */
'use strict';
const Q = require('../assets/js/quant.js');

const HOME_BOOST = 1.12, AWAY_DAMP = 0.9, SHRINK_GAMES = 4, W_MODEL = 0.35, RHO = -0.06;

function strength(row, avg) {
  if (!row || !row.gp) return { att: 1, def: 1, n: 0 };
  const k = SHRINK_GAMES, n = row.gp;
  return { att: ((row.gf / n / avg) * n + k) / (n + k), def: ((row.ga / n / avg) * n + k) / (n + k), n };
}
function formFactor(form) {
  if (!form) return 1;
  const s = form.replace(/[^WDL]/g, '');
  if (!s) return 1;
  const ppg = [...s].reduce((t, c) => t + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0) / s.length;
  return 1 + (ppg - 1.35) * 0.035;
}
const LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
const fitCache = new Map();
/**
 * Goles esperados (λ, μ) de Dixon-Coles que reproducen la probabilidad de local y visitante y,
 * si la casa publica línea de goles (0,5 … 4,5), también la probabilidad de «más de» esa línea.
 * El 1X2 fija quién es mejor; la línea de goles fija cuántos goles se esperan.
 */
// Evaluador ligero para el ajuste: misma matriz que Q.scoreMatrix(l, u, rho, 10) (Poisson + τ de Dixon-Coles,
// normalizada), pero sin construir la lista de marcadores ni ordenarla: ~100 veces más rápido.
const PX = new Float64Array(11), PY = new Float64Array(11);
function quick(l, u, rho, point) {
  PX[0] = Math.exp(-l); PY[0] = Math.exp(-u);
  for (let k = 1; k <= 10; k++) { PX[k] = PX[k - 1] * l / k; PY[k] = PY[k - 1] * u / k; }
  let tot = 0, home = 0, away = 0, over = 0;
  for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) {
    let v = PX[x] * PY[y];
    if (x < 2 && y < 2) v *= x === 0 && y === 0 ? 1 - l * u * rho : x === 0 ? 1 + l * rho : y === 0 ? 1 + u * rho : 1 - rho;
    if (v < 0) v = 0;
    tot += v;
    if (x > y) home += v; else if (x < y) away += v;
    if (point != null && x + y > point) over += v;
  }
  return { home: home / tot, away: away / tot, over: over / tot };
}
function fit(pH, pA, rho, over) {
  const key = [pH, pA, rho, over ? over.point : '', over ? over.p : ''].map((x) => typeof x === 'number' ? x.toFixed(6) : x).join('|');
  if (fitCache.has(key)) return fitCache.get(key);
  const pt = over ? over.point : null;
  const err = (l, u) => {
    const q = quick(l, u, rho, pt);
    // el 1X2 es lo que se publica y se congela: pesa 4 veces más que la línea de goles
    let e = 4 * ((q.home - pH) ** 2 + (q.away - pA) ** 2);
    if (over) e += (q.over - over.p) ** 2;
    return e;
  };
  let best = { l: 1.3, u: 1.1, e: Infinity };
  for (let l = 0.1; l <= 4.001; l += 0.1) for (let u = 0.1; u <= 4.001; u += 0.1) { const e = err(l, u); if (e < best.e) best = { l, u, e }; }
  for (const step of [0.01, 0.001]) {
    const b = best;
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
      const l = b.l + i * step, u = b.u + j * step;
      if (l > 0.02 && u > 0.02) { const e = err(l, u); if (e < best.e) best = { l, u, e }; }
    }
  }
  if (fitCache.size > 2000) fitCache.clear();
  fitCache.set(key, best);
  return best;
}

/**
 * Fracción de goles que falta por jugar. La intensidad de gol crece durante el partido
 * (w(t) = 0,85 + 0,3·t/90, normalizada para que ∫₀⁹⁰ w = 90): se marcan más goles al final.
 * Fin: 90' + ~3' de añadido; en prórroga (periodo 3+), 120' + ~2'.
 */
function remaining(minute, period) {
  const m = Math.max(0, minute || 0);
  const end = period >= 3 ? 122 : 93;
  if (m >= end) return 0;
  const W = (t) => 0.85 * t + (0.3 / 180) * t * t;
  return (W(end) - W(m)) / 90;
}
/** Estado del marcador (Dixon-Robinson): quien pierde se vuelca al ataque y quien gana se repliega. */
function stateFactor(diff) {
  if (diff <= -2) return 1.25;
  if (diff === -1) return 1.15;
  if (diff === 1) return 0.9;
  if (diff >= 2) return 0.85;
  return 1;
}
/** Expulsiones: cada roja propia baja el ataque ~28 %; cada roja rival lo sube ~18 %. */
function redFactor(reds, side) {
  if (!reds) return 1;
  return Math.pow(0.72, reds[side] || 0) * Math.pow(1.18, reds[1 - side] || 0);
}

function build(ev) {
  const avg = ev.leagueAvg || 1.35;
  const hs = ev.homeTeam && ev.homeTeam.standing, as = ev.awayTeam && ev.awayTeam.standing;
  const h = strength(hs, avg), a = strength(as, avg);
  const hasStats = h.n >= 3 && a.n >= 3;
  const book = (ev.books || [])[0];
  // la cuota de cierre (partido iniciado o terminado) solo sirve como referencia prepartido
  const odds = book && book.h2h ? [book.h2h.home, book.h2h.draw, book.h2h.away] : null;
  const pMarket = odds ? Q.devigShin(odds) : null;
  // línea de goles de la casa (solo líneas «,5»: las asiáticas tienen devolución y no se comparan igual)
  const tot = book && book.totals && LINES.includes(book.totals.point) && book.totals.over > 1 && book.totals.under > 1 ? book.totals : null;
  const pOverMk = tot ? Q.devigMultiplicative([tot.over, tot.under])[0] : null;
  let lam, mu, quality;
  if (hasStats) {
    lam = avg * h.att * a.def * HOME_BOOST * formFactor(ev.homeTeam.form);
    mu = avg * a.att * h.def * AWAY_DAMP * formFactor(ev.awayTeam.form);
    quality = pMarket ? 'alta' : 'media';
  } else if (pMarket) {
    const f = fit(pMarket[0], pMarket[2], RHO, tot ? { point: tot.point, p: pOverMk } : null); lam = f.l; mu = f.u; quality = 'mercado';
  } else {
    lam = avg * HOME_BOOST; mu = avg * AWAY_DAMP; quality = 'baja';
  }
  lam = Q.clamp(lam, 0.15, 4.5); mu = Q.clamp(mu, 0.15, 4.5);
  const live = ev.state === 'in';
  const score = ev.scores || [0, 0];
  const w = hasStats && pMarket ? W_MODEL : hasStats ? 1 : 0;

  // Prepartido: el 1X2 publicado es la mezcla modelo/mercado. Para que el marcador más probable, «más de 2,5» y
  // «ambos marcan» cuenten la misma historia, buscamos UNA matriz final que reproduzca ese 1X2 y, si hay
  // línea de goles, la mezcla de nuestra probabilidad de «más de» con la de la casa.
  const pre = Q.marketsFromMatrix(Q.scoreMatrix(lam, mu, RHO, 10));
  const pModelPre = [pre.home, pre.draw, pre.away];
  const pFinalPre = pMarket && w < 1 ? Q.blendMulti(pModelPre, pMarket, w) : pModelPre;
  let lamF = lam, muF = mu;
  if (hasStats && pMarket) {
    const overT = tot ? { point: tot.point, p: Q.blend(pre.over[tot.point], pOverMk, w) } : null;
    const f = fit(pFinalPre[0], pFinalPre[2], RHO, overT); lamF = f.l; muF = f.u;
  }

  // En vivo partimos de esa misma matriz final (anclada a la cuota de cierre), no solo de la tabla:
  // así el punto de partida coincide con lo que publicamos antes del inicio.
  const rem = live ? remaining(ev.minute, ev.period) : 1;
  const lamL = live ? lamF * rem * redFactor(ev.reds, 0) * stateFactor(score[0] - score[1]) : lamF;
  const muL = live ? muF * rem * redFactor(ev.reds, 1) * stateFactor(score[1] - score[0]) : muF;
  const M = Q.scoreMatrix(lamL, muL, live ? 0 : RHO, 10);
  const mk = Q.marketsFromMatrix(M, live ? score[0] : 0, live ? score[1] : 0);
  // en vivo la cuota prepartido ya no sirve: manda el modelo con el marcador y el minuto
  const pModel = live ? [mk.home, mk.draw, mk.away] : pModelPre;
  const pFinal = live ? pModel : pFinalPre;
  return {
    version: 'xp-model 1.3', lam: lamL, mu: muL, lamPre: lamF, muPre: muF, lamModel: lam, muModel: mu,
    w: live ? (hasStats ? 1 : 0) : w, quality, live,
    pModel, pMarket, pFinal, over25: mk.over[2.5], btts: mk.btts, top: mk.top.slice(0, 3),
    totals: tot ? { point: tot.point, pMarket: pOverMk, pModel: pre.over[tot.point], pFinal: live ? null : mk.over[tot.point] } : null,
  };
}

module.exports = { build, remaining, redFactor, stateFactor };

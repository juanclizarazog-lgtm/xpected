/*
 * Xpected · Laboratorio · cálculos compartidos (navegador, Web Worker y Node). Equivale a «packages/quant» del plan.
 * Nada de esto se muestra como fórmula al usuario: la app solo muestra resultados en palabras simples.
 *  - Apuestas juntas del mismo partido (probabilidad conjunta desde la matriz de marcadores) y diferencia de goles
 *  - Rangos: conjunto conformal (1X2) e intervalo conformal para conteos (binomial negativa)
 *  - Pocos datos: encogimiento hacia el promedio de la liga
 *  - Banca con varias apuestas: Kelly con límite de caída (condición de Busseti, Ryu y Boyd, evaluada exacta)
 *  - Simulador de temporada (Poisson con incertidumbre de fuerza; formatos de liga en lib/lab/formats)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('../quant.js'));
  else root.XLQ = factory(root.XQ);
})(typeof self !== 'undefined' ? self : this, function (Q) {
  'use strict';

  // ── azar reproducible ──────────────────────────────────────────────────────
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function poisson(r, lam) {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal(r)));
    // inversión de la acumulada: un solo número al azar por muestra
    let k = 0, p = Math.exp(-lam), s = p;
    const u = r();
    while (u > s && k < 60) { k++; p *= lam / k; s += p; }
    return k;
  }

  // ── selecciones como condiciones sobre el marcador final (h0, a0 = marcador actual) ──
  function pred(id) {
    const m = /^([OU])(\d\.5)$/.exec(id);
    if (m) { const L = +m[2]; return m[1] === 'O' ? (h, a) => h + a > L : (h, a) => h + a < L; }
    const t = /^([HA])([OU])(\d\.5)$/.exec(id);
    if (t) { const L = +t[3], side = t[1]; return (h, a) => { const g = side === 'H' ? h : a; return t[2] === 'O' ? g > L : g < L; }; }
    switch (id) {
      case '1': return (h, a) => h > a;
      case 'X': return (h, a) => h === a;
      case '2': return (h, a) => h < a;
      case '1X': return (h, a) => h >= a;
      case 'X2': return (h, a) => h <= a;
      case '12': return (h, a) => h !== a;
      case 'BTTS-S': return (h, a) => h > 0 && a > 0;
      case 'BTTS-N': return (h, a) => h === 0 || a === 0;
      default: return null;
    }
  }
  /** Probabilidad de que se cumplan TODAS las selecciones a la vez, sumando la matriz de marcadores. */
  function joint(M, ids, h0, a0) {
    const ps = ids.map(pred);
    if (ps.some((p) => !p)) return null;
    h0 = h0 || 0; a0 = a0 || 0;
    let s = 0;
    for (let x = 0; x < M.length; x++) for (let y = 0; y < M[x].length; y++) {
      const h = x + h0, a = y + a0;
      if (ps.every((p) => p(h, a))) s += M[x][y];
    }
    return s;
  }
  /** Ingenua (multiplicar como si fueran independientes) vs. real (conjunta) y el efecto de la relación entre ellas. */
  function correlation(M, ids, h0, a0) {
    const marg = ids.map((id) => joint(M, [id], h0, a0));
    const naive = marg.reduce((t, p) => t * p, 1);
    const real = joint(M, ids, h0, a0);
    return { marg, naive, real, effect: naive > 0 ? real / naive - 1 : 0, fairNaive: naive > 0 ? 1 / naive : Infinity, fairReal: real > 0 ? 1 / real : Infinity };
  }
  /** Distribución de la diferencia de goles (local − visitante), sumando la matriz. */
  function goalDiff(M, h0, a0) {
    const d = {};
    for (let x = 0; x < M.length; x++) for (let y = 0; y < M[x].length; y++) { const k = x + (h0 || 0) - y - (a0 || 0); d[k] = (d[k] || 0) + M[x][y]; }
    return d;
  }
  /** Probabilidad de ganar con hándicap h (p. ej. −1,5) desde la distribución de la diferencia de goles. */
  function handicap(dist, h) { let s = 0; Object.keys(dist).forEach((k) => { if (+k + h > 0) s += dist[k]; }); return s; }

  // ── rangos conformales ─────────────────────────────────────────────────────
  /** Umbral conformal: puntaje en la posición ⌈(n+1)(1−α)⌉ de los puntajes de calibración ordenados. */
  function conformalQ(scores, alpha) {
    const s = scores.slice().sort((a, b) => a - b), n = s.length;
    const k = Math.ceil((n + 1) * (1 - alpha));
    return k > n ? Infinity : s[k - 1];
  }
  /** Resultados posibles con la cobertura pedida: los que tienen 1 − p ≤ umbral. */
  function conformalSet(probs, q) { const out = []; probs.forEach((p, i) => { if (1 - p <= q + 1e-12) out.push(i); }); return out.length ? out : [probs.indexOf(Math.max(...probs))]; }

  // ── conteos (córners, tarjetas): binomial negativa ─────────────────────────
  function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (let j = 0; j < 6; j++) s += c[j] / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  /** P(X = k) con media mu y tamaño k (varianza = mu + mu²/size). size → ∞ es Poisson. */
  function nbPmf(k, mu, size) {
    if (!isFinite(size) || size > 1e6) return Q.poissonPmf(k, mu);
    return Math.exp(lgamma(k + size) - lgamma(size) - lgamma(k + 1) + size * Math.log(size / (size + mu)) + k * Math.log(mu / (size + mu)));
  }
  function nbDist(mu, size, max) { const d = []; let acc = 0; for (let k = 0; k <= (max || 40); k++) { const p = nbPmf(k, mu, size); d.push(p); acc += p; } return d.map((p) => p / acc); }
  /** Intervalo conformal de un conteo: valores cuyo «percentil» queda a ≤ q del centro (0,5). */
  function countInterval(dist, q) {
    let acc = 0, lo = null, hi = null;
    dist.forEach((p, k) => { const mid = acc + p / 2; acc += p; if (Math.abs(mid - 0.5) <= q) { if (lo == null) lo = k; hi = k; } });
    if (lo == null) { const mode = dist.indexOf(Math.max(...dist)); lo = hi = mode; }
    return [lo, hi];
  }
  function pitScore(dist, y) { let acc = 0; for (let k = 0; k < y && k < dist.length; k++) acc += dist[k]; return Math.abs(acc + (dist[y] || 0) / 2 - 0.5); }

  // ── pocos datos: cuánto creerle a la temporada frente al promedio de la liga ──
  /**
   * p: { avg, home, away, hAtt, hDef, aAtt, aDef, rho }: desvíos en escala logarítmica frente al promedio de la liga
   * (ataque = goles a favor; defensa = goles en contra, positivo = recibe más). w ∈ [0,1] → 1X2 y goles esperados.
   */
  function shrinkProbs(p, w) {
    const lam = p.avg * Math.exp(p.home + w * (p.hAtt + p.aDef)), mu = p.avg * Math.exp(p.away + w * (p.aAtt + p.hDef));
    const mk = Q.marketsFromMatrix(Q.scoreMatrix(lam, mu, p.rho == null ? -0.06 : p.rho, 10));
    return { lam, mu, p: [mk.home, mk.draw, mk.away] };
  }
  /** Peso de la temporada: n·τ² / (n·τ² + σ²). */
  function shrinkWeight(n, tau2, sigma2) { return n * tau2 / (n * tau2 + sigma2); }

  // ── banca con varias apuestas a la vez ─────────────────────────────────────
  function outcomes(bets) {
    const n = bets.length, out = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      let p = 1; const win = [];
      for (let i = 0; i < n; i++) { const w = (mask >> i) & 1; p *= w ? bets[i].p : 1 - bets[i].p; win.push(w); }
      out.push({ p, win });
    }
    return out;
  }
  function wealth(bets, b, win) { let w = 1; for (let i = 0; i < bets.length; i++) w += win[i] ? b[i] * (bets[i].o - 1) : -b[i]; return w; }
  /**
   * Montos para varias apuestas independientes abiertas a la vez.
   * Kelly completo de cada una, escalado por un factor c ∈ [0,1] que maximiza el crecimiento esperado sujeto a
   * E[W^(−λ)] ≤ 1 con λ = log β / log α (garantiza P(banca < α) ≤ β), y luego los topes de la app.
   * opts: { floor α (0,7), prob β (0,1), maxPct, maxExposure }
   */
  function portfolio(bets, opts) {
    const o = Object.assign({ floor: 0.7, prob: 0.1, maxPct: 0.02, maxExposure: 0.1 }, opts || {});
    const n = bets.length;
    if (!n || n > 10) return null;
    const kelly = bets.map((x) => Math.max(0, (x.p * x.o - 1) / (x.o - 1)));
    const lambda = Math.log(o.prob) / Math.log(o.floor);
    const outs = outcomes(bets);
    const evalAt = (b) => {
      let elog = 0, risk = 0;
      for (const oc of outs) { const W = wealth(bets, b, oc.win); if (W <= 0) return { elog: -Infinity, risk: Infinity }; elog += oc.p * Math.log(W); risk += oc.p * Math.pow(W, -lambda); }
      return { elog, risk };
    };
    let best = { c: 0, b: kelly.map(() => 0), elog: 0, risk: 1 };
    for (let i = 1; i <= 400; i++) {
      const c = i / 400, b = kelly.map((k) => k * c);
      if (b.reduce((s, x) => s + x, 0) >= 0.999) break;
      const e = evalAt(b);
      if (e.risk <= 1 + 1e-12 && e.elog > best.elog) best = { c, b, elog: e.elog, risk: e.risk };
    }
    // topes que la app ya aplica: por apuesta y exposición total
    let b = best.b.map((x) => Math.min(x, o.maxPct));
    const tot = b.reduce((s, x) => s + x, 0);
    if (tot > o.maxExposure) b = b.map((x) => x * o.maxExposure / tot);
    const fin = evalAt(b);
    const naive = kelly.map((k) => Math.min(k * 0.25, o.maxPct));
    return { kelly, scale: best.c, stakes: b, total: b.reduce((s, x) => s + x, 0), growth: fin.elog, risk: fin.risk, lambda, naiveTotal: naive.reduce((s, x) => s + x, 0) };
  }
  /** Trayectorias de banca repitiendo la misma cartera (supone que las probabilidades son correctas). */
  function paths(bets, b, rounds, count, seed) {
    const r = rng(seed || 7), out = [];
    let below = 0;
    for (let k = 0; k < count; k++) {
      let w = 1, min = 1; const path = [1];
      for (let t = 0; t < rounds; t++) {
        let step = 1;
        for (let i = 0; i < bets.length; i++) step += r() < bets[i].p ? b[i] * (bets[i].o - 1) : -b[i];
        w *= step; if (w < min) min = w; path.push(w);
      }
      out.push(path);
      if (min < 0.7) below++;
    }
    return { paths: out, below: below / count };
  }
  function percentiles(paths, qs) {
    const T = paths[0].length;
    return qs.map((q) => { const line = []; for (let t = 0; t < T; t++) { const col = paths.map((p) => p[t]).sort((a, b) => a - b); line.push(col[Math.min(col.length - 1, Math.floor(q * col.length))]); } return line; });
  }

  // ── simulador de temporada ─────────────────────────────────────────────────
  /**
   * model: { mh, ma, teams: { id: { att, def, sd } } } (goles medios de local y visitante; ataque y defensa en escala
   *   logarítmica, defensa alta = recibe menos; sd = incertidumbre de la fuerza)
   * table: { id: { pts, gd, gf, gp } } (lo ya jugado) · fixtures: [{ id, h, a }] (lo que falta)
   * format: ver lib/lab/formats/*.json · fixed: { fixtureId: '1' | 'X' | '2' } · results: [{h,a,hs,as}] ya jugados (desempate directo)
   */
  function simulate(model, table, fixtures, format, nSims, fixed, seed, results, extra) {
    // versión con índices y arreglos numéricos (rápida en el navegador): mismo método, sin objetos por temporada
    const r = rng(seed || 2026);
    const ids = Object.keys(table), n = ids.length, ix = {};
    ids.forEach((id, i) => { ix[id] = i; });
    const att0 = new Float64Array(n), def0 = new Float64Array(n), sdk = new Float64Array(n);
    ids.forEach((id, i) => { const t = model.teams[id] || { att: 0, def: 0, sd: 0.15 }; att0[i] = t.att; def0[i] = t.def; sdk[i] = (t.sd || 0) / Math.SQRT2; });
    const pts0 = new Float64Array(n), gd0 = new Float64Array(n), gf0 = new Float64Array(n), gp0 = new Float64Array(n);
    ids.forEach((id, i) => { const t = table[id]; pts0[i] = t.pts; gd0[i] = t.gd; gf0[i] = t.gf; gp0[i] = t.gp; });
    // [local, visitante, resultado fijado, goles ya marcados (en vivo), fracción del partido que falta]
    const fx = fixtures.filter((f) => f.h in ix && f.a in ix).map((f) => [ix[f.h], ix[f.a], fixed && fixed[f.id] ? fixed[f.id] : null, f.h0 || 0, f.a0 || 0, f.rem == null ? 1 : f.rem]);
    const useH2H = format.tiebreak === 'h2h';
    // enfrentamiento directo: puntos y diferencia de gol entre cada par (base = lo ya jugado)
    const hp0 = new Float64Array(n * n), hg0 = new Float64Array(n * n);
    const addH = (hp, hg, h, a, x, y) => { hg[h * n + a] += x - y; hg[a * n + h] += y - x; if (x > y) hp[h * n + a] += 3; else if (x < y) hp[a * n + h] += 3; else { hp[h * n + a]++; hp[a * n + h]++; } };
    if (useH2H) (results || []).forEach((m) => { if (m.h in ix && m.a in ix) addH(hp0, hg0, ix[m.h], ix[m.a], m.hs, m.as); });
    const rel = extra && extra.relegation ? ids.map((id) => extra.relegation[id] || { pts: 0, gp: 0 }) : null;
    const cChamp = new Float64Array(n), cTop = new Float64Array(n), cBot = new Float64Array(n), cPo = new Float64Array(n), cFin = new Float64Array(n), cPos = new Float64Array(n);
    const att = new Float64Array(n), def = new Float64Array(n), pts = new Float64Array(n), gd = new Float64Array(n), gf = new Float64Array(n), gp = new Float64Array(n), rnd = new Float64Array(n);
    const hp = new Float64Array(n * n), hg = new Float64Array(n * n);
    const order = ids.map((_, i) => i);
    let X = 0, Y = 0;
    const play = (h, a, fo, h0, a0, rem) => {
      const k = rem == null ? 1 : rem, g0 = h0 || 0, g1 = a0 || 0;
      const lh = model.mh * Math.exp(att[h] - def[a]) * k, la = model.ma * Math.exp(att[a] - def[h]) * k;
      for (let tries = 0; tries < 200; tries++) {
        const x = g0 + poisson(r, lh), y = g1 + poisson(r, la);
        if (!fo || (fo === '1' && x > y) || (fo === 'X' && x === y) || (fo === '2' && x < y)) { X = x; Y = y; return; }
      }
      // resultado fijado muy improbable: se fuerza el mínimo marcador que lo cumple
      const m = Math.max(g0, g1);
      if (fo === '1') { X = Math.max(g0, g1 + 1); Y = g1; } else if (fo === '2') { X = g0; Y = Math.max(g1, g0 + 1); } else { X = m; Y = m; }
    };
    const cmp = (a, b) => (pts[b] - pts[a]) || (useH2H ? (hp[b * n + a] - hp[a * n + b]) || (hg[b * n + a] - hg[a * n + b]) : 0) || (gd[b] - gd[a]) || (gf[b] - gf[a]) || (rnd[a] - rnd[b]);
    const gpts = new Float64Array(n), ggd = new Float64Array(n), ggf = new Float64Array(n), grnd = new Float64Array(n);
    const winner = (g) => {
      g.forEach((t) => { gpts[t] = 0; ggd[t] = 0; ggf[t] = 0; grnd[t] = r(); });
      for (const h of g) for (const a of g) if (h !== a) {
        play(h, a, null);
        ggf[h] += X; ggf[a] += Y; ggd[h] += X - Y; ggd[a] += Y - X;
        if (X > Y) gpts[h] += 3; else if (X < Y) gpts[a] += 3; else { gpts[h]++; gpts[a]++; }
      }
      return g.slice().sort((a, b) => (gpts[b] - gpts[a]) || (ggd[b] - ggd[a]) || (ggf[b] - ggf[a]) || (grnd[a] - grnd[b]))[0];
    };
    for (let k = 0; k < nSims; k++) {
      // fuerza de esta temporada simulada: sd es la incertidumbre de la fuerza total, repartida en dos sorteos de sd/√2
      for (let i = 0; i < n; i++) { att[i] = att0[i] + sdk[i] * normal(r); def[i] = def0[i] + sdk[i] * normal(r); rnd[i] = r(); }
      pts.set(pts0); gd.set(gd0); gf.set(gf0); gp.set(gp0);
      if (useH2H) { hp.set(hp0); hg.set(hg0); }
      for (let j = 0; j < fx.length; j++) {
        const h = fx[j][0], a = fx[j][1];
        play(h, a, fx[j][2], fx[j][3], fx[j][4], fx[j][5]);
        gf[h] += X; gf[a] += Y; gd[h] += X - Y; gd[a] += Y - X; gp[h]++; gp[a]++;
        if (X > Y) pts[h] += 3; else if (X < Y) pts[a] += 3; else { pts[h]++; pts[a]++; }
        if (useH2H) addH(hp, hg, h, a, X, Y);
      }
      order.sort(cmp);
      for (let i = 0; i < n; i++) cPos[order[i]] += i + 1;
      if (format.type === 'league') {
        cChamp[order[0]]++;
        for (let i = 0; i < Math.min(n, format.top); i++) cTop[order[i]]++;
        for (let i = 0; i < Math.min(n, format.bottom || 0); i++) cBot[order[n - 1 - i]]++;
      } else if (format.type === 'col-cuadrangulares') {
        const q = order.slice(0, 8);
        q.forEach((t) => { cPo[t]++; });
        // cabezas de grupo: 1.º y 2.º; luego por parejas (3-4, 5-6, 7-8) sorteadas
        const A = [q[0]], B = [q[1]];
        for (let p = 2; p < 8; p += 2) { if (r() < 0.5) { A.push(q[p]); B.push(q[p + 1]); } else { A.push(q[p + 1]); B.push(q[p]); } }
        const fa = winner(A), fb = winner(B);
        cFin[fa]++; cFin[fb]++;
        play(fa, fb, null); const x1 = X, y1 = Y; play(fb, fa, null);
        const ga = x1 + Y, gb = y1 + X;
        cChamp[ga > gb ? fa : gb > ga ? fb : (r() < 0.5 ? fa : fb)]++;
        // descenso: promedio de puntos del todos contra todos en las últimas temporadas
        if (rel) {
          const avg = order.map((t) => [t, (rel[t].pts + pts[t]) / Math.max(1, rel[t].gp + gp[t]), r()]).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]));
          for (let i = 0; i < format.bottom; i++) cBot[avg[i][0]]++;
        }
      }
    }
    const out = {};
    ids.forEach((id, i) => { out[id] = { champ: cChamp[i] / nSims, top: cTop[i] / nSims, bottom: cBot[i] / nSims, playoff: cPo[i] / nSims, final: cFin[i] / nSims, pos: cPos[i] / nSims }; });
    return out;
  }
  /** Error estándar de un porcentaje simulado. */
  function simSE(p, n) { return Math.sqrt(p * (1 - p) / n); }

  return { rng, normal, poisson, pred, joint, correlation, goalDiff, handicap, conformalQ, conformalSet, nbPmf, nbDist, countInterval, pitScore, lgamma, shrinkProbs, shrinkWeight, portfolio, paths, percentiles, simulate, simSE };
});

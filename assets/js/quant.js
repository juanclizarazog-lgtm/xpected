/**
 * Xpected · packages/quant (versión navegador + Node)
 * Funciones puras y testeadas (tests/quant.test.js + tests/test-vectors.json).
 * Cada función documenta concepto, fórmula y símbolos (Parte I y II del plan).
 * Las probabilidades publicadas salen de aquí y del motor, nunca de la capa de IA.
 */
(function (root) {
  'use strict';

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /** Bisección genérica: raíz de f en [lo, hi] (f debe cambiar de signo). */
  function bisect(f, lo, hi, iters = 200) {
    let flo = f(lo);
    for (let i = 0; i < iters; i++) {
      const mid = (lo + hi) / 2;
      const fm = f(mid);
      if (fm === 0) return mid;
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  // ───────────────────────── 1. Cuotas y probabilidad implícita ─────────────────────────

  /** Probabilidad implícita. q = 1 / o  (o: cuota decimal, incluye la apuesta). */
  function implied(o) { return 1 / o; }

  /** Americana → decimal. A > 0: 1 + A/100 · A < 0: 1 + 100/|A| */
  function americanToDecimal(a) { return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a); }

  /** Decimal → americana. o ≥ 2: (o−1)·100 · o < 2: −100/(o−1) */
  function decimalToAmerican(o) { return o >= 2 ? (o - 1) * 100 : -100 / (o - 1); }

  /** Probabilidad implícita de una cuota americana: A>0: 100/(A+100) · A<0: |A|/(|A|+100) */
  function impliedFromAmerican(a) { return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100); }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

  /** Fraccional n/d → decimal: 1 + n/d */
  function fractionalToDecimal(n, d) { return 1 + n / d; }

  /** Decimal → fraccional aproximada (denominador ≤ 100). Devuelve [n, d]. */
  function decimalToFractional(o) {
    const x = o - 1;
    let best = [Math.round(x), 1];
    let err = Math.abs(x - best[0]);
    for (let d = 2; d <= 100 && err > 1e-9; d++) {
      const n = Math.round(x * d);
      const e = Math.abs(x - n / d);
      if (e < err - 1e-12) { best = [n, d]; err = e; }
    }
    const g = gcd(best[0], best[1]);
    return [best[0] / g, best[1] / g];
  }

  // ───────────────────────── 2. Margen (overround) ─────────────────────────

  /** Libro total. B = Σ q_i */
  function overround(odds) { return sum(odds.map(implied)); }

  /** Margen de la casa. margen = B − 1 */
  function margin(odds) { return overround(odds) - 1; }

  // ───────────────────────── 3. Quitar el margen (devig) ─────────────────────────

  /** Multiplicativo: p_i = q_i / B. Correcto en dos vías equilibradas. */
  function devigMultiplicative(odds) {
    const q = odds.map(implied);
    const B = sum(q);
    return q.map((x) => x / B);
  }

  /** Exponente k del método potencia: Σ q_i^k = 1 */
  function powerExponent(odds) {
    const q = odds.map(implied);
    return bisect((k) => sum(q.map((x) => Math.pow(x, k))) - 1, 0.01, 50);
  }

  /** Potencia: p_i = q_i^k con Σ q_i^k = 1. Recorta más a los underdogs. */
  function devigPower(odds) {
    const q = odds.map(implied);
    const k = powerExponent(odds);
    const p = q.map((x) => Math.pow(x, k));
    const s = sum(p);
    return p.map((x) => x / s);
  }

  function shinRaw(q, B, z) {
    return q.map((x) => (Math.sqrt(z * z + (4 * (1 - z) * x * x) / B) - z) / (2 * (1 - z)));
  }

  /** Proporción z de apostadores informados (Shin) tal que Σ p_i = 1. */
  function shinZ(odds) {
    const q = odds.map(implied);
    const B = sum(q);
    if (B <= 1) return 0;
    return bisect((z) => sum(shinRaw(q, B, z)) - 1, 0, 0.999);
  }

  /** Shin: p_i = (√(z² + 4(1−z)q_i²/B) − z) / (2(1−z)). Estándar para 1X2 con longshots. */
  function devigShin(odds) {
    const q = odds.map(implied);
    const B = sum(q);
    const z = shinZ(odds);
    const p = shinRaw(q, B, z);
    const s = sum(p);
    return p.map((x) => x / s);
  }

  function devig(odds, method) {
    if (method === 'power') return devigPower(odds);
    if (method === 'mult') return devigMultiplicative(odds);
    return devigShin(odds);
  }

  /**
   * Inversa del método potencia: carga un margen m sobre probabilidades justas p
   * (q_i = p_i^k con Σ q_i = 1 + m, k < 1). Simula cómo una casa recarga a los longshots.
   */
  function applyMargin(p, m) {
    const k = bisect((k) => sum(p.map((x) => Math.pow(x, k))) - (1 + m), 0.2, 1);
    return p.map((x) => 1 / Math.pow(x, k));
  }

  // ───────────────────────── 4–6. EV, Kelly, CLV ─────────────────────────

  /** Valor esperado por unidad. EV = p·o − 1 */
  function ev(p, o) { return p * o - 1; }

  /** Kelly completo. f* = (p·o − 1)/(o − 1) */
  function kelly(p, o) { return (p * o - 1) / (o - 1); }

  /**
   * Stake con Kelly fraccional y topes duros (Parte III):
   * f = min(κ·max(f*,0), tope). κ ∈ [0.25, 0.5], tope por defecto 2 %.
   */
  function kellyStake(p, o, opts) {
    const o2 = Object.assign({ fraction: 0.25, maxPct: 0.02, bankroll: 1 }, opts || {});
    const fFull = kelly(p, o);
    const fFrac = Math.max(0, fFull) * clamp(o2.fraction, 0, 1);
    const f = Math.min(fFrac, o2.maxPct);
    return { fFull, fFrac, f, capped: fFrac > o2.maxPct, stake: f * o2.bankroll };
  }

  /** Closing Line Value. CLV = o_tomada · p_justa_cierre − 1 */
  function clv(oTaken, pFairClose) { return oTaken * pFairClose - 1; }

  // ───────────────────────── 7. Métricas de calibración ─────────────────────────

  /** Brier = (1/N) Σ (p_i − y_i)² */
  function brier(ps, ys) { return sum(ps.map((p, i) => (p - ys[i]) ** 2)) / ps.length; }

  /** LogLoss = −(1/N) Σ [y ln p + (1−y) ln(1−p)] */
  function logLoss(ps, ys) {
    const e = 1e-15;
    return -sum(ps.map((p, i) => {
      const pc = clamp(p, e, 1 - e);
      return ys[i] * Math.log(pc) + (1 - ys[i]) * Math.log(1 - pc);
    })) / ps.length;
  }

  /** RPS para resultados ordenados (1X2). RPS = 1/(r−1) Σ_k (Σ_{j≤k} p_j − Σ_{j≤k} e_j)² */
  function rps(probs, outcomeIndex) {
    const r = probs.length;
    let cp = 0, ce = 0, s = 0;
    for (let k = 0; k < r - 1; k++) {
      cp += probs[k];
      ce += k === outcomeIndex ? 1 : 0;
      s += (cp - ce) ** 2;
    }
    return s / (r - 1);
  }

  /** Error de calibración esperado con B intervalos iguales. */
  function ece(ps, ys, bins = 10) {
    const acc = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
    ps.forEach((p, i) => {
      const b = Math.min(bins - 1, Math.floor(p * bins));
      acc[b].n++; acc[b].p += p; acc[b].y += ys[i];
    });
    let e = 0;
    acc.forEach((b) => { if (b.n) e += (b.n / ps.length) * Math.abs(b.p / b.n - b.y / b.n); });
    return { ece: e, bins: acc.map((b, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: b.n, pMean: b.n ? b.p / b.n : null, freq: b.n ? b.y / b.n : null })) };
  }

  // ───────────────────────── Varianza (Parte III) ─────────────────────────

  /** σ_ROI = o·√(p(1−p)/N) */
  function sigmaROI(o, p, N) { return o * Math.sqrt((p * (1 - p)) / N); }

  /** N_min ≈ (z·o·√(p(1−p)) / ventaja)² */
  function nMin(z, o, p, edge) { return ((z * o * Math.sqrt(p * (1 - p))) / edge) ** 2; }

  // ───────────────────────── Fútbol: Poisson y Dixon-Coles ─────────────────────────

  const LF = [0];
  function logFact(n) { for (let i = LF.length; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i); return LF[n]; }

  /** P(X = x) = λ^x e^{−λ} / x! */
  function poissonPmf(x, lambda) {
    if (lambda <= 0) return x === 0 ? 1 : 0;
    return Math.exp(x * Math.log(lambda) - lambda - logFact(x));
  }

  /** Corrección τ de Dixon-Coles para marcadores bajos. */
  function dcTau(x, y, lam, mu, rho) {
    if (x === 0 && y === 0) return 1 - lam * mu * rho;
    if (x === 0 && y === 1) return 1 + lam * rho;
    if (x === 1 && y === 0) return 1 + mu * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  }

  /** Matriz de marcadores 0..max con Dixon-Coles, normalizada. M[x][y] = P(local x, visitante y). */
  function scoreMatrix(lam, mu, rho = 0, max = 10) {
    const M = [];
    let tot = 0;
    for (let x = 0; x <= max; x++) {
      M[x] = [];
      const px = poissonPmf(x, lam);
      for (let y = 0; y <= max; y++) {
        const v = Math.max(0, dcTau(x, y, lam, mu, rho) * px * poissonPmf(y, mu));
        M[x][y] = v; tot += v;
      }
    }
    for (let x = 0; x <= max; x++) for (let y = 0; y <= max; y++) M[x][y] /= tot;
    return M;
  }

  /**
   * Mercados desde la matriz (goles adicionales x,y sobre el marcador actual h0–a0).
   * 1X2 suma la triangular; over L suma x+y > L; BTTS suma x,y ≥ 1.
   */
  function marketsFromMatrix(M, h0 = 0, a0 = 0) {
    const lines = [0.5, 1.5, 2.5, 3.5, 4.5];
    const over = {}; lines.forEach((l) => { over[l] = 0; });
    let home = 0, draw = 0, away = 0, btts = 0;
    const scores = [];
    for (let x = 0; x < M.length; x++) {
      for (let y = 0; y < M[x].length; y++) {
        const p = M[x][y];
        const h = h0 + x, a = a0 + y;
        if (h > a) home += p; else if (h === a) draw += p; else away += p;
        if (h >= 1 && a >= 1) btts += p;
        lines.forEach((l) => { if (h + a > l) over[l] += p; });
        scores.push({ h, a, p });
      }
    }
    scores.sort((s1, s2) => s2.p - s1.p);
    return { home, draw, away, btts, over, top: scores.slice(0, 6) };
  }

  /** Intensidad restante en vivo: λ · min_restantes/90, ajustada por expulsiones. */
  function liveLambda(lambda, minute, ownReds = 0, oppReds = 0) {
    const remaining = Math.max(0, 90 - minute) + (minute < 90 ? 3 : Math.max(0, 93 - minute));
    return lambda * (remaining / 90) * Math.pow(0.72, ownReds) * Math.pow(1.18, oppReds);
  }

  // ───────────────────────── Elo ─────────────────────────

  /** E_A = 1 / (1 + 10^((R_B − R_A)/400)) */
  function eloExpected(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }

  /** R_A' = R_A + K (S_A − E_A) */
  function eloUpdate(ra, rb, sa, k = 20) { return ra + k * (sa - eloExpected(ra, rb)); }

  // ───────────────────────── Mezcla con el mercado ─────────────────────────

  function logit(p) { const pc = clamp(p, 1e-9, 1 - 1e-9); return Math.log(pc / (1 - pc)); }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  /** logit(p_final) = w·logit(p_modelo) + (1−w)·logit(p_mercado) */
  function blend(pModel, pMarket, w) { return sigmoid(w * logit(pModel) + (1 - w) * logit(pMarket)); }

  /** Mezcla para mercados de n vías: mezcla cada resultado y renormaliza a 1. */
  function blendMulti(pModel, pMarket, w) {
    const raw = pModel.map((p, i) => blend(p, pMarket[i], w));
    const s = sum(raw);
    return raw.map((x) => x / s);
  }

  /** Intervalo aproximado para una probabilidad con tamaño efectivo n_eff (z = 1.96). */
  function probInterval(p, nEff, z = 1.96) {
    const h = z * Math.sqrt((p * (1 - p)) / nEff);
    return { lo: clamp(p - h, 0.001, 0.999), hi: clamp(p + h, 0.001, 0.999), half: h };
  }

  /** Margen efectivo de una combinada: 1 − 1/Π B_i */
  function parlayMargin(books) { const prod = books.reduce((a, b) => a * b, 1); return { product: prod, margin: 1 - 1 / prod }; }

  // ───────────────────────── Utilidades numéricas ─────────────────────────

  /** PRNG determinista (mulberry32). */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gaussian(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  const XQ = {
    sum, clamp, bisect,
    implied, americanToDecimal, decimalToAmerican, impliedFromAmerican, fractionalToDecimal, decimalToFractional,
    overround, margin, devigMultiplicative, devigPower, powerExponent, devigShin, shinZ, devig, applyMargin,
    ev, kelly, kellyStake, clv,
    brier, logLoss, rps, ece, sigmaROI, nMin,
    poissonPmf, dcTau, scoreMatrix, marketsFromMatrix, liveLambda,
    eloExpected, eloUpdate,
    logit, sigmoid, blend, blendMulti, probInterval, parlayMargin,
    mulberry32, hashSeed, gaussian, quantile,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = XQ;
  else root.XQ = XQ;
})(typeof window !== 'undefined' ? window : globalThis);

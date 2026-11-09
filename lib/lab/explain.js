/*
 * Fase 6 · Estrategia 4 · «Por qué este porcentaje».
 * Pi-ratings (Constantinou y Fenton): cada equipo tiene una nota de local y otra de visitante que se corrigen con el
 * error de diferencia de goles, amortiguado (ψ(e) = 3·log10(1+|e|)) para que las goleadas no pesen de más.
 * Un modelo ordenado (pierde / empata / gana) combina 5 factores. La explicación usa valores de Shapley EXACTOS
 * (32 coaliciones) contra un partido de referencia: «dos equipos parejos en cancha neutral, misma forma y descanso».
 * Adaptación de CatBoost + SHAP del plan: ver docs/lab/adr-002-adaptacion-al-stack.md.
 */
'use strict';
const S = require('./strength.js');

const PI = { lambda: 0.035, gamma: 0.7, c: 3 };
const FEATURES = [
  { key: 'home', label: 'Jugar en casa' },
  { key: 'pi', label: 'Nivel de los equipos (como local y como visitante)' },
  { key: 'form', label: 'Forma reciente (últimos 5 partidos)' },
  { key: 'rest', label: 'Días de descanso' },
  { key: 'alt', label: 'Altura de la sede' },
];

const gExp = (r) => Math.sign(r) * (Math.pow(10, Math.abs(r) / PI.c) - 1);
const psi = (e) => 3 * Math.log10(1 + Math.abs(e)) * Math.sign(e);

/** Recorre los partidos y entrega, antes de cada uno, los 5 factores (sin mirar el futuro). */
function features(matches, onRow) {
  const R = {}, last = {}, pts = {};
  const team = (id) => (R[id] = R[id] || { h: 0, a: 0 });
  S.asOf(matches, (m, st) => {
    const H = team(m.hid), A = team(m.aid);
    const now = Date.parse(m.date);
    const rest = (id) => (last[id] ? Math.min(10, Math.max(2, (now - last[id]) / 86400e3)) : 7);
    const ppg = (id) => { const p = (pts[id] || []).slice(-5); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 1.35; };
    const gap = S.altitudeGap(m, st.homeCity);
    const x = {
      home: m.neutral ? 0 : 1,
      pi: gExp(H.h) - gExp(A.a),
      form: ppg(m.hid) - ppg(m.aid),
      rest: rest(m.hid) - rest(m.aid),
      alt: gap == null ? 0 : Math.max(0, gap) / 1000,
    };
    onRow(m, x, st);
    if (!m.done || m.hs == null) return;
    const e = (m.hs - m.as) - x.pi;
    const dH = PI.lambda * psi(e), dA = -PI.lambda * psi(e);
    H.h += dH; H.a += PI.gamma * dH; A.a += dA; A.h += PI.gamma * dA;
    last[m.hid] = last[m.aid] = now;
    (pts[m.hid] = pts[m.hid] || []).push(m.hs > m.as ? 3 : m.hs === m.as ? 1 : 0);
    (pts[m.aid] = pts[m.aid] || []).push(m.as > m.hs ? 3 : m.hs === m.as ? 1 : 0);
  });
  return R;
}

// ── modelo ordenado: P(visitante) = σ(θ1 − η), P(empate) = σ(θ2 − η) − σ(θ1 − η), P(local) = 1 − σ(θ2 − η)
const sig = (z) => 1 / (1 + Math.exp(-z));
function predict(fit, x) {
  const eta = FEATURES.reduce((s, f, j) => s + fit.beta[j] * x[f.key], 0);
  const pa = sig(fit.t1 - eta), pd = sig(fit.t2 - eta) - pa;
  return [1 - pa - pd, Math.max(1e-6, pd), pa];
}
/** Ajuste por máxima verosimilitud con descenso de gradiente (y una penalización pequeña para estabilidad). */
function train(rows) {
  const fit = { beta: FEATURES.map(() => 0), t1: -0.6, t2: 0.6 };
  const n = rows.length, lr = 0.05, l2 = 1e-3;
  for (let it = 0; it < 1500; it++) {
    const g = { beta: FEATURES.map(() => 0), t1: 0, t2: 0 };
    for (const r of rows) {
      const eta = FEATURES.reduce((s, f, j) => s + fit.beta[j] * r.x[f.key], 0);
      const a = sig(fit.t1 - eta), b = sig(fit.t2 - eta);
      const da = a * (1 - a), db = b * (1 - b);
      // derivadas del log de la probabilidad del resultado observado respecto a θ1, θ2 y η
      let dt1 = 0, dt2 = 0, deta = 0;
      if (r.y === 2) { dt1 = da / a; deta = -da / a; }
      else if (r.y === 1) { const p = Math.max(1e-9, b - a); dt1 = -da / p; dt2 = db / p; deta = (da - db) / p; }
      else { const p = Math.max(1e-9, 1 - b); dt2 = -db / p; deta = db / p; }
      g.t1 += dt1; g.t2 += dt2;
      FEATURES.forEach((f, j) => { g.beta[j] += deta * r.x[f.key]; });
    }
    fit.t1 += lr * g.t1 / n; fit.t2 += lr * g.t2 / n;
    FEATURES.forEach((f, j) => { fit.beta[j] += lr * (g.beta[j] / n - l2 * fit.beta[j]); });
    if (fit.t2 < fit.t1 + 0.05) fit.t2 = fit.t1 + 0.05;
  }
  return fit;
}
/** Valores de Shapley exactos del 1X2 frente al partido de referencia (todos los factores en 0). */
function shapley(fit, x) {
  const k = FEATURES.length, val = {};
  const v = (mask) => {
    if (val[mask]) return val[mask];
    const z = {}; FEATURES.forEach((f, j) => { z[f.key] = (mask >> j) & 1 ? x[f.key] : 0; });
    return (val[mask] = predict(fit, z));
  };
  const fact = [1, 1, 2, 6, 24, 120];
  const phi = FEATURES.map(() => [0, 0, 0]);
  for (let j = 0; j < k; j++) for (let mask = 0; mask < 1 << k; mask++) {
    if ((mask >> j) & 1) continue;
    let s = 0; for (let b = 0; b < k; b++) s += (mask >> b) & 1;
    const w = fact[s] * fact[k - s - 1] / fact[k];
    const a = v(mask | (1 << j)), b0 = v(mask);
    for (let o = 0; o < 3; o++) phi[j][o] += w * (a[o] - b0[o]);
  }
  return { base: v(0), final: v((1 << k) - 1), factors: FEATURES.map((f, j) => ({ key: f.key, label: f.label, value: x[f.key], phi: phi[j] })) };
}

module.exports = { features, train, predict, shapley, FEATURES, PI };

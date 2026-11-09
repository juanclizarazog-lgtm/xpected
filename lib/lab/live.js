/*
 * Fase 6 · Estrategia 6 · «Peligro de gol ahora».
 * Intensidad de gol minuto a minuto = base del partido (goles esperados repartidos con más peso al final, como el modelo
 * en vivo) × estado del marcador × (1 + Σ α·e^(−β·(t − t_k))) por cada gol o expulsión reciente: un evento «calienta»
 * el partido unos minutos y luego se enfría (proceso autoexcitado de Hawkes). α y β se ajustan con los minutos de los
 * goles de las temporadas anteriores. Probabilidad de al menos un gol en la ventana = 1 − e^(−∫ intensidad).
 */
'use strict';
const MODEL = require('../model.js');

const shape = (t) => (0.85 + t / 300) / 90; // por minuto; ∫₀⁹⁰ = 1

function intensity(t, base, score, events, prm) {
  // base: [λ, μ] goles esperados del partido completo; events: [[minuto, tipo]] anteriores a t
  let exc = 1;
  for (const [tk] of events) if (tk < t) exc += prm.alpha * Math.exp(-prm.beta * (t - tk));
  const d = score[0] - score[1];
  return (base[0] * MODEL.stateFactor(d) + base[1] * MODEL.stateFactor(-d)) * shape(t) * exc;
}
/** Probabilidad de al menos un gol entre t y t+win (integración por minuto, sin futuros eventos). */
function windowProb(t, win, base, score, events, prm, end) {
  let I = 0;
  const stop = Math.min(t + win, end || 93);
  for (let u = t; u < stop; u += 0.5) I += intensity(u + 0.25, base, score, events, prm) * 0.5;
  return 1 - Math.exp(-I);
}
/** Log-verosimilitud de los minutos de gol de un partido (proceso no homogéneo). */
function loglik(m, base, prm) {
  const evs = m.goals.map((g) => [g[0], 'gol']).concat((m.cards || []).filter((c) => c[2]).map((c) => [c[0], 'roja'])).sort((a, b) => a[0] - b[0]);
  let ll = 0, score = [0, 0];
  const end = Math.max(93, ...m.goals.map((g) => g[0] + 1));
  let gi = 0;
  const goals = m.goals.slice().sort((a, b) => a[0] - b[0]);
  for (let u = 0; u < end; u += 1) {
    const past = evs.filter((e) => e[0] <= u);
    const lam = intensity(u + 0.5, base, score, past, prm);
    ll -= lam;
    while (gi < goals.length && goals[gi][0] === u + 1) { ll += Math.log(Math.max(1e-9, lam)); if (goals[gi][1] >= 0) score[goals[gi][1]]++; gi++; }
  }
  return ll;
}
function fit(rows) {
  // rows: [{ m, base: [λ, μ] }]
  let best = null;
  for (const alpha of [0, 0.1, 0.2, 0.35, 0.5, 0.8]) for (const beta of [1 / 4, 1 / 8, 1 / 15]) {
    const prm = { alpha, beta };
    let ll = 0; rows.forEach((r) => { ll += loglik(r.m, r.base, prm); });
    if (!best || ll > best.ll) best = { alpha, beta, ll };
  }
  return best;
}
/** Para un partido en vivo: probabilidad de gol en 5, 10 y 15 minutos y un nivel de peligro simple. */
function now(ev, base, prm, typical) {
  const t = ev.minute || 0;
  // ev.details (lib/espn.js): [{ minute, type: gol | penal | autogol | roja | amarilla | cambio, side }]
  const evs = (ev.details || []).filter((e) => ['gol', 'penal', 'autogol', 'roja'].includes(e.type) && e.minute <= t).map((e) => [e.minute, e.type]);
  const score = ev.scores || [0, 0];
  const end = ev.period >= 3 ? 122 : 93;
  const p = [5, 10, 15].map((w) => windowProb(t, w, base, score, evs, prm, end));
  const calm = windowProb(t, 10, base, score, [], { alpha: 0, beta: 1 }, end);
  const ratio = calm > 0 ? p[1] / calm : 1;
  const level = p[1] >= (typical || 0.22) * 1.25 ? 'alto' : p[1] <= (typical || 0.22) * 0.75 ? 'bajo' : 'medio';
  return { minute: t, p5: p[0], p10: p[1], p15: p[2], heat: ratio, level };
}

module.exports = { intensity, windowProb, loglik, fit, now, shape };

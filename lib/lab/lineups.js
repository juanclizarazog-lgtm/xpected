/*
 * Fase 6 · Estrategia 3 · «¿Y si no juega…?»
 * Más-menos regularizado (ridge): cada tramo del partido entre cambios o expulsiones es una fila; las columnas son
 * los jugadores en cancha (+1 local, −1 visitante) y el resultado es la diferencia de goles del tramo por 90 minutos,
 * ponderada por su duración. La penalización ridge encoge hacia 0 a quien jugó poco. Resultado: cuántos goles de
 * diferencia por partido aporta cada jugador frente a uno promedio. Se resuelve con gradiente conjugado (filas dispersas).
 * Sin VAEP: no hay eventos por acción licenciados (ADR-002).
 */
'use strict';

/** Tramos de un partido con alineaciones y cambios. */
function segments(ev, lu) {
  const on = [new Set(lu.s[0]), new Set(lu.s[1])];
  const changes = [];
  lu.subs.forEach(([min, sd, pin, pout]) => changes.push({ t: min, f: () => { on[sd].delete(pout); on[sd].add(pin); } }));
  (lu.reds || []).forEach(([min, sd, p]) => changes.push({ t: min, f: () => on[sd].delete(p) }));
  changes.sort((a, b) => a.t - b.t);
  const lastT = Math.max(93, ...ev.goals.map((g) => g[0] + 1), ...changes.map((c) => c.t + 1));
  const cuts = [0, ...changes.map((c) => c.t), lastT];
  const out = [];
  let ci = 0;
  for (let k = 0; k < cuts.length - 1; k++) {
    while (ci < changes.length && changes[ci].t <= cuts[k] && k > 0) { changes[ci].f(); ci++; }
    const t1 = cuts[k], t2 = cuts[k + 1], dur = t2 - t1;
    if (dur <= 0) continue;
    let gd = 0;
    ev.goals.forEach(([t, sd]) => { if (t > t1 && t <= t2 || (t1 === 0 && t === 0)) gd += sd === 0 ? 1 : sd === 1 ? -1 : 0; });
    out.push({ home: [...on[0]], away: [...on[1]], dur, gd });
  }
  return out;
}

/** Ridge con filas dispersas: minimiza Σ w (y − c − xβ)² + λ Σ β². */
function ridge(rows, lambda) {
  const idx = new Map(); rows.forEach((r) => r.cols.forEach(([j]) => { if (!idx.has(j)) idx.set(j, idx.size); }));
  const p = idx.size;
  const W = rows.reduce((s, r) => s + r.w, 0);
  const c = rows.reduce((s, r) => s + r.w * r.y, 0) / W;
  const X = rows.map((r) => r.cols.map(([j, v]) => [idx.get(j), v]));
  const mul = (b) => { // (XᵀWX + λI) b
    const out = new Float64Array(p);
    rows.forEach((r, i) => { let s = 0; X[i].forEach(([j, v]) => { s += v * b[j]; }); s *= r.w; X[i].forEach(([j, v]) => { out[j] += v * s; }); });
    for (let j = 0; j < p; j++) out[j] += lambda * b[j];
    return out;
  };
  const rhs = new Float64Array(p);
  rows.forEach((r, i) => { const y = r.w * (r.y - c); X[i].forEach(([j, v]) => { rhs[j] += v * y; }); });
  let b = new Float64Array(p), res = Float64Array.from(rhs), dir = Float64Array.from(res);
  let rs = res.reduce((s, v) => s + v * v, 0);
  for (let it = 0; it < 300 && rs > 1e-10; it++) {
    const Ad = mul(dir);
    const alpha = rs / dir.reduce((s, v, j) => s + v * Ad[j], 0);
    for (let j = 0; j < p; j++) { b[j] += alpha * dir[j]; res[j] -= alpha * Ad[j]; }
    const rs2 = res.reduce((s, v) => s + v * v, 0);
    for (let j = 0; j < p; j++) dir[j] = res[j] + (rs2 / rs) * dir[j];
    rs = rs2;
  }
  const beta = {}; idx.forEach((k, j) => { beta[j] = b[k]; });
  return { c, beta };
}

/** Entrena con los partidos dados. Devuelve la nota de cada jugador (goles de diferencia por 90') y sus minutos. */
function train(events, summaries, lambda) {
  const rows = [], minutes = {}, names = {};
  for (const ev of events) {
    const s = summaries[ev.id];
    if (!s || !s.lu) continue;
    Object.assign(names, s.lu.names);
    for (const seg of segments(ev, s.lu)) {
      const cols = seg.home.map((id) => [id, 1]).concat(seg.away.map((id) => [id, -1]));
      rows.push({ cols, y: seg.gd * 90 / seg.dur, w: seg.dur / 90 });
      seg.home.concat(seg.away).forEach((id) => { minutes[id] = (minutes[id] || 0) + seg.dur; });
    }
  }
  if (!rows.length) return null;
  const fit = ridge(rows, lambda || 150);
  return { c: fit.c, beta: fit.beta, minutes, names, rows: rows.length };
}

/** Suma de notas de un once (jugadores sin nota cuentan 0 = jugador promedio). */
const xiValue = (model, ids) => ids.reduce((s, id) => s + (model.beta[id] || 0), 0);

/**
 * Impacto de quitar a cada titular probable: la diferencia de goles esperada cambia en −nota (lo reemplaza un jugador
 * promedio); se reparte mitad en ataque y mitad en defensa y se recalcula el 1X2.
 */
function impacts(model, lineup, lam, mu, probs1x2) {
  const base = probs1x2(lam, mu);
  const one = (side, id) => {
    const d = -(model.beta[id] || 0);
    const dl = side === 0 ? d / 2 : -d / 2;
    const l2 = Math.max(0.1, lam + dl), m2 = Math.max(0.1, mu - dl);
    const p = probs1x2(l2, m2);
    return { id, side, name: (model.names[id] || [id])[0], pos: (model.names[id] || [])[1] || '', rating: +(model.beta[id] || 0).toFixed(3), minutes: Math.round(model.minutes[id] || 0), delta: p.map((x, i) => +(x - base[i]).toFixed(4)) };
  };
  return { base, players: lineup[0].map((id) => one(0, id)).concat(lineup[1].map((id) => one(1, id))) };
}

module.exports = { segments, ridge, train, xiValue, impacts };

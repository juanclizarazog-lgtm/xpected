/*
 * Fase 6 · Estrategia 10 · puntos de jugadores de baloncesto con «cascada de uso». PREPARADO Y APAGADO:
 * la app no tiene datos de la NBA integrados (Prompt 6.4: «si no, deja el módulo preparado y apagado»).
 * Cuando falta un compañero, su uso (tiros) se reparte entre los demás según cómo rindieron sin él; la proyección es
 * una distribución (binomial negativa), no un número.
 */
'use strict';
const LQ = require('../../assets/js/lab/lab-quant.js');

/**
 * players: [{ id, min, rate (puntos por minuto), usage (parte de los tiros), withoutShare: { ausenteId: parte que absorbe } }]
 * out: id del ausente · k: dispersión
 */
function cascade(players, out, k) {
  const absent = players.find((p) => p.id === out);
  const free = absent ? absent.usage : 0;
  const rest = players.filter((p) => p.id !== out);
  const shares = rest.map((p) => (p.withoutShare && p.withoutShare[out] != null ? p.withoutShare[out] : p.usage));
  const tot = shares.reduce((a, b) => a + b, 0) || 1;
  return rest.map((p, i) => {
    const du = free * shares[i] / tot / Math.max(1e-6, p.usage);
    const mu = p.min * p.rate * (1 + du);
    return { id: p.id, mu, gain: du, flow: free * shares[i] / tot, dist: LQ.nbDist(mu, k || 12, 80) };
  });
}
const probOver = (dist, line) => dist.reduce((s, p, x) => s + (x > line ? p : 0), 0);

module.exports = { cascade, probOver, enabled: false, reason: 'La app aún no integra datos de baloncesto (NBA).' };

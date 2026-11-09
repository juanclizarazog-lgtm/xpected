/*
 * Fase 6 · Estrategia 11 · córners y tarjetas.
 * Conteos con más variación que un Poisson (llegan en rachas): binomial negativa con dispersión estimada por momentos.
 * Media del partido = promedio de la liga × efecto de cada equipo (a favor y en contra), encogido hacia el promedio
 * según cuántos partidos lleva (igual que la estrategia 2). Efecto árbitro: la fuente no publica el árbitro → no se usa.
 */
'use strict';
const LQ = require('../../assets/js/lab/lab-quant.js');

const cardsOf = (m) => { const c = [0, 0]; (m.cards || []).forEach(([, sd]) => { if (sd >= 0) c[sd]++; }); return c; };
const KIND = {
  corners: { of: (m) => m.corners, line: 9.5, label: 'córners' },
  cards: { of: (m) => (m.cards ? cardsOf(m) : null), line: 4.5, label: 'tarjetas' },
};

/** Recorre los partidos; antes de cada uno entrega la predicción con equipos y la de «solo el promedio de la liga». */
function run(matches, kind, onPredict) {
  const K = KIND[kind];
  const T = {}; let n = 0, sum = 0, sum2 = 0;
  const team = (id) => (T[id] = T[id] || { gp: 0, for: 0, against: 0 });
  for (const m of matches) {
    const v = K.of(m);
    const avgTeam = n ? sum / n / 2 : (kind === 'corners' ? 5 : 2.2);
    const meanTot = n ? sum / n : avgTeam * 2, varTot = n > 1 ? sum2 / n - meanTot * meanTot : meanTot * 1.5;
    const size = varTot > meanTot ? meanTot * meanTot / (varTot - meanTot) : 1e9;
    const shrink = (r, k) => (r && r.gp ? (r[k] + avgTeam * 6) / (r.gp + 6) : avgTeam) / avgTeam;
    const H = T[m.hid], A = T[m.aid];
    const muH = avgTeam * shrink(H, 'for') * shrink(A, 'against');
    const muA = avgTeam * shrink(A, 'for') * shrink(H, 'against');
    if (onPredict && n >= 40) onPredict(m, { team: muH + muA, league: meanTot, size, v });
    if (!v || !m.done) continue;
    team(m.hid).gp++; team(m.aid).gp++;
    T[m.hid].for += v[0]; T[m.hid].against += v[1]; T[m.aid].for += v[1]; T[m.aid].against += v[0];
    const tot = v[0] + v[1]; n++; sum += tot; sum2 += tot * tot;
  }
  return { teams: T, n };
}
/** Probabilidades para mostrar: distribución, más de la línea y rango con la cobertura pedida. */
function describe(mu, size, line, q) {
  const dist = LQ.nbDist(mu, size, 30);
  const over = dist.reduce((s, p, k) => s + (k > line ? p : 0), 0);
  return { mu, size, dist, over, range: q != null ? LQ.countInterval(dist, q) : null };
}

module.exports = { run, describe, KIND, cardsOf };

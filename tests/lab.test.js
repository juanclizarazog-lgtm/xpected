/* Fase 6 · pruebas del laboratorio (vectores de prueba de cada estrategia). node tests/lab.test.js */
'use strict';
const Q = require('../assets/js/quant.js');
const LQ = require('../assets/js/lab/lab-quant.js');
const S = require('../lib/lab/strength.js');
const X = require('../lib/lab/explain.js');
const LU = require('../lib/lab/lineups.js');
const LV = require('../lib/lab/live.js');
const MK = require('../lib/lab/market.js');
const NBA = require('../lib/lab/props-nba.js');
const SEASON = require('../lib/lab/season.js');

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.error('✗ ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); } };
const close = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ── 9 · apuestas juntas del mismo partido ─────────────────────────────────────
// Ejemplo del plan (OddsPapi): tasas 2,56 y 0,74, «más de 2,5 + ambos anotan»: ingenua 3,24, real 2,42.
const M0 = Q.scoreMatrix(2.56, 0.74, 0, 12);
const c0 = LQ.correlation(M0, ['O2.5', 'BTTS-S']);
ok('ingenua = 3,24 (multiplicar)', close(c0.fairNaive, 3.24, 0.01), c0.fairNaive);
ok('conjunta exacta = 2,42 (sumar la matriz)', close(c0.fairReal, 2.42, 0.01), c0.fairReal);
ok('están relacionadas: la conjunta es más probable que la ingenua', c0.effect > 0.25, c0.effect);
ok('conjunta = P(ambos anotan) − P(1-1)', close(c0.real, c0.marg[1] - M0[1][1], 1e-12));
const c1 = LQ.correlation(M0, ['1', '2']);
ok('resultados excluyentes: conjunta 0 y efecto −100 %', c1.real === 0 && close(c1.effect, -1));
const gd = LQ.goalDiff(M0);
ok('diferencia de goles suma 1', close(sum(Object.values(gd)), 1, 1e-12));
const mk0 = Q.marketsFromMatrix(M0);
ok('hándicap 0 (diferencia > 0) = gana el local', close(LQ.handicap(gd, 0), mk0.home, 1e-12));
ok('hándicap −1,5 ≤ gana el local', LQ.handicap(gd, -1.5) < mk0.home);
ok('en vivo: con 1-0 «ambos anotan» exige gol visitante', close(LQ.joint(Q.scoreMatrix(0.5, 0.4, 0, 10), ['BTTS-S'], 1, 0), 1 - Q.scoreMatrix(0.5, 0.4, 0, 10)[0].reduce((s, _, y) => s + (y === 0 ? 0 : 0), 0) - sum(Q.scoreMatrix(0.5, 0.4, 0, 10).map((row) => row[0])), 1e-12));

// ── 12 · rangos conformales ───────────────────────────────────────────────────
const sc = Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
ok('umbral conformal = puntaje en ⌈(n+1)(1−α)⌉', close(LQ.conformalQ(sc, 0.1), 0.91));
ok('con muy pocos datos el umbral es infinito (cubre todo)', LQ.conformalQ([0.3, 0.5], 0.05) === Infinity);
ok('conjunto: los resultados con 1 − p ≤ umbral', JSON.stringify(LQ.conformalSet([0.5, 0.3, 0.2], 0.75)) === '[0,1]');
ok('conjunto nunca vacío', LQ.conformalSet([0.5, 0.3, 0.2], 0.1).length === 1);
// cobertura empírica en datos sintéticos bien calibrados ≈ nivel pedido
{
  const r = LQ.rng(5), cal = [], test = [];
  const draw = () => { const p = [0.2 + 0.5 * r(), 0, 0]; p[1] = (1 - p[0]) * (0.3 + 0.4 * r()); p[2] = 1 - p[0] - p[1]; const u = r(); const y = u < p[0] ? 0 : u < p[0] + p[1] ? 1 : 2; return { p, y }; };
  for (let i = 0; i < 4000; i++) cal.push(draw());
  for (let i = 0; i < 4000; i++) test.push(draw());
  const q = LQ.conformalQ(cal.map((d) => 1 - d.p[d.y]), 0.1);
  const cov = test.filter((d) => LQ.conformalSet(d.p, q).includes(d.y)).length / test.length;
  ok('cobertura conformal del 90 % a ±2 puntos', Math.abs(cov - 0.9) <= 0.02, cov);
}

// ── 11 · conteos (binomial negativa) ──────────────────────────────────────────
const nb = LQ.nbDist(10, 8, 80);
const mean = sum(nb.map((p, k) => p * k)), vr = sum(nb.map((p, k) => p * (k - mean) ** 2));
ok('binomial negativa suma 1', close(sum(nb), 1, 1e-9));
ok('media = mu', close(mean, 10, 0.01), mean);
ok('varianza = mu + mu²/k (más que Poisson)', close(vr, 10 + 100 / 8, 0.1), vr);
ok('tamaño enorme → Poisson', close(LQ.nbPmf(3, 2, 1e9), Q.poissonPmf(3, 2), 1e-12));
const iv = LQ.countInterval(nb, 0.4);
ok('intervalo del conteo contiene la media', iv[0] <= 10 && iv[1] >= 10, iv);

// ── 2 · pocos partidos ────────────────────────────────────────────────────────
ok('peso de la temporada: n·τ²/(n·τ²+σ²)', close(LQ.shrinkWeight(6, 0.04, 0.7), 0.24 / 0.94));
ok('más partidos → más peso a la temporada', LQ.shrinkWeight(19, 0.04, 0.7) > LQ.shrinkWeight(6, 0.04, 0.7));
const sp = { avg: 1.3, home: S.HOME_L, away: S.AWAY_L, hAtt: 0.4, hDef: -0.3, aAtt: -0.2, aDef: 0.2, rho: -0.06 };
ok('peso 0 = equipos promedio; peso 1 = el fuerte gana más', LQ.shrinkProbs(sp, 1).p[0] > LQ.shrinkProbs(sp, 0).p[0]);
ok('1X2 del encogimiento suma 1', close(sum(LQ.shrinkProbs(sp, 0.5).p), 1, 1e-9));

// ── 14 · banca con varias apuestas ────────────────────────────────────────────
{
  const one = LQ.portfolio([{ p: 0.55, o: 2 }], { maxPct: 1, maxExposure: 1 });
  ok('Kelly completo de una apuesta = 0,10', close(one.kelly[0], 0.1));
  ok('con límite de caída se apuesta menos que Kelly completo', one.stakes[0] < 0.1 && one.stakes[0] > 0, one.stakes);
  ok('cumple E[W^−λ] ≤ 1', one.risk <= 1 + 1e-9, one.risk);
  ok('λ = log β / log α', close(one.lambda, Math.log(0.1) / Math.log(0.7)));
  const caps = LQ.portfolio([{ p: 0.6, o: 2 }, { p: 0.58, o: 2.1 }, { p: 0.57, o: 2.05 }, { p: 0.62, o: 1.9 }, { p: 0.55, o: 2.3 }, { p: 0.6, o: 2 }], { maxPct: 0.02, maxExposure: 0.1 });
  ok('nunca supera el tope por apuesta', caps.stakes.every((x) => x <= 0.02 + 1e-12), caps.stakes);
  ok('nunca supera la exposición total', caps.total <= 0.1 + 1e-12, caps.total);
  ok('sin ventaja no se apuesta', LQ.portfolio([{ p: 0.4, o: 2 }]).total === 0);
  const pth = LQ.paths([{ p: 0.55, o: 2 }], [0.05], 50, 300, 3);
  ok('trayectorias: 300 caminos de 51 puntos', pth.paths.length === 300 && pth.paths[0].length === 51);
  ok('probabilidad de caer bajo 70 % en (0,1)', pth.below >= 0 && pth.below < 1);
}

// ── 13 · simulador de temporada ───────────────────────────────────────────────
ok('error estándar con 10.000 en el peor caso = 0,5 puntos', close(LQ.simSE(0.5, 10000), 0.005));
{
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const table = {}; ids.forEach((id, i) => { table[id] = { pts: 30 - i * 3, gd: 10 - 2 * i, gf: 20, gp: 10 }; });
  table.a.pts = 100;
  const model = { mh: 1.4, ma: 1.1, teams: {} }; ids.forEach((id) => { model.teams[id] = { att: 0, def: 0, sd: 0.1 }; });
  const fx = []; ids.forEach((h) => ids.forEach((a) => { if (h !== a) fx.push({ id: h + a, h, a }); }));
  const lf = { type: 'league', top: 4, bottom: 3, tiebreak: 'gd' };
  const r = LQ.simulate(model, table, fx, lf, 400, null, 1);
  ok('liga: suma de campeones = 1', close(sum(ids.map((id) => r[id].champ)), 1, 1e-9));
  ok('liga: suma de «4 primeros» = 4 y de descenso = 3', close(sum(ids.map((id) => r[id].top)), 4, 1e-9) && close(sum(ids.map((id) => r[id].bottom)), 3, 1e-9));
  ok('con 100 puntos de ventaja es campeón siempre', r.a.champ === 1);
  const r2 = LQ.simulate(model, table, fx, lf, 400, null, 1);
  ok('misma semilla → mismo resultado', JSON.stringify(r) === JSON.stringify(r2));
  const fixed = { ba: '1' };
  const r3 = LQ.simulate(model, table, fx, lf, 400, fixed, 1);
  ok('fijar un resultado cambia la simulación', JSON.stringify(r3) !== JSON.stringify(r));
  // partido en curso: parte del marcador actual; sin tiempo restante, el resultado ya no cambia
  {
    const t2 = { p: { pts: 0, gd: 0, gf: 0, gp: 0 }, q: { pts: 0, gd: 0, gf: 0, gp: 0 } };
    const m2 = { mh: 1.5, ma: 1.2, teams: { p: { att: 0, def: 0, sd: 0 }, q: { att: 0.5, def: 0.5, sd: 0 } } };
    const lf2 = { type: 'league', top: 1, bottom: 0, tiebreak: 'gd' };
    const rl = LQ.simulate(m2, t2, [{ id: 'v', h: 'p', a: 'q', h0: 3, a0: 0, rem: 0 }], lf2, 200, null, 3);
    ok('en vivo 3-0 sin tiempo restante: el local gana siempre', rl.p.champ === 1, rl);
    const rf = LQ.simulate(m2, t2, [{ id: 'v', h: 'p', a: 'q', h0: 3, a0: 0, rem: 0 }], lf2, 50, { v: '2' }, 3);
    ok('resultado fijado imposible se fuerza a un marcador que lo cumple', rf.q.champ === 1, rf);
  }
  // formato colombiano: 8 a cuadrangulares, 2 a la final, 1 campeón, 2 descienden
  const ids20 = Array.from({ length: 12 }, (_, i) => 't' + i);
  const t20 = {}; ids20.forEach((id, i) => { t20[id] = { pts: 30 - i, gd: 0, gf: 10, gp: 18 }; });
  const m20 = { mh: 1.3, ma: 1.0, teams: {} }; ids20.forEach((id) => { m20.teams[id] = { att: 0, def: 0, sd: 0.1 }; });
  const rel = {}; ids20.forEach((id, i) => { rel[id] = { pts: 100 - i * 5, gp: 76 }; });
  const cf = { type: 'col-cuadrangulares', rounds: 19, playoff: 8, bottom: 2, tiebreak: 'gd' };
  const rc = LQ.simulate(m20, t20, [{ id: 'x', h: 't0', a: 't11' }], cf, 300, null, 9, [], { relegation: rel });
  ok('Colombia: 8 a cuadrangulares por temporada', close(sum(ids20.map((id) => rc[id].playoff)), 8, 1e-9));
  ok('Colombia: 2 finalistas y 1 campeón', close(sum(ids20.map((id) => rc[id].final)), 2, 1e-9) && close(sum(ids20.map((id) => rc[id].champ)), 1, 1e-9));
  ok('Colombia: 2 descensos por promedio', close(sum(ids20.map((id) => rc[id].bottom)), 2, 1e-9));
  ok('Colombia: el peor promedio desciende', rc.t11.bottom === 1);
}
{
  // fase de todos contra todos: los primeros K partidos de cada equipo, con K = lo que juegan los eliminados
  const teams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
  const games = []; let n = 0;
  teams.forEach((h, i) => teams.forEach((a, j) => { if (i < j) games.push({ id: 'g' + n++, hid: h, aid: a }); }));
  games.push({ id: 'po1', hid: 'a', aid: 'b' }, { id: 'po2', hid: 'c', aid: 'd' });
  const rr = SEASON.roundRobin(games);
  ok('detecta la fase de todos contra todos (deja fuera los de eliminación)', rr.length === 66 && !rr.some((g) => /^po/.test(g.id)), rr.length);
}

// ── 1 · fuerza en el tiempo (Kalman) ──────────────────────────────────────────
{
  const mk = (d, h, a, hs, as) => ({ id: d + h, date: '2026-01-' + String(d).padStart(2, '0') + 'T20:00Z', season: 's', hid: h, aid: a, hs, as, done: true });
  const ms = [mk(1, 'A', 'B', 4, 0), mk(8, 'C', 'A', 0, 3), mk(15, 'A', 'D', 5, 1)];
  const run = S.kalmanRun(ms, { q: 0.0002, p0: 0.1, rho: 0.8 });
  ok('quien gana fácil sube su fuerza', run.teams.A.a + run.teams.A.d > 0.1, run.teams.A);
  ok('tras cada partido la incertidumbre se encoge', run.teams.A.Pa < 0.1);
  let v1 = 0, v2 = 0;
  S.kalmanRun([mk(1, 'A', 'B', 1, 1), mk(2, 'A', 'C', 1, 1)], {}, (m, s) => { if (m.id === '2A') v1 = s.varL; });
  S.kalmanRun([mk(1, 'A', 'B', 1, 1), mk(30, 'A', 'C', 1, 1)], {}, (m, s) => { if (m.id === '30A') v2 = s.varL; });
  ok('entre partidos la incertidumbre crece con los días', v2 > v1, [v1, v2]);
}

// ── 5 · altura: recupera un efecto conocido en datos sintéticos ─────────────────
{
  const r = LQ.rng(21), rows = [];
  for (let i = 0; i < 3000; i++) { const x = r() < 0.5 ? 0 : r() * 3; const lam = 1.2 + 0.4 * r(); rows.push({ x, lam, y: LQ.poisson(r, lam * Math.exp(0.2 * x)) }); }
  const f = S.altitudeFit(rows);
  ok('altura: δ estimado ≈ 0,2 (±2 errores estándar)', Math.abs(f.delta - 0.2) < 2 * f.se + 0.01, f);
  ok('altura: ciudad con región («Palmira, Valle Cauca»)', S.altitudeOf('Palmira, Valle Cauca') === 1001 && S.altitudeOf('Bogotá') === 2640 && S.altitudeOf('El Alto, La Paz.') === 4090);
}

// ── 4 · factores: Shapley exacto ──────────────────────────────────────────────
{
  const fit = { beta: [0.35, 0.6, 0.1, 0.03, 0.2], t1: -0.7, t2: 0.5 };
  const x = { home: 1, pi: 0.4, form: 0.8, rest: -2, alt: 1.2 };
  const sh = X.shapley(fit, x);
  for (let o = 0; o < 3; o++) ok('Shapley eficiente (resultado ' + o + '): suma de aportes = final − base', close(sum(sh.factors.map((f) => f.phi[o])), sh.final[o] - sh.base[o], 1e-12));
  ok('factor con valor 0 aporta 0', close(X.shapley(fit, Object.assign({}, x, { rest: 0 })).factors[3].phi[0], 0, 1e-12));
  ok('modelo ordenado suma 1', close(sum(X.predict(fit, x)), 1, 1e-12));
}

// ── 3 · alineaciones ──────────────────────────────────────────────────────────
{
  const ev = { goals: [[30, 0], [70, 1]] };
  const lu = { s: [['h1', 'h2'], ['a1', 'a2']], subs: [[60, 0, 'h3', 'h2']], reds: [[80, 1, 'a2']] };
  const seg = LU.segments(ev, lu);
  ok('tramos: duración total = fin del partido', sum(seg.map((s) => s.dur)) === 93, seg.map((s) => s.dur));
  ok('tramos: diferencia de goles total = marcador', sum(seg.map((s) => s.gd)) === 0);
  ok('tras el cambio entra h3 y sale h2', seg[1].home.includes('h3') && !seg[1].home.includes('h2'));
  ok('tras la roja el visitante queda con uno menos', seg[seg.length - 1].away.length === 1);
  // ridge recupera el orden de dos jugadores en datos sintéticos
  const r = LQ.rng(4), rows = [];
  for (let i = 0; i < 2000; i++) { const p = r() < 0.5 ? 'buena' : 'mala'; rows.push({ cols: [[p, 1]], y: (p === 'buena' ? 0.6 : -0.4) + LQ.normal(r), w: 1 }); }
  const fit = LU.ridge(rows, 5);
  ok('ridge: el jugador bueno tiene mejor nota', fit.beta.buena > fit.beta.mala, fit.beta);
}

// ── 6 · peligro de gol ────────────────────────────────────────────────────────
{
  const base = [1.5, 1.1];
  const p0 = LV.windowProb(30, 10, base, [0, 0], [], { alpha: 0, beta: 1 });
  let I = 0; for (let u = 30; u < 40; u += 0.5) I += (base[0] + base[1]) * LV.shape(u + 0.25) * 0.5;
  ok('sin calentamiento = 1 − e^(−∫ intensidad)', close(p0, 1 - Math.exp(-I), 1e-12));
  ok('un gol reciente calienta el partido (α > 0)', LV.windowProb(30, 10, base, [0, 0], [[28, 'gol']], { alpha: 0.5, beta: 1 / 8 }) > p0);
  ok('ventana más larga = más probabilidad', LV.windowProb(30, 15, base, [0, 0], [], { alpha: 0, beta: 1 }) > p0);
  const now = LV.now({ minute: 60, scores: [1, 0], details: [{ minute: 58, type: 'gol' }], period: 2 }, base, { alpha: 0.3, beta: 1 / 8 }, 0.2);
  ok('termómetro en vivo: 5 < 10 < 15 minutos', now.p5 < now.p10 && now.p10 < now.p15, now);
}

// ── 7 · movimientos fuertes ───────────────────────────────────────────────────
{
  const t = 1e6, snaps = [];
  ['A', 'B', 'C'].forEach((b, i) => { snaps.push({ t, book: b, sharp: b === 'A', q: [0.5, 0.27, 0.27] }); snaps.push({ t: t + 120e3 + i * 1000, book: b, sharp: b === 'A', q: [0.52, 0.26, 0.26] }); snaps.push({ t: t + 4000e3, book: b, sharp: b === 'A', q: [0.53, 0.25, 0.26] }); });
  const d = MK.detectSteam(snaps);
  const s = d.signals.find((x) => x.sel === 0);
  ok('3 casas, +0,02 en 2 minutos → movimiento fuerte hacia el local', d.available && s && s.dir === 'baja' && s.books === 3, d);
  ok('la casa de referencia también se movió', s && s.sharpMoved);
  ok('una sola casa → no se puede detectar', MK.detectSteam(snaps.filter((x) => x.book === 'A')).available === false);
}

// ── 8 · ¿subirá o bajará? ─────────────────────────────────────────────────────
{
  const r = LQ.rng(8), rows = [];
  for (let i = 0; i < 400; i++) {
    const open = [1.8 + r(), 3.3, 3.5 + r()];
    const qo = Q.devigShin(open), pm = [qo[0] + 0.06 * (r() - 0.3), qo[1], qo[2]];
    const qc = [qo[0] + 0.5 * (pm[0] - qo[0]), qo[1], 0]; qc[2] = 1 - qc[0] - qc[1];
    rows.push({ open, close: qc.map((q) => 1 / q), pModel: pm });
  }
  const m = MK.trainClosing(rows);
  const f = MK.forecastClosing(m, [2.2, 3.3, 3.6], [0.5, 0.27, 0.23]);
  ok('si el modelo ve más probable al local que la casa, su cuota probablemente baje', f[0].delta > 0 && MK.direction(f[0].delta) === 'baje', f[0]);
  ok('frases simples', MK.direction(-0.02) === 'suba' && MK.direction(0.001) === 'se mantenga');
}

// ── 10 · baloncesto (apagado) ─────────────────────────────────────────────────
{
  const ps = [{ id: 'star', min: 34, rate: 0.8, usage: 0.3 }, { id: 'b', min: 32, rate: 0.5, usage: 0.2, withoutShare: { star: 0.5 } }, { id: 'c', min: 30, rate: 0.4, usage: 0.15, withoutShare: { star: 0.2 } }];
  const out = NBA.cascade(ps, 'star', 10);
  ok('el uso del ausente se reparte completo', close(sum(out.map((p) => p.flow)), 0.3, 1e-12));
  ok('quien más absorbe es quien más rendía sin él', out[0].flow > out[1].flow);
  ok('módulo apagado', NBA.enabled === false);
}

console.log((fail ? '✗ ' : '✓ ') + pass + ' pruebas del laboratorio correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);

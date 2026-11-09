/* Tests del paquete de fórmulas. Ejecutar: node tests/quant.test.js */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const Q = require('../assets/js/quant.js');
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-vectors.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.error('✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Vectores compartidos
V.implied.forEach((v) => ok('implied ' + v.o, close(Q.implied(v.o), v.q)));
V.americanToDecimal.forEach((v) => ok('american ' + v.a, close(Q.americanToDecimal(v.a), v.o)));
V.overround.forEach((v) => ok('overround', close(Q.overround(v.odds), v.B)));
V.ev.forEach((v) => ok('ev', close(Q.ev(v.p, v.o), v.ev)));
V.kelly.forEach((v) => ok('kelly ' + v.p, close(Q.kelly(v.p, v.o), v.f)));
V.clv.forEach((v) => ok('clv', close(Q.clv(v.o, v.p), v.clv)));
V.poisson.forEach((v) => ok('poisson ' + v.x, close(Q.poissonPmf(v.x, v.lambda), v.p, 1e-12)));
V.nMin.forEach((v) => ok('nMin', close(Q.nMin(v.z, v.o, v.p, v.edge), v.n, 1e-6)));
V.eloExpected.forEach((v) => ok('elo', close(Q.eloExpected(v.ra, v.rb), v.e)));

// Invariantes del devig: siempre suman 1
const books = [[1.9, 3.5, 5.0], [1.25, 6.0, 11.0], [1.95, 1.95], [1.5, 2.8], [3.1, 3.3, 2.4]];
books.forEach((b) => {
  ['mult', 'power', 'shin'].forEach((m) => {
    const p = Q.devig(b, m);
    ok('devig ' + m + ' suma 1 ' + b, close(Q.sum(p), 1, 1e-9), Q.sum(p));
    ok('devig ' + m + ' en (0,1)', p.every((x) => x > 0 && x < 1));
  });
  // Shin y potencia recortan más al underdog que el multiplicativo
  if (b.length === 3) {
    const lo = b.indexOf(Math.max(...b));
    ok('shin recorta longshot ' + b, Q.devigShin(b)[lo] <= Q.devigMultiplicative(b)[lo] + 1e-12);
  }
});
ok('shin z ≥ 0', Q.shinZ([1.9, 3.5, 5.0]) >= 0);

// applyMargin es la inversa aproximada del método potencia
const fair = [0.5, 0.3, 0.2];
const loaded = Q.applyMargin(fair, 0.05);
ok('applyMargin carga 5 %', close(Q.overround(loaded), 1.05, 1e-9));
ok('devigPower invierte applyMargin', Q.devigPower(loaded).every((p, i) => close(p, fair[i], 1e-7)));

// Kelly fraccional nunca supera el tope
for (let i = 0; i < 500; i++) {
  const p = 0.05 + Math.random() * 0.9, o = 1.05 + Math.random() * 9;
  const k = Q.kellyStake(p, o, { fraction: 0.5, maxPct: 0.02, bankroll: 1000 });
  if (!(k.f <= 0.02 + 1e-12 && k.f >= 0)) { ok('kelly tope', false, p + ' ' + o + ' ' + k.f); break; }
}
ok('kelly con EV negativo = 0', Q.kellyStake(0.3, 2, {}).f === 0);

// Dixon-Coles: la matriz suma 1 y los mercados son coherentes
const M = Q.scoreMatrix(1.6, 1.1, -0.08, 10);
ok('matriz suma 1', close(M.flat().reduce((a, b) => a + b, 0), 1, 1e-12));
const mk = Q.marketsFromMatrix(M);
ok('1X2 suma 1', close(mk.home + mk.draw + mk.away, 1, 1e-12));
ok('over 1.5 ≥ over 2.5', mk.over[1.5] >= mk.over[2.5]);
ok('rho < 0 sube empates bajos', Q.scoreMatrix(1.2, 1.2, -0.1)[1][1] > Q.scoreMatrix(1.2, 1.2, 0)[1][1]);
ok('top marcador ordenado', mk.top[0].p >= mk.top[1].p);
const live = Q.marketsFromMatrix(Q.scoreMatrix(0.0001, 0.0001, 0, 6), 2, 0);
ok('en vivo al final, 2-0 casi seguro local', live.home > 0.999);

// Métricas
ok('brier perfecto = 0', Q.brier([1, 0], [1, 0]) === 0);
ok('logloss 0.5 = ln2', close(Q.logLoss([0.5], [1]), Math.log(2)));
ok('rps perfecto = 0', close(Q.rps([1, 0, 0], 0), 0));
ok('rps peor caso = 1', close(Q.rps([0, 0, 1], 0), 1));
ok('blend w=1 es modelo', close(Q.blend(0.6, 0.4, 1), 0.6));
ok('blend w=0 es mercado', close(Q.blend(0.6, 0.4, 0), 0.4));
ok('blendMulti suma 1', close(Q.sum(Q.blendMulti([0.5, 0.3, 0.2], [0.45, 0.3, 0.25], 0.35)), 1));
ok('fraccional 2.5 = 3/2', Q.decimalToFractional(2.5).join('/') === '3/2');
ok('americana 1.5 = -200', close(Q.decimalToAmerican(1.5), -200));

// SHA-256 (core.js) en un contexto aislado
const ctx = { window: {}, document: { documentElement: { dataset: {} }, querySelector: () => null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Intl, Math, JSON, Date, Object, String, Array, unescape, encodeURIComponent, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/core.js'), 'utf8'), ctx);
V.sha256.forEach((v) => ok('sha256 "' + v.in + '"', ctx.XP.sha256(v.in) === v.out, ctx.XP.sha256(v.in)));

console.log((fail ? '✗' : '✓') + ' ' + pass + ' pruebas correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);

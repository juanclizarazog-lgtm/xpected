/* Pruebas del motor de pronóstico, del adaptador de datos y de los cálculos que ve el apostador.
   Ejecutar: node tests/model.test.js */
'use strict';
const Q = require('../assets/js/quant.js');
const MODEL = require('../lib/model.js');
const ESPN = require('../lib/espn.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); } };
const close = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ── conversión de cuotas americanas (lo que publica la fuente) ────────────────
ok('dec +150 = 2,50', ESPN.dec('+150') === 2.5);
ok('dec -110 = 1,91', ESPN.dec('-110') === 1.91);
ok('dec -185 = 1,54', ESPN.dec('-185') === 1.54);
ok('dec +100 = 2,00', ESPN.dec('+100') === 2);
ok('dec EVEN = 2,00', ESPN.dec('EVEN') === 2);
ok('dec OFF = sin cuota', ESPN.dec('OFF') === null);
ok('dec 0 = sin cuota', ESPN.dec(0) === null && ESPN.dec('0') === null);
ok('dec número 290 = 3,90', ESPN.dec(290) === 3.9);

// ── lectura del minuto ────────────────────────────────────────────────────────
ok("minuto 57'", ESPN.minuteOf("57'") === 57);
ok("minuto 45'+2'", ESPN.minuteOf("45'+2'") === 47);
ok("minuto 90'+5'", ESPN.minuteOf("90'+5'") === 95);
ok('minuto HT sin número = 0 (el adaptador lo corrige a 45)', ESPN.minuteOf('HT') === 0);

// ── normalización de un evento en entretiempo y con roja ─────────────────────
const team = (id, ab, score, form) => ({ homeAway: id === '1' ? 'home' : 'away', score: String(score), form, records: [{ summary: '5-3-2' }], team: { id, abbreviation: ab, displayName: ab + ' FC', logo: null, color: '112233' } });
const rawEvent = (over) => Object.assign({
  id: '999', date: new Date(Date.now() - 50 * 60e3).toISOString(),
  status: { displayClock: 'HT', period: 1, type: { name: 'STATUS_HALFTIME', state: 'in', completed: false, shortDetail: 'HT' } },
  competitions: [{ competitors: [team('1', 'HOM', 1, 'WWDLW'), team('2', 'AWY', 0, 'LDLWL')], details: [{ type: { text: 'Red Card' }, redCard: true, clock: { displayValue: "30'" }, team: { id: '2' }, athletesInvolved: [{ shortName: 'X. Pérez' }] }],
    odds: [{ moneyline: { home: { open: { odds: '+120' }, close: { odds: '-110' } }, draw: { open: { odds: '+250' } }, away: { open: { odds: '+230' }, close: { odds: '+260' } } }, drawOdds: { moneyLine: 260 }, overUnder: 2.5 }] }],
}, over || {});
const ht = ESPN.normalize(rawEvent(), 'eng.1', null, { map: { 1: { rank: 3, gp: 10, gf: 18, ga: 9, pts: 20 }, 2: { rank: 15, gp: 10, gf: 10, ga: 16, pts: 9 } }, avg: 1.4 });
ok('entretiempo → minuto 45', ht.minute === 45, ht.minute);
ok('entretiempo marcado', ht.halftime === true);
ok('roja contada para el visitante', ht.reds[0] === 0 && ht.reds[1] === 1, ht.reds);
ok('en juego la cuota se marca como cierre prepartido', ht.books[0].prematch === true);
ok('cuotas actuales convertidas', ht.books[0].h2h.home === 1.91 && ht.books[0].h2h.draw === 3.6 && ht.books[0].h2h.away === 3.6, ht.books[0].h2h);
const pre = ESPN.normalize(rawEvent({ status: { displayClock: "0'", period: 0, type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false } } }), 'eng.1', null, null);
ok('antes del partido la cuota es actual', pre.books[0].prematch === false && pre.minute === 0 && pre.scores === null);
const sh = ESPN.normalize(rawEvent({ status: { displayClock: "12'", period: 2, type: { name: 'STATUS_SECOND_HALF', state: 'in', completed: false } } }), 'eng.1', null, null);
ok('2.º tiempo con reloj raro → al menos 46', sh.minute === 46, sh.minute);
ok('2.º tiempo NO es entretiempo', sh.halftime === false);
const fh = ESPN.normalize(rawEvent({ status: { displayClock: "33'", period: 1, type: { name: 'STATUS_FIRST_HALF', state: 'in', completed: false, shortDetail: "33'" } } }), 'eng.1', null, null);
ok('1.er tiempo: minuto 33 y no es entretiempo', fh.minute === 33 && fh.halftime === false, [fh.minute, fh.halftime]);

// ── modelo prepartido ─────────────────────────────────────────────────────────
const base = {
  state: 'pre', minute: 0, leagueAvg: 1.4,
  homeTeam: { form: 'WWDWW', standing: { gp: 12, gf: 26, ga: 10 } },
  awayTeam: { form: 'LLDLW', standing: { gp: 12, gf: 11, ga: 22 } },
  books: [{ h2h: { home: 1.55, draw: 4.2, away: 6.0 }, prematch: false }],
};
const m0 = MODEL.build(base);
ok('1X2 del modelo suma 1', close(sum(m0.pModel), 1, 1e-9), sum(m0.pModel));
ok('1X2 publicado suma 1', close(sum(m0.pFinal), 1, 1e-9), sum(m0.pFinal));
ok('mercado sin margen suma 1', close(sum(m0.pMarket), 1, 1e-9));
ok('favorito claro es el local fuerte', m0.pFinal[0] > 0.55 && m0.pFinal[0] > m0.pFinal[2] * 3, m0.pFinal);
ok('mezcla queda entre modelo y mercado (local)', m0.pFinal[0] <= Math.max(m0.pModel[0], m0.pMarket[0]) + 0.01 && m0.pFinal[0] >= Math.min(m0.pModel[0], m0.pMarket[0]) - 0.01, [m0.pModel[0], m0.pMarket[0], m0.pFinal[0]]);
ok('peso del modelo 0,35 con tabla y cuotas', m0.w === 0.35 && m0.quality === 'alta');
ok('más de 2,5 y ambos marcan en (0,1)', m0.over25 > 0 && m0.over25 < 1 && m0.btts > 0 && m0.btts < 1);
ok('goles esperados razonables', m0.lam + m0.mu > 1.5 && m0.lam + m0.mu < 4.5, m0.lam + m0.mu);
ok('el local fuerte espera más goles', m0.lam > m0.mu);
// sin tabla pero con cuotas: el modelo reproduce al mercado
const mk = MODEL.build(Object.assign({}, base, { homeTeam: {}, awayTeam: {} }));
ok('sin tabla → calibrado al mercado', mk.quality === 'mercado' && Math.abs(mk.pModel[0] - mk.pMarket[0]) < 0.01 && Math.abs(mk.pModel[2] - mk.pMarket[2]) < 0.01, [mk.pModel, mk.pMarket]);
// matriz final coherente: reproduce el 1X2 publicado y se acerca a la línea de goles de la casa
const mat = (r) => { const M = Q.scoreMatrix(r.lam, r.mu, -0.06, 10); return Q.marketsFromMatrix(M); };
const f0 = mat(m0);
ok('la matriz final reproduce el 1X2 publicado (±1 pt)', Math.abs(f0.home - m0.pFinal[0]) < 0.01 && Math.abs(f0.away - m0.pFinal[2]) < 0.01, [f0.home, f0.away, m0.pFinal]);
ok('el marcador más probable concuerda con el favorito', m0.top[0].h >= m0.top[0].a, m0.top[0]);
const wt = (over, under) => MODEL.build(Object.assign({}, base, { books: [{ h2h: base.books[0].h2h, totals: { point: 2.5, over, under }, prematch: false }] }));
const hiG = wt(1.5, 2.6), loG = wt(2.6, 1.5);
ok('la línea de goles de la casa mueve los goles esperados', hiG.lam + hiG.mu > loG.lam + loG.mu + 0.4, [hiG.lam + hiG.mu, loG.lam + loG.mu]);
ok('más de 2,5 final queda entre modelo y casa', hiG.totals.pFinal > Math.min(hiG.totals.pModel, hiG.totals.pMarket) - 0.02 && hiG.totals.pFinal < Math.max(hiG.totals.pModel, hiG.totals.pMarket) + 0.02, hiG.totals);
ok('la línea de goles no cambia el 1X2 publicado', hiG.pFinal.every((p, i) => close(p, m0.pFinal[i], 1e-12)));
const mkT = MODEL.build({ state: 'pre', homeTeam: {}, awayTeam: {}, books: [{ h2h: { home: 2.2, draw: 3.4, away: 3.3 }, totals: { point: 2.5, over: 1.72, under: 2.1 }, prematch: false }] });
ok('solo cuotas: reproduce 1X2 y línea de goles de la casa (±1,5 pts)', Math.abs(mkT.totals.pFinal - mkT.totals.pMarket) < 0.015 && Math.abs(mkT.pModel[0] - mkT.pMarket[0]) < 0.015, [mkT.totals, mkT.pModel, mkT.pMarket]);
ok('línea asiática (2,25) se ignora', MODEL.build(Object.assign({}, base, { books: [{ h2h: base.books[0].h2h, totals: { point: 2.25, over: 1.9, under: 1.9 } }] })).totals === null);
// sin nada: probabilidades válidas y baja calidad
const none = MODEL.build({ state: 'pre', homeTeam: {}, awayTeam: {}, books: [] });
ok('sin datos → calidad baja y suma 1', none.quality === 'baja' && close(sum(none.pFinal), 1, 1e-9));

// ── modelo en vivo ────────────────────────────────────────────────────────────
const live = (minute, scores, extra) => MODEL.build(Object.assign({}, base, { state: 'in', minute, scores, books: [{ h2h: base.books[0].h2h, prematch: true }] }, extra || {}));
const l85 = live(85, [2, 0]);
ok('2-0 al 85\' → local > 97 %', l85.pFinal[0] > 0.97, l85.pFinal);
ok('en vivo no se mezcla con la cuota de cierre', l85.pFinal.every((p, i) => close(p, l85.pModel[i], 1e-12)));
const d89 = live(89, [1, 1]);
ok('1-1 al 89\' → empate > 75 %', d89.pFinal[1] > 0.75, d89.pFinal);
const ft = live(95, [0, 1]);
ok('0-1 al 95\' → visitante ~100 %', ft.pFinal[2] > 0.995, ft.pFinal);
const h45 = live(45, [0, 0]);
const k0 = live(1, [0, 0]);
ok('al descanso queda algo más de la mitad de los goles (se marca más al final)', Math.abs((h45.lam + h45.mu) / (k0.lam + k0.mu) - MODEL.remaining(45, 1) / MODEL.remaining(1, 1)) < 1e-9 && MODEL.remaining(45, 1) / MODEL.remaining(1, 1) > 0.52, MODEL.remaining(45, 1) / MODEL.remaining(1, 1));
ok('intensidad normalizada: un partido de 90\' completo = 1', close(MODEL.remaining(0, 1) - MODEL.remaining(90, 1), 1, 1e-12));
ok('quien pierde ataca más, quien gana se repliega', MODEL.stateFactor(-1) > 1 && MODEL.stateFactor(1) < 1 && MODEL.stateFactor(0) === 1);
// referencia del mundo real: equipos parejos, 2-0 a falta de ~30' → los mercados en vivo suelen dar 90-96 %
const even = { state: 'in', minute: 62, scores: [2, 0], homeTeam: {}, awayTeam: {}, books: [{ h2h: { home: 2.5, draw: 3.3, away: 2.9 }, prematch: true }] };
const e62 = MODEL.build(even);
ok('2-0 al 62\' entre equipos parejos: 90–96 %', e62.pFinal[0] > 0.9 && e62.pFinal[0] < 0.96, e62.pFinal);
const e1 = MODEL.build(Object.assign({}, even, { minute: 70, scores: [1, 0] }));
ok('1-0 al 70\' entre equipos parejos: 70–82 %', e1.pFinal[0] > 0.7 && e1.pFinal[0] < 0.82, e1.pFinal);
const red = live(30, [0, 0], { reds: [1, 0] });
const noRed = live(30, [0, 0], { reds: [0, 0] });
ok('roja del local baja su ataque y sube el del rival', red.lam < noRed.lam && red.mu > noRed.mu);
ok('roja del local baja su probabilidad de ganar', red.pFinal[0] < noRed.pFinal[0]);
const et = live(100, [1, 1], { period: 3 });
const noEt = live(100, [1, 1], { period: 2 });
ok('prórroga: todavía hay goles esperados', et.lam + et.mu > 0.1 && noEt.lam + noEt.mu === 0, [et.lam + et.mu, noEt.lam + noEt.mu]);
ok('restante al minuto 0 incluye el añadido (> 1)', MODEL.remaining(0, 1) > 1 && MODEL.remaining(93, 2) === 0);

// ── cálculos que ve el apostador ──────────────────────────────────────────────
const p = 0.298, o = 3.45;
ok('valor estimado Elche +2,8 %', close(Q.ev(p, o), 0.0281, 1e-4), Q.ev(p, o));
ok('cuota justa = 1/p', close(1 / p, 3.3557, 1e-4));
const k = Q.kellyStake(p, o, { fraction: 0.25, maxPct: 0.02, bankroll: 1000000 });
ok('monto prudente = ¼ Kelly × banca', close(k.stake, ((p * o - 1) / (o - 1)) * 0.25 * 1000000, 1e-6), k.stake);
ok('monto prudente nunca supera el tope de 2 %', Q.kellyStake(0.9, 3, { fraction: 0.5, maxPct: 0.02, bankroll: 1e6 }).stake === 20000);
const slipOdds = 3.45 * 1.91, slipP = 0.298 * 0.544;
ok('boleto: cuota combinada 6,59', close(slipOdds, 6.5895, 1e-4));
ok('boleto: probabilidad 16,2 %', Math.abs(slipP - 0.162) < 0.001);
ok('boleto: valor +6,8 %', Math.abs(slipP * slipOdds - 1 - 0.068) < 0.002, slipP * slipOdds - 1);
// el margen de la casa siempre es positivo en cuotas reales
// cuotas reales capturadas de la fuente el 8 de noviembre (BHA-BRE, CRY-LIV, IPS-BOU, ELC-BET, TOL-MIL)
const realBooks = [[1.91, 3.9, 3.8], [5.25, 4.4, 1.59], [4, 3.7, 1.91], [3.45, 3.75, 2.05], [2.15, 3.1, 3.3]];
realBooks.forEach((b) => ok('margen positivo ' + b, Q.overround(b) > 1 && Q.overround(b) < 1.12, Q.overround(b)));

console.log((fail ? '✗' : '✓') + ' ' + pass + ' pruebas del modelo correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);

/*
 * Xpected · motor de demostración (sustituye a services/model + ingest + grader).
 * Genera ligas, equipos, partidos y cuotas simuladas, aplica Dixon-Coles + Elo,
 * devig Shin, mezcla logit con el mercado, congela predicciones con SHA-256 y
 * simula el tiempo real (equivalente a los mensajes SSE odds | prob | state | grade).
 * En producción estos datos llegan de Postgres/Redis; la UI no cambia.
 */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ;

  const LEAGUES = [
    { slug: 'premier-league', name: 'Premier League', short: 'PL', country: 'Inglaterra', base: Math.log(1.36), home: 0.2, rho: -0.06, w: 0.35, nEff: 900, marketOnly: false,
      teams: [['Arsenal', 'ARS', 0.36], ['Liverpool', 'LIV', 0.34], ['Manchester City', 'MCI', 0.32], ['Chelsea', 'CHE', 0.2], ['Newcastle', 'NEW', 0.14], ['Aston Villa', 'AVL', 0.1], ['Tottenham', 'TOT', 0.05], ['Manchester United', 'MUN', 0.03], ['Brighton', 'BHA', 0.02], ['Brentford', 'BRE', -0.06]],
      plan: ['final', 'vivo:34', 'vivo:71', 'previa', 'previa'] },
    { slug: 'laliga', name: 'LaLiga', short: 'LL', country: 'España', base: Math.log(1.25), home: 0.24, rho: -0.07, w: 0.33, nEff: 860, marketOnly: false,
      teams: [['Real Madrid', 'RMA', 0.4], ['Barcelona', 'BAR', 0.39], ['Atlético de Madrid', 'ATM', 0.26], ['Athletic Club', 'ATH', 0.14], ['Villarreal', 'VIL', 0.12], ['Real Betis', 'BET', 0.07], ['Real Sociedad', 'RSO', 0.05], ['Sevilla', 'SEV', -0.02], ['Valencia', 'VAL', -0.05], ['Girona', 'GIR', -0.04]],
      plan: ['final', 'vivo:12', 'previa', 'previa', 'previa'] },
    { slug: 'liga-betplay', name: 'Liga BetPlay', short: 'BP', country: 'Colombia', base: Math.log(1.12), home: 0.33, rho: -0.09, w: 0.3, nEff: 600, marketOnly: false,
      teams: [['Atlético Nacional', 'NAC', 0.24], ['Millonarios', 'MIL', 0.2], ['América de Cali', 'AME', 0.17], ['Junior', 'JUN', 0.16], ['Deportes Tolima', 'TOL', 0.12], ['Independiente Medellín', 'DIM', 0.1], ['Independiente Santa Fe', 'SFE', 0.07], ['Atlético Bucaramanga', 'BUC', 0.05], ['Once Caldas', 'ONC', 0.01], ['Deportivo Cali', 'CAL', -0.03]],
      plan: ['vivo:58', 'previa', 'previa', 'previa', 'previa'] },
    { slug: 'libertadores', name: 'Copa Libertadores', short: 'CL', country: 'Sudamérica', base: Math.log(1.15), home: 0.36, rho: -0.08, w: 0, nEff: 300, marketOnly: true,
      teams: [['Flamengo', 'FLA', 0.32], ['Palmeiras', 'PAL', 0.3], ['River Plate', 'RIV', 0.27], ['Boca Juniors', 'BOC', 0.2], ['Racing Club', 'RAC', 0.17], ['Botafogo', 'BOT', 0.19]],
      plan: ['vivo:80', 'previa', 'previa'] },
  ];

  const GROUPS = [
    { id: '1x2', name: 'Resultado (1X2)', sels: ['1', 'X', '2'], kind: 'partition', devig: 'shin', sharpMargin: 0.025 },
    { id: 'dc', name: 'Doble oportunidad', sels: ['1X', 'X2', '12'], kind: 'derived', from: '1x2' },
    { id: 'ou15', name: 'Total de goles 1.5', sels: ['O1.5', 'U1.5'], kind: 'partition', devig: 'mult', sharpMargin: 0.022 },
    { id: 'ou25', name: 'Total de goles 2.5', sels: ['O2.5', 'U2.5'], kind: 'partition', devig: 'mult', sharpMargin: 0.02 },
    { id: 'ou35', name: 'Total de goles 3.5', sels: ['O3.5', 'U3.5'], kind: 'partition', devig: 'mult', sharpMargin: 0.022 },
    { id: 'btts', name: 'Ambos marcan', sels: ['BTTS-S', 'BTTS-N'], kind: 'partition', devig: 'mult', sharpMargin: 0.024 },
    { id: 'dnb', name: 'Empate no apuesta', sels: ['DNB-1', 'DNB-2'], kind: 'partition', devig: 'mult', sharpMargin: 0.022 },
  ];
  const BOOK_MARGINS = [0.042, 0.05, 0.036];

  const now0 = Date.now();
  const dayKey = XP.fmt.dayKey(new Date(now0));
  const rand = Q.mulberry32(Q.hashSeed('xpected-' + dayKey));
  const gauss = () => Q.gaussian(rand);

  // ── equipos ──────────────────────────────────────────────────────────────────
  const teams = {};
  const INJ = ['Delantero titular — lesión muscular', 'Mediocampista titular — duda', 'Defensa central — suspendido', 'Lateral titular — molestia', 'Portero suplente — lesión', 'Extremo titular — duda'];
  LEAGUES.forEach((L) => {
    L.teamIds = L.teams.map(([name, code, s]) => {
      const id = XP.slug(name);
      const nInj = Math.floor(rand() * 3);
      const inj = [];
      for (let i = 0; i < nInj; i++) inj.push(INJ[Math.floor(rand() * INJ.length)]);
      teams[id] = {
        id, name, code, league: L.slug, s,
        att: s * 0.78 + gauss() * 0.04,
        def: s * 0.66 + gauss() * 0.04,
        elo: Math.round(1500 + s * 520 + gauss() * 14),
        injuries: Array.from(new Set(inj)),
      };
      return id;
    });
  });

  // ── utilidades de mercado ────────────────────────────────────────────────────
  function probMap(mk) {
    const nb = mk.home + mk.away;
    return {
      '1': mk.home, 'X': mk.draw, '2': mk.away,
      '1X': mk.home + mk.draw, 'X2': mk.draw + mk.away, '12': mk.home + mk.away,
      'O1.5': mk.over[1.5], 'U1.5': 1 - mk.over[1.5],
      'O2.5': mk.over[2.5], 'U2.5': 1 - mk.over[2.5],
      'O3.5': mk.over[3.5], 'U3.5': 1 - mk.over[3.5],
      'BTTS-S': mk.btts, 'BTTS-N': 1 - mk.btts,
      'DNB-1': nb > 0 ? mk.home / nb : 0.5, 'DNB-2': nb > 0 ? mk.away / nb : 0.5,
    };
  }

  function selLabel(m, sel) {
    const H = teams[m.home].name, A = teams[m.away].name;
    return ({
      '1': H, 'X': 'Empate', '2': A,
      '1X': H + ' o empate', 'X2': 'Empate o ' + A, '12': H + ' o ' + A,
      'O1.5': 'Más de 1.5', 'U1.5': 'Menos de 1.5', 'O2.5': 'Más de 2.5', 'U2.5': 'Menos de 2.5', 'O3.5': 'Más de 3.5', 'U3.5': 'Menos de 3.5',
      'BTTS-S': 'Sí', 'BTTS-N': 'No', 'DNB-1': H, 'DNB-2': A,
    })[sel];
  }

  function lambdas(m, opts) {
    const o = Object.assign({ home: true, strength: true, injuries: true }, opts || {});
    const L = m.L, h = teams[m.home], a = teams[m.away];
    const hAtt = o.strength ? h.att : 0, hDef = o.strength ? h.def : 0;
    const aAtt = o.strength ? a.att : 0, aDef = o.strength ? a.def : 0;
    const hInj = o.injuries ? h.injuries.length * 0.035 : 0;
    const aInj = o.injuries ? a.injuries.length * 0.035 : 0;
    return {
      lam: Math.exp(L.base + hAtt - hInj - aDef + (o.home ? L.home : 0)),
      mu: Math.exp(L.base + aAtt - aInj - hDef),
    };
  }

  /** Mercados del modelo y del "mercado real" (que en la demo se aparta del modelo). */
  function computeMarkets(m) {
    const L = m.L;
    if (m.status === 'previa') {
      const M = Q.scoreMatrix(m.lam, m.mu, L.rho, 10);
      const Mk = Q.scoreMatrix(m.lam * m.mk.l, m.mu * m.mk.u, L.rho, 10);
      return { M, model: Q.marketsFromMatrix(M), market: Q.marketsFromMatrix(Mk) };
    }
    const lr = Q.liveLambda(m.lam, m.minute, m.red[0], m.red[1]);
    const mr = Q.liveLambda(m.mu, m.minute, m.red[1], m.red[0]);
    const M = Q.scoreMatrix(lr, mr, 0, 8);
    const Mk = Q.scoreMatrix(lr * m.mk.l, mr * m.mk.u, 0, 8);
    return { M, model: Q.marketsFromMatrix(M, m.score[0], m.score[1]), market: Q.marketsFromMatrix(Mk, m.score[0], m.score[1]) };
  }

  function noiseFor(m, sel, b) {
    const key = sel + ':' + b;
    if (m.noise[key] == null) m.noise[key] = gauss() * 0.04;
    return m.noise[key];
  }

  /** Recalcula todas las selecciones del partido (motor: modelo → mercado → mezcla → EV). */
  function price(m) {
    const L = m.L;
    const mk = computeMarkets(m);
    m.matrix = mk.M;
    m.top = mk.model.top;
    const pm = probMap(mk.model), pk = probMap(mk.market);
    const ts = Date.now();
    const prev = m.sel || {};
    const out = {};

    GROUPS.forEach((g) => {
      if (g.kind === 'derived') return;
      const trueMk = g.sels.map((s) => pk[s]);
      const suspended = trueMk.some((p) => p < 0.004 || p > 0.996) || m.status === 'final';
      const sharp = suspended ? g.sels.map(() => null) : Q.applyMargin(trueMk, g.sharpMargin).map((o) => Math.floor(o * 100) / 100);
      const books = BOOK_MARGINS.map((bm, b) => {
        if (suspended) return g.sels.map(() => null);
        const noisy = trueMk.map((p, i) => p * (1 + noiseFor(m, g.sels[i], b)));
        const s = Q.sum(noisy);
        return Q.applyMargin(noisy.map((x) => x / s), bm).map((o) => Math.floor(o * 100) / 100);
      });
      const pMarket = suspended ? trueMk : Q.devig(sharp, g.devig);
      const pModel = g.sels.map((s) => pm[s]);
      const pFinal = L.marketOnly || suspended ? pMarket.slice() : Q.blendMulti(pModel, pMarket, L.w);
      g.sels.forEach((s, i) => {
        out[s] = mkSel(m, g, s, pModel[i], pMarket[i], pFinal[i], sharp[i], books.map((bk) => bk[i]), suspended, prev[s], ts);
      });
    });

    // Doble oportunidad: derivada del 1X2 ya sin margen
    const dc = GROUPS[1];
    const sumOf = (key, ss) => ss.reduce((acc, s) => acc + out[s][key], 0);
    const parts = { '1X': ['1', 'X'], 'X2': ['X', '2'], '12': ['1', '2'] };
    dc.sels.forEach((s, i) => {
      const pMarket = sumOf('pMarket', parts[s]);
      const pModel = sumOf('pModel', parts[s]);
      const pFinal = sumOf('pFinal', parts[s]);
      const suspended = pMarket < 0.004 || pMarket > 0.996 || m.status === 'final';
      const sharp = suspended ? null : Math.floor((1 / (pMarket * 1.03)) * 100) / 100;
      const books = BOOK_MARGINS.map((bm, b) => (suspended ? null : Math.floor((1 / (pMarket * (1 + noiseFor(m, s, b)) * (1 + bm))) * 100) / 100));
      out[s] = mkSel(m, dc, s, pModel, pMarket, pFinal, sharp, books, suspended, prev[s], ts);
    });

    m.sel = out;
    m.version++;
    m.updatedAt = ts;
  }

  function mkSel(m, g, s, pModel, pMarket, pFinal, sharp, books, suspended, prev, ts, labels) {
    const L = m.L;
    const names = labels || XP.cfg.books;
    let best = null, book = null;
    books.forEach((o, i) => { if (o != null && (best == null || o > best)) { best = o; book = names[i]; } });
    const ci = Q.probInterval(pFinal, L.nEff);
    const ev = best != null ? Q.ev(pFinal, best) : null;
    const threshold = (L.valueMin || 0.02) + ci.half * 0.5;
    const changed = !prev || prev.best !== best || prev.sharp !== sharp;
    return {
      id: s, group: g.id, groupName: g.name, label: selLabel(m, s),
      pModel, pMarket, pFinal, lo: ci.lo, hi: ci.hi, half: ci.half,
      sharp, books, bookLabels: names, best, book, ev, evLo: best != null ? Q.ev(ci.lo, best) : null,
      fairEdge: best != null ? Q.ev(pMarket != null ? pMarket : pFinal, best) : null,
      threshold, value: !L.marketOnly && !suspended && m.status !== 'final' && ev != null && ev >= threshold,
      suspended, oddsAt: changed ? ts : prev.oddsAt,
    };
  }

  // ── simulación de partido (minuto a minuto) ──────────────────────────────────
  function step(m, quiet) {
    if (m.status === 'final') return;
    const t = m.minute + 1;
    const rates = [
      (m.lam * Math.pow(0.72, m.red[0]) * Math.pow(1.18, m.red[1])) / 90,
      (m.mu * Math.pow(0.72, m.red[1]) * Math.pow(1.18, m.red[0])) / 90,
    ];
    const bin = Math.floor((t - 1) / 5);
    if (!m.momentum[bin]) m.momentum[bin] = [0, 0];
    for (let side = 0; side < 2; side++) {
      if (rand() < rates[side] / 0.105) {
        const xg = Q.clamp(-Math.log(1 - rand()) * 0.105, 0.01, 0.85);
        m.xg[side] += xg;
        m.momentum[bin][side] += xg + 0.03;
        if (rand() < xg) {
          m.score[side]++;
          m.events.push({ min: t, type: 'gol', side, xg, text: 'Gol de ' + teams[side ? m.away : m.home].name });
        } else if (xg > 0.32) {
          m.events.push({ min: t, type: 'ocasion', side, xg, text: 'Ocasión clara (' + XP.fmt.num(xg, 2) + ' xG)' });
        }
      } else {
        m.momentum[bin][side] += rand() * 0.012;
      }
      if (rand() < 0.0011) {
        m.red[side]++;
        m.events.push({ min: t, type: 'roja', side, text: 'Tarjeta roja — ' + teams[side ? m.away : m.home].name });
      }
    }
    m.minute = t;
    m.xgSeries.push({ m: t, h: m.xg[0], a: m.xg[1] });
    // el mercado en vivo también se mueve un poco
    m.mk.l *= Math.exp(gauss() * 0.01);
    m.mk.u *= Math.exp(gauss() * 0.01);
    if (t >= 93) {
      m.status = 'final';
      grade(m);
    }
    if (m.status !== 'final') price(m);
    else { m.version++; m.updatedAt = Date.now(); }
    const p = m.status === 'final' ? finalProbs(m) : [m.sel['1'].pFinal, m.sel['X'].pFinal, m.sel['2'].pFinal];
    m.history.push({ m: t, p });
    if (!quiet) XP.bus.emit('match', m);
  }

  function finalProbs(m) { return m.score[0] > m.score[1] ? [1, 0, 0] : m.score[0] === m.score[1] ? [0, 1, 0] : [0, 0, 1]; }

  function grade(m) {
    const idx = m.score[0] > m.score[1] ? 0 : m.score[0] === m.score[1] ? 1 : 2;
    const p = m.frozen.p;
    const arr = [p['1'], p['X'], p['2']];
    const brier = arr.reduce((s, x, i) => s + (x - (i === idx ? 1 : 0)) ** 2, 0);
    m.grade = { outcome: ['1', 'X', '2'][idx], pOutcome: arr[idx], brier, logLoss: -Math.log(arr[idx]), rps: Q.rps(arr, idx), gradedAt: Date.now() };
  }

  // ── movimiento de línea (apertura → ahora) ───────────────────────────────────
  function buildLine(m) {
    const end = Math.min(now0, m.kickoff.getTime());
    const start = m.kickoff.getTime() - 48 * 3600e3;
    const n = Math.max(8, Math.round((end - start) / (45 * 60e3)));
    const lf = m.mk.l, uf = m.mk.u;
    let l = lf * Math.exp(gauss() * 0.09), u = uf * Math.exp(gauss() * 0.09);
    const injuryAt = Math.floor(n * (0.35 + rand() * 0.3));
    const pts = [];
    m.news = [{ i: 0, label: 'Apertura' }];
    for (let i = 0; i <= n; i++) {
      const t = start + ((end - start) * i) / n;
      const frac = i / n;
      l += (Math.log(lf) - Math.log(l)) * 0.12 * frac + gauss() * 0.012;
      u += (Math.log(uf) - Math.log(u)) * 0.12 * frac + gauss() * 0.012;
      l = Math.max(0.6, l); u = Math.max(0.6, u);
      if (i === injuryAt) { m.news.push({ i, label: 'Reporte de lesiones' }); }
      if (i === n) { l = lf; u = uf; }
      const M = Q.scoreMatrix(m.lam * l, m.mu * u, m.L.rho, 8);
      const mk = Q.marketsFromMatrix(M);
      const odds = Q.applyMargin([mk.home, mk.draw, mk.away], 0.025).map((o) => Math.floor(o * 100) / 100);
      pts.push({ t, odds, p: Q.devigShin(odds) });
    }
    if (m.kickoff.getTime() - 60 * 60e3 < end) m.news.push({ i: Math.max(1, n - Math.round(60 / 45)), label: 'Alineaciones confirmadas' });
    m.line = pts;
  }

  // ── forma y datos de equipo ──────────────────────────────────────────────────
  const teamCache = {};
  function teamDetail(id) {
    if (teamCache[id]) return teamCache[id];
    const t = teams[id];
    const r = Q.mulberry32(Q.hashSeed('team-' + id + dayKey));
    const g = () => Q.gaussian(r);
    const L = LEAGUES.find((x) => x.slug === t.league);
    const opps = L.teamIds.filter((x) => x !== id);
    const last = [];
    for (let i = 0; i < 10; i++) {
      const opp = teams[opps[Math.floor(r() * opps.length)]];
      const home = r() < 0.5;
      const xgf = Math.max(0.15, Math.exp(L.base + t.att - opp.def + (home ? L.home : 0)) + g() * 0.35);
      const xga = Math.max(0.15, Math.exp(L.base + opp.att - t.def + (home ? 0 : L.home)) + g() * 0.35);
      const gf = sampPois(xgf, r), ga = sampPois(xga, r);
      last.push({ opp: opp.name, oppCode: opp.code, home, xgf, xga, gf, ga, res: gf > ga ? 'G' : gf === ga ? 'E' : 'P' });
    }
    const elo = [];
    let e = t.elo - g() * 30;
    for (let i = 0; i < 20; i++) { e += g() * 9 + (t.elo - e) * 0.08; elo.push(Math.round(e)); }
    elo[19] = t.elo;
    teamCache[id] = { last, elo };
    return teamCache[id];
  }
  function sampPois(l, r) { let k = 0, p = Math.exp(-l), s = p; const u = r(); while (u > s && k < 10) { k++; p *= l / k; s += p; } return k; }

  // ── explicación (estructura del JSON de ExplanationCard) ─────────────────────
  function explanation(m) {
    const pre = m.frozen.p;
    const p1 = (opts) => { const l = lambdas(m, opts); const M = Q.scoreMatrix(l.lam, l.mu, m.L.rho, 10); return Q.marketsFromMatrix(M); };
    const neutral = p1({ home: false, strength: false, injuries: false });
    const withHome = p1({ home: true, strength: false, injuries: false });
    const withStrength = p1({ home: true, strength: true, injuries: false });
    const full = p1({});
    const H = teams[m.home], A = teams[m.away];
    const dH = teamDetail(m.home), dA = teamDetail(m.away);
    const xgDiff = (d) => d.last.slice(0, 5).reduce((s, x) => s + x.xgf - x.xga, 0) / 5;
    const factors = [
      { key: 'fuerza', label: 'Diferencia de fuerza (Elo y α/β)', delta: withStrength.home - withHome.home, data: 'Elo ' + H.elo + ' vs ' + A.elo + ' · E = ' + XP.fmt.prob(Q.eloExpected(H.elo, A.elo)) },
      { key: 'localia', label: 'Localía', delta: withHome.home - neutral.home, data: 'γ = ' + XP.fmt.num(m.L.home, 2) + ' en ' + m.L.name },
      { key: 'bajas', label: 'Bajas y dudas', delta: full.home - withStrength.home, data: H.code + ': ' + H.injuries.length + ' · ' + A.code + ': ' + A.injuries.length + ' (−0,035 en α por baja)' },
      { key: 'mercado', label: 'Mezcla con el mercado sin margen', delta: m.L.marketOnly ? pre['1'] - full.home : (m.frozen.pFinal1 - m.frozen.pModel1), data: m.L.marketOnly ? 'Liga en modo solo mercado (w = 0)' : 'w = ' + XP.fmt.num(m.L.w, 2) + ' · modelo ' + XP.fmt.prob(m.frozen.pModel1) + ' → publicada ' + XP.fmt.prob(m.frozen.pFinal1) },
      { key: 'forma', label: 'Forma reciente (xG neto, últimos 5)', delta: null, data: H.code + ' ' + XP.fmt.num(xgDiff(dH), 2) + ' · ' + A.code + ' ' + XP.fmt.num(xgDiff(dA), 2) + ' por partido (ya reflejada en α/β con ponderación temporal)' },
    ];
    const ranked = factors.filter((f) => f.delta != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const top = ranked[0];
    return {
      headline: H.name + ' tiene ' + XP.fmt.prob(pre['1']) + ' de probabilidad publicada antes del inicio; el factor que más la mueve es «' + top.label.toLowerCase() + '» (' + XP.fmt.pp(top.delta) + ').',
      factors,
      uncertainty_note: 'Intervalo del 95 % para la victoria local: ' + XP.fmt.prob(Q.probInterval(pre['1'], m.L.nEff).lo) + '–' + XP.fmt.prob(Q.probInterval(pre['1'], m.L.nEff).hi) + '. ' +
        (m.L.marketOnly ? 'En esta competición el modelo aún no supera al mercado en el backtest, así que se publica la probabilidad del mercado y no se marcan selecciones de valor.' : 'Una probabilidad no es un resultado: con este intervalo, cualquiera de los tres desenlaces es plausible.'),
    };
  }

  // ── construcción de la jornada ───────────────────────────────────────────────
  const matches = [];
  LEAGUES.forEach((L, li) => {
    const ids = L.teamIds.slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    L.plan.forEach((plan, k) => {
      const home = ids[k * 2], away = ids[k * 2 + 1];
      const [status, minStr] = plan.split(':');
      const startMinute = minStr ? parseInt(minStr, 10) : 0;
      let kickoff;
      if (status === 'previa') {
        const h = 1.25 + k * 1.1 + li * 0.5;
        kickoff = new Date(Math.ceil((now0 + h * 3600e3) / (15 * 60e3)) * (15 * 60e3));
      } else if (status === 'vivo') {
        kickoff = new Date(now0 - startMinute * 60e3 - (startMinute > 45 ? 15 * 60e3 : 0));
      } else {
        kickoff = new Date(Math.floor((now0 - (3 + k) * 3600e3) / (15 * 60e3)) * (15 * 60e3));
      }
      const m = {
        id: (L.short + '-' + teams[home].code + '-' + teams[away].code).toLowerCase(),
        L, league: L.slug, home, away, kickoff, status: 'previa',
        minute: 0, score: [0, 0], red: [0, 0], xg: [0, 0], events: [], history: [], xgSeries: [{ m: 0, h: 0, a: 0 }], momentum: [],
        mk: { l: Math.exp(gauss() * 0.075), u: Math.exp(gauss() * 0.075) },
        noise: {}, version: 0, updatedAt: now0, sel: null,
      };
      const l = lambdas(m);
      m.lam = l.lam; m.mu = l.mu;
      price(m);
      buildLine(m);
      // congelar la predicción prepartido (hash + sello anterior al inicio)
      const frozenAt = new Date(m.kickoff.getTime() - 75 * 60e3);
      const p = { '1': m.sel['1'].pFinal, 'X': m.sel['X'].pFinal, '2': m.sel['2'].pFinal };
      const payload = JSON.stringify({ id: m.id, at: frozenAt.toISOString(), model: XP.cfg.modelVersion, p: { '1': +p['1'].toFixed(6), 'X': +p['X'].toFixed(6), '2': +p['2'].toFixed(6) } });
      m.frozen = { at: frozenAt, p, pModel1: m.sel['1'].pModel, pFinal1: m.sel['1'].pFinal, payload, hash: XP.sha256(payload), closing: { '1': m.sel['1'].sharp, 'X': m.sel['X'].sharp, '2': m.sel['2'].sharp } };
      m.pre = JSON.parse(JSON.stringify(m.sel));
      m.history.push({ m: 0, p: [p['1'], p['X'], p['2']] });
      if (status !== 'previa') {
        m.status = 'vivo';
        const target = status === 'final' ? 93 : startMinute;
        for (let t = 0; t < target; t++) step(m, true);
      }
      matches.push(m);
    });
  });
  const byId = {};
  matches.forEach((m) => { byId[m.id] = m; });

  // ── reloj en vivo (equivalente al gateway SSE) ───────────────────────────────
  let tickN = 0;
  XP.live = { paused: false, pausedAt: null, demo: true };
  XP.setLivePaused = function (v) {
    XP.live.paused = v;
    XP.live.pausedAt = v ? Date.now() : null;
    XP.bus.emit('livepause', v);
  };
  setInterval(() => {
    if (XP.live.paused || !XP.live.demo) { XP.bus.emit('heartbeat'); return; }
    tickN++;
    matches.forEach((m) => {
      if (m.status === 'vivo' && tickN % XP.cfg.secondsPerMatchMinute === 0) step(m, false);
    });
    if (tickN % 3 === 0) {
      // cambios de cuota prepartido (noticias, dinero)
      const pre = matches.filter((m) => m.status === 'previa');
      for (let i = 0; i < 2 && pre.length; i++) {
        const m = pre[Math.floor(Math.random() * pre.length)];
        const keys = Object.keys(m.noise);
        for (let j = 0; j < 3; j++) { const k = keys[Math.floor(Math.random() * keys.length)]; m.noise[k] += Q.gaussian(Math.random) * 0.006; }
        m.mk.l *= Math.exp(Q.gaussian(Math.random) * 0.004);
        price(m);
        const last = m.line[m.line.length - 1];
        const odds = [m.sel['1'].sharp, m.sel['X'].sharp, m.sel['2'].sharp];
        if (odds.join() !== last.odds.join()) m.line.push({ t: Date.now(), odds, p: Q.devigShin(odds) });
        XP.bus.emit('match', m);
      }
    }
    XP.bus.emit('heartbeat');
  }, 1000);

  // ── rendimiento histórico (prediction_grades simuladas) ──────────────────────
  let perfCache = null;
  function performance() {
    if (perfCache) return perfCache;
    const r = Q.mulberry32(Q.hashSeed('perf-v1'));
    const g = () => Q.gaussian(r);
    const preds = [];
    const start = new Date(now0 - 182 * 86400e3);
    const per = { 'premier-league': 520, 'laliga': 500, 'liga-betplay': 460, 'libertadores': 180 };
    let id = 1;
    LEAGUES.filter((L) => !L.ext).forEach((L) => {
      const noiseModel = L.marketOnly ? 0.06 : 0.022;
      for (let i = 0; i < per[L.slug]; i++) {
        const pTrue = Q.clamp(0.06 + 0.86 * Math.pow(r(), 1.25), 0.03, 0.95);
        const pMarket = Q.clamp(pTrue + g() * 0.03, 0.02, 0.97);
        const pModel = Q.clamp(pTrue + g() * noiseModel, 0.02, 0.97);
        const pFinal = L.marketOnly ? pMarket : Q.blend(pModel, pMarket, L.w + 0.25);
        const y = r() < pTrue ? 1 : 0;
        const odds = Math.floor((1 / (pMarket * 1.05)) * 100) / 100;
        const flagged = !L.marketOnly && pFinal * odds - 1 > 0.025;
        const clvV = flagged ? 0.012 + g() * 0.035 : null;
        const at = new Date(start.getTime() + (i / per[L.slug]) * 180 * 86400e3 + r() * 86400e3);
        const home = teams[L.teamIds[Math.floor(r() * L.teamIds.length)]];
        let away = teams[L.teamIds[Math.floor(r() * L.teamIds.length)]];
        if (away === home) away = teams[L.teamIds[(L.teamIds.indexOf(home.id) + 1) % L.teamIds.length]];
        preds.push({ id: 'P' + String(id++).padStart(5, '0'), league: L.slug, event: home.name + ' vs ' + away.name, market: '1X2', at, pFinal, pMarket, y, odds, flagged, clv: clvV, profit: flagged ? (y ? odds - 1 : -1) : null });
      }
    });
    preds.sort((a, b) => a.at - b.at);
    const summarize = (arr) => {
      const ps = arr.map((x) => x.pFinal), ys = arr.map((x) => x.y), pk = arr.map((x) => x.pMarket);
      const fl = arr.filter((x) => x.flagged);
      const profits = fl.map((x) => x.profit);
      const mean = profits.length ? Q.sum(profits) / profits.length : 0;
      const sd = profits.length > 1 ? Math.sqrt(Q.sum(profits.map((p) => (p - mean) ** 2)) / (profits.length - 1)) : 0;
      const e = Q.ece(ps, ys, 10);
      return {
        n: arr.length, brier: Q.brier(ps, ys), logLoss: Q.logLoss(ps, ys), logLossMarket: Q.logLoss(pk, ys),
        ece: e.ece, bins: e.bins, flagged: fl.length,
        clv: fl.length ? Q.sum(fl.map((x) => x.clv)) / fl.length : null,
        clvPos: fl.length ? fl.filter((x) => x.clv > 0).length / fl.length : null,
        roi: mean, roiCi: 1.96 * sd / Math.sqrt(Math.max(1, profits.length)),
      };
    };
    const byLeague = LEAGUES.filter((L) => !L.ext).map((L) =>Object.assign({ L }, summarize(preds.filter((p) => p.league === L.slug))));
    perfCache = { preds, all: summarize(preds), byLeague, clvs: preds.filter((p) => p.flagged).map((p) => p.clv) };
    return perfCache;
  }

  function search(q) {
    const s = XP.slug(q || '');
    if (!s) return [];
    return matches.filter((m) => XP.slug(teams[m.home].name + ' ' + teams[m.away].name + ' ' + m.L.name).includes(s));
  }

  // ═════════════ feed externo: datos reales del gateway (ESPN / proveedor de cuotas) vía SSE ═════════════
  const demoMatches = matches.slice();
  const extMatches = [];
  const extLeagues = {};
  const SHORT = { soccer_epl: 'PL', soccer_spain_la_liga: 'LL', soccer_conmebol_copa_libertadores: 'CL' };
  const NAMES = { EPL: 'Premier League', 'La Liga - Spain': 'LaLiga' };

  function extLeague(ev) {
    const slug = 'x-' + XP.slug(ev.sportKey || ev.league);
    if (!extLeagues[slug]) {
      const real = ev.source === 'espn';
      const L = {
        slug, name: NAMES[ev.league] || ev.league, short: ev.leagueShort || SHORT[ev.sportKey] || 'MR', country: ev.country || 'Mercado real',
        logo: ev.leagueLogo || null, base: Math.log(1.3), home: 0.25, rho: -0.06, w: 0.35,
        nEff: real ? 450 : 700, valueMin: real ? 0.04 : 0.02, marketOnly: !real, ext: true, teams: [], teamIds: [], plan: [],
      };
      extLeagues[slug] = L;
      LEAGUES.push(L);
    }
    const L = extLeagues[slug];
    if (ev.leagueLogo) L.logo = ev.leagueLogo;
    return L;
  }
  function codeOf(name) {
    const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z ]/g, ' ').trim();
    const words = clean.split(/\s+/).filter((w) => w.length > 2 && !/^(fc|cf|club|de|del|la|el|and|the|hove|real|atletico|deportivo|independiente)$/i.test(w));
    const base = words[0] || clean.replace(/\s/g, '');
    return (words.length >= 3 ? words.slice(0, 3).map((w) => w[0]).join('') : base.slice(0, 3)).toUpperCase();
  }
  function extTeam(name, L, info) {
    const id = 'x-' + XP.slug(name);
    if (!teams[id]) teams[id] = { id, name, code: codeOf(name), league: L.slug, s: 0, att: 0, def: 0, elo: null, injuries: [], ext: true };
    const t = teams[id];
    if (info) {
      if (info.abbr) t.code = info.abbr;
      if (info.logo) t.logo = info.logo;
      t.color = info.color || t.color;
      t.form = info.form || t.form || null;
      t.record = info.record || t.record || null;
      t.standing = info.standing || t.standing || null;
    }
    if (!L.teamIds.includes(id)) L.teamIds.push(id);
    return id;
  }

  /** Ajusta λ y μ de Dixon-Coles para reproducir el 1X2 sin margen (cuando el servidor no envía modelo). */
  function fitLambdas(pH, pA, rho, h0, a0) {
    const err = (l, u) => { const mk = Q.marketsFromMatrix(Q.scoreMatrix(l, u, rho, 8), h0, a0); return (mk.home - pH) ** 2 + (mk.away - pA) ** 2; };
    let best = { l: 1.3, u: 1.1, e: Infinity };
    for (let l = 0.05; l <= 4.01; l += 0.15) for (let u = 0.05; u <= 4.01; u += 0.15) { const e = err(l, u); if (e < best.e) best = { l, u, e }; }
    for (let pass = 0, step = 0.05; pass < 2; pass++, step /= 5) {
      const b0 = best;
      for (let l = b0.l - step * 3; l <= b0.l + step * 3 + 1e-9; l += step) for (let u = b0.u - step * 3; u <= b0.u + step * 3 + 1e-9; u += step) {
        if (l <= 0.01 || u <= 0.01) continue;
        const e = err(l, u); if (e < best.e) best = { l, u, e };
      }
    }
    return best;
  }

  function priceExternal(m) {
    const ev = m.ext, ts = Date.now(), prev = m.sel || {};
    const allBooks = ev.books || [];
    // con el partido iniciado la fuente solo trae la cuota de cierre prepartido: es referencia, no oferta actual
    const closingOnly = allBooks.some((b) => b.prematch);
    const books = closingOnly ? [] : allBooks;
    const hbAll = allBooks.filter((b) => b.h2h && b.h2h.home > 1 && b.h2h.draw > 1 && b.h2h.away > 1);
    const hb = closingOnly ? [] : hbAll;
    m.closingOdds = closingOnly && hbAll.length ? [hbAll[0].h2h.home, hbAll[0].h2h.draw, hbAll[0].h2h.away] : null;
    if (closingOnly && hbAll.length && hbAll[0].open) m.openOdds = [hbAll[0].open.home, hbAll[0].open.draw, hbAll[0].open.away];
    const live = m.status === 'vivo';
    const h0 = live ? m.score[0] : 0, a0 = live ? m.score[1] : 0;
    let p1Mk = null, sharp1 = [null, null, null], ref = null;
    if (hb.length) {
      const ob = (b) => Q.overround([b.h2h.home, b.h2h.draw, b.h2h.away]);
      ref = hb.find((b) => b.sharp) || hb.slice().sort((a, b) => ob(a) - ob(b))[0];
      sharp1 = [ref.h2h.home, ref.h2h.draw, ref.h2h.away];
      p1Mk = Q.devigShin(sharp1);
    }
    if (ev.model) { m.lam = ev.model.lam; m.mu = ev.model.mu; m.quality = ev.model.quality; }
    else if (p1Mk) { const f = fitLambdas(p1Mk[0], p1Mk[2], live ? 0 : m.L.rho, h0, a0); m.lam = f.l; m.mu = f.u; m.quality = 'mercado'; }
    else return false;
    m.matrix = Q.scoreMatrix(m.lam, m.mu, live ? 0 : m.L.rho, 10);
    const mk = Q.marketsFromMatrix(m.matrix, h0, a0);
    m.top = mk.top;
    const pm = probMap(mk);
    // la matriz del servidor ya es la final (anclada al 1X2 mezclado y a la línea de goles);
    // para la columna «solo modelo» rehacemos la matriz con los goles esperados del modelo puro
    const pmModel = ev.model && ev.model.lamModel != null && !live
      ? probMap(Q.marketsFromMatrix(Q.scoreMatrix(ev.model.lamModel, ev.model.muModel, m.L.rho, 10))) : pm;
    const w = ev.model ? ev.model.w : 0;
    const model1 = ev.model ? ev.model.pModel : [mk.home, mk.draw, mk.away];
    const final1 = ev.model ? ev.model.pFinal : p1Mk;
    const out = {};
    const G = (id) => GROUPS.find((g) => g.id === id);
    const labels1 = hb.map((b) => b.label);
    ['1', 'X', '2'].forEach((s, i) => {
      const k = ['home', 'draw', 'away'][i];
      out[s] = mkSel(m, G('1x2'), s, model1[i], p1Mk ? p1Mk[i] : null, final1[i], sharp1[i], hb.map((b) => b.h2h[k]), false, prev[s], ts, labels1);
    });
    const parts = { '1X': ['1', 'X'], 'X2': ['X', '2'], '12': ['1', '2'] };
    G('dc').sels.forEach((s) => {
      const sum = (k) => parts[s].reduce((t, x) => t + out[x][k], 0);
      out[s] = mkSel(m, G('dc'), s, sum('pModel'), p1Mk ? sum('pMarket') : null, sum('pFinal'), null, [], false, prev[s], ts, []);
    });
    const tb = books.filter((b) => b.totals && b.totals.over > 1 && b.totals.under > 1);
    [['ou15', 1.5], ['ou25', 2.5], ['ou35', 3.5]].forEach(([gid, point]) => {
      const g = G(gid);
      const pO = pm['O' + point], pOm = pmModel['O' + point];
      const tbp = tb.filter((b) => b.totals.point === point);
      let pMk = null, so = null, su = null;
      if (tbp.length) { pMk = Q.devigMultiplicative([tbp[0].totals.over, tbp[0].totals.under])[0]; so = tbp[0].totals.over; su = tbp[0].totals.under; }
      // con modelo del servidor la matriz ya incorpora la línea de la casa: no se mezcla dos veces
      const pf = ev.model ? pO : pMk != null && !live && w < 1 ? Q.blend(pO, pMk, w) : pO;
      const lab = tbp.map((b) => b.label);
      out[g.sels[0]] = mkSel(m, g, g.sels[0], pOm, pMk, pf, so, tbp.map((b) => b.totals.over), false, prev[g.sels[0]], ts, lab);
      out[g.sels[1]] = mkSel(m, g, g.sels[1], 1 - pOm, pMk != null ? 1 - pMk : null, 1 - pf, su, tbp.map((b) => b.totals.under), false, prev[g.sels[1]], ts, lab);
    });
    ['BTTS-S', 'BTTS-N'].forEach((s) => { out[s] = mkSel(m, G('btts'), s, pmModel[s], null, pm[s], null, [], false, prev[s], ts, []); });
    const nb = out['1'].pFinal + out['2'].pFinal;
    out['DNB-1'] = mkSel(m, G('dnb'), 'DNB-1', pmModel['DNB-1'], null, out['1'].pFinal / nb, null, [], false, prev['DNB-1'], ts, []);
    out['DNB-2'] = mkSel(m, G('dnb'), 'DNB-2', pmModel['DNB-2'], null, out['2'].pFinal / nb, null, [], false, prev['DNB-2'], ts, []);
    m.sel = out;
    m.refLabel = ref ? ref.label : null;
    m.bookTable = books;
    m.hasOdds = hb.length > 0;
    if (!closingOnly) m.openOdds = ref && ref.open ? [ref.open.home, ref.open.draw, ref.open.away] : null;
    m.version++;
    m.updatedAt = ts;
    return true;
  }

  const KIND_TEXT = { gol: 'Gol', penal: 'Gol de penal', autogol: 'Autogol', amarilla: 'Tarjeta amarilla', roja: 'Tarjeta roja', cambio: 'Cambio' };

  function upsertExternal(ev) {
    const id = 'x-' + ev.id;
    let m = byId[id];
    const L = extLeague(ev);
    let isNew = false;
    const home = extTeam(ev.home, L, ev.homeTeam), away = extTeam(ev.away, L, ev.awayTeam);
    if (!m) {
      m = {
        id, ext: ev, L, league: L.slug, home, away, kickoff: new Date(ev.commence),
        status: 'previa', minute: 0, score: [0, 0], red: [0, 0], xg: [0, 0], events: [], history: [], xgSeries: [], momentum: [],
        mk: { l: 1, u: 1 }, noise: {}, version: 0, updatedAt: Date.now(), sel: null, line: [], news: [{ i: 0, label: 'Primera captura' }],
      };
      byId[id] = m;
      isNew = true;
    }
    m.ext = ev;
    m.kickoff = new Date(ev.commence);
    const prevGoals = m.score[0] + m.score[1];
    if (ev.state) m.status = ev.state === 'in' ? 'vivo' : ev.state === 'post' ? 'final' : 'previa';
    else m.status = ev.completed ? 'final' : Date.now() >= m.kickoff.getTime() ? 'vivo' : 'previa';
    m.postponed = !!ev.postponed;
    m.statusText = ev.statusText || '';
    if (Array.isArray(ev.scores)) m.score = ev.scores.slice();
    if (m.status === 'vivo') {
      if (ev.state) { m.minute = Math.max(1, ev.minute || m.minute || 1); m.clock = ev.clock; m.halftime = !!ev.halftime; m.minuteApprox = false; }
      else { const mins = (Date.now() - m.kickoff.getTime()) / 60000; m.minute = Math.max(1, Math.min(90, Math.round(mins > 60 ? mins - 15 : mins))); m.minuteApprox = true; }
    }
    if (Array.isArray(ev.details)) {
      m.events = ev.details.filter((d) => d.type !== 'cambio').map((d) => {
        const isGoal = d.type === 'gol' || d.type === 'penal' || d.type === 'autogol';
        const forSide = d.type === 'autogol' ? 1 - d.side : d.side;
        return { min: d.minute, minLabel: d.min, type: isGoal ? 'gol' : d.type, kind: d.type, side: isGoal ? forSide : d.side, player: d.player, text: KIND_TEXT[d.type] + (d.player ? ' · ' + d.player : '') };
      });
      m.red = [0, 1].map((s) => m.events.filter((e) => e.type === 'roja' && e.side === s).length);
    }
    if (!isNew && m.score[0] + m.score[1] > prevGoals) XP.bus.emit('goal', m);
    const priced = priceExternal(m);
    if (!priced && !m.sel) return null;
    if (!m.frozen && m.sel) {
      const at = new Date();
      const p = { '1': m.sel['1'].pFinal, 'X': m.sel['X'].pFinal, '2': m.sel['2'].pFinal };
      const payload = JSON.stringify({ id: m.id, at: at.toISOString(), model: ev.model ? ev.model.version : 'mercado', p: { '1': +p['1'].toFixed(6), 'X': +p['X'].toFixed(6), '2': +p['2'].toFixed(6) } });
      m.frozen = { at, p, pModel1: m.sel['1'].pModel, pFinal1: m.sel['1'].pFinal, payload, hash: XP.sha256(payload), lateCapture: m.status !== 'previa' };
      m.pre = JSON.parse(JSON.stringify(m.sel));
    }
    if (m.sel && m.status !== 'final') {
      const pt = { m: m.status === 'vivo' ? m.minute : 0, p: [m.sel['1'].pFinal, m.sel['X'].pFinal, m.sel['2'].pFinal] };
      const last = m.history[m.history.length - 1];
      if (last && last.m === pt.m) m.history[m.history.length - 1] = pt; else m.history.push(pt);
      if (m.hasOdds) {
        const odds = [m.sel['1'].sharp, m.sel['X'].sharp, m.sel['2'].sharp];
        if (!m.line.length && m.openOdds) m.line.push({ t: m.kickoff.getTime() - 3 * 86400e3, odds: m.openOdds, p: Q.devigShin(m.openOdds), open: true });
        const ll = m.line[m.line.length - 1];
        if (!ll || ll.odds.join() !== odds.join()) m.line.push({ t: Date.now(), odds, p: Q.devigShin(odds) });
      }
    }
    // solo se califica en el navegador lo que se congeló antes del inicio; el historial oficial vive en el servidor
    if (m.status === 'final' && !m.grade && m.frozen && !m.frozen.lateCapture && !m.postponed) grade(m);
    if (isNew) extMatches.push(m);
    m.version++;
    m.updatedAt = Date.now();
    return m;
  }

  function removeExternal(eventId) {
    const i = extMatches.findIndex((m) => m.id === 'x-' + eventId);
    if (i >= 0) extMatches.splice(i, 1);
    syncFeedList();
  }

  let feedOn = false;
  function useFeed(on) {
    feedOn = on;
    XP.live.demo = !on;
    syncFeedList();
  }
  const ORDER = { vivo: 0, previa: 1, final: 2 };
  function syncFeedList() {
    const src = feedOn ? extMatches.filter((m) => m.sel) : demoMatches;
    matches.length = 0;
    src.slice().sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (a.status === 'final' ? b.kickoff - a.kickoff : a.kickoff - b.kickoff)).forEach((m) => matches.push(m));
  }
  const activeLeagues = () => LEAGUES.filter((L) => matches.some((m) => m.league === L.slug));

  /** Análisis en lenguaje de apostador para partidos reales: cada cifra sale de la tabla, la forma o las cuotas. */
  function explanationExt(m) {
    const H = teams[m.home], A = teams[m.away];
    const s = m.sel;
    const fav = ['1', 'X', '2'].reduce((b, k) => (s[k].pFinal > s[b].pFinal ? k : b), '1');
    const favName = fav === '1' ? H.name : fav === '2' ? A.name : 'el empate';
    const factors = [];
    const hs = H.standing, as = A.standing;
    if (hs && as) factors.push({ key: 'tabla', icon: 'table', label: 'Tabla de posiciones', delta: null, data: H.name + ': ' + hs.rank + '.º con ' + hs.pts + ' pts · ' + A.name + ': ' + as.rank + '.º con ' + as.pts + ' pts' });
    const ppg = (f) => (f ? [...f.replace(/[^WDL]/g, '')].reduce((t, c) => t + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0) : null);
    if (H.form || A.form) factors.push({ key: 'forma', icon: 'fire', label: 'Forma (últimos 5)', delta: null, data: (H.form ? H.code + ' ' + formEs(H.form) + ' (' + ppg(H.form) + ' pts)' : '') + (A.form ? ' · ' + A.code + ' ' + formEs(A.form) + ' (' + ppg(A.form) + ' pts)' : '') });
    if (hs && as && hs.gp && as.gp) factors.push({ key: 'goles', icon: 'ball', label: 'Goles por partido', delta: null, data: H.code + ' marca ' + XP.fmt.num(hs.gf / hs.gp, 1) + ' y recibe ' + XP.fmt.num(hs.ga / hs.gp, 1) + ' · ' + A.code + ' marca ' + XP.fmt.num(as.gf / as.gp, 1) + ' y recibe ' + XP.fmt.num(as.ga / as.gp, 1) });
    if (m.hasOdds && s[fav].pMarket != null) factors.push({ key: 'casa', icon: 'scale', label: 'Xpected frente a la casa', delta: s[fav].pFinal - s[fav].pMarket, data: favName + ': Xpected ' + XP.fmt.prob(s[fav].pFinal, 0) + ' · la casa (sin su margen) ' + XP.fmt.prob(s[fav].pMarket, 0) });
    if (m.openOdds && m.hasOdds) {
      const now1 = s['1'].sharp, op1 = m.openOdds[0];
      factors.push({ key: 'mov', icon: now1 < op1 ? 'trend-down' : 'trend-up', label: 'Movimiento de la cuota', delta: null, data: H.name + ' abrió en ' + XP.fmt.odds(op1) + ' y ahora paga ' + XP.fmt.odds(now1) + (now1 < op1 ? ' (el dinero entra a su favor)' : now1 > op1 ? ' (pierde respaldo)' : '') });
    }
    const goals = m.lam + m.mu;
    factors.push({ key: 'xg', icon: 'target', label: 'Goles esperados', delta: null, data: XP.fmt.num(goals, 1) + ' en total · más de 2,5: ' + XP.fmt.prob(s['O2.5'].pFinal, 0) + ' · ambos marcan: ' + XP.fmt.prob(s['BTTS-S'].pFinal, 0) });
    return {
      headline: 'Pronóstico: ' + (fav === 'X' ? 'empate' : 'gana ' + favName) + ' (' + XP.fmt.prob(s[fav].pFinal, 0) + '). Marcador más probable ' + m.top[0].h + '–' + m.top[0].a + '.',
      factors,
      uncertainty_note: (m.quality === 'baja' ? 'Hay pocos datos de estos equipos: tómalo como orientación. ' : '') + 'Una probabilidad no es una garantía: incluso el favorito claro pierde a menudo.',
    };
  }
  function formEs(f) { return f.replace(/W/g, 'G').replace(/D/g, 'E').replace(/L/g, 'P'); }
  const explanationBase = explanation;
  function explanationAny(m) { return m.ext ? explanationExt(m) : explanationBase(m); }

  XP.data = { LEAGUES, GROUPS, teams, matches, byId, teamDetail, explanation: explanationAny, performance, search, lambdas, selLabel, dayKey, upsertExternal, removeExternal, useFeed, syncFeedList, activeLeagues, get feedOn() { return feedOn; } };
})();

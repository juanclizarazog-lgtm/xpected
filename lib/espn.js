/*
 * Xpected · adaptador de datos deportivos públicos (marcadores de ESPN).
 * Partidos, estado y minuto en vivo, goles y tarjetas, forma, tabla, logos y la cuota de referencia
 * (1X2 y total de goles, apertura y actual). Sin clave.
 * Uso en desarrollo: antes del lanzamiento se reemplaza por un proveedor licenciado (ver docs/data-licenses.md).
 * La casa que publica esas cuotas no está autorizada por Coljuegos: se muestra anonimizada y sin enlaces.
 */
'use strict';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer/';
const NAMES = {
  'eng.1': ['Premier League', 'PL', 'Inglaterra'],
  'esp.1': ['LaLiga', 'LL', 'España'],
  'col.1': ['Liga BetPlay', 'BP', 'Colombia'],
  'uefa.champions': ['Champions League', 'UCL', 'Europa'],
  'conmebol.libertadores': ['Copa Libertadores', 'LIB', 'Sudamérica'],
  'ita.1': ['Serie A', 'SA', 'Italia'],
  'ger.1': ['Bundesliga', 'BL', 'Alemania'],
  'fra.1': ['Ligue 1', 'L1', 'Francia'],
  'conmebol.sudamericana': ['Copa Sudamericana', 'SUD', 'Sudamérica'],
};

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + url.replace(BASE, ''));
  return r.json();
}

/** Fecha YYYYMMDD en la zona horaria de Bogotá, desplazada `offset` días. */
function ymd(offset, tz) {
  const d = new Date(Date.now() + offset * 86400e3);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
}

/** Cuota americana ("+150", "-110", "EVEN") → decimal. "OFF"/vacío → null. */
function dec(a) {
  if (a == null) return null;
  const s = String(a).trim().toUpperCase();
  if (!s || s === 'OFF' || s === '0') return null;
  if (s === 'EVEN' || s === 'EV') return 2;
  const n = parseFloat(s.replace('+', ''));
  if (!isFinite(n) || n === 0) return null;
  const o = n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  return Math.round(o * 100) / 100;
}

function minuteOf(clock) {
  const m = String(clock || '').match(/(\d+)'?(?:\+(\d+))?/);
  return m ? Math.min(120, parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0)) : 0;
}

async function standings(lg) {
  const j = await getJSON(STANDINGS + lg + '/standings');
  const map = {};
  let gf = 0, gp = 0;
  (j.children || []).forEach((ch) => (ch.standings && ch.standings.entries || []).forEach((en) => {
    const s = {};
    (en.stats || []).forEach((x) => { s[x.name] = x.value; });
    const row = { rank: s.rank, gp: s.gamesPlayed || 0, w: s.wins || 0, d: s.ties || 0, l: s.losses || 0, gf: s.pointsFor || 0, ga: s.pointsAgainst || 0, pts: s.points || 0, group: ch.name };
    map[en.team.id] = row;
    gf += row.gf; gp += row.gp;
  }));
  return { map, avg: gp > 20 ? gf / gp : null };
}

function normalize(e, lg, leagueLogo, st) {
  const c = e.competitions[0];
  const H = c.competitors.find((x) => x.homeAway === 'home') || c.competitors[0];
  const A = c.competitors.find((x) => x.homeAway === 'away') || c.competitors[1];
  const o = (c.odds || [])[0];
  const ml = o && o.moneyline;
  const pick = (side, fb) => dec(ml && ml[side] && ml[side].close && ml[side].close.odds) || dec(fb);
  const cur = o ? [pick('home', o.homeTeamOdds && o.homeTeamOdds.moneyLine), pick('draw', o.drawOdds && o.drawOdds.moneyLine), pick('away', o.awayTeamOdds && o.awayTeamOdds.moneyLine)] : [null, null, null];
  const open = ml ? ['home', 'draw', 'away'].map((k) => dec(ml[k] && ml[k].open && ml[k].open.odds)) : [null, null, null];
  let totals = null, totalsOpen = null;
  const t = o && o.total;
  if (t && t.over && t.under) {
    const line = (x) => { const v = parseFloat(String(x || '').replace(/^[ou]/i, '')); return isFinite(v) ? v : null; };
    const pc = line(t.over.close && t.over.close.line) || line(t.over.open && t.over.open.line) || o.overUnder;
    const ov = dec(t.over.close && t.over.close.odds), un = dec(t.under.close && t.under.close.odds);
    if (pc && ov && un) totals = { point: pc, over: ov, under: un };
    const po = line(t.over.open && t.over.open.line);
    const ovo = dec(t.over.open && t.over.open.odds), uno = dec(t.under.open && t.under.open.odds);
    if (po && ovo && uno) totalsOpen = { point: po, over: ovo, under: uno };
  }
  const type = e.status.type || {};
  const state = type.state || 'pre';
  // La fuente NO publica cuotas en vivo: con el partido iniciado o terminado, lo que llega es la cuota de
  // cierre prepartido. Se marca como «prematch» para que nadie la use como cuota actual (ni para valor ni para EV).
  const books = cur.every((x) => x && x > 1) || totals ? [{
    label: 'Casa de referencia', sharp: false, updated: new Date().toISOString(), prematch: state !== 'pre',
    h2h: cur.every((x) => x && x > 1) ? { home: cur[0], draw: cur[1], away: cur[2] } : null,
    open: open.every((x) => x && x > 1) ? { home: open[0], draw: open[1], away: open[2] } : null,
    totals, totalsOpen,
  }] : [];
  const postponed = /POSTPONED|CANCELED|SUSPENDED|ABANDONED/.test(type.name || '');
  const details = (c.details || []).map((d) => {
    const txt = (d.type && d.type.text) || '';
    const kind = d.redCard ? 'roja' : d.yellowCard ? 'amarilla' : d.ownGoal ? 'autogol' : d.penaltyKick && d.scoringPlay ? 'penal' : d.scoringPlay ? 'gol' : /sub/i.test(txt) ? 'cambio' : null;
    if (!kind || d.shootout) return null;
    const who = (d.athletesInvolved || [])[0];
    return { min: (d.clock && d.clock.displayValue) || '', minute: minuteOf(d.clock && d.clock.displayValue), type: kind, side: d.team && String(d.team.id) === String(A.team.id) ? 1 : 0, player: who ? who.shortName || who.displayName : '' };
  }).filter(Boolean);
  const meta = NAMES[lg] || [lg, lg.toUpperCase().slice(0, 3), ''];
  const team = (x) => ({
    name: x.team.displayName, abbr: x.team.abbreviation, logo: x.team.logo || null, id: String(x.team.id),
    color: x.team.color ? '#' + x.team.color : null, form: x.form || null,
    record: x.records && x.records[0] ? x.records[0].summary : null,
    standing: st && st.map[x.team.id] ? st.map[x.team.id] : null,
  });
  const h = team(H), a = team(A);
  // OJO: «STATUS_FIRST_HALF» y «STATUS_SECOND_HALF» también contienen «HALF»; el entretiempo es solo STATUS_HALFTIME
  const halftime = type.name === 'STATUS_HALFTIME' || /^HT$/i.test(String(type.shortDetail || '').trim());
  const period = e.status.period || 0;
  // minuto en vivo: en el entretiempo el reloj puede llegar como «HT» (→ 45); en el 2.º tiempo nunca menos de 46
  let minute = 0;
  if (state === 'in') {
    minute = halftime ? 45 : minuteOf(e.status.displayClock);
    if (!halftime && period >= 2 && minute < 46) minute = 46;
    if (!halftime && period >= 3 && minute < 91) minute = 91;
    minute = Math.max(1, minute);
  }
  const reds = [0, 1].map((side) => details.filter((d) => d.type === 'roja' && d.side === side).length);
  return {
    id: 'espn-' + e.id, source: 'espn', sportKey: lg, league: meta[0], leagueShort: meta[1], country: meta[2], leagueLogo,
    leagueAvg: st ? st.avg : null,
    home: h.name, away: a.name, homeTeam: h, awayTeam: a,
    commence: e.date, state: postponed ? 'post' : state, completed: !!type.completed, postponed,
    statusText: type.shortDetail || type.description || '', clock: e.status.displayClock || '', minute, period, reds,
    halftime,
    scores: state === 'pre' || postponed ? null : [parseInt(H.score, 10) || 0, parseInt(A.score, 10) || 0],
    details, venue: c.venue ? [c.venue.fullName, c.venue.address && c.venue.address.city].filter(Boolean).join(' · ') : null,
    books,
    lastUpdate: new Date().toISOString(),
  };
}

/**
 * Crea un sondeador incremental: hoy se refresca seguido (más aún con partidos en vivo),
 * ayer y los próximos días con menos frecuencia, y las tablas cada 30 minutos.
 */
function createPoller(opts) {
  const leagues = opts.leagues;
  const cache = {}; // key lg|day → { events, at }
  const st = {};    // lg → { map, avg, at }
  const logos = {};
  async function fetchDay(lg, day) {
    const j = await getJSON(BASE + lg + '/scoreboard?dates=' + day + '&limit=100');
    if (j.leagues && j.leagues[0] && j.leagues[0].logos && j.leagues[0].logos[0]) logos[lg] = j.leagues[0].logos[0].href;
    cache[lg + '|' + day] = { raw: j.events || [], at: Date.now() };
  }
  async function cycle(slow) {
    const now = Date.now();
    const days = [-1, 0, 1, 2, 3, 4, 5, 6].map((o) => ({ o, d: ymd(o) }));
    const anyLive = (lg) => days.slice(0, 3).some(({ d }) => (cache[lg + '|' + d] || { raw: [] }).raw.some((e) => e.status.type.state === 'in'));
    const soonStart = (lg) => (cache[lg + '|' + days[1].d] || { raw: [] }).raw.some((e) => e.status.type.state === 'pre' && Math.abs(Date.parse(e.date) - now) < 20 * 60e3);
    const jobs = [];
    leagues.forEach((lg) => {
      if (!st[lg] || now - st[lg].at > 30 * 60e3) jobs.push(() => standings(lg).then((s) => { st[lg] = Object.assign(s, { at: Date.now() }); }).catch(() => { st[lg] = st[lg] || { map: {}, avg: null, at: Date.now() }; }));
      days.forEach(({ o, d }) => {
        const c = cache[lg + '|' + d];
        // con partidos en vivo: cada 10 s (la fuente actualiza marcador y minuto aprox. cada 10–30 s)
        let ttl = o === 0 ? (anyLive(lg) || soonStart(lg) ? 10e3 : 60e3) : o === -1 ? (anyLive(lg) ? 15e3 : 10 * 60e3) : o === 1 ? 5 * 60e3 : 15 * 60e3;
        if (slow) ttl = Math.max(ttl, 5 * 60e3);
        if (!c || now - c.at > ttl) jobs.push(() => fetchDay(lg, d));
      });
    });
    let errors = 0;
    for (let i = 0; i < jobs.length; i += 6) {
      const res = await Promise.allSettled(jobs.slice(i, i + 6).map((f) => f()));
      errors += res.filter((r) => r.status === 'rejected').length;
    }
    const out = [];
    const seen = new Set();
    leagues.forEach((lg) => days.forEach(({ d }) => {
      const c = cache[lg + '|' + d];
      if (!c) return;
      c.raw.forEach((e) => {
        if (seen.has(e.id)) return;
        seen.add(e.id);
        try { out.push(normalize(e, lg, logos[lg] || null, st[lg])); } catch (err) { errors++; }
      });
    }));
    return { events: out, requests: jobs.length, errors, live: out.some((e) => e.state === 'in') };
  }
  return { cycle };
}

module.exports = { createPoller, dec, ymd, minuteOf, normalize, NAMES };

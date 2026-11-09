/*
 * Fase 6 · historial de partidos para el laboratorio (equivale a las tablas nuevas del plan, en JSON).
 * Fuente: marcadores públicos de ESPN (solo desarrollo). Por liga y temporada se lee el calendario oficial
 * (todas las fechas con partido, pasadas y futuras) y, para los partidos terminados de Liga BetPlay, Premier y LaLiga,
 * el resumen: cuota de referencia de apertura y cierre, alineaciones y cambios.
 * Archivo: data/lab/history.json (privado; el servidor nunca sirve data/).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ESPN = require('../espn.js');

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const FILE = path.join(__dirname, '../../data/lab/history.json');
// temporadas: una fecha de referencia dentro de cada una (null = la actual)
const SEASONS = {
  'col.1': ['20240601', '20250601', null],
  'eng.1': ['20260301', null],
  'esp.1': ['20260301', null],
  'uefa.champions': [null],
  'conmebol.libertadores': [null],
};
const DEEP = ['col.1', 'eng.1', 'esp.1']; // con resumen (cuotas y alineaciones)

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (r.ok) return r.json();
      if (r.status === 404 || r.status === 400) return null;
    } catch (e) { /* reintento */ }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  return null;
}
async function pool(items, n, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}
const ymdOf = (iso) => iso.slice(0, 10).replace(/-/g, '');

function calendarDates(cal) {
  const out = new Set();
  (cal || []).forEach((c) => {
    if (typeof c === 'string') out.add(ymdOf(c));
    else (c.entries || [c]).forEach((en) => {
      if (!en.startDate) return;
      const a = Date.parse(en.startDate), b = Date.parse(en.endDate || en.startDate);
      for (let t = a; t <= b; t += 86400e3) out.add(new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));
    });
  });
  return [...out].sort();
}

function compact(e, lg, seasonKey) {
  const c = e.competitions[0];
  const H = c.competitors.find((x) => x.homeAway === 'home'), A = c.competitors.find((x) => x.homeAway === 'away');
  if (!H || !A) return null;
  const side = (tid) => (tid === H.team.id ? 0 : tid === A.team.id ? 1 : -1);
  const det = c.details || [];
  const stat = (comp, name) => { const s = (comp.statistics || []).find((x) => x.name === name); return s ? +s.displayValue : null; };
  const corners = [stat(H, 'wonCorners'), stat(A, 'wonCorners')];
  const type = e.status.type || {};
  return {
    id: e.id, lg, season: seasonKey, stage: (e.season && e.season.slug) || '', date: e.date,
    st: type.state, done: !!type.completed, postponed: /POSTPONED|CANCELED|SUSPENDED/.test(type.name || ''),
    h: H.team.displayName, a: A.team.displayName, hid: H.team.id, aid: A.team.id,
    hs: H.score != null ? +H.score : null, as: A.score != null ? +A.score : null,
    city: (c.venue && c.venue.address && c.venue.address.city) || '', venue: (c.venue && c.venue.fullName) || '', neutral: !!c.neutralSite,
    goals: det.filter((d) => d.scoringPlay).map((d) => [ESPN.minuteOf(d.clock && d.clock.displayValue), side(d.team && d.team.id)]),
    cards: det.filter((d) => d.yellowCard || d.redCard).map((d) => [ESPN.minuteOf(d.clock && d.clock.displayValue), side(d.team && d.team.id), d.redCard ? 1 : 0]),
    corners: corners.every((x) => x != null) ? corners : null,
  };
}

function summaryOf(s, ev) {
  if (!s) return null;
  const out = {};
  const pc = (s.pickcenter || [])[0];
  if (pc && pc.moneyline) {
    const ml = pc.moneyline, g = (k, w) => ESPN.dec(ml[k] && ml[k][w] && ml[k][w].odds);
    const o = { h: [g('home', 'open'), g('home', 'close')], d: [g('draw', 'open'), g('draw', 'close')], a: [g('away', 'open'), g('away', 'close')] };
    if ([0, 1].every((i) => o.h[i] && o.d[i] && o.a[i])) out.odds = o;
  }
  if (pc && pc.total && pc.total.over && pc.total.under) {
    const t = pc.total, line = (x) => parseFloat(String(x || '').replace(/^[ou]/i, ''));
    const ov = [ESPN.dec(t.over.open && t.over.open.odds), ESPN.dec(t.over.close && t.over.close.odds)];
    const un = [ESPN.dec(t.under.open && t.under.open.odds), ESPN.dec(t.under.close && t.under.close.odds)];
    const pt = [line(t.over.open && t.over.open.line), line(t.over.close && t.over.close.line)];
    if (ov.every(Boolean) && un.every(Boolean) && pt.every(isFinite)) out.tot = { pt, ov, un };
  }
  const ro = s.rosters || [];
  if (ro.length === 2) {
    const lu = { s: [[], []], subs: [], reds: [], names: {} };
    ro.forEach((r) => {
      const sd = r.homeAway === 'home' ? 0 : 1;
      (r.roster || []).forEach((p) => {
        if (!p.athlete) return;
        lu.names[p.athlete.id] = [p.athlete.shortName || p.athlete.displayName, (p.position && p.position.abbreviation) || ''];
        if (p.starter) lu.s[sd].push(p.athlete.id);
      });
    });
    const hid = ev.hid;
    (s.keyEvents || []).forEach((k) => {
      const tp = (k.type && k.type.type) || '';
      const sd = k.team ? (k.team.id === hid ? 0 : 1) : -1;
      const min = ESPN.minuteOf(k.clock && k.clock.displayValue);
      const ps = (k.participants || []).map((p) => p.athlete && p.athlete.id);
      if (tp === 'substitution' && ps.length >= 2 && sd >= 0) lu.subs.push([min, sd, ps[0], ps[1]]);
      if (/red-card/.test(tp) && ps[0] && sd >= 0) lu.reds.push([min, sd, ps[0]]);
    });
    if (lu.s[0].length >= 10 && lu.s[1].length >= 10) out.lu = lu;
  }
  return out;
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { events: {}, dates: {}, summaries: {}, seasons: {} }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
  fs.renameSync(FILE + '.tmp', FILE);
}

/**
 * Actualiza el historial. Las fechas pasadas de más de 3 días se leen una sola vez; las recientes y futuras se releen.
 * @returns {Promise<{db, fetched:number, summaries:number}>}
 */
async function refresh(opts = {}) {
  const db = load();
  const log = opts.log || (() => {});
  const todayYmd = ESPN.ymd(0);
  const recent = ESPN.ymd(-3);
  let fetched = 0, sums = 0;
  for (const [lg, refs] of Object.entries(SEASONS)) {
    for (const ref of refs) {
      // OJO: el marcador sin fecha puede apuntar a la FASE SIGUIENTE con el calendario vacío (pasó con la Liga BetPlay
      // al terminar el todos contra todos). Para la temporada actual se unen varios calendarios y siempre se cubre
      // desde 10 días atrás hasta 21 días adelante.
      const heads = ref ? [ref] : [null, ESPN.ymd(0), ESPN.ymd(-7)];
      let L = null;
      const set = new Set();
      for (const h of heads) {
        const head = await getJSON(BASE + lg + '/scoreboard' + (h ? '?dates=' + h : ''));
        const Lh = head && head.leagues && head.leagues[0];
        if (!Lh) continue;
        L = L || Lh;
        calendarDates(Lh.calendar).forEach((d) => set.add(d));
      }
      if (!L) continue;
      if (!ref) for (let o = -10; o <= 21; o++) set.add(ESPN.ymd(o));
      const seasonKey = lg + ':' + (L.season && L.season.year);
      db.seasons[seasonKey] = { lg, year: L.season && L.season.year, name: L.season && L.season.displayName, start: L.season && L.season.startDate, end: L.season && L.season.endDate };
      const dates = [...set].sort();
      db.dates[seasonKey] = db.dates[seasonKey] || {};
      const todo = dates.filter((d) => !db.dates[seasonKey][d] || d >= recent);
      await pool(todo, 6, async (d) => {
        const j = await getJSON(BASE + lg + '/scoreboard?dates=' + d);
        if (!j) return;
        // la temporada sale de cada partido (no del encabezado, que puede ser de otra fase u otro año)
        (j.events || []).forEach((e) => { const c = compact(e, lg, e.season && e.season.year ? lg + ':' + e.season.year : seasonKey); if (c) db.events[e.id] = c; });
        db.dates[seasonKey][d] = Date.now();
        fetched++;
      });
      log(seasonKey + ': ' + dates.length + ' fechas en el calendario, ' + todo.length + ' leídas');
    }
  }
  const need = Object.values(db.events).filter((e) => e.done && DEEP.includes(e.lg) && !db.summaries[e.id]);
  await pool(need, 6, async (e) => {
    const s = await getJSON(BASE + e.lg + '/summary?event=' + e.id);
    db.summaries[e.id] = summaryOf(s, e) || {};
    sums++;
  });
  log('resúmenes nuevos: ' + sums);
  db.updatedAt = new Date().toISOString();
  db.today = todayYmd;
  save(db);
  return { db, fetched, summaries: sums };
}

/** Partidos de una liga ordenados por fecha (incluye futuros si all = true). */
function matches(db, lg, all) {
  return Object.values(db.events).filter((e) => e.lg === lg && !e.postponed && (all || (e.done && e.hs != null)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

module.exports = { refresh, load, matches, compact, summaryOf, calendarDates, SEASONS, FILE };

if (require.main === module) {
  const t0 = Date.now();
  refresh({ log: (m) => console.log('  · ' + m) }).then(({ db, fetched, summaries }) => {
    const done = Object.values(db.events).filter((e) => e.done).length;
    const withOdds = Object.values(db.summaries).filter((s) => s.odds).length;
    const withLu = Object.values(db.summaries).filter((s) => s.lu).length;
    console.log('✓ Historial: ' + Object.keys(db.events).length + ' partidos (' + done + ' terminados) · ' + fetched + ' fechas leídas · ' +
      summaries + ' resúmenes nuevos · con cuota de apertura y cierre: ' + withOdds + ' · con alineaciones: ' + withLu + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  });
}

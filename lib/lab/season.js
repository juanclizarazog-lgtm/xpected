/*
 * Fase 6 · Estrategia 13 · simulador de temporada.
 * Arma la tabla actual, los partidos que faltan y la fuerza de cada equipo (con su incertidumbre, de la estrategia 1)
 * y juega lo que falta 10.000 veces con el formato real de cada liga (lib/lab/formats/*.json).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const LQ = require('../../assets/js/lab/lab-quant.js');
const MODEL = require('../model.js');

const FORMATS = {};
fs.readdirSync(path.join(__dirname, 'formats')).forEach((f) => { const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'formats', f), 'utf8').replace(/^﻿/, '')); FORMATS[j.lg] = j; });

const ptsOf = (gf, ga) => (gf > ga ? 3 : gf === ga ? 1 : 0);

/** Partidos de la fase de todos contra todos de un torneo: los primeros K de cada equipo, con K = lo que juegan los eliminados. */
function roundRobin(games) {
  const by = {};
  games.forEach((m) => { [m.hid, m.aid].forEach((id) => { (by[id] = by[id] || []).push(m); }); });
  const counts = Object.values(by).map((a) => a.length).sort((a, b) => a - b);
  const low = counts.slice(0, Math.max(1, counts.length - 8));
  const K = low[Math.floor(low.length / 2)];
  const keep = new Set();
  Object.values(by).forEach((a) => a.slice(0, K).forEach((m) => keep.add(m.id)));
  return games.filter((m) => keep.has(m.id) && by[m.hid].indexOf(m) < K && by[m.aid].indexOf(m) < K);
}

function build(db, lg, kal, liveNow) {
  const format = FORMATS[lg];
  if (!format) return null;
  const all = Object.values(db.events).filter((e) => e.lg === lg && !e.postponed).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const seasons = [...new Set(all.map((e) => e.season))].sort((a, b) => +a.split(':')[1] - +b.split(':')[1]);
  const cur = seasons[seasons.length - 1];
  const doneCur = all.filter((e) => e.season === cur && e.done);
  const stage = doneCur.length ? doneCur[doneCur.length - 1].stage : (all.find((e) => e.season === cur) || {}).stage;
  const inStage = all.filter((e) => e.season === cur && e.stage === stage);
  const names = {}; inStage.forEach((e) => { names[e.hid] = e.h; names[e.aid] = e.a; });
  const table = {};
  Object.keys(names).forEach((id) => { table[id] = { pts: 0, gd: 0, gf: 0, gp: 0 }; });
  // los que el feed ya da por terminados (el historial se pone al día unos minutos después) cuentan como jugados
  const fin = (e) => !e.done && liveNow && liveNow[e.id] && liveNow[e.id].post;
  let played = inStage.filter((e) => e.done && e.hs != null).concat(inStage.filter(fin).map((e) => Object.assign({}, e, { done: true, hs: liveNow[e.id].h0, as: liveNow[e.id].a0 })));
  if (format.type === 'col-cuadrangulares') {
    // solo la fase de todos contra todos (máximo «rounds» partidos por equipo)
    const n = {}; played = played.filter((m) => { n[m.hid] = (n[m.hid] || 0) + 1; n[m.aid] = (n[m.aid] || 0) + 1; return n[m.hid] <= format.rounds && n[m.aid] <= format.rounds; });
  }
  played.forEach((m) => {
    const H = table[m.hid], A = table[m.aid];
    H.gp++; A.gp++; H.gf += m.hs; A.gf += m.as; H.gd += m.hs - m.as; A.gd += m.as - m.hs; H.pts += ptsOf(m.hs, m.as); A.pts += ptsOf(m.as, m.hs);
  });
  // partidos en curso: parten del marcador actual y solo se simula el tiempo que falta. Si el servidor pasa el estado
  // en vivo del feed (liveNow: marcador y minuto al instante), manda ese; si no, el del historial con el minuto estimado.
  const live = (e) => {
    const o = liveNow && liveNow[e.id];
    if (o) return { h0: o.h0, a0: o.a0, rem: o.post ? 0 : +(MODEL.remaining(o.minute, o.period) / MODEL.remaining(0, 1)).toFixed(4), live: true };
    if (e.st !== 'in' || e.hs == null) return {};
    const el = (Date.now() - Date.parse(e.date)) / 60000, minute = Math.min(93, Math.max(0, el > 60 ? el - 15 : el));
    return { h0: e.hs, a0: e.as, rem: +(MODEL.remaining(minute, 1) / MODEL.remaining(0, 1)).toFixed(4), live: true };
  };
  let fixtures = inStage.filter((e) => !e.done && !fin(e)).map((e) => Object.assign({ id: e.id, h: e.hid, a: e.aid, date: e.date }, live(e)));
  if (format.type === 'col-cuadrangulares') {
    const n = {}; Object.keys(table).forEach((id) => { n[id] = table[id].gp; });
    fixtures = fixtures.filter((f) => { if (n[f.h] >= format.rounds || n[f.a] >= format.rounds) return false; n[f.h]++; n[f.a]++; return true; });
  } else {
    // dos vueltas: los cruces que no se han jugado ni tienen fecha también faltan
    const seen = new Set(played.map((m) => m.hid + '|' + m.aid).concat(fixtures.map((f) => f.h + '|' + f.a)));
    const ids = Object.keys(table);
    ids.forEach((h) => ids.forEach((a) => { if (h !== a && !seen.has(h + '|' + a)) fixtures.push({ id: 'sin-fecha-' + h + '-' + a, h, a, date: null }); }));
  }
  // tabla del promedio (Colombia): fases de todos contra todos de las últimas tres temporadas, sin la actual
  let relegation = null;
  if (format.type === 'col-cuadrangulares') {
    relegation = {};
    const yearNow = +cur.split(':')[1];
    const tournaments = {};
    all.filter((e) => e.done && e.hs != null && +e.season.split(':')[1] >= yearNow - 2 && !(e.season === cur && e.stage === stage))
      .forEach((e) => { (tournaments[e.season + '|' + e.stage] = tournaments[e.season + '|' + e.stage] || []).push(e); });
    Object.values(tournaments).forEach((games) => roundRobin(games).forEach((m) => {
      [[m.hid, m.hs, m.as], [m.aid, m.as, m.hs]].forEach(([id, f, a]) => { const r = relegation[id] = relegation[id] || { pts: 0, gp: 0 }; r.pts += ptsOf(f, a); r.gp++; });
    }));
  }
  const model = { mh: kal.mh, ma: kal.ma, teams: {} };
  Object.keys(table).forEach((id) => { const t = kal.teams[id]; model.teams[id] = t ? { att: t.a, def: t.d, sd: Math.sqrt((t.Pa + t.Pd) / 2) } : { att: -0.1, def: -0.1, sd: 0.3 }; });
  const results = played.map((m) => ({ h: m.hid, a: m.aid, hs: m.hs, as: m.as }));
  return { lg, format, season: cur, stage, names, table, fixtures, model, results, relegation };
}

function run(input, nSims, fixed, seed) {
  const t0 = Date.now();
  const res = LQ.simulate(input.model, input.table, input.fixtures, input.format, nSims, fixed || null, seed || 2026, input.results, { relegation: input.relegation });
  const maxSE = Math.max(...Object.values(res).map((r) => Math.max(LQ.simSE(r.champ, nSims), LQ.simSE(r.top || r.playoff, nSims), LQ.simSE(r.bottom, nSims))));
  return { n: nSims, ms: Date.now() - t0, maxSE, teams: res };
}

module.exports = { build, run, roundRobin, FORMATS };

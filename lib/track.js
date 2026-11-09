/*
 * Xpected · historial real y auditable de pronósticos.
 * - Cada pronóstico se congela (SHA-256 + hora) entre 90 y 0 minutos antes del inicio y nunca se modifica.
 * - Hasta el inicio se guarda la cuota de cierre para medir CLV.
 * - Al terminar se califica: acierto del favorito, Brier, log loss frente a la casa y la apuesta de valor marcada.
 * Se persiste en data/track-record.json (fuera de lo que se sirve como archivo estático).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Q = require('../assets/js/quant.js');

const VALUE_EDGE = 0.04; // ventaja mínima para registrar una apuesta de valor

function createTrack(dir) {
  const file = path.join(dir, 'track-record.json');
  let db = { version: 1, preds: {} };
  try { if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('[track] no se pudo leer el historial:', e.message); }
  let dirty = false, timer = 0;
  function save() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!dirty) return;
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); dirty = false; }
      catch (e) { console.error('[track] no se pudo guardar:', e.message); }
    }, 1500);
  }

  function update(ev) {
    if (!ev.model) return;
    const now = Date.now(), t = Date.parse(ev.commence);
    const odds = ev.books && ev.books[0] && ev.books[0].h2h && !ev.books[0].prematch ? [ev.books[0].h2h.home, ev.books[0].h2h.draw, ev.books[0].h2h.away] : null;
    let p = db.preds[ev.id];
    if (ev.state === 'pre' && !ev.postponed && t > now && t - now <= 90 * 60e3) {
      if (!p) {
        const pf = ev.model.pFinal.map((x) => +x.toFixed(6));
        let pick = null;
        if (odds) {
          const evs = pf.map((x, i) => x * odds[i] - 1);
          const i = evs.indexOf(Math.max(...evs));
          if (evs[i] >= VALUE_EDGE) pick = { sel: ['1', 'X', '2'][i], idx: i, odds: odds[i], edge: +evs[i].toFixed(4) };
        }
        const frozenAt = new Date().toISOString();
        const payload = JSON.stringify({ id: ev.id, at: frozenAt, model: ev.model.version, p: pf });
        p = db.preds[ev.id] = {
          id: ev.id, league: ev.league, home: ev.home, away: ev.away, commence: ev.commence, frozenAt,
          p: pf, pMarket: ev.model.pMarket ? ev.model.pMarket.map((x) => +x.toFixed(6)) : null, odds, pick,
          quality: ev.model.quality, hash: crypto.createHash('sha256').update(payload).digest('hex'), payload,
        };
      }
      if (odds) p.closing = odds; // se actualiza hasta el inicio: queda la cuota de cierre
      save();
    }
    if (p && !p.result && ev.state === 'post' && ev.completed && !ev.postponed && ev.scores) {
      const [h, a] = ev.scores;
      const idx = h > a ? 0 : h === a ? 1 : 2;
      const brier = p.p.reduce((s, x, i) => s + (x - (i === idx ? 1 : 0)) ** 2, 0);
      const ll = -Math.log(Math.max(1e-9, p.p[idx]));
      let llMarket = null, clv = null;
      if (p.closing) {
        const pc = Q.devigShin(p.closing); // mismo método que en el resto de la app
        llMarket = -Math.log(Math.max(1e-9, pc[idx]));
        if (p.pick) clv = +(p.pick.odds * pc[p.pick.idx] - 1).toFixed(4);
      }
      const fav = p.p.indexOf(Math.max(...p.p));
      p.result = {
        score: [h, a], outcome: ['1', 'X', '2'][idx], favoriteHit: fav === idx, pOutcome: p.p[idx],
        brier: +brier.toFixed(5), logLoss: +ll.toFixed(5), logLossMarket: llMarket != null ? +llMarket.toFixed(5) : null,
        pickWon: p.pick ? p.pick.idx === idx : null, pickProfit: p.pick ? (p.pick.idx === idx ? +(p.pick.odds - 1).toFixed(3) : -1) : null,
        clv, gradedAt: new Date().toISOString(),
      };
      save();
    }
  }

  function summary() {
    const all = Object.values(db.preds).sort((x, y) => Date.parse(y.commence) - Date.parse(x.commence));
    const graded = all.filter((p) => p.result);
    const picks = graded.filter((p) => p.pick);
    const withMkt = graded.filter((p) => p.result.logLossMarket != null);
    const mean = (arr, f) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : null);
    const profits = picks.map((p) => p.result.pickProfit);
    const roi = profits.length ? profits.reduce((s, x) => s + x, 0) / profits.length : null;
    const sd = profits.length > 1 ? Math.sqrt(profits.reduce((s, x) => s + (x - roi) ** 2, 0) / (profits.length - 1)) : null;
    return {
      frozen: all.length, graded: graded.length, pending: all.length - graded.length,
      favoriteHitRate: mean(graded, (p) => (p.result.favoriteHit ? 1 : 0)),
      brier: mean(graded, (p) => p.result.brier),
      logLoss: mean(withMkt, (p) => p.result.logLoss), logLossMarket: mean(withMkt, (p) => p.result.logLossMarket), compared: withMkt.length,
      picks: picks.length, picksWon: picks.filter((p) => p.result.pickWon).length, roi, roiCi: sd != null ? 1.96 * sd / Math.sqrt(profits.length) : null,
      clv: mean(picks.filter((p) => p.result.clv != null), (p) => p.result.clv),
      since: all.length ? all[all.length - 1].frozenAt : null,
      recent: all.slice(0, 60).map((p) => ({ id: p.id, league: p.league, home: p.home, away: p.away, commence: p.commence, frozenAt: p.frozenAt, p: p.p, pick: p.pick, hash: p.hash, payload: p.payload, result: p.result || null })),
    };
  }

  return { update, summary };
}

module.exports = { createTrack };

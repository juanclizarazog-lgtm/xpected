/*
 * Xpected · Boleto de análisis.
 * Tocas una cuota (botón .odd-btn) y la selección vuela en arco hasta el boleto. El boleto calcula
 * cuota combinada, probabilidad según Xpected, cuota justa, valor estimado y un monto prudente.
 * No es una apuesta: Xpected no recibe apuestas ni enlaza a casas. Se guarda solo en este navegador.
 */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, F = XP.fmt, esc = XP.esc;
  const D = () => XP.data;
  const I = (n, s) => XP.icon(n, s);
  const slip = (XP.slip = { items: XP.LS.get('slip', []) });
  let host, btn, panel, countEl;

  const save = () => XP.LS.set('slip', slip.items);
  const keyOf = (mid, sid) => mid + '|' + sid;
  slip.has = (mid, sid) => slip.items.some((x) => x.mid === mid && x.sid === sid);

  function live(it) {
    const m = D() && D().byId[it.mid];
    const s = m && m.sel && m.sel[it.sid];
    return { m, s, odds: s ? (s.best != null ? s.best : null) : it.odds, p: s ? s.pFinal : it.p, label: s ? s.label : it.label, group: s ? s.groupName : it.group, status: m ? m.status : 'final' };
  }

  slip.toggle = function (mid, sid, from) {
    if (XP.isSelfExcluded()) { XP.toast('Las funciones de apuestas están en pausa por tu autoexclusión.'); return; }
    if (slip.has(mid, sid)) { slip.remove(keyOf(mid, sid)); return; }
    const m = D().byId[mid]; const s = m && m.sel && m.sel[sid];
    if (!s) return;
    const sameMatch = slip.items.findIndex((x) => x.mid === mid);
    const it = { mid, sid, label: s.label, group: s.groupName, odds: s.best, p: s.pFinal, match: D().teams[m.home].name + ' vs ' + D().teams[m.away].name, at: Date.now() };
    if (sameMatch >= 0) { slip.items[sameMatch] = it; XP.toast('Cambiamos tu selección en ese partido: una por partido.'); }
    else slip.items.push(it);
    save();
    fly(from, s.label, s.best != null ? F.odds(s.best) : 'sin cuota');
    paint();
    markButtons();
  };
  slip.remove = function (key) {
    slip.items = slip.items.filter((x) => keyOf(x.mid, x.sid) !== key);
    save(); paint(); markButtons();
  };
  slip.clear = function () { slip.items = []; save(); paint(); markButtons(); };

  /** Animación: la selección viaja en arco desde la cuota hasta el botón del boleto. */
  function fly(from, label, odds) {
    if (!from || !btn || XP.reducedMotion()) { bump(); return; }
    const a = from.getBoundingClientRect(), z = btn.getBoundingClientRect();
    const chip = document.createElement('div');
    chip.className = 'fly-chip';
    chip.innerHTML = '<span>' + esc(label) + '</span><b>' + esc(odds) + '</b>';
    document.body.appendChild(chip);
    const sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = z.left + z.width / 2, ey = z.top + z.height / 2;
    const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 140;
    const pt = (t) => { const u = 1 - t; return [u * u * sx + 2 * u * t * mx + t * t * ex, u * u * sy + 2 * u * t * my + t * t * ey]; };
    const frames = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => { const [x, y] = pt(t); return { transform: 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) scale(' + (1 - t * 0.55) + ') rotate(' + (t * -8) + 'deg)', opacity: t > 0.85 ? 0.4 : 1, offset: t }; });
    const anim = chip.animate(frames, { duration: 720, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' });
    anim.onfinish = () => { chip.remove(); bump(); };
  }
  function bump() {
    if (!btn) return;
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
    if (XP.audio) XP.audio.ui('tick');
  }

  function summary() {
    const ls = slip.items.map(live);
    const open = ls.filter((x) => x.status !== 'final');
    const withOdds = ls.every((x) => x.odds != null);
    const pAll = ls.reduce((t, x) => t * (x.p || 0), 1);
    const odds = withOdds ? ls.reduce((t, x) => t * x.odds, 1) : null;
    return { ls, open, pAll, fair: pAll > 0 ? 1 / pAll : null, odds, ev: odds ? pAll * odds - 1 : null };
  }

  function paint() {
    if (!host) return;
    const n = slip.items.length;
    host.hidden = XP.isSelfExcluded();
    btn.classList.toggle('has-items', n > 0);
    countEl.textContent = n;
    btn.setAttribute('aria-label', 'Boleto de análisis, ' + n + (n === 1 ? ' selección' : ' selecciones'));
    if (panel.hidden) return;
    const s = summary();
    const st = XP.settings;
    let stake = '';
    if (s.odds && s.ev != null) {
      const k = Q.kellyStake(s.pAll, s.odds, { fraction: st.kellyFraction, maxPct: n > 1 ? st.maxStakePct / 2 : st.maxStakePct, bankroll: st.bankroll });
      stake = k.f > 0 ? F.money(k.stake) + ' <small class="muted">(' + F.pct(k.f, 1) + ' de tu banca)</small>' : '<span class="muted">No apostar: sin ventaja a este precio</span>';
    }
    panel.innerHTML =
      '<header class="slip-head"><h2 class="h3">' + I('flag', 18) + ' Boleto de análisis</h2><button class="icon-btn btn-sm" type="button" data-slip-close aria-label="Cerrar">' + I('x', 16) + '</button></header>' +
      (n ? '<ul class="slip-list">' + s.ls.map((x, i) => {
        const it = slip.items[i];
        return '<li class="slip-item' + (x.status === 'final' ? ' done' : '') + '"><div class="si-main"><span class="si-match">' + esc(it.match) + (x.status === 'vivo' ? ' <span class="live-ind"><i class="dot"></i>vivo</span>' : x.status === 'final' ? ' <span class="chip chip-muted">terminado</span>' : '') + '</span><strong>' + esc(x.label) + '</strong><small class="muted">' + esc(x.group) + ' · Xpected ' + F.prob(x.p, 0) + ' · justa ' + F.odds(1 / x.p) + '</small></div>' +
          '<div class="si-odds">' + (x.odds != null ? F.odds(x.odds) : '<span class="muted small">sin cuota</span>') + '</div><button class="icon-btn btn-sm" type="button" data-slip-remove="' + esc(keyOf(it.mid, it.sid)) + '" aria-label="Quitar ' + esc(x.label) + '">' + I('x', 14) + '</button></li>';
      }).join('') + '</ul>' +
        '<dl class="slip-sum">' +
        '<div><dt>' + (n > 1 ? 'Cuota combinada' : 'Cuota') + '</dt><dd>' + (s.odds ? F.odds(s.odds) : '—') + '</dd></div>' +
        '<div><dt>Probabilidad Xpected</dt><dd>' + F.prob(s.pAll, 1) + '</dd></div>' +
        '<div><dt>Cuota justa</dt><dd>' + (s.fair ? F.odds(s.fair) : '—') + '</dd></div>' +
        '<div><dt>Valor estimado</dt><dd class="' + (s.ev == null ? '' : s.ev > 0 ? 'up' : 'down') + '">' + (s.ev == null ? '—' : F.signedPct(s.ev, 1)) + '</dd></div>' +
        (stake ? '<div class="wide"><dt>' + I('wallet', 14) + ' Monto prudente</dt><dd>' + stake + '</dd></div>' : '') +
        '</dl>' +
        (n > 1 ? '<p class="note small">' + I('info', 14) + ' En una combinada se multiplica el margen de la casa en cada selección, y suponemos partidos independientes. Por eso nunca la marcamos como «valor».</p>' : '') +
        '<div class="cta-row"><button class="btn btn-sm btn-ghost" type="button" data-slip-clear>' + I('x', 14) + ' Vaciar</button></div>'
        : '<div class="slip-empty">' + I('coin', 34) + '<p><strong>Tu boleto está vacío</strong></p><p class="muted small">Toca cualquier cuota en la pestaña «Apuestas» de un partido o en el radar de valor para analizarla aquí.</p></div>') +
      '<p class="muted small slip-legal">' + I('shield', 13) + ' Herramienta de análisis: Xpected no recibe apuestas ni enlaza a casas. Apuesta solo lo que puedas perder.</p>';
  }

  function markButtons() {
    XP.$$('[data-slip]').forEach((el) => {
      const [mid, sid] = el.dataset.slip.split('|');
      const on = slip.has(mid, sid);
      el.classList.toggle('in-slip', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }
  slip.mark = markButtons;

  function setOpen(v) {
    panel.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    host.classList.toggle('open', v);
    if (v) { paint(); const f = panel.querySelector('button'); if (f) f.focus(); }
  }

  slip.build = function () {
    host = document.createElement('div');
    host.className = 'slip';
    host.innerHTML = '<button class="slip-btn" type="button" aria-expanded="false" aria-controls="slip-panel">' + I('flag', 18) + '<span class="slip-lbl">Boleto</span><span class="slip-count">0</span></button><section class="slip-panel" id="slip-panel" hidden aria-label="Boleto de análisis"></section>';
    document.body.appendChild(host);
    btn = host.querySelector('.slip-btn'); panel = host.querySelector('.slip-panel'); countEl = host.querySelector('.slip-count');
    btn.addEventListener('click', () => setOpen(panel.hidden));
    panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-slip-close]')) { setOpen(false); btn.focus(); }
      const r = e.target.closest('[data-slip-remove]'); if (r) slip.remove(r.dataset.slipRemove);
      if (e.target.closest('[data-slip-clear]')) slip.clear();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });
    document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !host.contains(e.target) && !e.target.closest('[data-slip]')) setOpen(false); });
    // tocar una cuota (botón .odd-btn) la añade o la quita del boleto
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slip]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const [mid, sid] = b.dataset.slip.split('|');
      slip.toggle(mid, sid, b);
    }, true);
    XP.bus.on('match', () => { if (!panel.hidden) paint(); });
    XP.bus.on('settings', paint);
    paint();
  };

  /**
   * Botón de cuota estilo casa de apuestas: muestra SOLO la cuota de la casa («—» si no la publica; nunca la
   * cuota justa, que ya tiene su propia columna) y añade al boleto. Se actualiza en vivo si la casa la publica.
   */
  XP.oddBtn = function (m, sid) {
    const s = m.sel[sid];
    if (!s || XP.isSelfExcluded()) return XP.ui.bind(m, 'o:' + sid, 'odds-cell');
    const on = slip.has(m.id, sid);
    return '<button type="button" class="odd-btn' + (on ? ' in-slip' : '') + (s.value ? ' is-val' : '') + '" data-slip="' + m.id + '|' + sid + '" aria-pressed="' + on + '" title="' +
      (s.best != null ? 'Añadir al boleto de análisis' : 'La casa no publica cuota para esta apuesta · añadir al boleto de análisis') + '">' +
      XP.ui.bind(m, 'o:' + sid) + '<span class="ob-plus" aria-hidden="true">+</span></button>';
  };
})();

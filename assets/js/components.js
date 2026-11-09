/* Xpected · componentes de interfaz y gráficas (SVG propio, accesible, animado solo con transform/opacity). */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, F = XP.fmt, esc = XP.esc;
  const ui = (XP.ui = {});
  const D = () => XP.data;

  // ── piezas básicas ───────────────────────────────────────────────────────────
  /** Escudo: logo real del equipo si existe; si no carga, quedan sus siglas. */
  ui.crest = function (teamId, size) {
    const t = D().teams[teamId];
    const hue = Q.hashSeed(t.id) % 360;
    return '<span class="crest ' + (size || '') + (t.logo ? ' has-logo' : '') + '" style="--h:' + hue + '" aria-hidden="true"><span class="crest-code">' + esc(t.code) + '</span>' +
      (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>';
  };
  ui.leagueMark = function (L) {
    return L.logo ? '<img class="league-logo" src="' + esc(L.logo) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '<span class="league-dot" aria-hidden="true">' + XP.icon('trophy', 14) + '</span>';
  };
  /** Forma reciente como fichas G/E/P (no solo color: cada ficha lleva su letra). */
  ui.formDots = function (teamId, n) {
    const t = D().teams[teamId];
    let f = t.form;
    if (!f && !t.ext) f = D().teamDetail(teamId).last.slice(0, 5).map((r) => ({ G: 'W', E: 'D', P: 'L' })[r.res]).join('');
    if (!f) return '';
    const s = f.replace(/[^WDL]/g, '').slice(-(n || 5));
    return '<span class="form-dots" aria-label="Forma reciente: ' + s.replace(/W/g, 'G').replace(/D/g, 'E').replace(/L/g, 'P').split('').join(' ') + '">' +
      [...s].map((c) => '<i class="fd fd-' + c + '">' + ({ W: 'G', D: 'E', L: 'P' })[c] + '</i>').join('') + '</span>';
  };

  ui.statusChip = function (m) {
    if (m.postponed) return '<span class="chip chip-warn">Aplazado</span>';
    if (m.status === 'vivo') return '<span class="live-ind"><i class="dot" aria-hidden="true"></i><span class="sr-only">En vivo, minuto </span><span data-bind="' + m.id + '|minute">' + minuteText(m) + '</span></span>';
    if (m.status === 'final') return '<span class="chip chip-muted" data-bind="' + m.id + '|minute">Final</span>';
    return '<span class="chip">' + XP.icon('clock', 13) + '<span data-bind="' + m.id + '|minute">' + kickoffText(m) + '</span></span>';
  };
  function kickoffText(m) {
    const k = m.kickoff, dk = (d) => F.dayKey(d);
    const today = dk(new Date()), tomorrow = dk(new Date(Date.now() + 86400e3));
    const day = dk(k) === today ? '' : dk(k) === tomorrow ? 'Mañana ' : new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', timeZone: XP.settings.tz }).format(k) + ' · ';
    return day + F.time(k);
  }
  function minuteText(m) {
    if (m.postponed) return 'Aplazado';
    if (m.status === 'final') return 'Final';
    if (m.status === 'previa') return kickoffText(m);
    if (m.halftime) return 'Entretiempo';
    if (m.clock) return m.clock;
    return m.minute > 90 ? '90+' + (m.minute - 90) + "'" : m.minute + "'";
  }
  ui.kickoffText = kickoffText;

  ui.marketOnlyBadge = (L) => (L.marketOnly ? '<span class="chip chip-warn" title="El modelo no supera al mercado en el backtest de esta competición">Solo mercado</span>' : '');

  // ── valores enlazados (se actualizan solos con cada mensaje en vivo) ─────────
  function valueOf(m, key) {
    const [k, s] = key.split(':');
    if (k === 'score') return { text: m.score[0] + '–' + m.score[1], n: m.score[0] * 100 + m.score[1], neutral: true };
    if (k === 'minute') return { text: minuteText(m), n: null };
    if (k === 'upd') return { text: F.ago(m.updatedAt), n: null, ago: m.updatedAt };
    if (k === 'bm') return bookMargin(m, key);
    const sel = m.sel && m.sel[s];
    if (!sel) return { text: '—', n: null };
    if (k === 'pf') return { text: F.prob(sel.pFinal), n: sel.pFinal };
    if (k === 'pf0') return { text: F.prob(sel.pFinal, 0), n: +sel.pFinal.toFixed(3) };
    if (k === 'pm') return sel.pMarket == null ? { text: '—', n: null } : { text: F.prob(sel.pMarket), n: sel.pMarket };
    if (k === 'pd') return { text: F.prob(sel.pModel), n: sel.pModel };
    if (k === 'ci') return { text: F.prob(sel.lo, 0) + '–' + F.prob(sel.hi, 0), n: null };
    if (k === 'o') return { text: sel.suspended ? 'susp.' : sel.best == null ? '—' : F.odds(sel.best), n: sel.best };
    if (k === 's') return { text: sel.suspended ? 'susp.' : F.odds(sel.sharp), n: sel.sharp };
    if (k === 'ev') return { text: sel.ev == null ? '—' : F.signedPct(sel.ev), n: sel.ev, cls: sel.ev == null ? '' : sel.value ? 'is-value' : sel.ev < 0 ? 'is-neg' : '' };
    if (k === 'ago') return { text: F.ago(sel.oddsAt), n: null, ago: sel.oddsAt };
    // cuota justa según la probabilidad de Xpected
    if (k === 'fo') return { text: F.odds(1 / sel.pFinal), n: +(1 / sel.pFinal).toFixed(4) };
    if (k === 'bk') {
      const o = sel.books ? sel.books[+key.split(':')[2]] : null;
      if (o == null) return { text: '—', n: null, cls: '' };
      return { text: F.odds(o), n: o, cls: (o === sel.best ? 'is-best' : '') + (o * sel.pFinal > 1 ? ' over-fair' : '') };
    }
    return { text: '—', n: null };
  }
  function bookMargin(m, key) {
    const i = key.split(':')[1];
    const os = ['1', 'X', '2'].map((x) => (m.sel[x] ? (i === 's' ? m.sel[x].sharp : m.sel[x].books[+i]) : null));
    if (os.some((o) => o == null)) return { text: '—', n: null };
    return { text: F.pct(Q.overround(os) - 1, 1), n: null };
  }
  ui.bind = function (m, key, extra) {
    const v = valueOf(m, key);
    return '<span class="bind ' + (extra || '') + ' ' + (v.cls || '') + '" data-bind="' + m.id + '|' + key + '"' + (v.cls ? ' data-cls="' + v.cls.trim() + '"' : '') + (v.n != null ? ' data-v="' + v.n + '"' : '') + (v.ago ? ' data-ago="' + v.ago + '"' : '') + '><span class="num">' + v.text + '</span></span>';
  };

  ui.updateBindings = function (m, root) {
    XP.$$('[data-bind^="' + m.id + '|"]', root).forEach((el) => {
      const key = el.dataset.bind.slice(m.id.length + 1);
      const v = valueOf(m, key);
      if (v.ago) el.dataset.ago = v.ago;
      const old = el.dataset.v != null ? parseFloat(el.dataset.v) : null;
      if (v.cls != null) {
        (el.dataset.cls || 'is-value is-neg').split(' ').filter(Boolean).forEach((c) => el.classList.remove(c));
        v.cls.split(' ').filter(Boolean).forEach((c) => el.classList.add(c));
        el.dataset.cls = v.cls.trim();
      }
      if (v.n != null && old != null && Math.abs(v.n - old) > 1e-9) {
        const dir = v.neutral ? 'flat' : v.n > old ? 'up' : 'down';
        el.dataset.v = v.n;
        el.classList.remove('tick-up', 'tick-down', 'tick-flat');
        void el.offsetWidth; // reinicia la animación (un solo destello de 600 ms)
        el.classList.add('tick-' + dir);
        el.innerHTML = '<span class="num">' + v.text + '</span>' + (dir === 'flat' ? '' : '<span class="trend" aria-hidden="true">' + (dir === 'up' ? '▲' : '▼') + '</span>');
        el.setAttribute('aria-label', v.text + (dir === 'up' ? ', sube' : dir === 'down' ? ', baja' : ''));
      } else if (v.n == null || old == null) {
        if (v.n != null) el.dataset.v = v.n;
        const numEl = el.querySelector('.num');
        if (numEl) { if (numEl.textContent !== v.text) numEl.textContent = v.text; } else if (el.textContent !== v.text) el.textContent = v.text;
      }
    });
    XP.$$('[data-pbar^="' + m.id + '|"]', root).forEach((el) => {
      const kind = el.dataset.pbar.split('|')[1];
      setBar(el, barProbs(m, kind));
    });
    XP.$$('[data-gauge^="' + m.id + '|"]', root).forEach((el) => {
      el.outerHTML = ui.gauge(m, el.dataset.gauge.split('|')[1]);
    });
  };
  ui.updateAgo = function () {
    XP.$$('[data-ago]').forEach((el) => {
      const t = F.ago(+el.dataset.ago);
      const n = el.querySelector('.num') || el;
      if (n.textContent !== t) n.textContent = t;
    });
  };

  // ── ProbabilityBar1X2 ────────────────────────────────────────────────────────
  function barProbs(m, kind) {
    if (kind === 'frozen') return [m.frozen.p['1'], m.frozen.p['X'], m.frozen.p['2']];
    const k = kind === 'market' ? 'pMarket' : kind === 'model' ? 'pModel' : 'pFinal';
    if (m.status === 'final' && m.frozen) return [m.frozen.p['1'], m.frozen.p['X'], m.frozen.p['2']];
    const ps = ['1', 'X', '2'].map((s) => m.sel[s][k]);
    return ps.some((p) => p == null) ? ['1', 'X', '2'].map((s) => m.sel[s].pFinal) : ps;
  }
  function setBar(el, ps) {
    const segs = el.querySelectorAll('.seg');
    let acc = 0;
    ps.forEach((p, i) => {
      if (segs[i]) segs[i].style.transform = 'translateX(' + (acc * 100).toFixed(3) + '%) scaleX(' + p.toFixed(5) + ')';
      acc += p;
    });
    const lbl = el.querySelectorAll('.pbar-labels b');
    ps.forEach((p, i) => { if (lbl[i]) lbl[i].textContent = F.prob(p, 0); });
    el.setAttribute('aria-label', 'Local ' + F.prob(ps[0]) + ', empate ' + F.prob(ps[1]) + ', visitante ' + F.prob(ps[2]));
  }
  ui.probBar = function (m, kind, opts) {
    const o = Object.assign({ labels: true, title: null, compact: false }, opts || {});
    const ps = barProbs(m, kind || 'final');
    let acc = 0;
    const segs = ['h', 'd', 'a'].map((c, i) => {
      const s = '<span class="seg seg-' + c + '" style="transform:translateX(' + (acc * 100).toFixed(3) + '%) scaleX(' + ps[i].toFixed(5) + ')"></span>';
      acc += ps[i];
      return s;
    }).join('');
    const H = D().teams[m.home], A = D().teams[m.away];
    return '<div class="pbar' + (o.compact ? ' compact' : '') + '" data-pbar="' + m.id + '|' + (kind || 'final') + '" role="img" aria-label="Local ' + F.prob(ps[0]) + ', empate ' + F.prob(ps[1]) + ', visitante ' + F.prob(ps[2]) + '">' +
      (o.title ? '<div class="pbar-title">' + o.title + '</div>' : '') +
      '<div class="pbar-track">' + segs + '</div>' +
      (o.labels ? '<div class="pbar-labels"><span><i class="sw sw-h"></i>' + esc(o.compact ? H.code : '1 · ' + H.name) + ' <b>' + F.prob(ps[0], 0) + '</b></span><span><i class="sw sw-d"></i>X <b>' + F.prob(ps[1], 0) + '</b></span><span><i class="sw sw-a"></i>' + esc(o.compact ? A.code : '2 · ' + A.name) + ' <b>' + F.prob(ps[2], 0) + '</b></span></div>' : '') +
      '</div>';
  };

  // ── MatchCard ────────────────────────────────────────────────────────────────
  ui.bestValue = function (m) {
    if (m.status === 'final' || m.L.marketOnly) return null;
    let best = null;
    Object.values(m.sel).forEach((s) => { if (s.value && (!best || s.ev > best.ev)) best = s; });
    return best;
  };
  /** Favorito del 1X2 y nivel de confianza en palabras. */
  ui.pick = function (m) {
    const s = m.status === 'final' && m.frozen ? { '1': { pFinal: m.frozen.p['1'] }, 'X': { pFinal: m.frozen.p['X'] }, '2': { pFinal: m.frozen.p['2'] } } : m.sel;
    const k = ['1', 'X', '2'].reduce((b, x) => (s[x].pFinal > s[b].pFinal ? x : b), '1');
    const p = s[k].pFinal;
    const T = D().teams;
    return { key: k, p, label: k === '1' ? T[m.home].name : k === '2' ? T[m.away].name : 'Empate', short: k === '1' ? T[m.home].code : k === '2' ? T[m.away].code : 'X', conf: p >= 0.6 ? 'Alta' : p >= 0.45 ? 'Media' : 'Baja' };
  };

  ui.matchCard = function (m, opts) {
    const o = Object.assign({ big: false }, opts || {});
    const T = D().teams, H = T[m.home], A = T[m.away];
    const showScore = m.status !== 'previa' && !m.postponed;
    const bv = !XP.isSelfExcluded() && ui.bestValue(m);
    const pk = ui.pick(m);
    let foot;
    if (m.status === 'final') {
      const out = m.score[0] > m.score[1] ? '1' : m.score[0] === m.score[1] ? 'X' : '2';
      foot = m.postponed ? '<div class="mc-foot muted small">' + XP.icon('calendar', 14) + ' Partido aplazado</div>'
        : '<div class="mc-foot small ' + (pk.key === out ? 'hit' : 'miss') + '">' + XP.icon(pk.key === out ? 'check' : 'x', 14) + ' Pronóstico ' + esc(pk.short) + ' (' + F.prob(pk.p, 0) + ') ' + (pk.key === out ? 'acertado' : 'no se dio') + '</div>';
    } else {
      foot = '<div class="mc-odds">' + ['1', 'X', '2'].map((s) => '<span class="mc-odd' + (s === pk.key ? ' is-pick' : '') + '"><small>' + (s === '1' ? esc(H.code) : s === '2' ? esc(A.code) : 'X') + '</small>' +
        '<span class="mc-casa">' + ui.bind(m, 'o:' + s, 'odds-cell') + '</span><span class="mc-justa" title="Cuota justa según Xpected">' + ui.bind(m, 'fo:' + s) + '</span></span>').join('') + '</div>';
    }
    return '<a class="match-card tilt spot' + (o.big ? ' big' : '') + (m.status === 'vivo' ? ' is-live' : '') + (bv ? ' has-value' : '') + '" href="#/partido/' + m.id + '" data-match="' + m.id + '">' +
      '<div class="mc-head">' + ui.leagueMark(m.L) + '<span class="mc-league">' + esc(m.L.name) + '</span>' + ui.marketOnlyBadge(m.L) + '<span class="grow"></span>' + ui.statusChip(m) + '</div>' +
      '<div class="mc-teams">' +
      '<div class="mc-team">' + ui.crest(m.home) + '<span class="mc-name">' + esc(H.name) + (m.red[0] ? ' <i class="red-card" title="Tarjeta roja"></i>' : '') + '</span>' + (o.big ? ui.formDots(m.home) : '') + (showScore ? '<span class="mc-score">' + m.score[0] + '</span>' : '') + '</div>' +
      '<div class="mc-team">' + ui.crest(m.away) + '<span class="mc-name">' + esc(A.name) + (m.red[1] ? ' <i class="red-card" title="Tarjeta roja"></i>' : '') + '</span>' + (o.big ? ui.formDots(m.away) : '') + (showScore ? '<span class="mc-score">' + m.score[1] + '</span>' : '') + '</div>' +
      '</div>' +
      (m.status !== 'final' ? '<div class="mc-pick">' + XP.icon('target', 15) + '<span>Pronóstico: <strong>' + esc(pk.label) + '</strong></span><span class="grow"></span><span class="conf conf-' + pk.conf.toLowerCase() + '">' + F.prob(pk.p, 0) + '</span></div>' : '') +
      ui.probBar(m, 'final', { compact: true, labels: false }) +
      foot +
      (bv ? '<div class="mc-value">' + XP.icon('bolt', 14) + ' <span><strong>Valor</strong> en ' + esc(bv.label) + ' (' + esc(bv.groupName) + ')</span><span class="grow"></span><span class="ev-pill">' + F.signedPct(bv.ev, 0) + '</span></div>' : '') +
      '</a>';
  };
  ui.refreshCard = function (m) {
    XP.$$('.match-card[data-match="' + m.id + '"]').forEach((el) => {
      const big = el.classList.contains('big');
      const tmp = document.createElement('div');
      tmp.innerHTML = ui.matchCard(m, { big });
      const fresh = tmp.firstElementChild;
      const sig = (n) => [!!n.querySelector('.mc-foot'), !!n.querySelector('.mc-value'), XP.$$('.mc-score', n).length, (n.querySelector('.mc-pick strong') || {}).textContent, XP.$$('.red-card', n).length, (n.querySelector('.mc-value') || {}).textContent].join('|');
      if (sig(el) !== sig(fresh)) {
        if (el.classList.contains('rv')) fresh.classList.add('rv', 'in');
        el.replaceWith(fresh);
        return;
      }
      // conservamos los nodos enlazados para que el tick anime en su lugar
      XP.$$('.mc-score', el).forEach((s, i) => { const n = XP.$$('.mc-score', fresh)[i].textContent; if (s.textContent !== n) { s.textContent = n; s.classList.remove('tick-flat'); void s.offsetWidth; s.classList.add('tick-flat'); } });
      const c1 = el.querySelector('.mc-pick .conf'), c2 = fresh.querySelector('.mc-pick .conf');
      if (c1 && c2 && c1.outerHTML !== c2.outerHTML) c1.outerHTML = c2.outerHTML;
    });
  };

  // ── Medidor de valor ─────────────────────────────────────────────────────────
  ui.gauge = function (m, selId) {
    const s = m.sel[selId];
    const phase = m.status;
    const edge = s.ev == null ? 0 : s.ev;
    const t = Q.clamp((edge + 0.1) / 0.25, 0, 1); // −10 % … +15 %
    const ang = -90 + t * 180;
    const thr = Q.clamp((s.threshold + 0.1) / 0.25, 0, 1);
    const R = 80, cx = 100, cy = 96;
    const pt = (a, r) => [cx + r * Math.cos(((a - 90) * Math.PI) / 180), cy + r * Math.sin(((a - 90) * Math.PI) / 180)];
    const arc = (a0, a1) => { const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R); return 'M' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + x1 + ' ' + y1; };
    const zeroA = -90 + (0.1 / 0.25) * 180, thrA = -90 + thr * 180;
    const [nx, ny] = pt(ang, R - 14);
    const state = m.L.marketOnly ? 'Solo mercado' : s.best == null ? 'Sin cuota de la casa' : s.suspended ? 'Suspendido' : s.value ? 'Hay valor' : edge > 0 ? 'Valor pequeño' : 'Sin valor';
    return '<figure class="gauge" data-gauge="' + m.id + '|' + selId + '" data-state="' + (s.value ? 'value' : edge > 0 ? 'pos' : 'neg') + '">' +
      '<svg viewBox="0 0 200 118" role="img" aria-label="Medidor de valor: ' + (s.ev == null ? 'no disponible' : F.signedPct(edge)) + ', ' + state + '">' +
      '<path d="' + arc(-90, 90) + '" class="g-track"/>' +
      '<path d="' + arc(-90, zeroA) + '" class="g-neg"/>' +
      '<path d="' + arc(zeroA, thrA) + '" class="g-mid"/>' +
      '<path d="' + arc(thrA, 90) + '" class="g-pos"/>' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" class="g-needle"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="g-hub"/>' +
      '</svg>' +
      '<figcaption><strong class="g-val">' + (s.ev == null ? '—' : F.signedPct(edge)) + '</strong><span>' + state + ' · ' + ({ previa: 'antes del partido', vivo: 'en vivo', final: 'final' })[phase] + '</span></figcaption>' +
      '</figure>';
  };

  // ── Detalle de una apuesta en lenguaje de apostador (sin fórmulas) ──────────
  ui.stepByStep = function (m, selId) {
    const s = m.sel[selId];
    const st = XP.settings;
    if (s.suspended) return '<p class="muted">Mercado suspendido por la casa en este momento.</p>';
    const fair = 1 / s.pFinal;
    const rows = [
      ['target', 'Probabilidad Xpected', F.prob(s.pFinal, 0) + ' <span class="muted">(rango probable ' + F.prob(s.lo, 0) + '–' + F.prob(s.hi, 0) + ')</span>'],
      ['scale', 'Cuota justa', F.odds(fair) + ' <span class="muted">— lo mínimo que debería pagar una casa para que valga la pena</span>'],
    ];
    if (s.best != null) {
      rows.push(['coin', 'Paga la casa', F.odds(s.best) + (s.pMarket != null ? ' <span class="muted">(sin su margen, la casa le da ' + F.prob(s.pMarket, 0) + ')</span>' : '')]);
      const per100 = s.ev * 100;
      rows.push(['bolt', 'Valor estimado', '<strong class="' + (s.ev > 0 ? 'up' : 'down') + '">' + F.signedPct(s.ev, 1) + '</strong> <span class="muted">— a la larga, ' + (s.ev > 0 ? 'ganarías unos ' : 'perderías unos ') + F.money(Math.abs(per100) * 1000) + ' por cada ' + F.money(100000) + ' apostados a este precio</span>']);
      if (!XP.isSelfExcluded()) {
        const k = Q.kellyStake(s.pFinal, s.best, { fraction: st.kellyFraction, maxPct: st.maxStakePct, bankroll: st.bankroll });
        rows.push(['wallet', 'Monto prudente', k.f > 0 ? F.pct(k.f, 1) + ' de tu banca = <strong>' + F.money(k.stake) + '</strong> <span class="muted">(con tu banca de ' + F.money(st.bankroll) + '; cámbiala en Cuenta)</span>' : '<span class="muted">No apostar: a este precio no hay ventaja.</span>']);
      }
      rows.push(['clock', 'Cuota actualizada', F.time(new Date(s.oddsAt))]);
    } else {
      rows.push(['info', 'Sin cuota de la casa', '<span class="muted">Compara con la cuota justa: si encuentras un precio mayor, juega a tu favor.</span>']);
    }
    return '<ul class="detail-list">' + rows.map((r) => '<li>' + XP.icon(r[0], 16) + '<span class="dl-k">' + r[1] + '</span><span class="dl-v">' + r[2] + '</span></li>').join('') + '</ul>' +
      '<p class="muted small">Estimación, no una garantía. Apuesta solo lo que puedas perder.</p>';
  };

  // ── Mapa de calor de marcadores ──────────────────────────────────────────────
  ui.scoreHeatmap = function (m) {
    const M = m.matrix, N = 6;
    let max = 0;
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) max = Math.max(max, M[x][y]);
    const off = m.status === 'previa' ? [0, 0] : m.score;
    let h = '<div class="heatmap" role="table" aria-label="Probabilidad de cada marcador final">';
    h += '<div class="hm-row" role="row"><span class="hm-corner" role="columnheader">' + esc(D().teams[m.home].code) + ' ↓ / ' + esc(D().teams[m.away].code) + ' →</span>';
    for (let y = 0; y < N; y++) h += '<span class="hm-h" role="columnheader">' + (y + off[1]) + '</span>';
    h += '</div>';
    for (let x = 0; x < N; x++) {
      h += '<div class="hm-row" role="row"><span class="hm-h" role="rowheader">' + (x + off[0]) + '</span>';
      for (let y = 0; y < N; y++) {
        const p = M[x][y];
        h += '<span class="hm-cell" role="cell" style="--a:' + (0.06 + 0.94 * (p / max)).toFixed(3) + '" title="' + (x + off[0]) + '–' + (y + off[1]) + ': ' + F.prob(p) + '"><span>' + (p >= 0.0095 ? F.num(p * 100, 0) : '·') + '</span></span>';
      }
      h += '</div>';
    }
    return h + '</div><p class="muted small">Porcentaje por marcador final; filas: goles del local, columnas: del visitante.</p>';
  };

  ui.formStrip = function (last) {
    return '<div class="form-strip" aria-label="Forma reciente">' + last.slice(0, 5).map((r) => '<span class="fs fs-' + r.res + '" title="' + esc((r.home ? 'vs ' : '@ ') + r.opp + ' ' + r.gf + '–' + r.ga) + '">' + r.res + '</span>').join('') + '</div>';
  };

  // ── gráficas SVG ─────────────────────────────────────────────────────────────
  const P = { l: 40, r: 14, t: 14, b: 28 };
  function scale(d0, d1, r0, r1) { return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0); }
  function pathOf(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(''); }
  function stepPath(pts) { let d = ''; pts.forEach((p, i) => { d += i ? 'H' + p[0].toFixed(1) + 'V' + p[1].toFixed(1) : 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }); return d; }
  function axisY(ticks, y, W, fmt) { return ticks.map((t) => '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (P.l - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + fmt(t) + '</text>').join(''); }
  function axisX(ticks, x, H, fmt) { return ticks.map((t) => '<text class="tick" x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmt(t) + '</text>').join(''); }
  const svgOpen = (W, H, label) => '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';

  const charts = {};
  charts.winprob = function (m, W) {
    const H = 240, x = scale(0, 93, P.l, W - P.r), y = scale(0, 1, H - P.b, P.t);
    const hist = m.history;
    const names = ['Local', 'Empate', 'Visitante'], cls = ['home', 'draw', 'away'];
    let s = svgOpen(W, H, 'Probabilidad de victoria minuto a minuto');
    s += axisY([0, 0.25, 0.5, 0.75, 1], y, W, (t) => F.num(t * 100, 0) + '%');
    s += axisX([0, 15, 30, 45, 60, 75, 90], x, H, (t) => t + "'");
    const nEff = m.L.nEff;
    const band = hist.map((h) => [x(h.m), y(Math.min(1, h.p[0] + 1.96 * Math.sqrt((h.p[0] * (1 - h.p[0])) / nEff)))]).concat(hist.slice().reverse().map((h) => [x(h.m), y(Math.max(0, h.p[0] - 1.96 * Math.sqrt((h.p[0] * (1 - h.p[0])) / nEff)))]));
    if (hist.length > 1) s += '<path class="band home" d="' + pathOf(band) + 'Z"/>';
    [0, 1, 2].forEach((i) => { s += '<path class="ln ' + cls[i] + (m._drawn ? '' : ' animate-in') + '" pathLength="1" d="' + pathOf(hist.map((h) => [x(h.m), y(h.p[i])])) + '"/>'; });
    m.events.filter((e) => e.type !== 'ocasion').forEach((e) => {
      s += '<g class="ev-mark ' + e.type + '" transform="translate(' + x(e.min).toFixed(1) + ' ' + P.t + ')"><line y1="0" y2="' + (H - P.b - P.t) + '"/><circle r="6" cy="0"/><text y="3.5" text-anchor="middle">' + (e.type === 'gol' ? 'G' : 'R') + '</text><title>' + e.min + "' " + esc(e.text) + '</title></g>';
    });
    const last = hist[hist.length - 1];
    [0, 1, 2].forEach((i) => { s += '<text class="end-lbl ' + cls[i] + '" x="' + Math.min(W - P.r - 2, x(last.m) + 4) + '" y="' + (y(last.p[i]) + 4) + '" text-anchor="' + (x(last.m) > W - 80 ? 'end' : 'start') + '">' + names[i] + ' ' + F.num(last.p[i] * 100, 0) + '%</text>'; });
    m._drawn = true;
    return s + '</svg>';
  };
  charts.xg = function (m, W) {
    const H = 200, maxX = Math.max(1.5, m.xg[0], m.xg[1]) * 1.1;
    const x = scale(0, 93, P.l, W - P.r), y = scale(0, maxX, H - P.b, P.t);
    let s = svgOpen(W, H, 'Línea de tiempo de xG acumulado');
    s += axisY([0, maxX / 2, maxX].map((v) => +v.toFixed(1)), y, W, (t) => F.num(t, 1));
    s += axisX([0, 15, 30, 45, 60, 75, 90], x, H, (t) => t + "'");
    s += '<path class="ln home" d="' + stepPath(m.xgSeries.map((p) => [x(p.m), y(p.h)])) + '"/>';
    s += '<path class="ln away" d="' + stepPath(m.xgSeries.map((p) => [x(p.m), y(p.a)])) + '"/>';
    m.events.filter((e) => e.type === 'gol').forEach((e) => {
      const pt = m.xgSeries.find((p) => p.m === e.min) || m.xgSeries[m.xgSeries.length - 1];
      s += '<circle class="goal-dot ' + (e.side ? 'away' : 'home') + '" cx="' + x(e.min) + '" cy="' + y(e.side ? pt.a : pt.h) + '" r="5"><title>' + e.min + "' " + esc(e.text) + '</title></circle>';
    });
    return s + '</svg>';
  };
  charts.momentum = function (m, W) {
    const H = 150, n = 19, mid = H / 2;
    const max = Math.max(0.3, ...m.momentum.map((b) => (b ? Math.max(b[0], b[1]) : 0)));
    const bw = (W - P.l - P.r) / n;
    let s = svgOpen(W, H, 'Momentum por intervalos de 5 minutos');
    s += '<line class="axis" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + mid + '" y2="' + mid + '"/>';
    for (let i = 0; i < n; i++) {
      const b = m.momentum[i];
      if (!b) continue;
      const hh = (b[0] / max) * (mid - 12), ha = (b[1] / max) * (mid - 12);
      const xx = P.l + i * bw + 2;
      s += '<rect class="mbar home" x="' + xx.toFixed(1) + '" y="' + (mid - hh).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="2"/>';
      s += '<rect class="mbar away" x="' + xx.toFixed(1) + '" y="' + mid + '" width="' + (bw - 4).toFixed(1) + '" height="' + ha.toFixed(1) + '" rx="2"/>';
    }
    s += '<text class="tick" x="' + (P.l - 6) + '" y="16" text-anchor="end">' + esc(D().teams[m.home].code) + '</text><text class="tick" x="' + (P.l - 6) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(D().teams[m.away].code) + '</text>';
    return s + '</svg>';
  };
  charts.line = function (m, W) {
    const H = 260, pts = m.line;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const all = pts.flatMap((p) => p.p);
    const lo = Math.max(0, Math.min(...all) - 0.05), hi = Math.min(1, Math.max(...all) + 0.05);
    const x = scale(t0, t1, P.l, W - P.r), y = scale(lo, hi, H - P.b, P.t);
    let s = svgOpen(W, H, 'Movimiento de línea: probabilidad sin margen del mercado de referencia');
    const ticks = [lo, (lo + hi) / 2, hi];
    s += axisY(ticks, y, W, (t) => F.num(t * 100, 0) + '%');
    s += axisX([t0, t0 + (t1 - t0) / 2, t1], x, H, (t) => F.dateTime(new Date(t)));
    (m.news || []).forEach((n) => {
      const p = pts[Math.min(n.i, pts.length - 1)];
      s += '<g class="news-mark"><line x1="' + x(p.t) + '" x2="' + x(p.t) + '" y1="' + P.t + '" y2="' + (H - P.b) + '"/><text x="' + (x(p.t) + 4) + '" y="' + (P.t + 10) + '">' + esc(n.label) + '</text></g>';
    });
    ['home', 'draw', 'away'].forEach((c, i) => { s += '<path class="ln ' + c + '" d="' + pathOf(pts.map((p) => [x(p.t), y(p.p[i])])) + '"/>'; });
    return s + '</svg>';
  };
  charts.calib = function (bins, W) {
    const H = 300, x = scale(0, 1, P.l, W - P.r), y = scale(0, 1, H - P.b, P.t);
    const maxN = Math.max(...bins.map((b) => b.n));
    let s = svgOpen(W, H, 'Curva de calibración: probabilidad publicada frente a frecuencia observada');
    s += axisY([0, 0.25, 0.5, 0.75, 1], y, W, (t) => F.num(t * 100, 0) + '%');
    s += axisX([0, 0.2, 0.4, 0.6, 0.8, 1], x, H, (t) => F.num(t * 100, 0) + '%');
    bins.forEach((b) => { if (b.n) { const h = (b.n / maxN) * 50; s += '<rect class="cbar" x="' + (x(b.lo) + 2) + '" y="' + (H - P.b - h) + '" width="' + (x(b.hi) - x(b.lo) - 4) + '" height="' + h + '"/>'; } });
    s += '<line class="diag" x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(1) + '" y2="' + y(1) + '"/>';
    const pts = bins.filter((b) => b.n).map((b) => [x(b.pMean), y(b.freq)]);
    s += '<path class="ln home" d="' + pathOf(pts) + '"/>';
    bins.filter((b) => b.n).forEach((b) => { s += '<circle class="cdot" cx="' + x(b.pMean) + '" cy="' + y(b.freq) + '" r="4.5"><title>Dijimos ' + F.prob(b.pMean) + ', ocurrió ' + F.prob(b.freq) + ' (n = ' + b.n + ')</title></circle>'; });
    return s + '</svg>';
  };
  charts.fan = function (d, W) {
    const H = 280, n = d.steps.length;
    const x = scale(d.steps[0], d.steps[n - 1], P.l + 24, W - P.r);
    const maxY = Math.max(...d.p95, d.start * 1.2), minY = Math.min(...d.p5, 0);
    const y = scale(minY, maxY, H - P.b, P.t);
    let s = svgOpen(W, H, 'Simulación de banca: percentiles 5, 50 y 95');
    const ticks = [minY, d.start, maxY];
    s += ticks.map((t) => '<line class="grid" x1="' + (P.l + 24) + '" x2="' + (W - P.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (P.l + 18) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + F.num(t / 1000, 0) + 'k</text>').join('');
    s += axisX([d.steps[0], d.steps[Math.floor(n / 2)], d.steps[n - 1]], x, H, (t) => t + ' ap.');
    const band = d.steps.map((st, i) => [x(st), y(d.p95[i])]).concat(d.steps.slice().reverse().map((st, i) => [x(st), y(d.p5[n - 1 - i])]));
    s += '<path class="band home" d="' + pathOf(band) + 'Z"/>';
    s += '<path class="ln draw dashed" d="' + pathOf(d.steps.map((st) => [x(st), y(d.start)])) + '"/>';
    s += '<path class="ln home" d="' + pathOf(d.steps.map((st, i) => [x(st), y(d.p50[i])])) + '"/>';
    return s + '</svg>';
  };
  charts.hist = function (vals, W) {
    const H = 200, lo = -0.1, hi = 0.12, nb = 22, bw = (hi - lo) / nb;
    const c = Array(nb).fill(0);
    vals.forEach((v) => { const i = Math.floor((Q.clamp(v, lo, hi - 1e-9) - lo) / bw); c[i]++; });
    const max = Math.max(...c);
    const x = scale(lo, hi, P.l, W - P.r), y = scale(0, max, H - P.b, P.t);
    let s = svgOpen(W, H, 'Distribución del CLV por selección marcada');
    s += axisX([-0.1, -0.05, 0, 0.05, 0.1], x, H, (t) => F.num(t * 100, 0) + '%');
    c.forEach((n, i) => { const x0 = x(lo + i * bw); s += '<rect class="hbar ' + (lo + (i + 0.5) * bw >= 0 ? 'pos' : 'neg') + '" x="' + (x0 + 1) + '" y="' + y(n) + '" width="' + (x(lo + (i + 1) * bw) - x0 - 2) + '" height="' + (H - P.b - y(n)) + '"/>'; });
    s += '<line class="diag" x1="' + x(0) + '" x2="' + x(0) + '" y1="' + P.t + '" y2="' + (H - P.b) + '"/>';
    return s + '</svg>';
  };
  charts.elo = function (teamId, W) {
    const vals = D().teamDetail(teamId).elo;
    const H = 70, lo = Math.min(...vals) - 5, hi = Math.max(...vals) + 5;
    const x = scale(0, vals.length - 1, 4, W - 4), y = scale(lo, hi, H - 6, 6);
    return svgOpen(W, H, 'Tendencia Elo, últimas 20 actualizaciones') + '<path class="ln home" d="' + pathOf(vals.map((v, i) => [x(i), y(v)])) + '"/><circle class="cdot" cx="' + x(vals.length - 1) + '" cy="' + y(vals[vals.length - 1]) + '" r="3.5"/></svg>';
  };
  charts.xglast = function (teamId, W) {
    const last = D().teamDetail(teamId).last.slice().reverse();
    const H = 140, max = Math.max(2, ...last.map((r) => Math.max(r.xgf, r.xga)));
    const bw = (W - P.l - P.r) / last.length, mid = H / 2;
    let s = svgOpen(W, H, 'xG a favor y en contra, últimos 10 partidos');
    s += '<line class="axis" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + mid + '" y2="' + mid + '"/>';
    last.forEach((r, i) => {
      const xx = P.l + i * bw + 3, hf = (r.xgf / max) * (mid - 8), ha = (r.xga / max) * (mid - 8);
      s += '<rect class="mbar home" x="' + xx + '" y="' + (mid - hf) + '" width="' + (bw - 6) + '" height="' + hf + '" rx="2"><title>vs ' + esc(r.opp) + ': xG ' + F.num(r.xgf, 2) + ' a favor</title></rect>';
      s += '<rect class="mbar away" x="' + xx + '" y="' + mid + '" width="' + (bw - 6) + '" height="' + ha + '" rx="2"><title>vs ' + esc(r.opp) + ': xG ' + F.num(r.xga, 2) + ' en contra</title></rect>';
    });
    s += '<text class="tick" x="' + (P.l - 6) + '" y="16" text-anchor="end">a fav.</text><text class="tick" x="' + (P.l - 6) + '" y="' + (H - 6) + '" text-anchor="end">en c.</text>';
    return s + '</svg>';
  };
  ui.charts = charts;
  ui.chartArgs = {};

  /** Monta las gráficas declaradas con data-chart / data-arg a su ancho real. */
  ui.mountCharts = function (root, onlyId) {
    XP.$$('[data-chart]', root).forEach((el) => {
      if (onlyId && el.dataset.arg !== onlyId) return;
      const name = el.dataset.chart, arg = el.dataset.arg;
      const fn = charts[name];
      if (!fn) return;
      const W = Math.max(260, Math.floor(el.clientWidth || 600));
      let a = arg;
      if (['winprob', 'xg', 'momentum', 'line'].includes(name)) a = D().byId[arg];
      else if (['calib', 'fan', 'hist'].includes(name)) a = ui.chartArgs[arg];
      if (!a) return;
      el.innerHTML = fn(a, W);
    });
  };

  // ── esqueletos ───────────────────────────────────────────────────────────────
  ui.skeleton = (n, h) => Array.from({ length: n }, () => '<div class="skeleton" style="height:' + (h || 140) + 'px"></div>').join('');

  // ── FLIP para reordenamientos (animación 9) ──────────────────────────────────
  ui.flip = function (container, mutate) {
    const items = XP.$$('[data-flip]', container);
    const first = new Map(items.map((el) => [el.dataset.flip, el.getBoundingClientRect().top]));
    mutate();
    if (XP.reducedMotion()) return;
    XP.$$('[data-flip]', container).forEach((el) => {
      const f = first.get(el.dataset.flip);
      if (f == null) return;
      const dy = f - el.getBoundingClientRect().top;
      if (!dy) return;
      el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    });
  };

  // ── pestañas accesibles ──────────────────────────────────────────────────────
  ui.tabs = function (id, tabs, active, hrefFn) {
    return '<div class="tabs" role="tablist" aria-label="Secciones">' + tabs.map((t) => '<a role="tab" id="tab-' + id + '-' + t[0] + '" href="' + hrefFn(t[0]) + '" aria-selected="' + (t[0] === active) + '" class="tab' + (t[0] === active ? ' active' : '') + '">' + t[1] + '</a>').join('') + '</div>';
  };
})();

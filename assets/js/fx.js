/*
 * Xpected · capa de experiencia: cursor con estela, aurora que sigue al mouse, tilt 3D con foco de luz,
 * botones magnéticos, ondas al pulsar, revelados con desenfoque, contadores, texto que se decodifica,
 * indicador de navegación, ticker de cuotas y centro de control (música, paleta, movimiento, tema).
 * Todo respeta el movimiento reducido y se desactiva en pantallas táctiles cuando no aporta.
 */
(function () {
  'use strict';
  const XP = window.XP, F = XP.fmt, esc = XP.esc;
  const fx = (XP.fx = {});
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  const reduced = () => XP.reducedMotion();
  const html = document.documentElement;

  // ── estado del puntero ───────────────────────────────────────────────────────
  const P = { x: innerWidth / 2, y: innerHeight / 3, nx: 0, ny: 0 };
  const S = { x: P.x, y: P.y, nx: 0, ny: 0 };
  window.addEventListener('pointermove', (e) => {
    P.x = e.clientX; P.y = e.clientY;
    P.nx = (e.clientX / innerWidth) * 2 - 1; P.ny = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  // ── cursor ───────────────────────────────────────────────────────────────────
  let dot = null, ring = null;
  if (fine) {
    dot = document.createElement('div'); dot.className = 'cursor-dot'; dot.setAttribute('aria-hidden', 'true');
    ring = document.createElement('div'); ring.className = 'cursor-ring'; ring.setAttribute('aria-hidden', 'true');
    const layer = document.createElement('div'); layer.className = 'fx-layer'; layer.setAttribute('aria-hidden', 'true');
    layer.append(ring, dot);
    document.body.append(layer);
    html.classList.add('has-cursor');
  }
  const INTERACTIVE = 'a, button, [role="tab"], .match-card, summary, select, input[type="range"], input[type="checkbox"], .swatch';
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest(INTERACTIVE);
    if (ring) ring.classList.toggle('active', !!t);
    if (ring) ring.classList.toggle('text', !!e.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea'));
    if (t && XP.audio && !t.matches('select, input')) XP.audio.ui('hover');
  });
  document.addEventListener('pointerdown', (e) => {
    if (ring) ring.classList.add('press');
    const b = e.target.closest('.btn, .pill, .tab, .dock-btn, .swatch, .seg-btn');
    if (b) {
      if (XP.audio) XP.audio.ui('click');
      if (!reduced()) {
        const r = b.getBoundingClientRect();
        const s = document.createElement('span'); s.className = 'ripple';
        s.style.left = e.clientX - r.left + 'px'; s.style.top = e.clientY - r.top + 'px';
        b.appendChild(s); setTimeout(() => s.remove(), 650);
      }
    }
  });
  document.addEventListener('pointerup', () => { if (ring) ring.classList.remove('press'); });
  document.addEventListener('pointerleave', () => { if (ring) ring.style.opacity = '0'; if (dot) dot.style.opacity = '0'; });
  document.addEventListener('pointerenter', () => { if (ring) ring.style.opacity = ''; if (dot) dot.style.opacity = ''; });

  // ── tilt + foco de luz + magnetismo (delegados) ──────────────────────────────
  let tiltEl = null, magEl = null;
  function resetTilt(el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.classList.remove('tilting'); }
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest('.tilt, .spot');
    if (tiltEl && tiltEl !== el) resetTilt(tiltEl);
    tiltEl = el;
    if (el) {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      el.style.setProperty('--mx', x.toFixed(0) + 'px');
      el.style.setProperty('--my', y.toFixed(0) + 'px');
      if (el.classList.contains('tilt') && fine && !reduced()) {
        el.classList.add('tilting');
        el.style.setProperty('--rx', (((y / r.height) - 0.5) * -8).toFixed(2) + 'deg');
        el.style.setProperty('--ry', (((x / r.width) - 0.5) * 10).toFixed(2) + 'deg');
      }
    }
    const mg = e.target.closest('.magnetic');
    if (magEl && magEl !== mg) magEl.style.translate = '';
    magEl = mg;
    if (mg && fine && !reduced()) {
      const r = mg.getBoundingClientRect();
      mg.style.translate = ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1) + 'px';
    }
  }, { passive: true });

  // ── bucle visual (cursor, aurora, ecualizador) ───────────────────────────────
  const aurora = document.querySelector('.aurora');
  let eqBars = [];
  function loop() {
    S.x += (P.x - S.x) * 0.2; S.y += (P.y - S.y) * 0.2;
    S.nx += (P.nx - S.nx) * 0.04; S.ny += (P.ny - S.ny) * 0.04;
    if (dot) dot.style.transform = 'translate3d(' + P.x + 'px,' + P.y + 'px,0)';
    if (ring) ring.style.transform = 'translate3d(' + S.x.toFixed(1) + 'px,' + S.y.toFixed(1) + 'px,0)';
    if (aurora && !reduced()) {
      aurora.style.setProperty('--px', S.nx.toFixed(3));
      aurora.style.setProperty('--py', S.ny.toFixed(3));
      aurora.style.setProperty('--lvl', (XP.audio ? XP.audio.level() : 0).toFixed(3));
    }
    if (XP.audio && XP.audio.on && eqBars.length) {
      const b = XP.audio.bands(eqBars.length);
      eqBars.forEach((el, i) => { el.style.transform = 'scaleY(' + (0.2 + Math.min(1, b[i] * 1.8)).toFixed(3) + ')'; });
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ── revelados, contadores y texto decodificado ───────────────────────────────
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      XP.$$('[data-countup]', en.target).concat(en.target.matches('[data-countup]') ? [en.target] : []).forEach(fx.countUp);
      XP.$$('[data-scramble]', en.target).concat(en.target.matches('[data-scramble]') ? [en.target] : []).forEach(fx.scramble);
    });
  }, { rootMargin: '0px', threshold: 0.01 }) : null;

  fx.scan = function (root) {
    XP.$$('.match-card, .tile, .kpi, .plan, .how-steps li', root).forEach((el) => el.classList.add('tilt'));
    XP.$$('.card, .match-header, .lesson, .tile, .kpi, .plan', root).forEach((el) => el.classList.add('spot'));
    XP.$$('.btn-accent, .cta-row .btn, .hero-chip', root).forEach((el) => el.classList.add('magnetic'));
    XP.$$('.kpi-v, .hero-stats dd', root).forEach((el) => el.setAttribute('data-countup', ''));
    XP.$$('.eyebrow', root).forEach((el) => { if (!el.children.length) el.setAttribute('data-scramble', ''); });
    if (!io || reduced()) return;
    XP.$$('.page-head, .section-head, .card, .tile, .kpi, .plan, .how-steps li, .lesson, .match-card, .faq-item, .bb-league, .hero-stats', root).forEach((el, i) => {
      el.classList.add('rv');
      el.style.setProperty('--d', (i % 6) * 55 + 'ms');
      io.observe(el);
    });
  };

  fx.countUp = function (el) {
    if (reduced() || el.dataset.counted) return;
    el.dataset.counted = '1';
    const txt = el.textContent;
    const m = txt.match(/^([^\d+−-]*)([+−-]?)(\d[\d.]*(?:,\d+)?)(.*)$/);
    if (!m) return;
    const dec = (m[3].split(',')[1] || '').length;
    const val = parseFloat(m[3].replace(/\./g, '').replace(',', '.'));
    const t0 = performance.now(), dur = 1300;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = k < 1 ? m[1] + m[2] + F.num(val * e, dec) + m[4] : txt;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%+/·';
  fx.scramble = function (el) {
    if (reduced() || el.dataset.scrambled || el.children.length) return;
    el.dataset.scrambled = '1';
    const final = el.textContent;
    el.setAttribute('aria-label', final);
    let f = 0;
    const total = 26;
    const tick = () => {
      f++;
      const reveal = (f / total) * final.length;
      el.textContent = final.split('').map((c, i) => (c === ' ' || i < reveal ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      if (f < total) requestAnimationFrame(tick); else { el.textContent = final; el.removeAttribute('aria-label'); }
    };
    requestAnimationFrame(tick);
  };

  // ── indicador líquido de navegación ──────────────────────────────────────────
  fx.nav = function () {
    const nav = XP.$('.mainnav'), ind = XP.$('.nav-indicator');
    if (!nav || !ind) return;
    const a = XP.$('.mainnav a.active');
    if (!a || !nav.offsetWidth) { ind.style.opacity = '0'; return; }
    const r = a.getBoundingClientRect(), nr = nav.getBoundingClientRect();
    ind.style.opacity = '1';
    ind.style.transform = 'translateX(' + (r.left - nr.left).toFixed(1) + 'px) scaleX(' + (r.width / 100).toFixed(3) + ')';
  };
  window.addEventListener('resize', () => fx.nav());

  // ── ticker de cuotas ─────────────────────────────────────────────────────────
  fx.ticker = function () {
    const track = XP.$('#ticker-track');
    if (!track || !XP.data) return;
    const T = XP.data.teams, ui = XP.ui;
    // en la cinta: partidos en vivo y los que ya tienen cuota de la casa
    const ms = XP.data.matches.filter((m) => m.sel && (m.status === 'vivo' || (m.status === 'previa' && (!m.ext || m.hasOdds)))).slice(0, 16);
    if (!ms.length) { track.innerHTML = ''; return; }
    const item = (m) => '<a class="tk" href="#/partido/' + m.id + '">' +
      (m.status === 'vivo' ? '<i class="tk-dot" aria-hidden="true"></i>' : '') +
      '<b>' + esc(T[m.home].code) + '</b>' +
      (m.status === 'previa' ? '<span class="tk-time">' + F.time(m.kickoff) + '</span>' : ui.bind(m, 'score', 'tk-score')) +
      '<b>' + esc(T[m.away].code) + '</b>' +
      (m.status === 'vivo' ? ui.bind(m, 'minute', 'tk-min') : '') +
      // en vivo no hay cuota de la casa: se muestra la probabilidad en vivo de Xpected
      (m.status === 'vivo' && !m.hasOdds
        ? ['1', 'X', '2'].map((s) => '<span class="tk-o tk-live"><small>' + s + '</small>' + ui.bind(m, 'pf0:' + s) + '</span>').join('')
        : ['1', 'X', '2'].map((s) => '<span class="tk-o"><small>' + s + '</small>' + ui.bind(m, 'o:' + s, 'odds-cell') + '</span>').join('')) +
      '</a>';
    const body = ms.map(item).join('<span class="tk-sep" aria-hidden="true">◆</span>');
    track.innerHTML = '<div class="tk-group">' + body + '<span class="tk-sep" aria-hidden="true">◆</span></div><div class="tk-group" aria-hidden="true">' + body + '<span class="tk-sep">◆</span></div>';
    XP.$$('.tk-group[aria-hidden] a', track).forEach((a) => { a.tabIndex = -1; });
    track.style.setProperty('--dur', Math.max(40, ms.length * 7) + 's');
  };

  // ── centro de control ────────────────────────────────────────────────────────
  const PALETTES = [
    ['aurora', 'Césped', 'Lima eléctrica, violeta y cian'],
    ['nebula', 'Neón', 'Magenta, índigo y azul'],
    ['solar', 'Atardecer', 'Ámbar, coral y rosa'],
    ['glacier', 'Hielo', 'Hielo, turquesa y menta'],
  ];
  fx.buildDock = function () {
    const host = XP.$('#dock');
    if (!host) return;
    host.innerHTML =
      '<button class="dock-btn dock-sound" id="sound-toggle" type="button" aria-pressed="false" aria-label="Activar música ambiental">' +
      '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="dock-lbl">Sonido</span></button>' +
      '<button class="dock-btn" id="dock-open" type="button" aria-expanded="false" aria-controls="dock-panel" aria-label="Centro de control">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>' +
      '<section class="dock-panel" id="dock-panel" hidden aria-label="Centro de control">' +
      '<header><p class="eyebrow">Centro de control</p><button class="icon-btn btn-sm" type="button" id="dock-close" aria-label="Cerrar">✕</button></header>' +
      '<div class="dp-row"><span>Música ambiental<small>Generativa, en tiempo real</small></span><label class="switch"><input type="checkbox" id="dp-music"><span class="sr-only">Música ambiental</span></label></div>' +
      '<label class="dp-row dp-vol"><span>Volumen</span><input type="range" id="dp-vol" min="0" max="1" step="0.01"></label>' +
      '<div class="dp-row"><span>Sonidos de interfaz</span><label class="switch"><input type="checkbox" id="dp-ui"><span class="sr-only">Sonidos de interfaz</span></label></div>' +
      '<fieldset class="dp-pal"><legend>Paleta artística</legend><div class="swatches">' +
      PALETTES.map((p) => '<button type="button" class="swatch sw-' + p[0] + '" data-palette="' + p[0] + '" aria-pressed="false" title="' + p[2] + '"><span class="sw-chip" aria-hidden="true"></span>' + p[1] + '</button>').join('') +
      '</div></fieldset>' +
      '<div class="dp-row"><span>Estadio 3D de fondo<small>Reacciona a los partidos</small></span><label class="switch"><input type="checkbox" id="dp-stage"><span class="sr-only">Estadio 3D de fondo</span></label></div>' +
      '<div class="dp-row"><span>Movimiento</span><div class="seg" role="group" aria-label="Movimiento"><button type="button" class="seg-btn" data-motion="full">Completo</button><button type="button" class="seg-btn" data-motion="reduce">Reducido</button></div></div>' +
      '<div class="dp-row"><span>Tema</span><div class="seg" role="group" aria-label="Tema"><button type="button" class="seg-btn" data-theme-set="dark">Oscuro</button><button type="button" class="seg-btn" data-theme-set="light">Claro</button></div></div>' +
      '<div class="dp-row"><span>Datos en vivo<small data-feed-text></small></span><button type="button" class="btn btn-sm" id="dp-live">Pausar</button></div>' +
      '</section>';
    eqBars = XP.$$('.eq i', host);
    const panel = XP.$('#dock-panel'), openBtn = XP.$('#dock-open');
    const setOpen = (v) => {
      panel.hidden = !v; openBtn.setAttribute('aria-expanded', String(v));
      if (v) { syncDock(); XP.$('#dp-music').focus(); }
    };
    openBtn.addEventListener('click', () => setOpen(panel.hidden));
    XP.$('#dock-close').addEventListener('click', () => { setOpen(false); openBtn.focus(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); openBtn.focus(); } });
    document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !host.contains(e.target)) setOpen(false); });
    XP.$('#sound-toggle').addEventListener('click', () => XP.audio.toggle());
    XP.$('#dp-music').addEventListener('change', (e) => (e.target.checked ? XP.audio.start() : XP.audio.stop()));
    XP.$('#dp-vol').addEventListener('input', (e) => XP.audio.setVolume(+e.target.value));
    XP.$('#dp-ui').addEventListener('change', (e) => XP.audio.setUi(e.target.checked));
    XP.$('#dp-stage').addEventListener('change', (e) => XP.setSetting('stage3d', e.target.checked));
    XP.$('#dp-live').addEventListener('click', () => XP.setLivePaused(!XP.live.paused));
    panel.addEventListener('click', (e) => {
      const p = e.target.closest('[data-palette]');
      if (p) XP.setSetting('palette', p.dataset.palette);
      const mo = e.target.closest('[data-motion]');
      if (mo) XP.setSetting('motion', mo.dataset.motion);
      const th = e.target.closest('[data-theme-set]');
      if (th) XP.setSetting('theme', th.dataset.themeSet);
      syncDock();
    });
    syncDock();
  };
  function syncDock() {
    const st = XP.$('#sound-toggle');
    if (!st) return;
    const on = XP.audio && XP.audio.on;
    st.setAttribute('aria-pressed', String(!!on));
    st.setAttribute('aria-label', on ? 'Silenciar música ambiental' : 'Activar música ambiental');
    st.classList.toggle('on', !!on);
    XP.$('#dp-music').checked = !!on;
    XP.$('#dp-vol').value = XP.audio ? XP.audio.volume : 0.5;
    XP.$('#dp-ui').checked = XP.audio ? XP.audio.uiOn : true;
    XP.$('#dp-stage').checked = XP.settings.stage3d !== false;
    XP.$$('[data-palette]').forEach((b) => { const a = (XP.settings.palette || 'aurora') === b.dataset.palette; b.setAttribute('aria-pressed', String(a)); b.classList.toggle('active', a); });
    XP.$$('[data-motion]').forEach((b) => b.classList.toggle('active', (XP.reducedMotion() ? 'reduce' : 'full') === b.dataset.motion));
    XP.$$('[data-theme-set]').forEach((b) => b.classList.toggle('active', XP.settings.theme === b.dataset.themeSet));
    const lv = XP.$('#dp-live'); if (lv) lv.textContent = XP.live.paused ? 'Reanudar' : 'Pausar';
    const ft = XP.$('[data-feed-text]');
    if (ft && XP.feed) ft.textContent = XP.feed.mode === 'demo' ? 'Simulación local' : XP.feed.mode === 'mock' ? 'Gateway SSE · feed simulado' : 'Gateway SSE · proveedor real';
  }
  fx.syncDock = syncDock;
  XP.bus.on('audio', syncDock);
  XP.bus.on('settings', syncDock);
  XP.bus.on('livepause', (v) => { syncDock(); document.body.classList.toggle('live-paused', v); });
})();

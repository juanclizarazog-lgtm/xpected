/* Xpected · shell: router, puerta de edad, cookies, paleta de comandos, temporizador de sesión. */
(function () {
  'use strict';
  const XP = window.XP, F = XP.fmt, esc = XP.esc, ui = XP.ui;
  const D = () => XP.data;

  // ── sesión ───────────────────────────────────────────────────────────────────
  let start = Date.now();
  try { start = +sessionStorage.getItem('xp:sessionStart') || Date.now(); sessionStorage.setItem('xp:sessionStart', start); } catch (e) { /* sin sessionStorage */ }
  XP.session = { start, snoozeUntil: 0 };

  // ── router (hash) ────────────────────────────────────────────────────────────
  const ROUTES = [
    [/^\/?$/, 'landing', []],
    [/^\/hoy\/?$/, 'hoy', []],
    [/^\/partido\/([\w-]+)(?:\/([\w-]+))?\/?$/, 'partido', ['id', 'tab']],
    [/^\/valor\/?$/, 'valor', []],
    [/^\/mercados\/?$/, 'mercados', []],
    [/^\/herramientas(?:\/([\w-]+))?\/?$/, 'herramientas', ['tool']],
    [/^\/rendimiento\/?$/, 'rendimiento', []],
    [/^\/aprender\/?$/, 'aprender', []],
    [/^\/metodologia\/?$/, 'metodologia', []],
    [/^\/juego-responsable\/?$/, 'juego-responsable', []],
    [/^\/privacidad\/?$/, 'privacidad', []],
    [/^\/terminos\/?$/, 'terminos', []],
    [/^\/cuenta\/?$/, 'cuenta', []],
    [/^\/laboratorio(?:\/([\w-]+))?\/?$/, 'laboratorio', ['view']],
    [/^\/ligas\/([\w-]+)\/?$/, 'ligas', ['slug']],
  ];
  let current = null, currentName = null, currentParams = {}, currentRoot = null;

  function parse() {
    const path = (location.hash || '#/').slice(1) || '/';
    for (const [re, name, keys] of ROUTES) {
      const m = path.match(re);
      if (m) { const params = {}; keys.forEach((k, i) => { params[k] = m[i + 1]; }); return { name, params }; }
    }
    return { name: 'notFound', params: {} };
  }

  function swap(force) {
    const { name, params } = parse();
    const samePage = name === currentName && params.id === currentParams.id && !!force === !!force;
    const keepScroll = force || (name === currentName && name === 'partido' && params.id === currentParams.id) || (name === 'herramientas' && currentName === 'herramientas');
    if (current && current.destroy) current.destroy();
    const page = XP.pages[name] || XP.pages.notFound;
    const host = XP.$('#app');
    const root = document.createElement('div');
    root.className = 'page-root';
    root.innerHTML = page.render(params);
    host.replaceChildren(root);
    current = page; currentName = name; currentParams = params; currentRoot = root;
    document.title = (typeof page.title === 'string' ? page.title : 'Xpected') + ' · ' + XP.cfg.brand.name;
    if (page.mount) page.mount(root, params);
    if (XP.fx) XP.fx.scan(root);
    if (XP.stage) XP.stage.route(name, params);
    XP.$$('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === name || (a.dataset.nav === 'hoy' && name === 'partido');
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (XP.fx) requestAnimationFrame(() => XP.fx.nav());
    if (!keepScroll) {
      window.scrollTo(0, 0);
      const h1 = root.querySelector('h1');
      if (h1 && !force) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
    return samePage;
  }

  XP.router = {
    render(force) {
      if (document.startViewTransition && !force && document.visibilityState === 'visible') {
        const vt = document.startViewTransition(() => swap(false));
        // una transición interrumpida no es un error: el DOM ya quedó actualizado
        [vt.ready, vt.finished, vt.updateCallbackDone].forEach((p) => p && p.catch(() => {}));
      } else swap(force);
    },
    get root() { return currentRoot; },
  };

  window.addEventListener('hashchange', () => XP.router.render(false));
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.match-card');
    if (card) {
      XP.$$('.match-card').forEach((c) => { c.style.viewTransitionName = ''; });
      card.style.viewTransitionName = 'match-' + card.dataset.match;
    }
  });

  // ── tiempo real: actualizar enlaces, páginas y relojes ───────────────────────
  XP.bus.on('match', (m) => {
    ui.updateBindings(m, document);
    if (current && current.onMatch) current.onMatch(m);
  });
  XP.bus.on('heartbeat', () => {
    ui.updateAgo();
    if (current && current.onHeartbeat) current.onHeartbeat();
  });
  // el feed real añadió/quitó partidos: refrescar ticker y páginas de listas
  let mcT = 0;
  XP.bus.on('matches-changed', () => {
    clearTimeout(mcT);
    mcT = setTimeout(() => {
      if (XP.fx) XP.fx.ticker();
      const note = XP.$('[data-demo-note]');
      if (note) note.textContent = XP.data.feedOn ? 'Cuotas sincronizadas en tiempo real con el gateway; casas sin autorización anonimizadas.' : 'Datos simulados salvo que el gateway de cuotas esté conectado.';
      if (['landing', 'hoy', 'valor', 'mercados', 'notFound'].includes(currentName)) XP.router.render(true);
    }, 120);
  });
  // los partidos que terminan salen del ticker
  let lastStates = '';
  setInterval(() => {
    const s = XP.data.matches.map((m) => m.status).join();
    if (s !== lastStates) { lastStates = s; if (XP.fx) XP.fx.ticker(); }
  }, 5000);
  XP.bus.on('settings', (e) => {
    if (['oddsFormat', 'tz', 'selfExcludedUntil', 'kellyFraction', 'maxStakePct', 'bankroll'].includes(e.k) && currentName !== 'cuenta') XP.router.render(true);
    if (e.k === 'selfExcludedUntil' && currentName === 'cuenta') XP.router.render(true);
    syncThemeBtn();
  });
  XP.bus.on('livepause', (v) => {
    const b = XP.$('#live-toggle');
    b.setAttribute('aria-pressed', String(v));
    b.querySelector('span').textContent = v ? 'Reanudar en vivo' : 'Pausar en vivo';
    b.classList.toggle('paused', v);
  });

  let rT = 0;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (currentRoot) ui.mountCharts(currentRoot); }, 180); });

  // ── tema ─────────────────────────────────────────────────────────────────────
  function syncThemeBtn() {
    const b = XP.$('#theme-toggle');
    if (!b) return;
    const dark = XP.settings.theme === 'dark';
    b.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    b.innerHTML = dark ? iconSun : iconMoon;
  }
  const iconSun = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const iconMoon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  // ── modal genérico con trampa de foco ────────────────────────────────────────
  function openModal(html, opts) {
    const o = Object.assign({ dismissable: true, label: 'Diálogo', cls: '' }, opts || {});
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap ' + o.cls;
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(o.label) + '">' + html + '</div>';
    document.body.appendChild(wrap);
    const behind = ['#shell', '#dock'].map((s) => XP.$(s)).filter(Boolean);
    behind.forEach((el) => { el.inert = true; });
    document.documentElement.classList.add('modal-open');
    const modal = wrap.querySelector('.modal');
    const focusables = () => XP.$$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', modal);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 150);
      if (!XP.$$('.modal-wrap:not(.out)').length) {
        behind.forEach((el) => { el.inert = false; });
        document.documentElement.classList.remove('modal-open');
      }
      // devolver el foco tras el evento actual, para que la misma tecla no active otro control
      setTimeout(() => { if (prev && prev.isConnected && prev !== document.body && prev.focus) prev.focus({ preventScroll: true }); }, 0);
      XP.bus.emit('modal', { open: !!XP.$$('.modal-wrap:not(.out)').length });
    };
    XP.bus.emit('modal', { open: true });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && o.dismissable) { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    if (o.dismissable) wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    setTimeout(() => { const f = focusables()[0]; if (f) f.focus(); }, 30);
    return { el: modal, close };
  }
  XP.openModal = openModal;

  // ── puerta de edad (AgeGate) ─────────────────────────────────────────────────
  function ageGate(done) {
    if (XP.LS.get('age', null)) return done();
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const md = openModal(
      '<div class="brand-mark lg" aria-hidden="true">X</div><h2 class="h2" id="age-title">Solo para mayores de 18 años</h2>' +
      '<p class="muted">Xpected es un servicio informativo sobre probabilidades deportivas. No recibe apuestas. Para continuar, confirma tu fecha de nacimiento.</p>' +
      '<form id="age-form" class="age-form" novalidate><fieldset><legend>Fecha de nacimiento</legend><div class="form-row">' +
      '<label class="field"><span>Día</span><input id="age-d" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="DD" autocomplete="bday-day" aria-describedby="age-err"></label>' +
      '<label class="field"><span>Mes</span><select id="age-m" autocomplete="bday-month" aria-describedby="age-err"><option value="" selected disabled>Mes</option>' + months.map((m, i) => '<option value="' + (i + 1) + '">' + m + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Año</span><input id="age-y" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="AAAA" autocomplete="bday-year" aria-describedby="age-err"></label>' +
      '</div></fieldset><p id="age-err" class="feedback ko" role="alert" aria-live="assertive"></p>' +
      '<button class="btn btn-accent wide" type="submit">Continuar</button></form>' +
      '<p class="muted small">Al continuar aceptas los <a href="#/terminos" data-gate-link>términos</a> y la <a href="#/privacidad" data-gate-link>política de privacidad</a>. No guardamos tu fecha de nacimiento. Juega con responsabilidad.</p>',
      { dismissable: false, label: 'Verificación de edad', cls: 'age-gate' });

    const $d = XP.$('#age-d', md.el), $m = XP.$('#age-m', md.el), $y = XP.$('#age-y', md.el), err = XP.$('#age-err', md.el);
    const fields = [$d, $m, $y];
    const fail = (msg, el) => {
      err.textContent = msg;
      fields.forEach((f) => f.removeAttribute('aria-invalid'));
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
      md.el.classList.remove('shake'); void md.el.offsetWidth; md.el.classList.add('shake');
    };
    // solo dígitos; al completar el día salta al mes; al cambiar algo se limpia el error
    [$d, $y].forEach((inp) => inp.addEventListener('input', () => {
      const clean = inp.value.replace(/\D/g, '').slice(0, inp === $d ? 2 : 4); // también limpia lo pegado ("3x1" → "31")
      if (clean !== inp.value) inp.value = clean;
      if (inp === $d && clean.length === 2) $m.focus();
    }));
    fields.forEach((f) => f.addEventListener(f.tagName === 'SELECT' ? 'change' : 'input', () => { if (err.textContent) { err.textContent = ''; f.removeAttribute('aria-invalid'); } }));
    // los textos legales se leen encima de la puerta, sin salir de ella
    XP.$$('[data-gate-link]', md.el).forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const name = a.getAttribute('href').replace('#/', '');
      const page = XP.pages[name];
      if (!page) return;
      const lm = openModal('<div class="legal-head"><button type="button" class="btn btn-sm" data-close>Volver a la verificación</button></div>' + page.render({}), { label: page.title, cls: 'legal-modal' });
      XP.$('[data-close]', lm.el).addEventListener('click', lm.close);
    }));

    XP.$('#age-form', md.el).addEventListener('submit', (e) => {
      e.preventDefault();
      const d = parseInt($d.value, 10), m = parseInt($m.value, 10), y = parseInt($y.value, 10);
      const now = new Date();
      if (!d || d < 1 || d > 31) return fail('Escribe el día con números, del 1 al 31.', $d);
      if (!m) return fail('Elige el mes de nacimiento.', $m);
      if (!$y.value) return fail('Escribe el año de nacimiento.', $y);
      if ($y.value.length !== 4) return fail('Escribe el año con 4 dígitos, por ejemplo 1995.', $y);
      if (y < 1900 || y > now.getFullYear()) return fail('Revisa el año: debe estar entre 1900 y ' + now.getFullYear() + '.', $y);
      const dob = new Date(y, m - 1, d);
      if (dob.getMonth() !== m - 1) return fail('Esa fecha no existe: ' + months[m - 1] + ' no tiene ' + d + ' días.', $d);
      if (dob > now) return fail('La fecha de nacimiento no puede ser futura.', $y);
      let age = now.getFullYear() - y;
      if (now.getMonth() < m - 1 || (now.getMonth() === m - 1 && now.getDate() < d)) age--;
      if (age < 18) return fail('Debes tener 18 años o más para entrar. Si te equivocaste al escribir, corrige la fecha.', $y);
      XP.LS.set('age', { verifiedAt: new Date().toISOString() }); // no guardamos la fecha de nacimiento
      md.close();
      setTimeout(done, 200);
    });
  }

  // ── consentimiento de cookies ────────────────────────────────────────────────
  XP.showCookieConsent = function (force) {
    const prev = XP.LS.get('consent', null);
    if (prev && !force) return;
    const old = XP.$('.cookie-bar'); if (old) old.remove();
    const bar = document.createElement('section');
    bar.className = 'cookie-bar';
    bar.setAttribute('aria-label', 'Preferencias de cookies');
    bar.innerHTML = '<div><h2 class="h4">Tu privacidad</h2><p class="small">Usamos almacenamiento necesario para recordar tu verificación de edad y preferencias. La analítica es opcional y está desactivada salvo que la aceptes.</p>' +
      '<div class="cookie-opts" hidden><label class="switch"><input type="checkbox" checked disabled><span>Necesarias</span></label><label class="switch"><input type="checkbox" id="ck-an"' + (prev && prev.analytics ? ' checked' : '') + '><span>Analítica de producto</span></label><label class="switch"><input type="checkbox" id="ck-pr"' + (prev && prev.preferences ? ' checked' : '') + '><span>Preferencias</span></label></div></div>' +
      '<div class="cookie-actions"><button class="btn btn-sm" data-ck="necessary" type="button">Solo necesarias</button><button class="btn btn-sm" data-ck="config" type="button">Configurar</button><button class="btn btn-sm" data-ck="all" type="button">Aceptar todas</button></div>';
    document.body.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ck]'); if (!b) return;
      const opts = XP.$('.cookie-opts', bar);
      if (b.dataset.ck === 'config') {
        if (opts.hidden) { opts.hidden = false; b.textContent = 'Guardar selección'; return; }
        save({ analytics: XP.$('#ck-an', bar).checked, preferences: XP.$('#ck-pr', bar).checked });
      }
      if (b.dataset.ck === 'necessary') save({ analytics: false, preferences: false });
      if (b.dataset.ck === 'all') save({ analytics: true, preferences: true });
    });
    function save(c) { XP.LS.set('consent', Object.assign({ necessary: true, at: new Date().toISOString() }, c)); bar.remove(); XP.toast('Preferencias de cookies guardadas.'); }
  };

  // ── paleta de comandos (Ctrl K / ⌘K) ─────────────────────────────────────────
  const PAGES = [['Hoy', '#/hoy', 'Tablero del día'], ['Mercados en vivo', '#/mercados', 'Comparador de casas y precio justo'], ['Música ambiental', 'audio', 'Activar o silenciar el paisaje sonoro'],['Radar de valor', '#/valor', 'Selecciones con EV sobre umbral'], ['Herramientas', '#/herramientas', 'Calculadoras'], ['Quitar margen', '#/herramientas/devig', 'Devig con 3 métodos'], ['Simulador de banca', '#/herramientas/simulador', 'Monte Carlo'], ['Rendimiento', '#/rendimiento', 'Calibración y CLV'], ['Aprender', '#/aprender', 'Lecciones'], ['Metodología', '#/metodologia', 'Cómo calculamos'], ['Juego responsable', '#/juego-responsable', 'Ayuda y límites'], ['Cuenta', '#/cuenta', 'Preferencias y autoexclusión']];
  let paletteOpen = false;
  function openPalette() {
    if (paletteOpen) return;
    paletteOpen = true;
    const md = openModal('<div class="palette"><label class="sr-only" for="pal-in">Buscar equipos, partidos y páginas</label><input id="pal-in" class="pal-in" placeholder="Busca un equipo, partido o página…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list"><ul id="pal-list" class="pal-list" role="listbox"></ul><p class="muted small pal-hint">↑ ↓ para moverte · Enter para abrir · Esc para cerrar</p></div>', { label: 'Paleta de comandos', cls: 'palette-wrap' });
    const input = XP.$('#pal-in', md.el), list = XP.$('#pal-list', md.el);
    let items = [], idx = 0;
    const render = () => {
      const q = XP.slug(input.value);
      const ms = q ? D().search(input.value) : D().matches.filter((m) => m.status === 'vivo');
      const ps = PAGES.filter((p) => !q || XP.slug(p[0] + ' ' + p[2]).includes(q));
      items = ms.slice(0, 8).map((m) => ({ href: '#/partido/' + m.id, title: D().teams[m.home].name + ' – ' + D().teams[m.away].name, sub: m.L.name + ' · ' + (m.status === 'vivo' ? 'en vivo ' + m.minute + "'" : m.status === 'final' ? 'final ' + m.score.join('–') : F.time(m.kickoff)) }))
        .concat(ps.map((p) => ({ href: p[1], title: p[0], sub: p[2] })));
      idx = Math.min(idx, Math.max(0, items.length - 1));
      list.innerHTML = items.length ? items.map((it, i) => '<li role="option" id="pal-' + i + '" aria-selected="' + (i === idx) + '" data-i="' + i + '"><strong>' + esc(it.title) + '</strong><small>' + esc(it.sub) + '</small></li>').join('') : '<li class="muted">Sin resultados</li>';
      input.setAttribute('aria-activedescendant', items.length ? 'pal-' + idx : '');
    };
    const go = (i) => {
      const it = items[i]; if (!it) return;
      md.close(); paletteOpen = false;
      if (it.href === 'audio') XP.audio.toggle(); else location.hash = it.href;
    };
    input.addEventListener('input', () => { idx = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      if (e.key === 'Enter') { e.preventDefault(); go(idx); }
    });
    list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) go(+li.dataset.i); });
    const obs = new MutationObserver(() => { if (!document.body.contains(md.el)) { paletteOpen = false; obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
    render();
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (XP.LS.get('age', null)) openPalette(); }
  });

  // ── temporizador de sesión ───────────────────────────────────────────────────
  function sessionTick() {
    const mins = Math.floor((Date.now() - XP.session.start) / 60000);
    const el = XP.$('#session-time');
    if (el) el.textContent = mins + ' min';
    const lim = +XP.settings.sessionLimitMin;
    if (lim > 0 && mins >= lim && Date.now() > XP.session.snoozeUntil && !XP.$('.session-modal') && XP.LS.get('age', null)) {
      const md = openModal('<h2 class="h2">Llevas ' + mins + ' minutos aquí</h2><p>Es un buen momento para una pausa. Tu límite de aviso es de ' + lim + ' minutos; puedes cambiarlo en Cuenta.</p><div class="cta-row"><a class="btn btn-accent" href="#/juego-responsable" data-act="break">Tomar un descanso</a><button class="btn" type="button" data-act="snooze">Seguir 15 minutos</button></div>', { label: 'Aviso de tiempo de sesión', cls: 'session-modal' });
      md.el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]'); if (!a) return;
        XP.session.snoozeUntil = Date.now() + 15 * 60000;
        if (a.dataset.act === 'break') XP.setLivePaused(true);
        md.close();
      });
    }
  }

  // ── arranque ─────────────────────────────────────────────────────────────────
  function boot() {
    XP.applySettings();
    syncThemeBtn();
    XP.$('#theme-toggle').addEventListener('click', () => XP.setSetting('theme', XP.settings.theme === 'dark' ? 'light' : 'dark'));
    XP.$('#live-toggle').addEventListener('click', () => XP.setLivePaused(!XP.live.paused));
    XP.$$('button[data-search]').forEach((b) => b.addEventListener('click', () => { if (XP.LS.get('age', null)) openPalette(); }));
    XP.$('#year').textContent = new Date().getFullYear();
    if (XP.fx) { XP.fx.buildDock(); XP.fx.ticker(); }
    if (XP.slip) XP.slip.build();
    XP.router.render(true);
    if (XP.stage) XP.stage.init().then((ok) => XP.bus.emit('stage-ready', ok));
    ageGate(() => XP.showCookieConsent(false));
    sessionTick();
    setInterval(sessionTick, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

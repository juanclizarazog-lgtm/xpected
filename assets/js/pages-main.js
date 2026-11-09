/* Xpected · páginas principales: landing, /hoy, /partido/[id], /valor — pensadas para apostadores. */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, F = XP.fmt, esc = XP.esc, ui = XP.ui;
  const D = () => XP.data;
  const I = (n, s, c) => XP.icon(n, s, c);
  const pages = (XP.pages = XP.pages || {});

  // ── ilustraciones SVG para estados vacíos ────────────────────────────────────
  function illus(kind) {
    if (kind === 'net') {
      return '<svg class="illus" viewBox="0 0 220 140" aria-hidden="true"><defs><linearGradient id="ig1" x1="0" x2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>' +
        '<path d="M30 120V40h160v80" fill="none" stroke="url(#ig1)" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M30 40l18-18h124l18 18M62 40v80M94 40v80M126 40v80M158 40v80M30 66h160M30 92h160" fill="none" stroke="var(--glass-line)" stroke-width="1.5"/>' +
        '<circle cx="150" cy="104" r="14" fill="var(--surface-2)" stroke="url(#ig1)" stroke-width="2.5"/><path d="M150 96l6 4.5-2.3 7h-7.4l-2.3-7z" fill="url(#ig1)"/>' +
        '<path d="M8 128h204" stroke="var(--glass-line)" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    return '<svg class="illus" viewBox="0 0 220 140" aria-hidden="true"><defs><linearGradient id="ig2" x1="0" x2="1"><stop offset="0" stop-color="var(--accent-3)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>' +
      '<rect x="40" y="26" width="140" height="92" rx="12" fill="none" stroke="var(--glass-line)" stroke-width="2"/>' +
      '<path d="M56 98l28-30 22 18 34-40 24 22" fill="none" stroke="url(#ig2)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="140" cy="46" r="6" fill="url(#ig2)"/><path d="M40 52h140" stroke="var(--glass-line)" stroke-width="1.5" stroke-dasharray="4 5"/></svg>';
  }
  XP.illus = illus;

  function statTile(icon, label, value, sub) {
    return '<div class="stat-tile">' + I(icon, 18) + '<span class="st-l">' + label + '</span><strong class="st-v">' + value + '</strong>' + (sub ? '<span class="st-s">' + sub + '</span>' : '') + '</div>';
  }

  // ════════════════════════════════ LANDING ════════════════════════════════
  const hero = { raf: 0, io: null, paused: false, onScroll: null };

  function splitText(text) {
    let i = 0;
    return text.split(' ').map((w) => '<span class="w">' + Array.from(w).map((c) => '<span class="c" style="--i:' + i++ + '">' + esc(c) + '</span>').join('') + '</span>').join(' ');
  }

  pages.landing = {
    title: 'Pronósticos y cuotas en vivo',
    render() {
      const ms = D().matches;
      const live = ms.filter((m) => m.status === 'vivo');
      const upcoming = ms.filter((m) => m.status === 'previa');
      const withOdds = upcoming.filter((m) => m.sel && m.sel['1'].best != null);
      const values = valueRows();
      const leagues = D().activeLeagues();
      const headline = 'Apuesta con datos, no con corazonadas.';
      const fm = featured();
      const showcase = (live.length ? live : upcoming).slice(0, 3);
      return '' +
        '<section class="hero" aria-labelledby="hero-title">' +
        '<canvas class="hero-canvas" aria-hidden="true"></canvas>' +
        '<div class="container hero-inner">' +
        '<p class="eyebrow"><span class="live-ind"><i class="dot" aria-hidden="true"></i>' + live.length + ' en vivo</span> ' + esc(leagues.map((L) => L.name).join(' · ')) + '</p>' +
        '<h1 id="hero-title" class="display kinetic grad" aria-label="' + headline + '"><span aria-hidden="true">' + splitText(headline) + '</span></h1>' +
        '<p class="lead">Pronóstico de cada partido, la cuota justa frente a la que paga la casa, y aviso cuando hay valor. Resultados, tablas y cuotas reales actualizados en vivo.</p>' +
        '<div class="cta-row"><a class="btn btn-accent" href="#/hoy">' + I('calendar', 18) + ' Ver partidos</a><a class="btn" href="#/valor">' + I('bolt', 18) + ' Apuestas con valor</a></div>' +
        '<button class="sound-cta" type="button" data-sound-cta aria-pressed="' + !!(XP.audio && XP.audio.on) + '"><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span data-sound-label>' + (XP.audio && XP.audio.on ? 'Silenciar el paisaje sonoro' : 'Activar el paisaje sonoro inmersivo') + '</span></button>' +
        '<p class="hero-hint-orb">' + I('sparkle', 14) + ' Arrastra el balón y suéltalo para patear · tócalo para ver otro partido · cada columna de luz es una probabilidad</p>' +
        '<dl class="hero-stats">' +
        '<div><dt>' + I('ball', 14) + ' Partidos analizados</dt><dd>' + F.int(ms.length) + '</dd></div>' +
        '<div><dt>' + I('coin', 14) + ' Con cuota de la casa</dt><dd>' + F.int(withOdds.length) + '</dd></div>' +
        '<div><dt>' + I('bolt', 14) + ' Apuestas con valor</dt><dd>' + F.int(values.length) + '</dd></div>' +
        '</dl>' +
        (fm ? heroChip(fm) : '') +
        '</div>' +
        '<button class="hero-pause btn btn-ghost btn-sm" type="button" aria-pressed="false">Pausar animación</button>' +
        '<span class="scroll-hint" aria-hidden="true"></span>' +
        '</section>' +
        '<div class="marquee-leagues" aria-hidden="true"><div class="track">' + Array(2).fill(leagues.map((L) => '<span>' + esc(L.name) + '</span><span>' + ['Pronóstico', 'Cuota justa', 'Valor', 'En vivo'][L.name.length % 4] + '</span>').join('')).join('') + '</div></div>' +

        '<section class="container section" aria-labelledby="live-title">' +
        '<div class="section-head"><div><p class="eyebrow">' + (live.length ? 'En vivo ahora' : 'Próximos partidos') + '</p><h2 id="live-title" class="h2">' + (live.length ? 'Lo que está pasando ahora' : 'Lo que viene') + '</h2></div><a class="btn btn-ghost" href="#/hoy">Ver todos ' + I('chevron-right', 16) + '</a></div>' +
        (showcase.length ? '<div class="grid-3">' + showcase.map((m) => ui.matchCard(m, { big: true })).join('') + '</div>' : emptyState('No hay partidos por ahora', 'Vuelve pronto: la jornada se actualiza sola.')) +
        '</section>' +

        '<section class="container section" aria-labelledby="feat-title">' +
        '<p class="eyebrow">Lo que obtienes</p><h2 id="feat-title" class="h2">Todo lo que necesitas antes de apostar</h2>' +
        '<div class="feature-grid">' +
        feature('target', 'Pronóstico claro', 'Quién es favorito, con qué probabilidad y qué tan confiable es el pronóstico.') +
        feature('scale', 'Cuota justa vs. casa', 'Te decimos cuánto debería pagar cada resultado. Si la casa paga más, el precio está a tu favor.') +
        feature('bolt', 'Valor detectado', 'Avisamos solo cuando la diferencia es grande. Nada de promesas: probabilidades honestas.') +
        feature('live', 'En vivo minuto a minuto', 'Marcador, goles, tarjetas y probabilidad que cambia con el partido.') +
        feature('table', 'Tabla y forma', 'Posición, puntos, goles a favor y en contra, y las últimas cinco jornadas.') +
        feature('wallet', 'Monto prudente', 'Te sugerimos cuánto arriesgar según tu banca, con un tope para cuidarla.') +
        '</div></section>' +

        (values.length ? '<section class="container section" aria-labelledby="val-title"><div class="section-head"><div><p class="eyebrow">Radar de valor</p><h2 id="val-title" class="h2">Donde la casa paga de más</h2></div><a class="btn btn-ghost" href="#/valor">Ver radar ' + I('chevron-right', 16) + '</a></div>' +
          '<div class="value-strip">' + values.slice(0, 4).map(valueCard).join('') + '</div></section>' : '') +

        '<section class="container section" aria-labelledby="price-title">' +
        '<p class="eyebrow">Planes</p><h2 id="price-title" class="h2">Gratis para empezar. Pro para ir más allá.</h2>' +
        '<div class="pricing">' +
        '<article class="plan"><h3>' + I('star', 20) + ' Gratis</h3><p class="price">$0</p><ul><li>Pronóstico y cuota justa de todos los partidos</li><li>Radar de valor</li><li>Marcadores y probabilidad en vivo</li><li>Calculadoras de apuesta</li></ul><a class="btn" href="#/hoy">Empezar</a></article>' +
        '<article class="plan plan-pro beam"><h3>' + I('sparkle', 20) + ' Pro <span class="chip">Próximamente</span></h3><p class="price">Precio por definir</p><ul><li>Alertas de valor y de goles en tu celular</li><li>Más ligas y mercados (corners, tarjetas)</li><li>Analista con IA</li><li>Comparador de varias casas</li></ul><button class="btn" type="button" disabled>Lista de espera pronto</button></article>' +
        '</div><p class="muted small">Sin afiliación a casas de apuestas. No recibimos apuestas ni manejamos dinero.</p></section>' +

        '<section class="container section faq" aria-labelledby="faq-title">' +
        '<h2 id="faq-title" class="h2">Preguntas frecuentes</h2>' +
        faq([
          ['¿Xpected garantiza ganancias?', 'No. Nadie puede garantizarlas. Te damos la probabilidad de cada resultado y te avisamos cuándo una cuota paga más de lo que vale; la decisión y el riesgo son tuyos.'],
          ['¿De dónde salen los datos?', 'Partidos, resultados, goles, tablas y la cuota de referencia llegan en tiempo real desde una fuente pública de marcadores. El pronóstico lo calcula nuestro motor con la tabla, la forma reciente y la cuota.'],
          ['¿Qué es la «cuota justa»?', 'Es lo mínimo que debería pagar un resultado según nuestra probabilidad. Si una casa paga más que la cuota justa, el precio juega a tu favor.'],
          ['¿Puedo apostar aquí?', 'No. Xpected es un servicio informativo para mayores de 18 años. No recibe apuestas ni enlaza a casas no autorizadas por Coljuegos.'],
          ['¿Por qué suena música?', 'Solo si la activas. Es un paisaje sonoro original que tu navegador genera en tiempo real. Puedes silenciarlo en el centro de control.'],
        ]) +
        '</section>';
    },
    mount(root) {
      const canvas = XP.$('.hero-canvas', root);
      const section = XP.$('.hero', root);
      const btn = XP.$('.hero-pause', root);
      hero.paused = false;
      hero.alive = true;
      hero.featured = featured();
      btn.addEventListener('click', () => {
        hero.paused = !hero.paused;
        btn.setAttribute('aria-pressed', String(hero.paused));
        btn.textContent = hero.paused ? 'Reanudar animación' : 'Pausar animación';
        if (XP.stage && XP.stage.ready) XP.stage.setPaused(hero.paused);
        else if (!hero.paused) loop();
      });
      const sc = XP.$('[data-sound-cta]', root);
      sc.addEventListener('click', () => XP.audio.toggle());
      hero.offAudio = XP.bus.on('audio', (a) => {
        sc.setAttribute('aria-pressed', String(a.on));
        XP.$('[data-sound-label]', sc).textContent = a.on ? 'Silenciar el paisaje sonoro' : 'Activar el paisaje sonoro inmersivo';
      });
      // el orbe 3D vive en el escenario persistente; aquí solo le damos el partido en foco
      const useStage = (ok) => {
        if (!hero.alive) return;
        if (ok) { section.classList.add('has-3d'); if (hero.featured) XP.stage.focus(hero.featured.id); }
        else if (hero.featured) initHero(canvas);
      };
      if (XP.stage && XP.stage.initP) XP.stage.initP.then(useStage);
      else hero.offReady = XP.bus.on('stage-ready', useStage);
      // tocar el orbe recorre los partidos: la tarjeta del hero se transforma al nuevo partido
      hero.offFocus = XP.bus.on('stage-focus', (id) => {
        const m = D().byId[id];
        const chip = XP.$('.hero-chip', root);
        if (!m || !chip) return;
        hero.featured = m;
        const tmp = document.createElement('div');
        tmp.innerHTML = heroChip(m);
        const fresh = tmp.firstElementChild;
        fresh.classList.add('chip-swap', 'magnetic');
        chip.replaceWith(fresh);
      });
    },
    destroy() {
      hero.alive = false;
      cancelAnimationFrame(hero.raf);
      if (hero.io) hero.io.disconnect();
      if (hero.onScroll) window.removeEventListener('scroll', hero.onScroll);
      if (hero.onResize) window.removeEventListener('resize', hero.onResize);
      if (hero.off) hero.off();
      if (hero.offAudio) hero.offAudio();
      if (hero.offReady) hero.offReady();
      if (hero.offFocus) hero.offFocus();
      if (hero.paused && XP.stage) XP.stage.setPaused(false);
    },
    onMatch(m) { ui.refreshCard(m); },
  };

  function feature(icon, title, text) {
    return '<article class="feature tile"><span class="feat-ico">' + I(icon, 26) + '</span><h3>' + title + '</h3><p>' + text + '</p></article>';
  }
  function faq(items) {
    return items.map((it) => '<details class="faq-item"><summary>' + esc(it[0]) + '</summary><p>' + esc(it[1]) + '</p></details>').join('');
  }
  function emptyState(title, text, kind) {
    return '<div class="empty">' + illus(kind || 'net') + '<h2 class="h3">' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p></div>';
  }
  function featured() { return D().matches.find((m) => m.status === 'vivo' && m.sel) || D().matches.find((m) => m.status === 'previa' && m.sel && m.sel['1'].best != null) || D().matches.find((m) => m.sel); }
  function probsOf(m) { return m.status === 'final' && m.frozen ? [m.frozen.p['1'], m.frozen.p['X'], m.frozen.p['2']] : ['1', 'X', '2'].map((s) => m.sel[s].pFinal); }
  function heroChip(m) {
    const T = D().teams, pk = ui.pick(m);
    return '<a class="hero-chip" data-match="' + m.id + '" href="#/partido/' + m.id + '">' +
      '<span class="hc-top">' + ui.statusChip(m) + ui.leagueMark(m.L) + '<span>' + esc(m.L.name) + '</span><span class="grow"></span><span class="muted">Columnas de luz = 1X2</span></span>' +
      '<span class="hc-teams"><span class="hc-t">' + ui.crest(m.home) + esc(T[m.home].name) + '</span>' + (m.status === 'previa' ? '<span class="muted">vs</span>' : ui.bind(m, 'score', 'hc-score')) + '<span class="hc-t right">' + esc(T[m.away].name) + ui.crest(m.away) + '</span></span>' +
      ui.probBar(m, 'final', { compact: true }) +
      '<span class="hc-hint">' + I('target', 13) + ' Pronóstico: ' + esc(pk.label) + ' · ' + F.prob(pk.p, 0) + '</span>' +
      '</a>';
  }
  function valueCard(r) {
    const m = r.m, s = r.s, T = D().teams;
    return '<a class="value-card tile" data-match="' + m.id + '" href="#/partido/' + m.id + '/mercados">' +
      '<span class="vc-top">' + ui.crest(m.home, 'sm') + ui.crest(m.away, 'sm') + '<span class="vc-match">' + esc(T[m.home].code + ' vs ' + T[m.away].code) + '</span><span class="grow"></span><span class="ev-pill">' + F.signedPct(s.ev, 0) + '</span></span>' +
      '<strong class="vc-sel">' + esc(s.label) + '</strong><span class="muted small">' + esc(s.groupName) + '</span>' +
      '<span class="vc-odds"><span><small>Paga</small><b>' + F.odds(s.best) + '</b></span><span><small>Justa</small><b>' + F.odds(1 / s.pFinal) + '</b></span><span><small>Prob.</small><b>' + F.prob(s.pFinal, 0) + '</b></span></span>' +
      '</a>';
  }

  // Hero: campo de partículas sobre una cancha que se ordena en la matriz de marcadores (scroll en scrub).
  let loop = () => {};
  function initHero(canvas) {
    const ctx = canvas.getContext('2d');
    const featured = D().matches.find((m) => m.status === 'vivo') || D().matches[0];
    let W = 0, H = 0, dpr = 1, parts = [], progress = 0, visible = true, t = 0;
    function build() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = W < 700 ? 520 : 1100;
      const r = Q.mulberry32(42);
      // cancha
      const pw = Math.min(W * 0.86, 980), ph = Math.min(H * 0.7, pw * 0.6);
      const px = (W - pw) / 2 + (W > 900 ? W * 0.12 : 0), py = (H - ph) / 2;
      const pitch = () => {
        const k = r();
        if (k < 0.45) { // contorno
          const s = r() * 2 * (pw + ph);
          if (s < pw) return [px + s, py];
          if (s < pw + ph) return [px + pw, py + s - pw];
          if (s < 2 * pw + ph) return [px + pw - (s - pw - ph), py + ph];
          return [px, py + ph - (s - 2 * pw - ph)];
        }
        if (k < 0.6) return [px + pw / 2, py + r() * ph];
        if (k < 0.75) { const a = r() * Math.PI * 2; const rr = ph * 0.17; return [px + pw / 2 + Math.cos(a) * rr, py + ph / 2 + Math.sin(a) * rr]; }
        if (k < 0.9) { const left = r() < 0.5; const bw = pw * 0.15, bh = ph * 0.55; const s = r() * (2 * bw + bh); const x0 = left ? px : px + pw; const dir = left ? 1 : -1; if (s < bw) return [x0 + dir * s, py + (ph - bh) / 2]; if (s < bw + bh) return [x0 + dir * bw, py + (ph - bh) / 2 + s - bw]; return [x0 + dir * (s - bw - bh), py + (ph + bh) / 2]; }
        return [px + r() * pw, py + r() * ph];
      };
      // matriz 6×6 ponderada por probabilidad
      const M = featured.matrix;
      const cells = [];
      let tot = 0;
      for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) { cells.push({ x, y, p: M[x][y] }); tot += M[x][y]; }
      const gs = Math.min(ph, pw * 0.6) / 6;
      const gx = px + pw / 2 - gs * 3, gy = py + ph / 2 - gs * 3;
      const cum = [];
      let acc = 0;
      cells.forEach((c) => { acc += c.p / tot; cum.push(acc); });
      parts = [];
      for (let i = 0; i < n; i++) {
        const a = pitch();
        const u = r();
        let ci = cum.findIndex((c) => c >= u); if (ci < 0) ci = cells.length - 1;
        const c = cells[ci];
        const b = [gx + c.y * gs + gs * (0.12 + r() * 0.76), gy + c.x * gs + gs * (0.12 + r() * 0.76)];
        parts.push({ a, b, d: r(), ph: r() * Math.PI * 2, s: 1.4 + r() * 1.8, alpha: 0.4 + Math.min(0.6, (c.p / 0.12)) });
      }
    }
    function color() { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C8FF2E'; }
    let col = color();
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = col;
      for (const p of parts) {
        const e = Q.clamp((progress - p.d * 0.35) / 0.65, 0, 1);
        const k = e * e * (3 - 2 * e);
        const jx = Math.sin(t * 0.0008 + p.ph) * 1.6 * (1 - k * 0.7);
        const jy = Math.cos(t * 0.0007 + p.ph) * 1.6 * (1 - k * 0.7);
        const x = p.a[0] + (p.b[0] - p.a[0]) * k + jx;
        const y = p.a[1] + (p.b[1] - p.a[1]) * k + jy;
        ctx.globalAlpha = 0.5 + (p.alpha - 0.5) * k;
        ctx.fillRect(x, y, p.s, p.s);
      }
      ctx.globalAlpha = 1;
    }
    loop = function () {
      cancelAnimationFrame(hero.raf);
      const fr = (ts) => {
        t = ts;
        draw();
        if (!hero.paused && visible && !XP.reducedMotion()) hero.raf = requestAnimationFrame(fr);
      };
      hero.raf = requestAnimationFrame(fr);
    };
    hero.onScroll = () => {
      const rect = canvas.getBoundingClientRect();
      progress = Q.clamp(-rect.top / (rect.height * 0.6), 0, 1);
      if (hero.paused || XP.reducedMotion()) draw();
    };
    hero.onResize = () => { build(); col = color(); draw(); };
    window.addEventListener('scroll', hero.onScroll, { passive: true });
    window.addEventListener('resize', hero.onResize);
    hero.off = XP.bus.on('settings', () => { col = color(); draw(); });
    hero.io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) loop(); });
    hero.io.observe(canvas);
    build();
    if (XP.reducedMotion()) { progress = 1; draw(); } else loop();
  }

  // ════════════════════════════════ /hoy ════════════════════════════════
  const hoyState = { league: 'all', day: null, valueOnly: false, loaded: false };
  const DAYS = [['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Próximos 7 días'], ['resultados', 'Resultados']];

  function dayOf(m) {
    const k = F.dayKey(m.kickoff), today = F.dayKey(new Date()), tom = F.dayKey(new Date(Date.now() + 86400e3));
    return { today: k === today, tomorrow: k === tom };
  }
  function inDay(m, day) {
    if (day === 'hoy') return m.status === 'vivo' || (dayOf(m).today && m.status !== 'final') || (dayOf(m).today && m.status === 'final');
    if (day === 'manana') return dayOf(m).tomorrow;
    if (day === 'semana') return m.status === 'previa' || m.status === 'vivo';
    return m.status === 'final';
  }

  pages.hoy = {
    title: 'Partidos',
    render() {
      if (!hoyState.day) hoyState.day = D().matches.some((m) => inDay(m, 'hoy') && m.status !== 'final') ? 'hoy' : 'semana';
      const leagues = D().activeLeagues();
      if (hoyState.league !== 'all' && !leagues.some((L) => L.slug === hoyState.league)) hoyState.league = 'all';
      return '<div class="container page">' +
        '<header class="page-head"><div><p class="eyebrow">' + I('calendar', 14) + ' ' + F.dateLong(new Date()) + '</p><h1 class="h1">Partidos y pronósticos</h1></div>' +
        '<div class="sport-filter" role="group" aria-label="Deporte"><button class="pill active" aria-pressed="true">' + I('ball', 15) + ' Fútbol</button>' + ['Baloncesto', 'Tenis'].map((s) => '<button class="pill" disabled title="Próximamente">' + s + '</button>').join('') + '</div></header>' +
        '<div class="filters" role="group" aria-label="Filtros">' +
        '<div class="seg-tabs" role="tablist" aria-label="Día">' + DAYS.map((d) => '<button role="tab" class="seg-tab' + (hoyState.day === d[0] ? ' active' : '') + '" aria-selected="' + (hoyState.day === d[0]) + '" data-day="' + d[0] + '">' + d[1] + ' <span class="count">' + D().matches.filter((m) => inDay(m, d[0])).length + '</span></button>').join('') + '</div>' +
        '<div class="pill-row">' + [['all', 'Todas las ligas', null]].concat(leagues.map((L) => [L.slug, L.name, L])).map((x) => '<button class="pill' + (hoyState.league === x[0] ? ' active' : '') + '" data-league="' + x[0] + '" aria-pressed="' + (hoyState.league === x[0]) + '">' + (x[2] ? ui.leagueMark(x[2]) : I('trophy', 14)) + esc(x[1]) + '</button>').join('') +
        '<label class="switch"><input type="checkbox" id="value-only"' + (hoyState.valueOnly ? ' checked' : '') + (XP.isSelfExcluded() ? ' disabled' : '') + '><span>' + I('bolt', 14) + ' Solo con valor</span></label></div>' +
        '</div>' +
        '<div id="hoy-board">' + (hoyState.loaded ? board() : '<div class="bento-board">' + ui.skeleton(6, 170) + '</div>') + '</div>' +
        '</div>';
    },
    mount(root) {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-league],[data-day]');
        if (!b) return;
        if (b.dataset.league) hoyState.league = b.dataset.league;
        if (b.dataset.day) hoyState.day = b.dataset.day;
        XP.$$('[data-league]', root).forEach((x) => { const on = x.dataset.league === hoyState.league; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on); });
        XP.$$('[data-day]', root).forEach((x) => { const on = x.dataset.day === hoyState.day; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
        XP.$('#hoy-board', root).innerHTML = board();
        if (XP.fx) XP.fx.scan(XP.$('#hoy-board', root));
      });
      const vo = XP.$('#value-only', root);
      vo.addEventListener('change', () => { hoyState.valueOnly = vo.checked; XP.$('#hoy-board', root).innerHTML = board(); });
      if (!hoyState.loaded) setTimeout(() => { hoyState.loaded = true; const b = XP.$('#hoy-board', root); if (b) { b.innerHTML = board(); if (XP.fx) XP.fx.scan(b); } }, 350);
    },
    onMatch(m) {
      ui.refreshCard(m);
      const radar = XP.$('#hoy-radar');
      if (radar) radar.innerHTML = radarRows();
    },
  };

  function filtered() {
    return D().matches.filter((m) => inDay(m, hoyState.day) && (hoyState.league === 'all' || m.league === hoyState.league) && (!hoyState.valueOnly || ui.bestValue(m)));
  }
  function radarRows() {
    if (XP.isSelfExcluded()) return '<p class="muted small">' + I('padlock', 14) + ' Funciones de apuestas en pausa por tu autoexclusión.</p>';
    const rows = valueRows().slice(0, 6);
    if (!rows.length) return '<p class="muted small">Ahora mismo ninguna cuota paga claramente de más. Te avisamos cuando aparezca.</p>';
    return '<ul class="radar-mini">' + rows.map((r) => '<li><a data-match="' + r.m.id + '" href="#/partido/' + r.m.id + '/mercados">' + ui.crest(r.s.label === D().teams[r.m.away].name ? r.m.away : r.m.home, 'sm') + '<span><strong>' + esc(r.s.label) + '</strong><small>' + esc(r.s.groupName) + ' · paga ' + F.odds(r.s.best) + '</small></span><span class="ev-pill">' + F.signedPct(r.s.ev, 0) + '</span></a></li>').join('') + '</ul><a class="btn btn-ghost btn-sm" href="#/valor">Abrir radar ' + I('chevron-right', 14) + '</a>';
  }
  function board() {
    const ms = filtered();
    if (!ms.length) return emptyState(hoyState.day === 'resultados' ? 'Aún no hay resultados' : 'No hay partidos con estos filtros', 'Prueba con otro día o liga. La jornada se actualiza sola.');
    const live = ms.filter((m) => m.status === 'vivo');
    let h = '<div class="bento-board">';
    if (live.length) h += '<section class="bb-live" aria-labelledby="bb-live-t"><h2 id="bb-live-t" class="h3"><span class="live-ind"><i class="dot" aria-hidden="true"></i></span> En vivo ahora</h2><div class="grid-2">' + live.map((m) => ui.matchCard(m, { big: true })).join('') + '</div></section>';
    h += '<aside class="bb-radar tile" aria-labelledby="bb-radar-t"><h2 id="bb-radar-t" class="h3">' + I('bolt', 18) + ' Radar de valor</h2><div id="hoy-radar">' + radarRows() + '</div></aside>';
    D().activeLeagues().forEach((L) => {
      const lm = ms.filter((m) => m.league === L.slug && m.status !== 'vivo');
      if (!lm.length) return;
      // agrupar por día dentro de la liga
      const groups = {};
      lm.forEach((m) => { const k = F.dayKey(m.kickoff); (groups[k] = groups[k] || []).push(m); });
      h += '<section class="bb-league" aria-labelledby="lg-' + L.slug + '"><div class="lg-head">' + ui.leagueMark(L) + '<h2 id="lg-' + L.slug + '" class="h3">' + esc(L.name) + '</h2><span class="muted small">' + esc(L.country) + '</span>' + ui.marketOnlyBadge(L) + '</div>' +
        Object.keys(groups).sort((a, b) => (hoyState.day === 'resultados' ? (a < b ? 1 : -1) : (a < b ? -1 : 1))).map((k) => (Object.keys(groups).length > 1 ? '<p class="day-sep">' + I('calendar', 13) + ' ' + F.dateLong(groups[k][0].kickoff) + '</p>' : '') + '<div class="grid-3">' + groups[k].map((m) => ui.matchCard(m)).join('') + '</div>').join('') +
        '</section>';
    });
    return h + '</div>';
  }

  function valueRows() {
    const rows = [];
    D().matches.forEach((m) => {
      if (m.status === 'final' || m.L.marketOnly || !m.sel) return;
      Object.values(m.sel).forEach((s) => { if (s.value && s.best != null) rows.push({ m, s }); });
    });
    return rows.sort((a, b) => b.s.ev - a.s.ev);
  }
  XP.valueRows = valueRows;

  // ════════════════════════════════ /partido/[id] ════════════════════════════════
  const TABS = [['resumen', 'Resumen'], ['mercados', 'Apuestas'], ['en-vivo', 'En vivo'], ['equipos', 'Equipos'], ['movimiento', 'Cuotas'], ['explicacion', 'Análisis']];
  TABS.push(['avanzado', 'Avanzado']); // Fase 6: pestaña del laboratorio, al final y sin mover las demás

  pages.partido = {
    title: 'Partido',
    render(params) {
      const m = D().byId[params.id];
      if (!m || !m.sel) return pages.notFound.render();
      const tab = TABS.some((t) => t[0] === params.tab) ? params.tab : 'resumen';
      const T = D().teams, H = T[m.home], A = T[m.away];
      this.title = H.name + ' vs ' + A.name;
      const rank = (t) => (t.standing ? '<span class="rank-chip">' + I('table', 12) + ' ' + t.standing.rank + '.º · ' + t.standing.pts + ' pts</span>' : t.elo ? '<span class="rank-chip">Elo ' + t.elo + '</span>' : '');
      return '<div class="container page">' +
        '<nav class="crumbs" aria-label="Ruta"><a href="#/hoy">Partidos</a><span aria-hidden="true">/</span>' + ui.leagueMark(m.L) + '<span>' + esc(m.L.name) + '</span></nav>' +
        '<header class="match-header" style="view-transition-name: match-' + m.id + '">' +
        '<div class="mh-meta">' + ui.statusChip(m) + '<span class="muted small">' + I('calendar', 13) + ' ' + F.dateTime(m.kickoff) + '</span>' + (m.ext && m.ext.venue ? '<span class="muted small">' + I('stadium', 13) + ' ' + esc(m.ext.venue) + '</span>' : '') + ui.marketOnlyBadge(m.L) + '<span class="grow"></span><span class="muted small">' + I('clock', 13) + ' Actualizado ' + ui.bind(m, 'upd') + '</span></div>' +
        '<div class="mh-main">' +
        '<div class="mh-team">' + ui.crest(m.home, 'xl') + '<span class="h2">' + esc(H.name) + '</span><span class="mh-sub">' + I('home', 13) + ' Local ' + rank(H) + '</span>' + ui.formDots(m.home) + '</div>' +
        '<div class="mh-score" aria-live="polite">' + (m.status === 'previa' || m.postponed ? '<span class="vs">' + (m.postponed ? 'Aplazado' : 'vs') + '</span><span class="mh-kick">' + ui.kickoffText(m) + '</span>' : ui.bind(m, 'score', 'score-big')) + '</div>' +
        '<div class="mh-team right">' + ui.crest(m.away, 'xl') + '<span class="h2">' + esc(A.name) + '</span><span class="mh-sub">' + I('plane', 13) + ' Visitante ' + rank(A) + '</span>' + ui.formDots(m.away) + '</div>' +
        '</div>' +
        '<div id="stale-slot"></div>' +
        '</header>' +
        ui.tabs('m', TABS, tab, (t) => '#/partido/' + m.id + (t === 'resumen' ? '' : '/' + t)) +
        '<div class="tab-panel" role="tabpanel" aria-labelledby="tab-m-' + tab + '" id="tab-panel">' + renderTab(m, tab) + '</div>' +
        '</div>';
    },
    mount(root, params) {
      this.params = params;
      ui.mountCharts(root);
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-calc]');
        if (!b) return;
        const m = D().byId[params.id];
        const row = XP.$('#calc-' + b.dataset.calc.replace('.', '_'), root);
        const open = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', String(!open));
        b.innerHTML = open ? 'Ver detalle' : 'Ocultar';
        row.hidden = open;
        if (!open) row.querySelector('td').innerHTML = ui.stepByStep(m, b.dataset.calc);
      });
      const holo = XP.$('#holo', root);
      const m0 = D().byId[params.id];
      const sw = XP.$('.view-switch', root);
      const setView = (v) => {
        matrixView = v;
        XP.$$('button', sw).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
        holo.hidden = v !== '3d';
        XP.$('#heatmap-slot', root).hidden = v === '3d';
        if (v === '3d' && !this.holo && !this.holoLoading) {
          this.holoLoading = true;
          XP.three.matrix(holo, m0).then((h) => {
            this.holoLoading = false;
            if (!h) { setView('2d'); XP.$('button[data-view="3d"]', sw).disabled = true; return; }
            if (!holo.isConnected) { h.dispose(); return; }
            this.holo = h;
          });
        }
      };
      if (holo && sw) {
        sw.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b && !b.disabled) setView(b.dataset.view); });
        setView(XP.three.available() ? matrixView : '2d');
      }
      this.staleCheck();
    },
    staleCheck() {
      const slot = XP.$('#stale-slot');
      const m = this.params && D().byId[this.params.id];
      if (!slot || !m) return;
      const s = XP.feed && XP.feed.status;
      const ref = m.ext && s && s.lastSync ? new Date(s.lastSync).getTime() : m.updatedAt;
      const limit = m.ext && s ? Math.max(XP.cfg.staleAfterMs, s.pollSeconds * 3000) : XP.cfg.staleAfterMs;
      const stale = m.status === 'vivo' && !XP.live.paused && Date.now() - ref > limit;
      document.body.classList.toggle('is-stale', stale);
      const html = stale ? '<div class="banner banner-warn" role="status">' + I('clock', 15) + ' Datos atrasados: la última actualización en vivo fue ' + F.ago(ref) + '. Las cifras se muestran atenuadas hasta que llegue un dato nuevo.</div>' : '';
      if (slot.innerHTML !== html) slot.innerHTML = html;
    },
    onMatch(m) {
      if (!this.params || m.id !== this.params.id) return;
      const tab = this.params.tab || 'resumen';
      if (tab === 'en-vivo' && m.status !== 'previa') {
        const ev = XP.$('#events-list');
        if (ev) ev.innerHTML = eventsList(m);
        ui.mountCharts(document, m.id);
      }
      if (tab === 'resumen') {
        const hm = XP.$('#heatmap-slot'); if (hm) hm.innerHTML = ui.scoreHeatmap(m);
        const top = XP.$('#top-scores'); if (top) top.innerHTML = topScores(m);
        const ks = XP.$('#key-stats'); if (ks) ks.innerHTML = keyStats(m);
        if (this.holo) this.holo.update(m);
      }
      if (tab === 'movimiento') ui.mountCharts(document, m.id);
      if (m.status === 'final' && !this._finalShown) { this._finalShown = true; XP.router.render(true); }
      this.staleCheck();
    },
    onHeartbeat() { this.staleCheck(); },
    destroy() {
      this._finalShown = false;
      document.body.classList.remove('is-stale');
      if (this.holo) { this.holo.dispose(); this.holo = null; }
      this.holoLoading = false;
    },
  };
  let matrixView = '3d';

  function renderTab(m, tab) {
    if (tab === 'mercados') return tabMarkets(m);
    if (tab === 'en-vivo') return tabLive(m);
    if (tab === 'equipos') return tabTeams(m);
    if (tab === 'movimiento') return tabLine(m);
    if (tab === 'explicacion') return tabExplain(m);
    if (tab === 'avanzado') return XP.labTab ? XP.labTab(m) : '';
    return tabSummary(m);
  }

  function topScores(m) {
    return '<ol class="top-scores">' + m.top.slice(0, 4).map((s) => '<li><span class="ts-score">' + s.h + '–' + s.a + '</span><span class="ts-bar"><i style="transform:scaleX(' + (s.p / m.top[0].p).toFixed(3) + ')"></i></span><span class="ts-p">' + F.prob(s.p, 0) + '</span></li>').join('') + '</ol>';
  }
  function keyStats(m) {
    const s = m.sel;
    return statTile('ball', 'Goles esperados', F.num(m.lam + m.mu, 1), 'en el partido') +
      statTile('goalnet', 'Más de 2,5 goles', F.prob(s['O2.5'].pFinal, 0), 'cuota justa ' + F.odds(1 / s['O2.5'].pFinal)) +
      statTile('users', 'Ambos marcan', F.prob(s['BTTS-S'].pFinal, 0), 'cuota justa ' + F.odds(1 / s['BTTS-S'].pFinal)) +
      statTile('target', 'Marcador probable', m.top[0].h + '–' + m.top[0].a, F.prob(m.top[0].p, 0) + ' de probabilidad');
  }
  function bestBet(m) {
    let best = null;
    Object.values(m.sel).forEach((s) => { if (s.best != null && s.ev != null && (!best || s.ev > best.ev)) best = s; });
    return best;
  }

  function tabSummary(m) {
    const T = D().teams, H = T[m.home], A = T[m.away];
    if (m.status === 'final') {
      const pk = ui.pick(m);
      const out = m.score[0] > m.score[1] ? '1' : m.score[0] === m.score[1] ? 'X' : '2';
      return '<div class="grid-2 gap-lg">' +
        '<section class="card"><h2 class="h3">' + I('flag', 18) + ' Resultado</h2>' +
        (m.postponed ? '<p>Partido aplazado.</p>' : '<p class="result-line ' + (pk.key === out ? 'hit' : 'miss') + '">' + I(pk.key === out ? 'check' : 'x', 20) + ' El pronóstico era <strong>' + esc(pk.label) + '</strong> (' + F.prob(pk.p, 0) + ') y el resultado fue <strong>' + esc(out === '1' ? 'victoria de ' + H.name : out === '2' ? 'victoria de ' + A.name : 'empate') + '</strong> (' + m.score.join('–') + ').</p>') +
        ui.probBar(m, 'final', { title: 'Lo que decía Xpected antes del partido' }) +
        (m.events.length ? '<h3 class="h4">Goles y tarjetas</h3><ul class="events">' + eventsList(m) + '</ul>' : '') + '</section>' +
        '<section class="card"><h2 class="h3">' + I('chart', 18) + ' Probabilidad durante el partido</h2>' + (m.history.length > 2 ? '<div class="chart" data-chart="winprob" data-arg="' + m.id + '"></div>' : '<p class="muted">No seguimos este partido en vivo.</p>') + '</section>' +
        '</div>';
    }
    const pk = ui.pick(m);
    const bb = bestBet(m);
    return '<div class="summary-grid">' +
      '<section class="card s-bars"><p class="eyebrow">' + I('target', 14) + ' Pronóstico</p>' +
      '<div class="pick-hero">' + (pk.key === 'X' ? '<span class="pick-x">X</span>' : ui.crest(pk.key === '1' ? m.home : m.away, 'lg')) + '<div><span class="pick-name">' + (pk.key === 'X' ? 'Empate' : 'Gana ' + esc(pk.label)) + '</span><span class="pick-sub">Confianza <span class="conf conf-' + pk.conf.toLowerCase() + '">' + pk.conf + '</span> · ' + F.prob(pk.p, 0) + ' de probabilidad</span></div></div>' +
      ui.probBar(m, 'final', { title: 'Xpected' }) +
      (m.ext ? (m.hasOdds ? ui.probBar(m, 'market', { title: 'La casa (sin su margen)' })
        : m.closingOdds ? '<p class="banner banner-info small">' + I('info', 14) + ' Partido en juego: la fuente solo publica la cuota de cierre prepartido (' + m.closingOdds.map((o) => F.odds(o)).join(' · ') + '). No calculamos valor contra una cuota que ya no está disponible; la probabilidad de arriba es en vivo, con el marcador y el minuto.</p>'
        : '<p class="muted small">' + I('info', 14) + ' Todavía no hay cuota de la casa para este partido.</p>') : ui.probBar(m, 'market', { title: 'La casa (sin su margen)' })) +
      '<div class="table-wrap"><table class="mini-table"><thead><tr><th scope="col"></th><th scope="col">Xpected</th><th scope="col">Cuota justa</th><th scope="col">Paga la casa</th><th scope="col">Valor</th></tr></thead><tbody>' +
      ['1', 'X', '2'].map((s) => '<tr' + (m.sel[s].value && !XP.isSelfExcluded() ? ' class="row-value"' : '') + '><th scope="row">' + (s === 'X' ? 'Empate' : ui.crest(s === '1' ? m.home : m.away, 'sm') + esc(m.sel[s].label)) + '</th><td>' + ui.bind(m, 'pf0:' + s) + '</td><td>' + ui.bind(m, 'fo:' + s, 'odds-cell') + '</td><td>' + XP.oddBtn(m, s) + '</td><td>' + (XP.isSelfExcluded() ? '—' : ui.bind(m, 'ev:' + s, 'ev-cell')) + '</td></tr>').join('') +
      '</tbody></table></div></section>' +
      '<section class="card s-gauge"><p class="eyebrow">' + I('bolt', 14) + ' Mejor apuesta del partido</p>' +
      (XP.isSelfExcluded() ? '<p class="muted">' + I('padlock', 14) + ' En pausa por autoexclusión.</p>'
        : bb ? '<p class="bb-name"><strong>' + esc(bb.label) + '</strong> <span class="muted">· ' + esc(bb.groupName) + '</span></p>' + ui.gauge(m, bb.id) + '<p class="muted small center">Paga ' + F.odds(bb.best) + ' · justa ' + F.odds(1 / bb.pFinal) + '</p>'
          : '<div class="no-odds">' + illus('chart') + '<p class="muted small">Sin cuotas de la casa todavía. Usa la cuota justa como referencia.</p></div>') + '</section>' +
      '<section class="card s-top"><p class="eyebrow">' + I('target', 14) + ' Marcadores más probables</p><div id="top-scores">' + topScores(m) + '</div></section>' +
      '<section class="card s-keys"><p class="eyebrow">' + I('sparkle', 14) + ' Datos clave</p><div class="stat-grid" id="key-stats">' + keyStats(m) + '</div></section>' +
      '<section class="card s-heat"><div class="card-head"><h2 class="h3">' + I('goalnet', 18) + ' Holo-matriz de marcadores</h2><div class="view-switch" role="group" aria-label="Vista de la matriz"><button type="button" data-view="3d" aria-pressed="true">3D</button><button type="button" data-view="2d" aria-pressed="false">Tabla</button></div></div>' +
      '<div class="holo" id="holo" aria-hidden="true"><span class="holo-hint">Arrastra para girar · pasa el mouse por una barra</span></div>' +
      '<div id="heatmap-slot">' + ui.scoreHeatmap(m) + '</div></section>' +
      '</div>';
  }

  function tabMarkets(m) {
    const ex = XP.isSelfExcluded();
    let h = '<p class="muted small market-note">' + I('info', 14) + ' «Cuota justa» es lo mínimo que debería pagar ese resultado según Xpected. Si la casa paga más, hay valor. Casa de referencia sin marca ni enlaces.</p>';
    D().GROUPS.forEach((g) => {
      if (!m.sel[g.sels[0]]) return;
      const anyOdds = g.sels.some((s) => m.sel[s].best != null);
      h += '<section class="card market"><h2 class="h3">' + I(g.id === '1x2' ? 'trophy' : g.id.startsWith('ou') ? 'goalnet' : g.id === 'btts' ? 'users' : 'shield', 18) + ' ' + esc(g.name) + (anyOdds ? '' : ' <span class="chip chip-muted">sin cuota de la casa</span>') + '</h2><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Apuesta</th><th scope="col">Probabilidad</th><th scope="col">Cuota justa</th><th scope="col">Paga la casa</th><th scope="col">Valor</th><th scope="col"><span class="sr-only">Detalle</span></th></tr></thead><tbody>';
      g.sels.forEach((s) => {
        const sel = m.sel[s];
        h += '<tr' + (sel.value && !ex ? ' class="row-value"' : '') + '><th scope="row">' + esc(sel.label) + (sel.value && !ex ? ' <span class="tag-value">' + I('bolt', 11) + ' valor</span>' : '') + '</th>' +
          '<td><strong>' + ui.bind(m, 'pf0:' + s) + '</strong></td><td>' + ui.bind(m, 'fo:' + s, 'odds-cell') + '</td><td>' + XP.oddBtn(m, s) + '</td>' +
          '<td>' + (ex ? '—' : ui.bind(m, 'ev:' + s, 'ev-cell')) + '</td>' +
          '<td><button class="btn btn-ghost btn-sm" type="button" data-calc="' + s + '" aria-expanded="false" aria-controls="calc-' + s.replace('.', '_') + '">Ver detalle</button></td></tr>' +
          '<tr class="calc-row" id="calc-' + s.replace('.', '_') + '" hidden><td colspan="6"></td></tr>';
      });
      h += '</tbody></table></div></section>';
    });
    return h;
  }

  const EV_ICON = { gol: 'ball', roja: 'card', amarilla: 'card', ocasion: 'target' };
  function eventsList(m) {
    const evs = m.events.slice().reverse();
    if (!evs.length) return '<li class="muted">Sin goles ni tarjetas todavía.</li>';
    const T = D().teams;
    return evs.map((e) => '<li class="ev ev-' + e.type + '"><span class="ev-min">' + esc(e.minLabel || e.min + "'") + '</span><span class="ev-ico ev-' + e.type + '">' + I(EV_ICON[e.type] || 'info', 16) + '</span><span>' + esc(e.text) + '</span>' + ui.crest(e.side ? m.away : m.home, 'sm') + '</li>').join('');
  }

  function tabLive(m) {
    if (m.status === 'previa') return emptyState('El partido aún no empieza', 'Comienza: ' + ui.kickoffText(m).toLowerCase().replace(/\.$/, '') + '. Aquí verás el marcador, los goles, las tarjetas y la probabilidad minuto a minuto.');
    const T = D().teams;
    const head = '<section class="card lg-score"><div class="live-score">' + ui.crest(m.home, 'lg') + '<span class="ls-name">' + esc(T[m.home].name) + '</span>' + ui.bind(m, 'score', 'score-big') + '<span class="ls-name right">' + esc(T[m.away].name) + '</span>' + ui.crest(m.away, 'lg') + '</div><p class="center">' + ui.statusChip(m) + '</p></section>';
    if (m.ext) {
      return '<div class="live-grid">' + head +
        '<section class="card lg-wp"><div class="card-head"><h2 class="h3">' + I('chart', 18) + ' Probabilidad en vivo</h2><span class="legend"><i class="sw sw-h"></i>Local <i class="sw sw-d"></i>Empate <i class="sw sw-a"></i>Visitante</span></div>' + (m.history.length > 1 ? '<div class="chart" data-chart="winprob" data-arg="' + m.id + '"></div>' : '<p class="muted">La curva se dibuja a medida que avanza el partido.</p>') + '</section>' +
        '<section class="card lg-ev"><h2 class="h3">' + I('whistle', 18) + ' Goles y tarjetas</h2><ul class="events" id="events-list">' + eventsList(m) + '</ul></section>' +
        '</div>';
    }
    return '<div class="live-grid">' + head +
      '<section class="card lg-wp"><div class="card-head"><h2 class="h3">' + I('chart', 18) + ' Probabilidad en vivo</h2><span class="legend"><i class="sw sw-h"></i>Local <i class="sw sw-d"></i>Empate <i class="sw sw-a"></i>Visitante</span></div><div class="chart" data-chart="winprob" data-arg="' + m.id + '"></div></section>' +
      '<section class="card lg-xg"><h2 class="h3">' + I('target', 18) + ' Peligro acumulado (xG)</h2><div class="chart" data-chart="xg" data-arg="' + m.id + '"></div></section>' +
      '<section class="card lg-mo"><h2 class="h3">' + I('bolt', 18) + ' Dominio por tramos</h2><div class="chart" data-chart="momentum" data-arg="' + m.id + '"></div></section>' +
      '<section class="card lg-ev"><h2 class="h3">' + I('whistle', 18) + ' Goles y tarjetas</h2><ul class="events" id="events-list">' + eventsList(m) + '</ul></section>' +
      '</div>';
  }

  function teamCard(m, id, side) {
    const t = D().teams[id];
    const st = t.standing;
    const formRow = ui.formDots(id) || '<span class="muted small">Sin datos de forma</span>';
    let stats = '';
    if (st) {
      stats = statTile('table', 'Posición', st.rank + '.º', st.pts + ' puntos') +
        statTile('flag', 'Partidos', st.gp, st.w + ' G · ' + st.d + ' E · ' + st.l + ' P') +
        statTile('ball', 'Goles a favor', F.num(st.gp ? st.gf / st.gp : 0, 1), 'por partido (' + st.gf + ' en total)') +
        statTile('shield', 'Goles en contra', F.num(st.gp ? st.ga / st.gp : 0, 1), 'por partido (' + st.ga + ' en total)');
    } else if (!t.ext) {
      const d = D().teamDetail(id);
      const xgf = d.last.reduce((s, r) => s + r.xgf, 0) / 10, xga = d.last.reduce((s, r) => s + r.xga, 0) / 10;
      stats = statTile('chart', 'Elo', t.elo, 'fuerza del equipo') + statTile('ball', 'Peligro creado', F.num(xgf, 1), 'xG por partido') + statTile('shield', 'Peligro recibido', F.num(xga, 1), 'xG por partido') + statTile('users', 'Bajas', t.injuries.length, t.injuries.length ? 'jugadores' : 'plantel completo');
    }
    return '<section class="card team-col"><div class="tc-head">' + ui.crest(id, 'xl') + '<div><h2 class="h3">' + esc(t.name) + '</h2><span class="muted small">' + I(side === 'Local' ? 'home' : 'plane', 13) + ' ' + side + (t.record ? ' · temporada ' + esc(t.record.replace(/-/g, ' – ')) + ' (G–E–P)' : '') + '</span></div></div>' +
      '<h3 class="h4">' + I('fire', 14) + ' Últimos 5 partidos</h3>' + formRow +
      (stats ? '<div class="stat-grid">' + stats + '</div>' : '<p class="muted">La tabla de esta competición aún no está disponible.</p>') +
      (!t.ext && t.injuries.length ? '<h3 class="h4">' + I('info', 14) + ' Bajas y dudas</h3><ul class="plain">' + t.injuries.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      '</section>';
  }
  function tabTeams(m) { return '<div class="grid-2 gap-lg">' + teamCard(m, m.home, 'Local') + teamCard(m, m.away, 'Visitante') + '</div>'; }

  function tabLine(m) {
    if ((!m.line.length || (m.ext && !m.hasOdds)) && m.closingOdds) {
      const names = [m.sel['1'].label, 'Empate', m.sel['2'].label];
      return '<section class="card"><h2 class="h3">' + I('trend-up', 18) + ' Cuotas antes del partido</h2><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Resultado</th><th scope="col">Apertura</th><th scope="col">Cierre</th><th scope="col">Lo que daba la casa (sin margen)</th></tr></thead><tbody>' +
        [0, 1, 2].map((i) => '<tr><th scope="row">' + esc(names[i]) + '</th><td>' + (m.openOdds ? F.odds(m.openOdds[i]) : '—') + '</td><td><strong>' + F.odds(m.closingOdds[i]) + '</strong></td><td>' + F.prob(Q.devigShin(m.closingOdds)[i], 0) + '</td></tr>').join('') +
        '</tbody></table></div><p class="muted small">El partido ya empezó: la fuente no publica cuotas en vivo, así que mostramos la apertura y el cierre prepartido como referencia.</p></section>';
    }
    if (!m.line.length || (m.ext && !m.hasOdds)) return emptyState('Sin cuotas de la casa todavía', 'Cuando la casa publique cuotas para este partido verás aquí cómo se mueven desde la apertura.', 'chart');
    const a = m.line[0], z = m.line[m.line.length - 1];
    const names = [m.sel['1'].label, 'Empate', m.sel['2'].label];
    const moved = (i) => { const d = z.odds[i] - a.odds[i]; return d < 0 ? '<span class="down">' + I('arrow-down', 13) + ' baja (entra dinero)</span>' : d > 0 ? '<span class="up">' + I('arrow-up', 13) + ' sube (pierde respaldo)</span>' : '<span class="muted">sin cambio</span>'; };
    return '<section class="card"><div class="card-head"><h2 class="h3">' + I('trend-up', 18) + ' Cómo se movió la cuota</h2><span class="legend"><i class="sw sw-h"></i>Local <i class="sw sw-d"></i>Empate <i class="sw sw-a"></i>Visitante</span></div>' +
      (m.line.length > 1 ? '<div class="chart" data-chart="line" data-arg="' + m.id + '"></div>' : '') +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Resultado</th><th scope="col">' + (a.open ? 'Apertura' : 'Primera captura') + '</th><th scope="col">Ahora</th><th scope="col">Tendencia</th></tr></thead><tbody>' +
      [0, 1, 2].map((i) => '<tr><th scope="row">' + esc(names[i]) + '</th><td>' + F.odds(a.odds[i]) + '</td><td><strong>' + F.odds(z.odds[i]) + '</strong></td><td>' + moved(i) + '</td></tr>').join('') +
      '</tbody></table></div><p class="muted small">Cuando una cuota baja, la casa está recibiendo apuestas a ese resultado.</p></section>';
  }

  function tabExplain(m) {
    const ex = D().explanation(m);
    return '<section class="card explain">' +
      '<div class="card-head"><h2 class="h3">' + I('sparkle', 18) + ' Análisis del partido</h2><span class="chip">Basado en datos, sin cifras inventadas</span></div>' +
      '<p class="lead-sm">' + esc(ex.headline) + '</p>' +
      '<ul class="factors">' + ex.factors.map((f) => '<li class="factor">' + I(f.icon || 'info', 20, 'f-ico') + '<div><strong>' + esc(f.label) + '</strong>' +
        (f.delta != null && m.ext ? ' <span class="' + (f.delta > 0 ? 'up' : 'down') + ' small">' + (f.delta > 0 ? '▲ ' : '▼ ') + F.pp(f.delta) + '</span>' : '') +
        '<p class="muted small">' + esc(f.data) + '</p></div></li>').join('') + '</ul>' +
      '<p class="note">' + I('info', 14) + ' ' + esc(ex.uncertainty_note) + '</p>' +
      '</section>';
  }

  // ════════════════════════════════ /valor ════════════════════════════════
  const valState = { league: 'all', group: 'all', minEv: 0, sort: 'ev' };
  pages.valor = {
    title: 'Apuestas con valor',
    render() {
      if (XP.isSelfExcluded()) return lockedPage('Radar de valor');
      return '<div class="container page">' +
        '<header class="page-head"><div><p class="eyebrow">' + I('bolt', 14) + ' Radar de valor</p><h1 class="h1">Cuotas que pagan más de lo que valen</h1><p class="lead-sm muted">Aparecen aquí solo las apuestas donde la casa paga claramente por encima de la cuota justa de Xpected. Es una ventaja estimada, no una garantía.</p></div></header>' +
        '<div class="filters form-row">' +
        '<label>Liga<select id="vf-league"><option value="all">Todas</option>' + D().activeLeagues().filter((L) => !L.marketOnly).map((L) => '<option value="' + L.slug + '"' + (valState.league === L.slug ? ' selected' : '') + '>' + esc(L.name) + '</option>').join('') + '</select></label>' +
        '<label>Mercado<select id="vf-group"><option value="all">Todos</option>' + D().GROUPS.map((g) => '<option value="' + g.id + '"' + (valState.group === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></label>' +
        '<label>Valor mínimo <output id="vf-ev-out">' + F.pct(valState.minEv, 0) + '</output><input type="range" id="vf-ev" min="0" max="0.15" step="0.01" value="' + valState.minEv + '"></label>' +
        '<label>Ordenar<select id="vf-sort"><option value="ev">Mayor valor</option><option value="prob">Más probable</option><option value="time">Hora de inicio</option></select></label>' +
        '</div>' +
        '<div class="table-wrap card"><table class="data-table radar"><thead><tr><th scope="col">Partido</th><th scope="col">Apuesta</th><th scope="col">Probabilidad</th><th scope="col">Paga la casa</th><th scope="col">Cuota justa</th><th scope="col">Valor</th><th scope="col">Cuota de</th></tr></thead><tbody id="vt-body">' + valBody() + '</tbody></table></div>' +
        '<p class="muted small">' + I('info', 13) + ' Las combinadas nunca se marcan como valor: el margen de la casa se multiplica en cada selección.</p>' +
        '</div>';
    },
    mount(root) {
      if (XP.isSelfExcluded()) return;
      XP.$('#vf-sort', root).value = valState.sort;
      const upd = () => { ui.flip(XP.$('#vt-body', root), () => { XP.$('#vt-body', root).innerHTML = valBody(); }); };
      XP.$('#vf-league', root).addEventListener('change', (e) => { valState.league = e.target.value; upd(); });
      XP.$('#vf-group', root).addEventListener('change', (e) => { valState.group = e.target.value; upd(); });
      XP.$('#vf-sort', root).addEventListener('change', (e) => { valState.sort = e.target.value; upd(); });
      XP.$('#vf-ev', root).addEventListener('input', (e) => { valState.minEv = +e.target.value; XP.$('#vf-ev-out', root).textContent = F.pct(valState.minEv, 0); upd(); });
      this._t = 0;
    },
    onMatch() {
      const now = Date.now();
      if (now - (this._t || 0) < 2000) return;
      this._t = now;
      const body = XP.$('#vt-body');
      if (!body) return;
      const html = valBody();
      if (html !== body.innerHTML) ui.flip(body, () => { body.innerHTML = html; });
    },
  };
  function valBody() {
    let rows = valueRows().filter((r) => (valState.league === 'all' || r.m.league === valState.league) && (valState.group === 'all' || r.s.group === valState.group) && r.s.ev >= valState.minEv);
    if (valState.sort === 'prob') rows.sort((a, b) => b.s.pFinal - a.s.pFinal);
    if (valState.sort === 'time') rows.sort((a, b) => a.m.kickoff - b.m.kickoff);
    if (!rows.length) return '<tr><td colspan="7"><div class="empty slim">' + illus('chart') + '<p class="muted">Ahora mismo ninguna cuota paga claramente de más. El radar se actualiza solo con cada cambio de cuota.</p></div></td></tr>';
    const T = D().teams;
    return rows.map((r) => {
      const m = r.m, s = r.s;
      return '<tr data-match="' + m.id + '" data-flip="' + m.id + s.id + '"><th scope="row"><a class="vt-match" href="#/partido/' + m.id + '/mercados">' + ui.crest(m.home, 'sm') + ui.crest(m.away, 'sm') + '<span>' + esc(T[m.home].name + ' – ' + T[m.away].name) + '<small class="muted block">' + esc(m.L.name) + ' · ' + (m.status === 'vivo' ? 'en vivo' : ui.kickoffText(m)) + '</small></span></a></th>' +
        '<td><strong>' + esc(s.label) + '</strong><small class="muted block">' + esc(s.groupName) + '</small></td>' +
        '<td>' + F.prob(s.pFinal, 0) + '</td>' +
        '<td>' + XP.oddBtn(m, s.id) + '</td><td>' + ui.bind(m, 'fo:' + s.id, 'odds-cell') + '</td>' +
        '<td>' + ui.bind(m, 'ev:' + s.id, 'ev-cell') + '</td><td class="muted small">' + ui.bind(m, 'ago:' + s.id) + '</td></tr>';
    }).join('');
  }

  function lockedPage(name) {
    return '<div class="container page"><div class="empty">' + I('padlock', 40) + '<h1 class="h2">' + esc(name) + ' en pausa</h1><p>Activaste una pausa de las funciones de apuestas hasta el ' + F.dateLong(new Date(XP.settings.selfExcludedUntil)) + '. Los partidos y resultados siguen disponibles.</p><p><a class="btn" href="#/juego-responsable">Recursos de ayuda</a></p></div></div>';
  }
  XP.lockedPage = lockedPage;

  pages.notFound = {
    title: 'No encontrado',
    render() { return '<div class="container page">' + emptyState('No encontramos esta página', 'Puede que el partido ya no esté en la jornada. Revisa los partidos de hoy.') + '<p class="center"><a class="btn btn-accent" href="#/hoy">Ver partidos</a></p></div>'; },
  };
})();

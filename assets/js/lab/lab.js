/*
 * Xpected · Laboratorio (fase 6). Se carga solo en #/laboratorio, #/ligas/:slug y la pestaña «Avanzado».
 * Cada herramienta es la misma tarjeta de tres capas: 1) veredicto en una frase con su número, rango y semáforo;
 * 2) «Pruébalo»: una sola interacción con «Restablecer»; 3) «Cómo lo calculamos», en palabras simples.
 * Nada de nombres técnicos ni fórmulas a la vista: los métodos están en docs/plan-fase-6.md y docs/reports/.
 */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, LQ = window.XLQ, F = XP.fmt, esc = XP.esc;
  const I = (n, s) => XP.icon(n, s || 18);
  const D = () => XP.data;
  const api = (p) => fetch('/api/lab/' + p, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));
  const P = (p, d) => F.prob(p, d == null ? 0 : d);
  const num = (x, d) => F.num(x, d == null ? 1 : d);
  const pts = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + num(Math.abs(x * 100), 1) + ' pts';
  const RHO = -0.06;
  let uid = 0, cleanup = [], timers = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); cleanup.push(() => el.removeEventListener(ev, fn)); };
  const every = (ms, fn) => { const t = setInterval(fn, ms); timers.push(t); };
  const mode = () => XP.LS.get('lab:mode', 'simple');
  const reduced = () => XP.reducedMotion();

  // ── semáforo (Parte 2 del plan) ──────────────────────────────────────────────
  const LIGHTS = {
    alta: ['Confiabilidad alta', 'Históricamente, cuando decimos 60 %, pasa cerca de 60 % de las veces.'],
    media: ['Confiabilidad media', 'Bien calibrado, con menos historial.'],
    baja: ['Confiabilidad baja', 'Mercado difícil: úsalo como referencia, no como señal.'],
    educativa: ['Modo aprendizaje', 'Modo aprendizaje: todavía no mejoró lo suficiente en la prueba con partidos pasados, así que no marca apuestas de valor.'],
    apagada: ['Apagada', 'Esta herramienta aún no tiene datos para funcionar.'],
  };
  function lightChip(light, id) {
    const L = LIGHTS[light] || LIGHTS.educativa;
    return '<span class="lab-light-wrap"><span class="lab-light lab-light-' + light + '"><i aria-hidden="true"></i>' + L[0] + '</span>' +
      '<button type="button" class="lab-tip" aria-label="Qué significa: ' + L[0] + '" aria-describedby="' + id + '-tip">?</button><span class="lab-tip-text" role="tooltip" id="' + id + '-tip">' + L[1] + '</span></span>';
  }

  // ── catálogo (nombres simples) ──────────────────────────────────────────────
  const FAMILIES = [['A', 'La fuerza de los equipos'], ['B', 'En vivo'], ['C', 'Las cuotas'], ['D', 'Apuestas especiales'], ['E', 'Confianza, temporada y banca']];
  const CATALOG = [
    { id: '1', fam: 'A', icon: 'trend-up', title: 'Fuerza semana a semana', what: 'Cómo cambia el nivel de cada equipo y cuánta duda hay.' },
    { id: '2', fam: 'A', icon: 'scale', title: 'Pocos partidos jugados', what: 'Cuánto creerle a esta temporada frente al promedio de la liga.' },
    { id: '3', fam: 'A', icon: 'users', title: '¿Y si no juega…?', what: 'Qué pasa con el partido si falta un titular.' },
    { id: '4', fam: 'A', icon: 'chart', title: '¿Por qué este porcentaje?', what: 'Qué suma y qué resta en la probabilidad.' },
    { id: '5', fam: 'A', icon: 'stadium', title: 'Ventaja de la altura', what: 'Si jugar en Bogotá, Quito o La Paz cambia algo.' },
    { id: '6', fam: 'B', icon: 'fire', title: 'Peligro de gol ahora', what: 'Probabilidad de gol en los próximos minutos.' },
    { id: '7', fam: 'C', icon: 'bolt', title: 'Movimientos fuertes de cuota', what: 'Cuándo varias casas mueven la cuota a la vez.' },
    { id: '8', fam: 'C', icon: 'trend-down', title: '¿La cuota subirá o bajará?', what: 'Hacia dónde va la cuota antes del inicio.' },
    { id: '9', fam: 'D', icon: 'swap', title: 'Apuestas juntas del mismo partido', what: 'Cuánto valen de verdad dos o tres selecciones juntas.' },
    { id: '10', fam: 'D', icon: 'star', title: 'Puntos de jugadores (baloncesto)', what: 'A quién le llegan los tiros cuando falta una estrella.' },
    { id: '11', fam: 'D', icon: 'flag', title: 'Córners y tarjetas', what: 'Cuántos córners y tarjetas esperar, con su rango.' },
    { id: '12', fam: 'E', icon: 'target', title: '¿Qué tan seguro es cada número?', what: 'El rango de cada probabilidad y los resultados posibles.' },
    { id: '13', fam: 'E', icon: 'trophy', title: 'Simulador de temporada', what: 'Campeón, clasificación y descenso en miles de temporadas.' },
    { id: '14', fam: 'E', icon: 'wallet', title: 'Cuánto arriesgar con varias apuestas', what: 'Montos para varias selecciones abiertas a la vez.' },
  ];
  const byId = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

  // ── tarjeta de tres capas ───────────────────────────────────────────────────
  function card(def, st, c) {
    const light = st.status === 'apagada' ? 'apagada' : st.status === 'publicada' ? st.light || 'media' : 'educativa';
    const id = 'lab' + def.id + '-' + ++uid;
    const how = c.how ? '<details class="lab-how"' + (mode() === 'experto' ? ' open' : '') + '><summary>' + I('info', 14) + ' Cómo lo calculamos</summary><ul class="detail-list">' +
      c.how.map((r) => '<li>' + I(r[0], 16) + '<span class="dl-k">' + r[1] + '</span><span class="dl-v">' + r[2] + '</span></li>').join('') + '</ul>' +
      '<p class="muted small">' + I('shield', 13) + ' ' + testLine(st) + '</p></details>' : '';
    return '<article class="lab-card tile" id="' + id + '" data-strategy="' + def.id + '" data-light="' + light + '" aria-labelledby="' + id + '-t">' +
      '<header class="lab-head"><span class="lab-ico" aria-hidden="true">' + I(def.icon, 20) + '</span><div class="lab-ht"><h3 class="lab-title" id="' + id + '-t">' + def.title + '</h3><p class="muted small">' + def.what + '</p></div>' + lightChip(light, id) + '</header>' +
      '<p class="lab-verdict" aria-live="polite">' + c.verdict + '</p>' +
      (c.big ? '<p class="lab-big"><span class="lab-big-n">' + c.big + '</span>' + (c.range ? ' <span class="lab-range">' + c.range + '</span>' : '') + '</p>' : '') +
      (c.play ? '<button type="button" class="btn btn-sm lab-try" aria-expanded="false" aria-controls="' + id + '-play">' + I('sparkle', 14) + ' Pruébalo</button>' +
        '<div class="lab-play" id="' + id + '-play" hidden>' + c.play + '<div class="lab-play-foot"><button type="button" class="btn btn-sm btn-ghost lab-reset">' + I('swap', 14) + ' Restablecer</button></div></div>' : '') +
      (c.note ? '<p class="lab-note small">' + I('info', 13) + ' ' + c.note + '</p>' : '') + how +
      '</article>';
  }
  function testLine(st) {
    if (st.status === 'apagada') return st.why || 'Apagada.';
    const n = st.stats && st.stats.n;
    if (st.status === 'publicada') return 'Probada con ' + (n ? F.int(n) + ' ' : '') + 'partidos pasados: mejoró al modelo actual de Xpected.';
    return 'Modo aprendizaje: ' + (st.why ? st.why.replace(/\.$/, '') + '.' : 'en la prueba con partidos pasados todavía no mejoró lo suficiente al modelo actual.');
  }
  /** Enlaza «Pruébalo» y «Restablecer» de una tarjeta; c.mount(el) y c.reset(el) son de cada herramienta. */
  function wire(el, c) {
    if (!el) return;
    const btn = el.querySelector('.lab-try'), play = el.querySelector('.lab-play');
    if (btn) on(btn, 'click', () => { const open = btn.getAttribute('aria-expanded') === 'true'; btn.setAttribute('aria-expanded', String(!open)); play.hidden = open; if (!open && !play.dataset.mounted) { play.dataset.mounted = '1'; if (c.mount) c.mount(play, el); } });
    const rs = el.querySelector('.lab-reset');
    if (rs) on(rs, 'click', () => { if (c.reset) c.reset(play, el); else { play.innerHTML = c.play + play.querySelector('.lab-play-foot').outerHTML; } });
    XP.$$('.lab-tip', el).forEach((b) => on(b, 'click', () => b.parentElement.classList.toggle('show')));
  }
  const na = (text) => ({ verdict: text, big: null, play: null, how: null });

  // ── piezas visuales pequeñas ────────────────────────────────────────────────
  function bar3(p, names) {
    const n = names || ['Local', 'Empate', 'Visitante'];
    let acc = 0;
    const segs = p.map((x, i) => { const s = '<span class="lab-seg lab-seg-' + i + '" style="transform:translateX(' + (acc * 100).toFixed(2) + '%) scaleX(' + x.toFixed(4) + ')"></span>'; acc += x; return s; }).join('');
    return '<div class="lab-bar3" role="img" aria-label="' + n.map((x, i) => x + ' ' + P(p[i])).join(', ') + '"><div class="lab-bar3-track">' + segs + '</div><div class="lab-bar3-lab">' + n.map((x, i) => '<span><i class="lab-dot lab-dot-' + i + '"></i>' + esc(x) + ' <strong>' + P(p[i]) + '</strong></span>').join('') + '</div></div>';
  }
  const probs = (lam, mu, rho, h0, a0) => { const mk = Q.marketsFromMatrix(Q.scoreMatrix(Math.max(0.05, lam), Math.max(0.05, mu), rho == null ? RHO : rho, 10), h0 || 0, a0 || 0); return [mk.home, mk.draw, mk.away]; };
  const teamNames = (ctx) => [ctx.p.home ? ctx.p.home.name : 'Local', ctx.p.away ? ctx.p.away.name : 'Visitante'];

  // ════════════════════════ herramientas por partido ════════════════════════
  const B = {};

  // 1 · fuerza semana a semana
  B['1'] = (ctx) => {
    const S = ctx.p.strength;
    if (!S || !S.home || !S.away) return na('Todavía no hay suficientes partidos de estos equipos en el historial.');
    const dir = (t) => (t.change5 >= 2 ? 'subió' : t.change5 <= -2 ? 'bajó' : 'se mantuvo');
    const t = S.home;
    const chart = (team) => {
      const s = team.series; if (s.length < 2) return '<p class="muted small">Pocos partidos para dibujar la línea.</p>';
      const W = 320, Hh = 130, y = (v) => Hh - 12 - Math.max(0, Math.min(100, v)) / 100 * (Hh - 24), x = (i) => 8 + i / (s.length - 1) * (W - 16);
      const up = s.map((r, i) => x(i).toFixed(1) + ',' + y(r[3]).toFixed(1)), lo = s.map((r, i) => x(i).toFixed(1) + ',' + y(r[2]).toFixed(1)).reverse();
      return '<svg class="lab-rating" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Nivel de ' + esc(team.name) + ' en sus últimos ' + s.length + ' partidos">' +
        '<line x1="0" x2="' + W + '" y1="' + y(50) + '" y2="' + y(50) + '" class="lab-mid"/><text x="' + (W - 4) + '" y="' + (y(50) - 4) + '" class="lab-axis" text-anchor="end">50 = promedio</text>' +
        '<polygon class="lab-band" points="' + up.concat(lo).join(' ') + '"/><polyline class="lab-line" points="' + s.map((r, i) => x(i).toFixed(1) + ',' + y(r[1]).toFixed(1)).join(' ') + '"/>' +
        '<g class="lab-marker" transform="translate(' + x(s.length - 1) + ',0)"><rect class="lab-breath" x="-5" width="10" y="' + y(s[s.length - 1][3]) + '" height="' + Math.max(2, y(s[s.length - 1][2]) - y(s[s.length - 1][3])) + '" rx="4"/><circle r="4.5" cy="' + y(s[s.length - 1][1]) + '"/></g></svg>' +
        '<label class="lab-field"><span>Recorre la temporada</span><input type="range" min="0" max="' + (s.length - 1) + '" value="' + (s.length - 1) + '" data-tl aria-valuetext="Partido más reciente"></label><p class="lab-out small" data-tl-out></p>';
    };
    const c = {
      verdict: esc(t.name) + ': su fuerza ' + dir(t) + ' en los últimos 5 partidos, con incertidumbre ' + t.unc + '.',
      big: 'Nivel ' + t.now, range: '(' + t.lo + '–' + t.hi + ') · 50 = promedio de la liga',
      play: '<div class="lab-seg-ctl" role="group" aria-label="Equipo"><button type="button" class="chip" aria-pressed="true" data-team="home">' + esc(S.home.name) + '</button><button type="button" class="chip" aria-pressed="false" data-team="away">' + esc(S.away.name) + '</button></div><div data-chart></div>',
      how: [['flag', 'Punto de partida', 'El nivel de la temporada pasada, acercado un poco al promedio de la liga.'],
        ['whistle', 'Después de cada partido', 'Lo corregimos según qué tan sorpresivo fue el marcador: una goleada inesperada mueve más que un resultado previsto.'],
        ['clock', 'Entre partidos', 'La duda crece un poco cada día sin jugar; por eso la banda se ensancha y se estrecha.'],
        ['target', 'Con esto, este partido', S.p ? 'Local ' + P(S.p[0]) + ' · Empate ' + P(S.p[1]) + ' · Visitante ' + P(S.p[2]) : '—']],
    };
    c.mount = (play) => {
      const draw = (side) => {
        const team = S[side];
        play.querySelector('[data-chart]').innerHTML = chart(team);
        const tl = play.querySelector('[data-tl]'), out = play.querySelector('[data-tl-out]');
        if (!tl) return;
        const svg = play.querySelector('svg'), g = svg.querySelector('.lab-marker'), rect = g.querySelector('rect'), dot = g.querySelector('circle');
        const s = team.series, W = 320, Hh = 130, y = (v) => Hh - 12 - Math.max(0, Math.min(100, v)) / 100 * (Hh - 24), x = (i) => 8 + i / (s.length - 1) * (W - 16);
        const upd = () => {
          const i = +tl.value, r = s[i];
          g.setAttribute('transform', 'translate(' + x(i).toFixed(1) + ',0)');
          const top = y(r[3]), h = Math.max(2, y(r[2]) - top);
          rect.setAttribute('y', top.toFixed(1)); rect.setAttribute('height', h.toFixed(1));
          dot.setAttribute('cy', y(r[1]).toFixed(1));
          if (!reduced()) { rect.classList.remove('breathe'); void rect.getBBox(); rect.classList.add('breathe'); }
          const txt = F.dateLong(new Date(r[0] + 'T12:00:00Z')) + ': nivel ' + r[1] + ' (entre ' + r[2] + ' y ' + r[3] + ')';
          out.textContent = txt; tl.setAttribute('aria-valuetext', txt);
        };
        on(tl, 'input', upd); upd();
      };
      XP.$$('[data-team]', play).forEach((b) => on(b, 'click', () => { XP.$$('[data-team]', play).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(b.dataset.team); }));
      draw('home');
    };
    c.reset = (play) => { const b = play.querySelector('[data-team="home"]'); if (b) b.click(); };
    return c;
  };

  // 2 · pocos partidos jugados
  B['2'] = (ctx) => {
    const S = ctx.p.shrink;
    if (!S) return na('Sin tabla del torneo para este partido.');
    const [hn] = teamNames(ctx);
    const names = [teamNames(ctx)[0], 'Empate', teamNames(ctx)[1]];
    const w0 = (S.w[0] + S.w[1]) / 2;
    const p0 = LQ.shrinkProbs(S.params, w0).p;
    const c = {
      verdict: 'Con ' + S.n[0] + ' partidos jugados, a ' + esc(hn) + ' le creemos ' + P(S.w[0]) + ' a esta temporada y ' + P(1 - S.w[0]) + ' al promedio de la liga.',
      big: 'Local ' + P(p0[0]),
      play: '<label class="lab-field"><span>Cuánto creerle a esta temporada: <output data-o>' + Math.round(w0 * 100) + ' %</output></span><input type="range" min="0" max="100" step="1" value="' + Math.round(w0 * 100) + '" data-w aria-valuetext="' + Math.round(w0 * 100) + ' % temporada"></label>' +
        '<div class="lab-ends small muted"><span>Izquierda: todos son equipos promedio</span><span>Derecha: solo esta temporada</span></div><div data-bar>' + bar3(p0, names) + '</div>',
      how: [['table', 'Lo que dice esta temporada', 'Goles a favor y en contra de cada equipo frente al promedio de la liga.'],
        ['users', 'Cuánto varían los equipos de verdad', 'Comparamos qué tan distintos son los equipos con lo que se explicaría solo por azar.'],
        ['scale', 'El peso', 'Con pocos partidos, el número de la temporada se acerca al promedio; con muchos, manda la temporada. Hoy: local ' + P(S.w[0]) + ', visitante ' + P(S.w[1]) + '.']],
    };
    c.mount = (play) => {
      const r = play.querySelector('[data-w]'), o = play.querySelector('[data-o]'), bar = play.querySelector('[data-bar]');
      on(r, 'input', () => { const w = +r.value / 100; o.textContent = r.value + ' %'; r.setAttribute('aria-valuetext', r.value + ' % temporada'); bar.innerHTML = bar3(LQ.shrinkProbs(S.params, w).p, names); });
    };
    c.reset = (play) => { const r = play.querySelector('[data-w]'); r.value = Math.round(w0 * 100); r.dispatchEvent(new Event('input')); };
    return c;
  };

  // 3 · ¿y si no juega…?
  B['3'] = (ctx) => {
    const L = ctx.p.lineup;
    if (!L) return na('No tenemos una alineación reciente de estos equipos.');
    const [hn, an] = teamNames(ctx), names = [hn, 'Empate', an];
    const key = L.players.filter((x) => x.side === 0).sort((a, b) => a.delta[0] - b.delta[0])[0];
    const c = {
      verdict: key && Math.abs(key.delta[0]) >= 0.005 ? 'Sin ' + esc(key.name) + ', la probabilidad de ' + esc(hn) + ' ' + (key.delta[0] < 0 ? 'baja ' : 'sube ') + num(Math.abs(key.delta[0] * 100), 1) + ' puntos.' : 'Ningún titular probable de ' + esc(hn) + ' cambia el partido más de medio punto por sí solo.',
      big: esc(hn) + ' ' + P(L.base[0]),
      play: '<p class="small muted">Alineación probable: el último once de cada equipo. Toca un jugador para sacarlo.</p><div class="lab-xi">' +
        [0, 1].map((side) => '<div><h4 class="small">' + esc(side ? an : hn) + '</h4><ul class="lab-xi-list">' + L.players.filter((x) => x.side === side).sort((a, b) => b.rating - a.rating).map((x) =>
          '<li><button type="button" class="lab-player" aria-pressed="true" data-pid="' + esc(x.id) + '" data-side="' + side + '" data-r="' + x.rating + '"><span>' + esc(x.name) + ' <small class="muted">' + esc(x.pos) + '</small></span><small class="' + (x.rating >= 0 ? 'up' : 'down') + '">' + (x.rating >= 0 ? '+' : '−') + num(Math.abs(x.rating), 2) + '</small></button></li>').join('') + '</ul></div>').join('') + '</div><div data-bar>' + bar3(L.base, names) + '</div><p class="lab-out small" data-out></p>',
      how: [['users', 'Nota de cada jugador', 'Cuántos goles de diferencia por partido suma frente a un jugador promedio, según quién estaba en la cancha cuando cayó cada gol (los que jugaron poco se acercan a 0).'],
        ['calendar', 'Alineación probable', 'El último once de cada equipo (' + L.from.map((d) => F.dateTime(new Date(d))).join(' y ') + ').'],
        ['swap', 'Si falta', 'Lo reemplaza un jugador promedio; la diferencia se reparte mitad en ataque y mitad en defensa.']],
      note: 'Las notas tienen mucho ruido con una sola temporada de datos: úsalas como orientación.',
    };
    c.mount = (play) => {
      const upd = () => {
        let dl = 0;
        XP.$$('.lab-player[aria-pressed="false"]', play).forEach((b) => { const r = +b.dataset.r; dl += b.dataset.side === '0' ? -r / 2 : r / 2; });
        const p = probs(L.lam + dl, L.mu - dl);
        play.querySelector('[data-bar]').innerHTML = bar3(p, names);
        play.querySelector('[data-out]').textContent = dl === 0 ? '' : esc(hn) + ': ' + P(L.base[0]) + ' → ' + P(p[0]) + ' (' + pts(p[0] - L.base[0]) + ')';
      };
      XP.$$('.lab-player', play).forEach((b) => on(b, 'click', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); upd(); }));
    };
    c.reset = (play) => { XP.$$('.lab-player', play).forEach((b) => b.setAttribute('aria-pressed', 'true')); play.querySelector('[data-bar]').innerHTML = bar3(L.base, names); play.querySelector('[data-out]').textContent = ''; };
    return c;
  };

  // 4 · ¿por qué este porcentaje?
  const FACT_TXT = {
    home: (v) => (v ? 'Juega en su estadio.' : 'Cancha neutral.'),
    pi: (v) => 'Según sus últimos resultados como local y como visitante, el local es ' + (v >= 0 ? 'mejor' : 'peor') + ' por ' + num(Math.abs(v), 2) + ' goles por partido.',
    form: (v) => 'Diferencia de puntos por partido en los últimos 5: ' + (v >= 0 ? '+' : '−') + num(Math.abs(v), 1) + ' a favor del ' + (v >= 0 ? 'local' : 'visitante') + '.',
    rest: (v) => (Math.abs(v) < 0.5 ? 'Los dos llegan con el mismo descanso.' : 'El ' + (v > 0 ? 'local' : 'visitante') + ' descansó ' + num(Math.abs(v), 0) + ' días más.'),
    alt: (v) => (v > 0 ? 'La sede está ' + F.int(v * 1000) + ' m más alta que la ciudad del visitante.' : 'Sin diferencia de altura a favor del local.'),
  };
  B['4'] = (ctx) => {
    const X = ctx.p.factors;
    if (!X) return na('Sin datos suficientes para separar los factores de este partido.');
    const fs = X.factors.slice().sort((a, b) => Math.abs(b.phi[0]) - Math.abs(a.phi[0]));
    const [hn] = teamNames(ctx);
    const top = fs.filter((f) => Math.abs(f.phi[0]) >= 0.005).slice(0, 2);
    const wf = () => {
      const mx = Math.max(0.05, ...X.factors.map((f) => Math.abs(f.phi[0])));
      return '<ol class="lab-wf"><li class="lab-wf-row base"><span>Partido parejo en cancha neutral</span><strong>' + P(X.base[0]) + '</strong></li>' +
        fs.map((f, i) => '<li class="lab-wf-row"><button type="button" class="lab-wf-btn" aria-expanded="false" data-f="' + i + '"><span>' + esc(f.label) + '</span><span class="lab-wf-bar ' + (f.phi[0] >= 0 ? 'pos' : 'neg') + '"><i style="transform:scaleX(' + (Math.abs(f.phi[0]) / mx).toFixed(3) + ')"></i></span><strong class="' + (f.phi[0] >= 0 ? 'up' : 'down') + '">' + pts(f.phi[0]) + '</strong></button><p class="small muted" hidden>' + FACT_TXT[f.key](f.value) + '</p></li>').join('') +
        '<li class="lab-wf-row total"><span>Este partido</span><strong>' + P(X.final[0]) + '</strong></li></ol>';
    };
    const c = {
      verdict: top.length ? 'Lo que más pesa hoy: ' + top.map((f) => f.label.toLowerCase().replace(/ \(.*\)/, '') + ' (' + pts(f.phi[0]) + ')').join(' y ') + '.' : 'Ningún factor mueve mucho este partido: está parejo.',
      big: 'de ' + P(X.base[0]) + ' a ' + P(X.final[0]), range: 'gana ' + esc(hn),
      play: '<p class="small muted">Toca un factor para ver su dato.</p>' + wf(),
      note: X.appP ? 'El porcentaje principal de Xpected para el local es ' + P(X.appP[0]) + '; esta es una segunda mirada con otros datos.' : null,
      how: [['table', 'Nivel de cada equipo', 'Una nota como local y otra como visitante que se corrige tras cada partido; las goleadas pesan menos de lo que suman.'],
        ['calc', 'Cinco factores', 'Jugar en casa, nivel, forma reciente, días de descanso y altura, combinados con partidos pasados.'],
        ['scale', 'Reparto justo', 'Cada factor se lleva exactamente lo que agrega en promedio, sin importar el orden: la suma da el total.']],
    };
    c.mount = (play) => XP.$$('.lab-wf-btn', play).forEach((b) => on(b, 'click', () => { const p = b.nextElementSibling; const open = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', String(!open)); p.hidden = open; }));
    c.reset = (play) => XP.$$('.lab-wf-btn', play).forEach((b) => { b.setAttribute('aria-expanded', 'false'); b.nextElementSibling.hidden = true; });
    return c;
  };

  // 5 · altura
  const CITY = { Bogota: [4.71, -74.07, 2640], Tunja: [5.54, -73.36, 2810], Pasto: [1.21, -77.28, 2527], Manizales: [5.07, -75.52, 2160], Rionegro: [6.15, -75.37, 2125], Medellin: [6.25, -75.56, 1495], Pereira: [4.81, -75.69, 1411], Armenia: [4.53, -75.68, 1483], Ibague: [4.44, -75.23, 1285], Cali: [3.45, -76.53, 1018], Bucaramanga: [7.12, -73.12, 959], Neiva: [2.93, -75.28, 442], Villavicencio: [4.14, -73.63, 467], Cucuta: [7.89, -72.5, 320], Monteria: [8.75, -75.88, 18], Barranquilla: [10.96, -74.8, 18], 'Santa Marta': [11.24, -74.2, 2], Valledupar: [10.46, -73.25, 169], Quito: [-0.18, -78.47, 2850], 'La Paz': [-16.5, -68.15, 3640], 'El Alto': [-16.5, -68.19, 4090], Cusco: [-13.53, -71.97, 3399], Sucre: [-19.05, -65.26, 2810], Cochabamba: [-17.39, -66.16, 2558], Lima: [-12.05, -77.04, 154], Guayaquil: [-2.19, -79.89, 4], Santiago: [-33.45, -70.67, 570], 'Buenos Aires': [-34.6, -58.38, 25], 'Sao Paulo': [-23.55, -46.63, 760], 'Rio de Janeiro': [-22.91, -43.17, 5], Montevideo: [-34.9, -56.16, 43], Asuncion: [-25.26, -57.58, 43], Caracas: [10.48, -66.9, 900] };
  const OUTLINE = [[12.4, -71.7], [10.6, -61.5], [7.5, -58.5], [5, -52], [-1.5, -48.5], [-5, -35.2], [-13, -38.5], [-23, -41.5], [-29, -48.8], [-34.5, -53.5], [-36, -57], [-39, -62], [-42, -64], [-47, -65.8], [-52.2, -68.4], [-55, -67], [-53, -72], [-46, -75.5], [-37, -73.5], [-30, -71.5], [-18.3, -70.3], [-14, -76.3], [-6, -81], [-2.5, -80.8], [1.5, -78.9], [7.2, -77.9], [8.6, -77.3], [9.5, -76], [11.2, -74.2]];
  const norm = (s) => String(s || '').split(',')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  B['5'] = (ctx) => {
    const A = ctx.p.altitude, lam = ctx.p.combos && ctx.p.combos.lam, mu = ctx.p.combos && ctx.p.combos.mu;
    const [hn, an] = teamNames(ctx);
    if (!A || A.cityM == null || A.awayM == null) return Object.assign(na('No conocemos la altura de una de las dos sedes de este partido.'), { how: null });
    const eff = (gap) => (A.delta != null && gap > 0 && lam ? lam * (Math.exp(A.delta * gap / 1000) - 1) : 0);
    const small = Math.abs(A.extraGoals || 0) < 0.03;
    const verdict = A.gap <= 0 ? esc(an) + ' viene de una ciudad igual o más alta: la altura no le juega en contra.' :
      A.delta == null ? 'La sede está ' + F.int(A.gap) + ' m más alta que la ciudad de ' + esc(an) + ', pero en esta liga no hay datos suficientes para medir el efecto.' :
        small ? 'La altura de ' + esc(norm(A.city)) + ' (' + F.int(A.cityM) + ' m) no muestra una ventaja extra en esta liga, más allá de jugar en casa.' :
          'La altura de ' + esc(norm(A.city)) + ' suma cerca de ' + num(A.extraGoals, 2) + ' goles esperados a ' + esc(hn) + '.';
    const map = (sel) => {
      const W = 220, Hh = 260, px = (lo) => ((lo + 82) / 48) * W, py = (la) => ((13 - la) / 50) * Hh;
      const dots = Object.entries(CITY).map(([n, v]) => '<circle class="lab-city' + (n === sel ? ' sel' : '') + '" cx="' + px(v[1]).toFixed(1) + '" cy="' + py(v[0]).toFixed(1) + '" r="' + (n === sel ? 5.5 : 2.5 + v[2] / 1300).toFixed(1) + '" style="--h:' + Math.min(1, v[2] / 4000).toFixed(2) + '"><title>' + n + ' · ' + F.int(v[2]) + ' m</title></circle>').join('');
      return '<svg class="lab-map" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Mapa de alturas de sedes en Sudamérica"><polygon class="lab-land" points="' + OUTLINE.map((p) => px(p[1]).toFixed(1) + ',' + py(p[0]).toFixed(1)).join(' ') + '"/>' + dots + '</svg>';
    };
    const sel0 = Object.keys(CITY).find((n) => norm(n).toLowerCase() === norm(A.city).toLowerCase()) || 'Bogota';
    const c = {
      verdict, big: F.int(Math.max(0, A.gap)) + ' m', range: 'de diferencia (' + esc(norm(A.city)) + ' ' + F.int(A.cityM) + ' m · ' + esc(norm(A.awayCity)) + ' ' + F.int(A.awayM) + ' m)',
      play: '<div class="lab-map-wrap"><div data-map>' + map(sel0) + '</div><div><label class="lab-field"><span>Cambiar la sede (hipotético)</span><select data-city>' + Object.entries(CITY).sort((a, b) => b[1][2] - a[1][2]).map(([n, v]) => '<option value="' + n + '"' + (n === sel0 ? ' selected' : '') + '>' + n + ' · ' + F.int(v[2]) + ' m</option>').join('') + '</select></label><p class="lab-out" data-out></p><p class="small muted">Referencia: en un estudio con 1.460 partidos de selecciones en Sudamérica, cada 1.000 m de diferencia valieron cerca de 0,4 goles a favor del equipo de altura.</p></div></div>',
      how: [['stadium', 'Altura de cada sede', 'Tabla propia con la altura de cada ciudad (se verifica antes de producción).'],
        ['plane', 'Ciudad del visitante', 'La ciudad donde más veces jugó de local.'],
        ['calc', 'Efecto en esta liga', A.delta == null ? 'Sin partidos suficientes para medirlo.' : 'Medido con partidos pasados: ' + (A.delta >= 0 ? '+' : '−') + num(Math.abs(A.delta * 100), 1) + ' % de goles del local por cada 1.000 m (margen ± ' + num((A.se || 0) * 100, 1) + ' %).']],
    };
    c.mount = (play) => {
      const s = play.querySelector('[data-city]'), out = play.querySelector('[data-out]');
      const upd = () => {
        const v = CITY[s.value], gap = v[2] - A.awayM, e = eff(gap);
        play.querySelector('[data-map]').innerHTML = map(s.value);
        const p = probs((lam || 1.3) + e, mu || 1.1);
        out.innerHTML = 'En ' + esc(s.value) + ': ' + (gap > 0 ? F.int(gap) + ' m más alto que la ciudad de ' + esc(an) : 'no más alto que la ciudad de ' + esc(an)) + '. Con lo medido en esta liga: ' + (e >= 0.01 ? '+' + num(e, 2) + ' goles esperados para ' + esc(hn) : 'sin cambio apreciable') + '. ' + esc(hn) + ' ganaría ' + P(p[0]) + '.';
      };
      on(s, 'change', upd); upd();
    };
    c.reset = (play) => { const s = play.querySelector('[data-city]'); s.value = sel0; s.dispatchEvent(new Event('change')); };
    return c;
  };

  // 6 · peligro de gol ahora
  B['6'] = (ctx) => {
    const V = ctx.p.live;
    if (!V) return Object.assign(na('Se enciende cuando el partido está en vivo: mide la probabilidad de gol en los próximos 5, 10 o 15 minutos.'), {
      how: [['fire', 'Ritmo de gol', 'Partimos de los goles esperados del partido; al final se marcan más goles que al principio.'],
        ['whistle', 'Lo que pasa en la cancha', 'Un gol o una expulsión pueden «calentar» el partido unos minutos; luego se enfría.'],
        ['scale', 'El marcador', 'Quien pierde ataca más y quien gana se repliega.']] });
    const lv = { alto: 'alto', medio: 'medio', bajo: 'bajo' }[V.level];
    const thermo = (p) => '<div class="lab-thermo" role="img" aria-label="Probabilidad de gol ' + P(p) + '"><div class="lab-thermo-tube"><i style="transform:scaleY(' + Math.min(1, p / 0.6).toFixed(3) + ')"></i></div><strong data-thermo-n>' + P(p) + '</strong></div>';
    const c = {
      verdict: 'Peligro ' + lv + ': ' + P(V.p10) + ' de gol en los próximos 10 minutos.',
      big: thermo(V.p10), range: 'minuto ' + V.minute,
      play: '<div class="lab-seg-ctl" role="group" aria-label="Ventana de tiempo">' + [5, 10, 15].map((w) => '<button type="button" class="chip" data-w="' + w + '" aria-pressed="' + (w === 10) + '">' + w + ' min</button>').join('') + '</div><p class="lab-out" data-out>' + P(V.p10) + ' de que haya al menos un gol en los próximos 10 minutos.</p>',
      how: [['fire', 'Ritmo de gol', 'Partimos de los goles esperados del partido; al final se marcan más goles que al principio.'],
        ['whistle', 'Lo que pasa en la cancha', 'Un gol o una expulsión pueden «calentar» el partido unos minutos; luego se enfría.'],
        ['clock', 'Actualización', 'Se recalcula con cada actualización del partido en vivo.']],
    };
    c.mount = (play) => {
      const set = (w) => { XP.$$('[data-w]', play).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === w))); play.querySelector('[data-out]').textContent = P(V['p' + w]) + ' de que haya al menos un gol en los próximos ' + w + ' minutos.'; };
      XP.$$('[data-w]', play).forEach((b) => on(b, 'click', () => set(+b.dataset.w)));
    };
    c.reset = (play) => { const b = play.querySelector('[data-w="10"]'); if (b) b.click(); };
    return c;
  };

  // 7 · movimientos fuertes
  B['7'] = (ctx) => {
    const M = ctx.p.market || { books: 0, steam: {}, reference: { points: [], moves: [] } };
    const ref = M.reference || { points: [], moves: [] };
    const names = [teamNames(ctx)[0], 'Empate', teamNames(ctx)[1]];
    const verdict = M.steam && M.steam.available ? 'Ningún movimiento fuerte detectado en este partido.' :
      'Con una sola casa en la fuente no se pueden detectar movimientos fuertes. ' + (ref.moves.length ? 'La casa de referencia movió la cuota ' + ref.moves.length + (ref.moves.length === 1 ? ' vez.' : ' veces.') : 'La casa de referencia no ha movido la cuota desde que la seguimos.');
    const chart = () => {
      const pt = ref.points;
      if (pt.length < 2) return '<p class="small muted">Aún no hay suficientes registros: guardamos cada cambio de cuota desde que el servidor está encendido.</p>';
      const W = 320, Hh = 130, t0 = pt[0][0], t1 = pt[pt.length - 1][0] || t0 + 1;
      const all = pt.flatMap((r) => [r[1], r[2], r[3]]), lo = Math.min(...all) - 0.02, hi = Math.max(...all) + 0.02;
      const x = (t) => 8 + (t - t0) / Math.max(1, t1 - t0) * (W - 16), y = (q) => Hh - 10 - (q - lo) / (hi - lo) * (Hh - 20);
      const lines = [0, 1, 2].map((k) => '<polyline class="lab-mline lab-mline-' + k + '" points="' + pt.map((r) => x(r[0]).toFixed(1) + ',' + y(r[k + 1]).toFixed(1)).join(' ') + '"/>').join('');
      const pulses = ref.moves.map((mv, i) => { const r = pt.find((p) => p[0] === mv.t) || pt[pt.length - 1]; return '<circle class="lab-pulse" style="--d:' + (i * 0.15).toFixed(2) + 's" cx="' + x(mv.t).toFixed(1) + '" cy="' + y(r[mv.sel + 1]).toFixed(1) + '" r="7"><title>' + esc(names[mv.sel]) + ': ' + (mv.d > 0 ? 'baja la cuota' : 'sube la cuota') + '</title></circle>'; }).join('');
      return '<svg class="lab-steam" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Probabilidad de la casa de referencia en el tiempo">' + lines + pulses + '</svg><div class="lab-bar3-lab small">' + names.map((n, i) => '<span><i class="lab-dot lab-dot-' + i + '"></i>' + esc(n) + '</span>').join('') + '</div>';
    };
    const c = {
      verdict, big: F.int(M.books || 0) + (M.books === 1 ? ' casa' : ' casas'), range: 'en la fuente actual',
      play: '<div data-steam>' + chart() + '</div><p class="small muted">' + I('info', 13) + ' La casa de referencia sí se movió en cada anillo. Un movimiento fuerte exige 3 o más casas moviéndose a la vez; perseguirlo tarde no sirve, porque la cuota de cierre ya lo incluye.</p>',
      how: [['bolt', 'Movimiento fuerte', 'Tres o más casas cambian la probabilidad más de medio punto en menos de 5 minutos, en la misma dirección, y una hora después sigue así.'],
        ['eye', 'Casa de referencia', 'Si la casa más afinada no se movió, probablemente no es dinero profesional.'],
        ['padlock', 'Lo que no hacemos', 'No mostramos «movimiento inverso»: exige saber cuánto apuesta el público, y ningún proveedor actual lo entrega.']],
    };
    c.reset = (play) => { play.querySelector('[data-steam]').innerHTML = chart(); };
    return c;
  };

  // 8 · ¿subirá o bajará?
  B['8'] = (ctx) => {
    const Cl = ctx.p.closing;
    if (!Cl) return na('Disponible para partidos por jugar con cuota de la casa.');
    const names = [teamNames(ctx)[0], 'el empate', teamNames(ctx)[1]], sels = ['1', 'X', '2'];
    const k = [0, 1, 2].sort((a, b) => Math.abs(Cl.forecast[b].delta) - Math.abs(Cl.forecast[a].delta))[0];
    const f = Cl.forecast[k];
    const m = ctx.m;
    const val = m && m.sel && m.sel[sels[k]] && m.sel[sels[k]].value;
    const st = ctx.flags['8'] || {};
    const sx = st.stats || {};
    const c = {
      verdict: 'La cuota de ' + esc(names[k]) + ' probablemente ' + f.dir + ' antes del inicio.',
      big: I(f.dir === 'baje' ? 'arrow-down' : f.dir === 'suba' ? 'arrow-up' : 'swap', 22) + ' ' + F.odds(Cl.odds[k]) + ' → ≈ ' + F.odds(1 / Math.max(0.01, f.close) * (Cl.odds[k] * f.now)),
      range: 'cuota de la casa hoy → al cierre',
      note: val && f.dir === 'suba' ? 'Ojo: Xpected ve valor en ' + esc(names[k]) + ', pero esta herramienta cree que su cuota subirá antes del inicio. Las dos lecturas no coinciden.' : null,
      play: '<ul class="lab-closing">' + Cl.forecast.map((x, i) => '<li><span>' + esc(names[i]) + '</span><strong>' + F.odds(Cl.odds[i]) + '</strong><span class="' + (x.dir === 'baje' ? 'down' : x.dir === 'suba' ? 'up' : 'muted') + '">' + I(x.dir === 'baje' ? 'arrow-down' : x.dir === 'suba' ? 'arrow-up' : 'swap', 14) + ' ' + x.dir + '</span></li>').join('') + '</ul>' +
        (sx.dirHit != null ? '<p class="small">En la prueba con partidos pasados acertó la dirección ' + num(sx.dirHit * 10, 1) + ' de cada 10 veces (' + F.int(sx.dirN) + ' movimientos).</p>' : ''),
      how: [['coin', 'Punto de partida', 'La cuota de hoy, sin el margen de la casa.'],
        ['target', 'Pista', 'Si nuestro modelo ve un resultado más probable que la casa, esa cuota suele bajar.'],
        ['chart', 'Aprendido de', 'Partidos pasados con su cuota de apertura y de cierre.']],
    };
    return c;
  };

  // 9 · apuestas juntas del mismo partido
  B['9'] = (ctx) => {
    const Cm = ctx.p.combos;
    if (!Cm || !Cm.lam) return na('Sin goles esperados para este partido.');
    const [hn, an] = teamNames(ctx);
    const OPTS = [['1', 'Gana ' + hn], ['X', 'Empate'], ['2', 'Gana ' + an], ['O2.5', 'Más de 2,5 goles'], ['U2.5', 'Menos de 2,5 goles'], ['BTTS-S', 'Ambos anotan'], ['BTTS-N', 'No anotan ambos'], ['O1.5', 'Más de 1,5 goles'], ['HO0.5', hn + ' anota'], ['AO0.5', an + ' anota']];
    const M = Q.scoreMatrix(Cm.lam, Cm.mu, Cm.rho, 10);
    const def = ['O2.5', 'BTTS-S'];
    const res = (ids) => LQ.correlation(M, ids, Cm.h0, Cm.a0);
    const r0 = res(def);
    const tell = (r) => (r.effect > 0.05 ? 'se ayudan entre sí.' : r.effect < -0.05 ? 'se estorban entre sí.' : 'casi no se relacionan.');
    const panel = (ids) => {
      if (ids.length < 2) return '<p class="small muted">Elige 2 o 3 selecciones.</p>';
      const r = res(ids);
      if (r.real <= 0) return '<p class="lab-out">Estas selecciones no pueden pasar juntas.</p>';
      return '<div class="lab-parlay"><div><small class="muted">Multiplicando</small><s class="lab-naive' + (reduced() ? '' : ' strike') + '">' + F.odds(r.fairNaive) + '</s></div><div><small class="muted">Cuota justa real</small><strong>' + F.odds(r.fairReal) + '</strong></div><div><small class="muted">Relación</small><strong class="' + (r.effect >= 0 ? 'up' : 'down') + '">' + (r.effect >= 0 ? '+' : '−') + num(Math.abs(r.effect * 100), 0) + ' %</strong></div></div><p class="small">Probabilidad real de que pasen juntas: <strong>' + P(r.real, 1) + '</strong> (multiplicando saldría ' + P(r.naive, 1) + ').</p>';
    };
    const c = {
      verdict: 'Más de 2,5 goles + ambos anotan: juntas no valen ' + F.odds(r0.fairNaive) + ', valen ' + F.odds(r0.fairReal) + '; ' + tell(r0),
      big: F.odds(r0.fairReal), range: 'en vez de ' + F.odds(r0.fairNaive),
      play: '<div class="lab-chips" role="group" aria-label="Selecciones (hasta 3)">' + OPTS.map((o) => '<button type="button" class="chip" data-sel="' + o[0] + '" aria-pressed="' + def.includes(o[0]) + '">' + esc(o[1]) + '</button>').join('') + '</div><div data-res>' + panel(def) + '</div>',
      note: 'Las casas suelen cobrar un margen extra en estas combinadas: compara con la cuota justa real.',
      how: [['table', 'Todos los marcadores', 'Usamos la probabilidad de cada marcador posible (0-0, 1-0, 2-1…).'],
        ['swap', 'Juntas', 'Sumamos solo los marcadores donde se cumplen todas tus selecciones. Multiplicar supone que no se relacionan, y en un mismo partido casi siempre se relacionan.']],
    };
    c.mount = (play) => {
      const upd = () => { const ids = XP.$$('[data-sel][aria-pressed="true"]', play).map((b) => b.dataset.sel); play.querySelector('[data-res]').innerHTML = panel(ids); };
      XP.$$('[data-sel]', play).forEach((b) => on(b, 'click', () => {
        const onNow = b.getAttribute('aria-pressed') === 'true';
        if (!onNow && XP.$$('[data-sel][aria-pressed="true"]', play).length >= 3) { XP.toast('Máximo 3 selecciones.'); return; }
        b.setAttribute('aria-pressed', String(!onNow)); upd();
      }));
    };
    c.reset = (play) => { XP.$$('[data-sel]', play).forEach((b) => b.setAttribute('aria-pressed', String(def.includes(b.dataset.sel)))); play.querySelector('[data-res]').innerHTML = panel(def); };
    return c;
  };

  // 10 · baloncesto (apagada)
  B['10'] = () => na('Apagada: la app todavía no tiene datos de baloncesto. El cálculo está listo para cuando los tenga.');

  // 11 · córners y tarjetas
  B['11'] = (ctx) => {
    const Cs = ctx.p.counts || {};
    if (!Cs.corners) return na('Sin datos de córners para este partido.');
    const K = { corners: ['córners', 5.5, 14.5], cards: ['tarjetas', 1.5, 8.5] };
    const hist = (d, line) => { const mx = Math.max(...d.dist); return '<div class="lab-hist" role="img" aria-label="Distribución">' + d.dist.map((p, k) => '<span class="' + (k > line ? 'over' : '') + '" style="transform:scaleY(' + (p / mx).toFixed(3) + ')" title="' + k + ': ' + P(p) + '"></span>').join('') + '</div><div class="lab-hist-ax small muted"><span>0</span><span>' + Math.floor(d.dist.length / 2) + '</span><span>' + (d.dist.length - 1) + '</span></div>'; };
    const over = (d, line) => d.dist.reduce((s, p, k) => s + (k > line ? p : 0), 0);
    const r = Cs.corners.range80;
    const c = {
      verdict: 'Entre ' + r[0] + ' y ' + r[1] + ' córners con 80 % de cobertura.',
      big: num(Cs.corners.mu, 1) + ' córners', range: 'esperados',
      play: '<div class="lab-seg-ctl" role="group" aria-label="Conteo"><button type="button" class="chip" data-k="corners" aria-pressed="true">Córners</button>' + (Cs.cards ? '<button type="button" class="chip" data-k="cards" aria-pressed="false">Tarjetas</button>' : '') + '</div><div data-h></div>' +
        '<label class="lab-field"><span>Línea: <output data-lo></output></span><input type="range" data-line step="1" min="0" max="10"></label><p class="lab-out" data-out></p><p class="small muted">Árbitro: la fuente no lo publica, así que no lo usamos.</p>',
      how: [['flag', 'Promedio de la liga', 'Cuántos córners y tarjetas hay por partido en esta liga.'],
        ['users', 'Los dos equipos', 'Cuántos sacan y cuántos conceden, acercados al promedio si llevan pocos partidos.'],
        ['chart', 'Rachas', 'Los córners llegan en rachas: por eso el rango es más ancho que en los goles.']],
      note: 'Mercado difícil: úsalo como referencia, no como señal.',
    };
    c.mount = (play) => {
      let kind = 'corners';
      const sl = play.querySelector('[data-line]');
      const upd = () => {
        const d = Cs[kind], k = K[kind], line = k[1] + +sl.value;
        play.querySelector('[data-lo]').textContent = 'más de ' + num(line, 1);
        play.querySelector('[data-h]').innerHTML = hist(d, line);
        play.querySelector('[data-out]').textContent = 'Más de ' + num(line, 1) + ' ' + k[0] + ': ' + P(over(d, line)) + ' · rango con 80 % de cobertura: ' + d.range80[0] + ' a ' + d.range80[1] + '.';
        sl.setAttribute('aria-valuetext', 'más de ' + num(line, 1));
      };
      const setKind = (kk) => { kind = kk; sl.max = String(K[kk][2] - K[kk][1]); sl.value = String(Math.round(Cs[kk].line - K[kk][1])); XP.$$('[data-k]', play).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === kk))); upd(); };
      XP.$$('[data-k]', play).forEach((b) => on(b, 'click', () => setKind(b.dataset.k)));
      on(sl, 'input', upd);
      setKind('corners');
      play._reset = () => setKind('corners');
    };
    c.reset = (play) => play._reset && play._reset();
    return c;
  };

  // 12 · ¿qué tan seguro es cada número?
  B['12'] = (ctx) => {
    const R = ctx.p.ranges;
    if (!R || !R.probs || !R.p) return na('Sin rangos para este partido.');
    const names = [teamNames(ctx)[0], 'Empate', teamNames(ctx)[1]], keys = ['1', 'X', '2'];
    const fav = R.p.indexOf(Math.max(...R.p));
    const setTxt = (lvl) => { const s = R.conformal && R.conformal[lvl]; if (!s) return null; if (s.set.length === 3) return 'cualquier resultado es posible (partido abierto)'; return s.set.map((i) => (i === 1 ? 'empate' : 'gana ' + esc(names[i]))).join(' o '); };
    const st90 = setTxt('0.1');
    const whiskers = () => '<ul class="lab-whisk">' + [0, 1, 2].map((i) => { const r = R.probs[keys[i]]; return '<li><span>' + esc(names[i]) + '</span><span class="lab-whisk-track"><i class="rg" style="transform:translateX(' + (r[0] * 100).toFixed(1) + '%) scaleX(' + Math.max(0.005, r[1] - r[0]).toFixed(4) + ')"></i><b style="transform:translateX(' + (R.p[i] * 100).toFixed(1) + '%)"></b></span><strong>' + P(R.p[i]) + ' <small class="muted">(' + P(r[0]) + '–' + P(r[1]) + ')</small></strong></li>'; }).join('') + '</ul>';
    const c = {
      verdict: st90 ? 'Con 90 % de cobertura: ' + st90 + '.' : 'Rango de cada probabilidad de este partido.',
      big: P(R.p[fav]), range: '(' + P(R.probs[keys[fav]][0]) + '–' + P(R.probs[keys[fav]][1]) + ') ' + (fav === 1 ? 'empate' : 'gana ' + esc(names[fav])),
      play: whiskers() + (R.conformal ? '<div class="lab-seg-ctl" role="group" aria-label="Cobertura">' + [['0.2', '80 %'], ['0.1', '90 %'], ['0.05', '95 %']].map(([k, t]) => '<button type="button" class="chip" data-lvl="' + k + '" aria-pressed="' + (k === '0.1') + '">' + t + '</button>').join('') + '</div><p class="lab-out" data-out>Con 90 % de cobertura: ' + st90 + '.</p>' : '') +
        '<label class="lab-switch"><input type="checkbox" data-global' + (XP.settings.labRanges ? ' checked' : '') + '> Mostrar el rango junto a cada probabilidad en toda la app</label>',
      how: [['target', 'Rango de cada número', 'Probamos 200 escenarios posibles de la fuerza de los equipos y mostramos el 90 % central.'],
        ['shield', 'Resultados posibles', 'Con partidos ya jugados medimos cuánto se equivocan nuestros números y armamos el grupo más pequeño de resultados que acierta 9 de cada 10 veces; en cada partido, el grupo nunca suma menos que esa probabilidad.']],
    };
    c.mount = (play) => {
      XP.$$('[data-lvl]', play).forEach((b) => on(b, 'click', () => { XP.$$('[data-lvl]', play).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); const lv = Math.round((1 - +b.dataset.lvl) * 100); play.querySelector('[data-out]').textContent = 'Con ' + lv + ' % de cobertura: ' + setTxt(b.dataset.lvl) + '.'; }));
      const g = play.querySelector('[data-global]');
      if (g) on(g, 'change', () => { XP.setSetting('labRanges', g.checked); ranges.decorate(true); XP.toast(g.checked ? 'Rangos visibles en toda la app.' : 'Rangos ocultos.'); });
    };
    c.reset = (play) => { const b = play.querySelector('[data-lvl="0.1"]'); if (b) b.click(); };
    return c;
  };

  // ════════════════════════ 13 · simulador de temporada ════════════════════════
  const LEAGUE_SLUGS = [['liga-betplay', 'Liga BetPlay'], ['premier-league', 'Premier League'], ['laliga', 'LaLiga']];
  let worker = null;
  function seasonCard(slug, flagsAll) {
    const id = 'lab13-' + ++uid;
    return '<article class="lab-card tile lab-wide" id="' + id + '" data-strategy="13" data-season="' + slug + '" aria-labelledby="' + id + '-t"><header class="lab-head"><span class="lab-ico" aria-hidden="true">' + I('trophy', 20) + '</span><div class="lab-ht"><h3 class="lab-title" id="' + id + '-t">Simulador de temporada</h3><p class="muted small">Campeón, clasificación y descenso en miles de temporadas.</p></div><span data-light></span></header>' +
      '<div class="lab-seg-ctl" role="group" aria-label="Liga">' + LEAGUE_SLUGS.map(([s, n]) => '<button type="button" class="chip" data-league="' + s + '" aria-pressed="' + (s === slug) + '">' + n + '</button>').join('') + '</div><div data-season-body><p class="muted">Cargando simulación…</p></div></article>';
  }
  function mountSeason(el) {
    const body = () => el.querySelector('[data-season-body]');
    const load = (slug) => {
      el.dataset.season = slug;
      XP.$$('[data-league]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.league === slug)));
      body().innerHTML = '<p class="muted">Cargando simulación…</p>';
      api('season/' + slug).then((S) => {
        if (!el.isConnected) return;
        if (!S.result) { body().innerHTML = '<p class="muted">' + esc(S.missing || 'Simulador no disponible todavía.') + '</p>'; return; }
        renderSeason(el, S);
      }).catch(() => { body().innerHTML = '<p class="muted">No se pudo cargar la simulación. ¿Está encendido el servidor de datos?</p>'; });
    };
    XP.$$('[data-league]', el).forEach((b) => on(b, 'click', () => load(b.dataset.league)));
    load(el.dataset.season);
  }
  function renderSeason(el, S) {
    const st = (S.flags || {})['13'] || {};
    const light = st.status === 'publicada' ? st.light || 'media' : 'educativa';
    el.querySelector('[data-light]').innerHTML = lightChip(light, el.id);
    XP.$$('.lab-tip', el).forEach((b) => on(b, 'click', () => b.parentElement.classList.toggle('show')));
    const col = S.format.type === 'col-cuadrangulares';
    const cols = col ? [['champ', 'Campeón'], ['playoff', 'Cuadrangulares'], ['final', 'Final'], ['bottom', 'Desciende']] : [['champ', 'Campeón'], ['top', S.format.top + ' primeros'], ['bottom', 'Desciende']];
    const fixed = {};
    const upcoming = S.fixtures.filter((f) => f.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 40);
    let res = S.result.teams, n = S.result.n, custom = false;
    const sorted = () => Object.keys(res).sort((a, b) => (res[b].champ - res[a].champ) || (res[b].playoff || res[b].top) - (res[a].playoff || res[a].top) || res[a].pos - res[b].pos);
    const lead = () => { const t = sorted()[0]; return esc(S.names[t]) + ' es campeón en ' + P(res[t].champ) + ' de ' + F.int(n) + ' temporadas simuladas' + (col ? ' y llega a la final en ' + P(res[t].final) : '') + '.'; };
    const table = () => '<div class="lab-sim-head small muted" style="--cols:' + cols.length + '"><span>Equipo</span>' + cols.map((c) => '<span>' + c[1] + '</span>').join('') + '</div><ol class="lab-sim" data-sim style="--cols:' + cols.length + '">' + sorted().map((id) => '<li data-flip="' + id + '"><span class="lab-sim-team">' + esc(S.names[id]) + ' <small class="muted">' + S.table[id].pts + ' pts</small></span>' +
      cols.map(([k]) => { const v = res[id][k] || 0; return '<span class="lab-sim-cell ' + k + '"><i style="transform:scaleX(' + v.toFixed(4) + ')"></i><b>' + (v < 0.0005 ? '—' : P(v)) + '</b></span>'; }).join('') + '</li>').join('') + '</ol>';
    body(el).innerHTML = '<p class="lab-verdict" aria-live="polite" data-lead>' + lead() + '</p>' +
      '<button type="button" class="btn btn-sm lab-try" aria-expanded="false">' + I('sparkle', 14) + ' Pruébalo: fijar resultados</button>' +
      '<div class="lab-play" hidden><div class="lab-fix"><label class="lab-field"><span>Partido</span><select data-fx>' + upcoming.map((f) => '<option value="' + esc(f.id) + '">' + esc(f.hn + ' vs ' + f.an) + ' · ' + F.dateTime(new Date(f.date)) + '</option>').join('') + '</select></label>' +
      '<div class="lab-seg-ctl" role="group" aria-label="Resultado"><button type="button" class="chip" data-out="1">Gana local</button><button type="button" class="chip" data-out="X">Empate</button><button type="button" class="chip" data-out="2">Gana visitante</button></div></div>' +
      '<ul class="lab-fixed" data-fixed></ul><p class="small muted" data-simnote></p><div class="lab-play-foot"><button type="button" class="btn btn-sm btn-ghost lab-reset">' + I('swap', 14) + ' Restablecer</button></div></div>' +
      '<div data-table>' + table() + '</div>' +
      '<details class="lab-how"' + (mode() === 'experto' ? ' open' : '') + '><summary>' + I('info', 14) + ' Cómo lo calculamos</summary><ul class="detail-list">' +
      [['trend-up', 'Fuerza de cada equipo', 'La de «Fuerza semana a semana», con su duda: en cada temporada simulada los equipos pueden rendir un poco más o menos.'],
        ['calendar', 'Lo que falta', F.int(S.fixtures.length) + ' partidos por jugar.'],
        ['flag', 'Formato', esc(S.format.rules)]].concat(S.format.assumptions ? [['info', 'Supuestos', esc(S.format.assumptions)]] : [])
        .concat([['scale', 'Precisión', 'Con ' + F.int(S.result.n) + ' temporadas, cada porcentaje tiene un margen de ±' + num(S.result.maxSE * 100, 1) + ' puntos.']])
        .map((r) => '<li>' + I(r[0], 16) + '<span class="dl-k">' + r[1] + '</span><span class="dl-v">' + r[2] + '</span></li>').join('') + '</ul><p class="muted small">' + I('shield', 13) + ' ' + testLine(st) + '</p></details>';
    function body(e) { return e.querySelector('[data-season-body]'); }
    const b = body(el);
    const tb = b.querySelector('[data-table]'), note = b.querySelector('[data-simnote]');
    const repaint = () => {
      const before = {}; XP.$$('[data-flip]', tb).forEach((li) => { before[li.dataset.flip] = li.getBoundingClientRect().top; });
      tb.innerHTML = table();
      b.querySelector('[data-lead]').innerHTML = lead();
      if (!reduced()) XP.$$('[data-flip]', tb).forEach((li) => { const t0 = before[li.dataset.flip]; if (t0 == null) return; const dy = t0 - li.getBoundingClientRect().top; if (Math.abs(dy) < 1) return; li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
    };
    const fixedList = () => { const ul = b.querySelector('[data-fixed]'); ul.innerHTML = Object.entries(fixed).map(([fid, o]) => { const f = S.fixtures.find((x) => x.id === fid); return '<li class="chip">' + esc(f.hn + ' vs ' + f.an) + ': ' + (o === '1' ? 'gana ' + esc(f.hn) : o === '2' ? 'gana ' + esc(f.an) : 'empate') + ' <button type="button" class="lab-x" data-un="' + esc(fid) + '" aria-label="Quitar">×</button></li>'; }).join(''); XP.$$('[data-un]', ul).forEach((x) => on(x, 'click', () => { delete fixed[x.dataset.un]; fixedList(); run(); })); };
    let token = 0;
    const run = () => {
      if (!Object.keys(fixed).length) { res = S.result.teams; n = S.result.n; custom = false; note.textContent = ''; repaint(); return; }
      if (!window.Worker) return;
      if (!worker) worker = new Worker('assets/js/lab/lab-worker.js');
      const my = ++token;
      note.textContent = 'Simulando 2.000 temporadas con tus resultados…';
      worker.onmessage = (e) => { if (e.data.token !== my || !el.isConnected) return; res = e.data.res; n = e.data.n; custom = true; note.textContent = 'Con tus resultados fijados · ' + F.int(n) + ' temporadas (' + e.data.ms + ' ms). Restablecer vuelve a las 10.000 oficiales.'; repaint(); };
      worker.postMessage({ model: S.model, table: S.table, fixtures: S.fixtures, format: S.format, n: 2000, fixed, seed: 7, results: S.results, relegation: S.relegation, token: my });
    };
    const tryBtn = b.querySelector('.lab-try'), play = b.querySelector('.lab-play');
    on(tryBtn, 'click', () => { const o = tryBtn.getAttribute('aria-expanded') === 'true'; tryBtn.setAttribute('aria-expanded', String(!o)); play.hidden = o; });
    XP.$$('[data-out]', b).forEach((x) => on(x, 'click', () => { const fid = b.querySelector('[data-fx]').value; if (!fid) return; fixed[fid] = x.dataset.out; fixedList(); run(); }));
    on(b.querySelector('.lab-reset'), 'click', () => { Object.keys(fixed).forEach((k) => delete fixed[k]); fixedList(); run(); });
    if (!upcoming.length) play.innerHTML = '<p class="muted small">No quedan partidos con fecha por jugar en esta fase.</p>';
    void custom;
  }

  // ════════════════════════ 14 · cuánto arriesgar con varias apuestas ════════════════════════
  /** Devuelve { html, c }: c lleva el montaje de la interacción. */
  function portfolioCard(st) {
    const def = byId['14'];
    if (XP.isSelfExcluded()) return { html: card(def, st, na(I('padlock', 14) + ' Funciones de apuestas en pausa por tu autoexclusión.')), c: {} };
    const picks = selections();
    if (picks.list.length < 2) return { html: card(def, st, Object.assign(na('Agrega al menos 2 selecciones con cuota a tu boleto (o espera a que el radar encuentre cuotas con valor) para repartir la banca entre ellas.'), { how: howBank() })), c: {} };
    const bank = XP.settings.bankroll;
    const pf = LQ.portfolio(picks.list.map((x) => ({ p: x.p, o: x.o })), { floor: 0.7, prob: 0.1, maxPct: XP.settings.maxStakePct, maxExposure: XP.settings.maxExposurePct });
    const c = {
      verdict: (picks.from === 'boleto' ? 'Con tus ' : 'Con las ') + picks.list.length + ' selecciones' + (picks.from === 'boleto' ? '' : ' con valor de hoy') + ', arriesga en total ' + P(pf.total, 1) + ' de tu banca.',
      big: F.money(pf.total * bank), range: 'repartido en ' + picks.list.length,
      play: '<label class="lab-field"><span>No quiero caer por debajo del <output data-fo>70 %</output> de mi banca…</span><input type="range" min="50" max="90" step="5" value="70" data-floor></label>' +
        '<label class="lab-field"><span>…con más de <output data-po>10 %</output> de probabilidad</span><input type="range" min="5" max="25" step="5" value="10" data-prob></label>' +
        '<ul class="lab-stakes" data-stakes></ul><canvas class="lab-paths" width="640" height="200" data-paths aria-label="Trayectorias simuladas de la banca" role="img"></canvas><p class="lab-out small" data-pout></p>',
      how: howBank(),
      note: 'Supone que nuestras probabilidades son correctas. Nunca supera tus topes por apuesta (' + P(XP.settings.maxStakePct, 1) + ') ni en total (' + P(XP.settings.maxExposurePct, 1) + ').',
    };
    c.mount = (play) => {
      const fl = play.querySelector('[data-floor]'), pr = play.querySelector('[data-prob]');
      const upd = (anim) => {
        const floor = +fl.value / 100, prob = +pr.value / 100;
        play.querySelector('[data-fo]').textContent = fl.value + ' %'; play.querySelector('[data-po]').textContent = pr.value + ' %';
        const bets = picks.list.map((x) => ({ p: x.p, o: x.o }));
        const r = LQ.portfolio(bets, { floor, prob, maxPct: XP.settings.maxStakePct, maxExposure: XP.settings.maxExposurePct });
        play.querySelector('[data-stakes]').innerHTML = picks.list.map((x, i) => '<li><span>' + esc(x.label) + ' <small class="muted">' + esc(x.match) + ' · ' + F.odds(x.o) + '</small></span><strong>' + F.money(r.stakes[i] * bank) + '</strong></li>').join('') + '<li class="total"><span>Total</span><strong>' + F.money(r.total * bank) + ' (' + P(r.total, 1) + ')</strong></li>';
        drawPaths(play.querySelector('[data-paths]'), bets, r.stakes, floor, play.querySelector('[data-pout]'), anim);
      };
      on(fl, 'input', () => upd(false)); on(pr, 'input', () => upd(false));
      upd(true);
      play._reset = () => { fl.value = 70; pr.value = 10; upd(true); };
    };
    c.reset = (play) => play._reset && play._reset();
    return { html: card(def, st, c), c };
  }
  function howBank() {
    return [['wallet', 'Cada apuesta sola', 'Calculamos la fracción de la banca que más la haría crecer a la larga.'],
      ['shield', 'Todas juntas', 'Las reducimos a la vez hasta que la probabilidad de caer por debajo de tu límite quede donde la aceptas.'],
      ['padlock', 'Topes de la app', 'Nunca más de lo que definiste en Cuenta por apuesta ni en total.']];
  }
  function selections() {
    const out = [];
    (XP.slip ? XP.slip.items : []).forEach((it) => { const m = D().byId[it.mid]; const s = m && m.sel && m.sel[it.sid]; if (s && s.best != null && m.status !== 'final') out.push({ p: s.pFinal, o: s.best, label: s.label, match: it.match }); });
    if (out.length >= 2) return { from: 'boleto', list: out.slice(0, 10) };
    const rows = XP.valueRows ? XP.valueRows() : [];
    const seen = new Set(), list = [];
    rows.forEach((r) => { if (seen.has(r.m.id) || list.length >= 4) return; seen.add(r.m.id); list.push({ p: r.s.pFinal, o: r.s.best, label: r.s.label, match: D().teams[r.m.home].name + ' vs ' + D().teams[r.m.away].name }); });
    return { from: 'radar', list };
  }
  function drawPaths(cv, bets, stakes, floor, out, anim) {
    const sim = LQ.paths(bets, stakes, 40, 1000, 11);
    const below = sim.paths.filter((p) => Math.min(...p) < floor).length / sim.paths.length;
    out.textContent = 'En 1.000 simulaciones de 40 rondas, la banca cayó por debajo del ' + Math.round(floor * 100) + ' % en ' + P(below, 1) + ' de los casos.';
    const ctx = cv.getContext('2d'), W = cv.width, Hh = cv.height;
    const all = sim.paths.flat(), lo = Math.min(floor - 0.05, ...all), hi = Math.max(1.1, ...all);
    const x = (t) => (t / 40) * W, y = (v) => Hh - ((v - lo) / (hi - lo)) * Hh;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#C8FF2E', warn = css.getPropertyValue('--warn').trim() || '#f5a524', muted = css.getPropertyValue('--text-3').trim() || '#888';
    const base = () => { ctx.clearRect(0, 0, W, Hh); ctx.strokeStyle = warn; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(0, y(floor)); ctx.lineTo(W, y(floor)); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(0, y(1)); ctx.lineTo(W, y(1)); ctx.stroke(); };
    if (reduced()) {
      // variante estática: banda del 10 % al 90 %
      base();
      const [p10, p50, p90] = LQ.percentiles(sim.paths, [0.1, 0.5, 0.9]);
      ctx.fillStyle = accent; ctx.globalAlpha = 0.2; ctx.beginPath(); p90.forEach((v, t) => ctx.lineTo(x(t), y(v))); p10.slice().reverse().forEach((v, i) => ctx.lineTo(x(40 - i), y(v))); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.beginPath(); p50.forEach((v, t) => ctx.lineTo(x(t), y(v))); ctx.stroke();
      return;
    }
    base();
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.06; ctx.lineWidth = 1;
    const drawUpTo = (k0, k1) => { for (let k = k0; k < k1; k++) { const p = sim.paths[k]; ctx.beginPath(); p.forEach((v, t) => ctx.lineTo(x(t), y(v))); ctx.stroke(); } };
    if (!anim) { drawUpTo(0, 1000); ctx.globalAlpha = 1; return; }
    const t0 = performance.now(); let done = 0;
    const step = (now) => { if (!cv.isConnected) return; const k = Math.min(1000, Math.round(((now - t0) / 1200) * 1000)); drawUpTo(done, k); done = k; if (k < 1000) requestAnimationFrame(step); else ctx.globalAlpha = 1; };
    requestAnimationFrame(step);
  }

  // ════════════════════════ armado de páginas ════════════════════════
  function contextFor(mid) {
    const id = String(mid).replace(/^x-/, '');
    return api('match/' + encodeURIComponent(id)).then((p) => ({ p, m: D().byId['x-' + id] || D().byId[mid] || null, flags: p.flags || {} }));
  }
  const MATCH_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12'];
  function cardsFor(ctx, ids) {
    const html = [], built = [];
    ids.forEach((id) => {
      const st = ctx.flags[id] || { status: 'educativa' };
      if (st.status === 'apagada' && mode() === 'simple') return;
      if (mode() === 'simple' && st.status === 'publicada' && st.light === 'baja') return; // en Simple se ocultan las de confiabilidad baja
      let c;
      try { c = B[id](ctx); } catch (e) { c = na('No se pudo calcular esta herramienta para este partido.'); }
      html.push(card(byId[id], st, c)); built.push(c);
    });
    return { html: html.join(''), built };
  }
  function wireAll(root, built) { XP.$$('.lab-card[data-strategy]:not([data-season])', root).forEach((el, i) => wire(el, built[i] || {})); }

  function matchOptions(sel) {
    const ms = D().matches.filter((m) => m.ext && m.status !== 'final').sort((a, b) => (a.status === 'vivo' ? -1 : 0) - (b.status === 'vivo' ? -1 : 0) || a.kickoff - b.kickoff);
    return ms.map((m) => '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(D().teams[m.home].name + ' vs ' + D().teams[m.away].name) + ' · ' + (m.status === 'vivo' ? 'en vivo' : F.dateTime(m.kickoff)) + '</option>').join('');
  }

  const XLab = {};
  XLab.destroy = function () { cleanup.forEach((f) => f()); cleanup = []; timers.forEach(clearInterval); timers = []; };

  XLab.mountLab = function (root, params) {
    const host = root.querySelector('.lab-loading');
    if (params && params.view === 'catalogo') { host.outerHTML = catalog(); wireAll(root, CATALOG_EX); return; }
    host.outerHTML = '<div class="lab-bar"><div class="lab-seg-ctl" role="group" aria-label="Modo"><button type="button" class="chip" data-mode="simple" aria-pressed="' + (mode() === 'simple') + '">Simple</button><button type="button" class="chip" data-mode="experto" aria-pressed="' + (mode() === 'experto') + '">Experto</button></div>' +
      '<label class="lab-field lab-pick"><span>Partido para analizar</span><select data-match><option value="">Cargando partidos…</option></select></label><button type="button" class="btn btn-sm btn-ghost" data-tour>' + I('info', 14) + ' Cómo funciona</button></div>' +
      '<p class="lab-honest small">' + I('shield', 14) + ' Más avanzado no significa ganar más: estas herramientas miden mejor la duda y explican el porqué. El mercado sigue siendo difícil de batir. Cada una se publica solo si mejoró en una prueba con partidos pasados; si no, queda en <strong>modo aprendizaje</strong> y no marca apuestas de valor.</p>' +
      '<div data-lab-body><p class="muted">Cargando herramientas…</p></div>';
    const sel = root.querySelector('[data-match]'), bodyEl = root.querySelector('[data-lab-body]');
    XP.$$('[data-mode]', root).forEach((b) => on(b, 'click', () => { XP.LS.set('lab:mode', b.dataset.mode); XP.$$('[data-mode]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
    on(root.querySelector('[data-tour]'), 'click', tour);
    let current = null, overview = null;
    const render = () => {
      if (!current) return;
      const ctx = current;
      const groups = FAMILIES.map(([f, name]) => {
        const ids = CATALOG.filter((c) => c.fam === f).map((c) => c.id);
        const parts = [];
        const matchIds = ids.filter((id) => MATCH_IDS.includes(id) || id === '10');
        const r = cardsFor(ctx, matchIds);
        parts.push(r.html);
        if (ids.includes('13')) parts.push(seasonCard(ctx.p.season || 'liga-betplay'));
        let pf = null;
        if (ids.includes('14')) { pf = portfolioCard(ctx.flags['14'] || {}); parts.push(pf.html); }
        return { f, name, html: parts.join(''), built: r.built, pf: pf ? pf.c : null };
      }).filter((g) => g.html);
      bodyEl.innerHTML = groups.map((g) => '<section class="lab-family" aria-labelledby="fam-' + g.f + '"><h2 class="h3" id="fam-' + g.f + '">' + g.name + '</h2><div class="lab-grid" data-fam="' + g.f + '"></div></section>').join('');
      groups.forEach((g) => {
        const grid = bodyEl.querySelector('[data-fam="' + g.f + '"]');
        grid.innerHTML = g.html;
        XP.$$('.lab-card[data-strategy]:not([data-season])', grid).forEach((el) => { wire(el, el.dataset.strategy === '14' ? g.pf || {} : g.built.shift() || {}); });
        const sc = grid.querySelector('[data-season]'); if (sc) mountSeason(sc);
      });
      if (XP.fx) XP.fx.scan(bodyEl);
    };
    const pick = (mid) => {
      bodyEl.setAttribute('aria-busy', 'true');
      contextFor(mid).then((ctx) => {
        if (!root.isConnected) return;
        bodyEl.removeAttribute('aria-busy');
        if (!ctx.p.ready) { bodyEl.innerHTML = '<p class="muted">El laboratorio está preparando el historial de partidos (la primera vez tarda unos minutos). Vuelve a intentar en un momento.</p>'; return; }
        current = ctx; render();
      }).catch(() => { bodyEl.innerHTML = '<div class="empty"><h2 class="h3">El laboratorio necesita el servidor de datos</h2><p class="muted">Abre la app con <code>node server.js</code> para ver las herramientas con partidos reales.</p></div>'; });
    };
    on(sel, 'change', () => { if (sel.value) pick(sel.value); });
    api('overview').then((o) => {
      overview = o;
      const fid = o.featured ? 'x-' + o.featured : null;
      const opts = matchOptions(fid);
      sel.innerHTML = opts || '<option value="">Sin partidos disponibles</option>';
      const first = fid && D().byId[fid] ? fid : sel.value;
      if (first) { sel.value = first; pick(first); } else bodyEl.innerHTML = '<p class="muted">Sin partidos con datos ahora mismo.</p>';
      if (!XP.LS.get('lab:tour', false)) setTimeout(tour, 600);
    }).catch(() => { sel.innerHTML = '<option value="">Sin servidor</option>'; bodyEl.innerHTML = '<div class="empty"><h2 class="h3">El laboratorio necesita el servidor de datos</h2><p class="muted">Abre la app con <code>node server.js</code> para ver las herramientas con partidos reales.</p></div>'; });
    every(60e3, () => { if (current && sel.value && document.visibilityState === 'visible' && !root.querySelector('.lab-play:not([hidden])')) pick(sel.value); });
    listenIntensity(() => current && current.p.id, (it) => { const el = root.querySelector('[data-strategy="6"] .lab-thermo'); if (el) updateThermo(el, it); });
    void overview;
  };
  function updateThermo(el, it) {
    const i = el.querySelector('.lab-thermo-tube i'), n = el.querySelector('[data-thermo-n]');
    if (i) i.style.transform = 'scaleY(' + Math.min(1, it.p10 / 0.6).toFixed(3) + ')';
    if (n) n.textContent = P(it.p10);
  }
  function listenIntensity(getId, fn) {
    const h = (e) => { try { const d = JSON.parse(e.data); const id = getId(); (d.items || []).forEach((it) => { if (it.eventId === id) fn(it); }); } catch (err) { /* noop */ } };
    let es = null;
    const attach = () => { const cur = XP.feed && XP.feed.es; if (cur && cur !== es) { if (es) es.removeEventListener('intensity', h); es = cur; es.addEventListener('intensity', h); } };
    attach(); every(5000, attach);
    cleanup.push(() => { if (es) es.removeEventListener('intensity', h); });
  }

  // pestaña «Avanzado» del partido
  XLab.mountAdvanced = function (el, mid) {
    contextFor(mid).then((ctx) => {
      if (!el.isConnected) return;
      if (!ctx.p.ready) { el.innerHTML = '<p class="muted">El laboratorio está preparando el historial de partidos. Vuelve en un momento.</p>'; return; }
      if (ctx.p.missing) { el.innerHTML = '<p class="muted">' + esc(ctx.p.missing) + '</p>'; return; }
      const r = cardsFor(ctx, MATCH_IDS);
      el.innerHTML = '<p class="lab-honest small">' + I('sparkle', 14) + ' Herramientas avanzadas para este partido, explicadas fácil. <a href="#/laboratorio">Abrir el Laboratorio</a>' + (ctx.p.season ? ' · <a href="#/ligas/' + ctx.p.season + '">Simulador de la temporada</a>' : '') + '</p><div class="lab-grid">' + r.html + '</div>';
      wireAll(el, r.built);
      listenIntensity(() => ctx.p.id, (it) => { const t = el.querySelector('[data-strategy="6"] .lab-thermo'); if (t) updateThermo(t, it); });
    }).catch(() => { el.innerHTML = '<p class="muted">Las herramientas avanzadas necesitan el servidor de datos (<code>node server.js</code>).</p>'; });
  };

  // #/ligas/:slug
  XLab.mountLeague = function (root, params) {
    const slug = (params && params.slug) || 'liga-betplay';
    const name = (LEAGUE_SLUGS.find((x) => x[0] === slug) || [slug, slug])[1];
    root.querySelector('h1').textContent = 'Simulador · ' + name;
    document.title = 'Simulador · ' + name + ' · ' + XP.cfg.brand.name;
    root.querySelector('.lab-loading').outerHTML = '<p class="small"><a href="#/laboratorio">' + I('chevron-right', 13) + ' Volver al Laboratorio</a></p>' + seasonCard(slug);
    mountSeason(root.querySelector('[data-season]'));
  };

  // recorrido de la primera visita (3 pasos)
  function tour() {
    const steps = [
      ['1 de 3 · El veredicto', 'Cada tarjeta empieza con una frase simple y un número grande con su rango. Eso es lo importante.'],
      ['2 de 3 · Pruébalo', 'Un solo control (un interruptor, una barra o una lista) para ver «¿y si…?». «Restablecer» lo deja como estaba.'],
      ['3 de 3 · El semáforo', 'Confiabilidad alta, media o baja según cómo le fue con partidos pasados. «Modo aprendizaje» = todavía no mejoró lo suficiente: sirve para entender, no para apostar.'],
    ];
    let i = 0;
    const html = () => '<div class="lab-tour"><h2 class="h3">' + steps[i][0] + '</h2><p>' + steps[i][1] + '</p><div class="cta-row"><button type="button" class="btn btn-sm btn-ghost" data-skip>Saltar</button><button type="button" class="btn btn-sm btn-accent" data-next>' + (i < 2 ? 'Siguiente' : 'Listo') + '</button></div></div>';
    const md = XP.openModal(html(), { label: 'Cómo funciona el laboratorio' });
    const box = XP.$$('.modal-wrap:not(.out) .modal').pop();
    const bind = () => {
      box.querySelector('[data-next]').focus();
      box.querySelector('[data-next]').addEventListener('click', () => { if (i < 2) { i++; box.innerHTML = html(); bind(); } else { XP.LS.set('lab:tour', true); if (md && md.close) md.close(); } });
      box.querySelector('[data-skip]').addEventListener('click', () => { XP.LS.set('lab:tour', true); if (md && md.close) md.close(); });
    };
    if (box) bind();
  }

  // catálogo: la tarjeta en sus cuatro estados (plantillas con datos de ejemplo)
  const CATALOG_EX = [];
  function catalog() {
    const ex = [['alta', 'publicada'], ['media', 'publicada'], ['baja', 'publicada'], ['educativa', 'educativa']];
    const html = ex.map(([light, status]) => {
      const c = { verdict: '{Local} gana en 58 % de los escenarios (54–62 %). ' + LIGHTS[light][0] + '.', big: '58 %', range: '(54–62 %)', play: '<label class="lab-field"><span>Un control de ejemplo</span><input type="range" min="0" max="100" value="50"></label>', how: [['info', 'Paso 1', 'Concepto en palabras simples.'], ['calc', 'Paso 2', 'El cálculo con los números del partido.']] };
      CATALOG_EX.push(c);
      return card({ id: 'ej', icon: 'sparkle', title: 'Tarjeta de ejemplo · ' + LIGHTS[light][0], what: 'Estado: ' + light + '.' }, { status, light, stats: { n: 1000 } }, c);
    }).join('');
    return '<p class="lab-honest small">' + I('info', 14) + ' Los ejemplos de esta página son plantillas con datos de ejemplo, no pronósticos reales. <a href="#/laboratorio">Volver al Laboratorio</a></p><div class="lab-grid">' + html + '</div>';
  }

  // ════════════════════════ rangos en toda la app (capa opcional) ════════════════════════
  const ranges = { data: null, at: 0, busy: false };
  ranges.decorate = function (force) {
    if (!XP.settings.labRanges) { XP.$$('.lab-rng').forEach((e) => e.remove()); return; }
    const apply = () => {
      const R = ranges.data || {};
      XP.$$('[data-bind*="|pf"]').forEach((el) => {
        const [mid, key] = el.getAttribute('data-bind').split('|');
        const mm = /^pf0?:(1|X|2|O2\.5|BTTS-S)$/.exec(key || '');
        if (!mm) return;
        const r = R[String(mid).replace(/^x-/, '')];
        const v = r && r[mm[1]];
        let tag = el.nextElementSibling && el.nextElementSibling.classList.contains('lab-rng') ? el.nextElementSibling : null;
        if (!v) { if (tag) tag.remove(); return; }
        const txt = '(' + Math.round(v[0] * 100) + '–' + Math.round(v[1] * 100) + ' %)';
        if (!tag) { tag = document.createElement('small'); tag.className = 'lab-rng'; tag.title = 'Rango probable (90 % central)'; el.after(tag); }
        if (tag.textContent !== txt) tag.textContent = txt;
      });
    };
    if (!force && ranges.data && Date.now() - ranges.at < 30e3) return apply();
    if (ranges.busy) return;
    ranges.busy = true;
    api('ranges').then((j) => { ranges.data = j.ranges || {}; ranges.at = Date.now(); ranges.busy = false; apply(); }).catch(() => { ranges.busy = false; });
  };
  XLab.ranges = ranges;

  window.XLab = XLab;
})();

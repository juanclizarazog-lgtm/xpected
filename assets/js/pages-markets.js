/* Xpected · /mercados — comparador de casas en tiempo real con precio justo (sin margen) y estado del feed. */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, F = XP.fmt, esc = XP.esc, ui = XP.ui;
  const D = () => XP.data;
  const pages = (XP.pages = XP.pages || {});
  const st = { sort: 'time', league: 'all' };

  function rows(m) {
    if (m.ext) {
      const labels = m.sel['1'].bookLabels || [];
      return labels.map((l, i) => ({ label: l, key: String(i), sharp: !!(m.ext.books.find((b) => b.label === l) || {}).sharp }));
    }
    return [{ label: XP.cfg.referenceLabel, key: 's', sharp: true }].concat(XP.cfg.books.map((l, i) => ({ label: l, key: String(i) })));
  }
  const maxEdge = (m) => Math.max(...['1', 'X', '2'].map((s) => (m.sel[s] && m.sel[s].fairEdge) || -1));

  function card(m) {
    const T = D().teams, H = T[m.home], A = T[m.away];
    const rs = rows(m);
    return '<article class="card mkt-card" data-mid="' + m.id + '" data-match="' + m.id + '">' +
      '<div class="mkt-head">' + ui.crest(m.home) + ui.crest(m.away) + '<a href="#/partido/' + m.id + '/mercados">' + esc(H.name) + ' <span class="muted">vs</span> ' + esc(A.name) + '</a>' +
      (m.status === 'vivo' ? ui.bind(m, 'score', 'tk-score') : '') + '<span class="grow"></span>' + ui.statusChip(m) + '</div>' +
      '<p class="muted small" style="margin:-4px 0 8px">' + esc(m.L.name) + (m.minuteApprox && m.status === 'vivo' ? ' · minuto aproximado' : '') + ' · actualizado ' + ui.bind(m, 'upd') + '</p>' +
      '<div class="table-wrap"><table class="mkt-table"><thead><tr><th scope="col">Casa</th><th scope="col">1</th><th scope="col">X</th><th scope="col">2</th><th scope="col">Margen</th></tr></thead><tbody>' +
      rs.map((r) => '<tr><th scope="row">' + esc(r.label) + (r.sharp ? ' <span class="chip">ref.</span>' : '') + '</th>' +
        ['1', 'X', '2'].map((s) => '<td>' + ui.bind(m, (r.key === 's' ? 's:' + s : 'bk:' + s + ':' + r.key), 'odds-cell') + '</td>').join('') +
        '<td class="muted">' + ui.bind(m, 'bm:' + r.key) + '</td></tr>').join('') +
      (m.openOdds ? '<tr><th scope="row">' + XP.icon('clock', 13) + ' Apertura</th>' + m.openOdds.map((o) => '<td class="muted">' + F.odds(o) + '</td>').join('') + '<td class="muted">' + F.pct(Q.overround(m.openOdds) - 1, 1) + '</td></tr>' : '') +
      '<tr class="fair"><th scope="row">' + XP.icon('scale', 13) + ' Cuota justa Xpected</th>' + ['1', 'X', '2'].map((s) => '<td>' + ui.bind(m, 'fo:' + s, 'odds-cell') + '</td>').join('') + '<td class="muted">0 %</td></tr>' +
      '</tbody></table></div>' +
      '<div class="pbar-wrap">' + ui.probBar(m, 'market', { compact: true }) + '</div>' +
      '</article>';
  }

  pages.mercados = {
    title: 'Mercados en vivo',
    render() {
      const feed = XP.feed || { mode: 'demo' }, s = feed.status || {};
      const leagues = D().activeLeagues();
      if (st.league !== 'all' && !leagues.some((L) => L.slug === st.league)) st.league = 'all';
      let ms = D().matches.filter((m) => m.sel && m.status !== 'final' && (!m.ext || m.hasOdds) && (st.league === 'all' || m.league === st.league));
      if (st.sort === 'edge') ms = ms.slice().sort((a, b) => maxEdge(b) - maxEdge(a));
      const modeTxt = feed.mode === 'live' ? (s.provider || 'Proveedor real') : feed.mode === 'mock' ? 'Feed simulado vía gateway' : 'Simulación en el navegador';
      return '<div class="container page">' +
        '<header class="page-head"><div><p class="eyebrow">' + XP.icon('coin', 14) + ' Mercados en vivo</p><h1 class="h1">Lo que paga la casa frente a la cuota justa</h1>' +
        '<p class="lead-sm muted">Cuota de apertura, cuota actual y la cuota justa de Xpected para cada resultado. El punto ● marca cuando la casa paga más que la cuota justa. Las casas sin autorización de Coljuegos se muestran sin marca ni enlaces.</p></div></header>' +
        '<div class="feed-panel">' +
        kpi('Fuente', modeTxt) +
        kpi('Conexión', feed.mode === 'demo' ? 'Local' : feed.connected ? 'SSE activa' : 'Reconectando') +
        kpi('Última sincronización', s.lastSync ? '<span data-ago="' + new Date(s.lastSync).getTime() + '"><span class="num">' + F.ago(new Date(s.lastSync).getTime()) + '</span></span>' : (feed.mode === 'demo' ? 'Cada segundo' : '—')) +
        kpi('Latencia del proveedor', s.latencyMs != null ? F.int(s.latencyMs) + ' ms' : '—') +
        kpi('Eventos · casas', F.int(ms.length) + ' · ' + (s.books || (feed.mode === 'demo' ? 4 : '—'))) +
        kpi('Créditos restantes', s.remaining != null ? F.int(s.remaining) + (s.costPerSync ? ' <small class="muted">(' + s.costPerSync + ' por sync)</small>' : '') : '—') +
        kpi('Próxima sincronización', s.idle ? 'En pausa sin visitantes' : s.nextPollAt ? F.time(new Date(s.nextPollAt)) + (s.paced ? ' <small class="muted">ritmo ajustado a créditos</small>' : '') : (feed.mode === 'demo' ? 'Continua' : '—')) +
        '</div>' +
        (s.error ? '<p class="banner banner-warn">El proveedor respondió con un error: ' + esc(s.error) + '. Se muestran los últimos datos válidos.</p>' : '') +
        (feed.mode !== 'live' ? connectBox(feed.mode) : '') +
        '<div class="filters"><div class="pill-row">' + [['all', 'Todas']].concat(leagues.map((L) => [L.slug, L.name])).map((x) => '<button class="pill' + (st.league === x[0] ? ' active' : '') + '" data-ml="' + x[0] + '" aria-pressed="' + (st.league === x[0]) + '">' + esc(x[1]) + '</button>').join('') +
        '<span class="grow"></span><label class="field" style="flex:0 0 220px"><span>Ordenar</span><select id="mk-sort"><option value="time">Estado y hora</option><option value="edge">Mayor cuota sobre el justo</option></select></label></div></div>' +
        '<div class="mkt-legend"><span><i style="background:color-mix(in srgb,var(--accent-2) 40%,transparent)"></i>Precio justo sin margen</span><span><i style="box-shadow:inset 0 0 0 2px var(--accent)"></i>Mejor cuota</span><span><b style="color:var(--accent)">●</b> Por encima del justo (informativo, no es una recomendación)</span></div>' +
        (ms.length ? '<div class="mkt-grid">' + ms.map(card).join('') + '</div>' : '<div class="empty"><h2 class="h3">Sin mercados abiertos</h2><p class="muted">El proveedor no tiene eventos próximos para las competiciones configuradas.</p></div>') +
        '</div>';
    },
    mount(root) {
      const sel = XP.$('#mk-sort', root);
      sel.value = st.sort;
      sel.addEventListener('change', () => { st.sort = sel.value; XP.router.render(true); });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ml]');
        if (b) { st.league = b.dataset.ml; XP.router.render(true); }
      });
      this.offStatus = XP.bus.on('feed-status', () => {
        const panel = XP.$('.feed-panel', root);
        if (!panel) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = pages.mercados.render();
        const fresh = XP.$('.feed-panel', tmp);
        if (fresh) panel.innerHTML = fresh.innerHTML;
      });
    },
    destroy() { if (this.offStatus) this.offStatus(); },
  };

  function kpi(l, v) { return '<div class="kpi"><span class="kpi-l">' + l + '</span><strong class="kpi-v">' + v + '</strong></div>'; }

  function connectBox(mode) {
    const file = !/^https?:$/.test(location.protocol);
    return '<section class="card connect-box"><h2 class="h3">' + (mode === 'mock' ? 'Estás viendo el feed simulado del gateway' : 'Conecta cuotas reales en tiempo real') + '</h2>' +
      (file ? '<p class="banner banner-info">Abriste el archivo directamente. Para sincronizar con casas reales, sirve la web con el gateway: <code>node server.js</code>.</p>' : '') +
      '<ol><li>Crea una cuenta en un proveedor de cuotas licenciado (el gateway incluye el adaptador de <strong>The Odds API v4</strong>; plan gratuito de 500 créditos al mes).</li>' +
      '<li>Arranca el gateway con tu clave (queda solo en el servidor, nunca en el navegador):<br><code>$env:ODDS_API_KEY="tu-clave"; node server.js</code></li>' +
      '<li>Opcional: <code>ODDS_SPORTS</code> (competiciones; consulta <code>/api/sports</code>), <code>ODDS_POLL_SECONDS</code> (cada consulta consume créditos) y <code>ODDS_ALLOWED_BOOKS</code> (lista blanca de operadores autorizados por Coljuegos).</li>' +
      '<li>Para probar el flujo completo sin gastar créditos: <code>$env:ODDS_PROVIDER="mock"; node server.js</code></li></ol>' +
      '<p class="muted small">Con el feed real, las competiciones se publican en modo «solo mercado» hasta tener un backtest propio; los partidos simulados se ocultan.</p></section>';
  }
})();

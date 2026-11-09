/* Xpected · /rendimiento, /cuenta, /metodologia y páginas legales. */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, F = XP.fmt, esc = XP.esc, ui = XP.ui;
  const D = () => XP.data;
  const pages = (XP.pages = XP.pages || {});

  // ════════════════════════════════ /rendimiento (historial real) ════════════════════════════════
  const I = (n, s) => XP.icon(n, s);
  let trackCache = null;
  pages.rendimiento = {
    title: 'Historial de pronósticos',
    render() {
      return '<div class="container page">' +
        '<header class="page-head"><div><p class="eyebrow">' + I('shield', 14) + ' Historial verificable</p><h1 class="h1">¿Qué tan bien pronostica Xpected?</h1>' +
        '<p class="lead-sm muted">Cada pronóstico se congela antes de que empiece el partido, con un sello digital que demuestra que no se cambió después. Al terminar, lo comparamos con el resultado real. Sin borrar los fallos.</p></div></header>' +
        '<div id="track-slot">' + (trackCache ? trackView(trackCache) : '<div class="kpis">' + ui.skeleton(4, 96) + '</div>' + ui.skeleton(1, 260)) + '</div>' +
        '</div>';
    },
    mount(root) {
      const slot = XP.$('#track-slot', root);
      const load = () => {
        if (!/^https?:$/.test(location.protocol)) { slot.innerHTML = noServer(); return; }
        fetch('/api/track', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then((d) => { trackCache = d; if (slot.isConnected) { slot.innerHTML = trackView(d); if (XP.fx) XP.fx.scan(slot); } })
          .catch(() => { if (slot.isConnected) slot.innerHTML = noServer(); });
      };
      load();
      this.timer = setInterval(load, 60000);
      root.addEventListener('click', (e) => {
        const v = e.target.closest('[data-verify]');
        if (!v) return;
        const p = (trackCache.recent || []).find((x) => x.id === v.dataset.verify);
        const ok = p && XP.sha256(p.payload) === p.hash;
        v.outerHTML = '<span class="' + (ok ? 'up' : 'down') + '">' + I(ok ? 'check' : 'x', 14) + (ok ? ' Intacto' : ' No coincide') + '</span>';
      });
    },
    destroy() { clearInterval(this.timer); },
  };

  function noServer() {
    return '<div class="empty">' + (XP.illus ? XP.illus('chart') : '') + '<h2 class="h3">El historial vive en el servidor</h2><p class="muted">Abre Xpected con <code>node server.js</code> para ver el registro real de pronósticos.</p></div>';
  }

  function trackView(d) {
    const pct = (x) => (x == null ? '—' : F.pct(x, 0));
    const head = '<div class="kpis">' +
      kpi(I('flag', 16) + ' Pronósticos congelados', F.int(d.frozen), d.since ? 'desde ' + F.dateTime(new Date(d.since)) : 'empezando hoy') +
      kpi(I('check', 16) + ' Ya calificados', F.int(d.graded), d.pending + ' esperando resultado') +
      kpi(I('target', 16) + ' Favorito acertó', pct(d.favoriteHitRate), d.graded ? 'en ' + d.graded + ' partidos' : 'aún sin partidos terminados') +
      kpi(I('bolt', 16) + ' Apuestas de valor', d.picks ? d.picksWon + ' de ' + d.picks : '—', d.roi != null ? 'rendimiento ' + F.signedPct(d.roi, 0) + ' por apuesta' : 'aún sin apuestas calificadas') +
      '</div>';
    const small = d.graded < 50;
    const vsMarket = d.compared ? (d.logLoss <= d.logLossMarket
      ? 'En los ' + d.compared + ' partidos con cuota, las probabilidades de Xpected fueron <strong class="up">más acertadas</strong> que las de la casa.'
      : 'En los ' + d.compared + ' partidos con cuota, la casa fue <strong class="down">más acertada</strong> que Xpected. Lo publicamos igual.') : 'Todavía no hay partidos terminados con cuota para comparar con la casa.';
    const card = '<section class="card"><h2 class="h3">' + I('scale', 18) + ' Xpected frente a la casa</h2><p>' + vsMarket + '</p>' +
      (d.clv != null ? '<p>' + I('flag', 14) + ' En las apuestas de valor, la cuota que marcamos fue en promedio <strong class="' + (d.clv > 0 ? 'up' : 'down') + '">' + F.signedPct(d.clv, 1) + '</strong> ' + (d.clv > 0 ? 'mejor' : 'peor') + ' que la cuota de cierre.</p>' : '') +
      (small ? '<p class="note">' + I('info', 14) + ' Con menos de 50 partidos calificados los porcentajes cambian mucho de un día a otro: espera a que el historial crezca antes de sacar conclusiones.</p>' : '') + '</section>';
    const rows = (d.recent || []).map((p) => {
      const pk = ['1', 'X', '2'][p.p.indexOf(Math.max(...p.p))];
      const label = pk === '1' ? p.home : pk === '2' ? p.away : 'Empate';
      const r = p.result;
      return '<tr><th scope="row">' + esc(p.home + ' – ' + p.away) + '<small class="muted block">' + esc(p.league) + ' · ' + F.dateTime(new Date(p.commence)) + '</small></th>' +
        '<td>' + esc(label) + ' <span class="muted">' + F.prob(Math.max(...p.p), 0) + '</span></td>' +
        '<td>' + (p.pick ? I('bolt', 13) + ' ' + esc(p.pick.sel === '1' ? p.home : p.pick.sel === '2' ? p.away : 'Empate') + ' @ ' + F.odds(p.pick.odds) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (r ? '<strong>' + r.score.join('–') + '</strong> ' + (r.favoriteHit ? '<span class="up">' + I('check', 13) + '</span>' : '<span class="down">' + I('x', 13) + '</span>') : '<span class="chip">Pendiente</span>') + '</td>' +
        '<td><code class="hash" title="' + esc(p.payload) + '">' + p.hash.slice(0, 10) + '…</code> <button class="btn btn-sm btn-ghost" type="button" data-verify="' + esc(p.id) + '">Verificar</button></td></tr>';
    }).join('');
    const table = '<section class="card"><h2 class="h3">' + I('calendar', 18) + ' Últimos pronósticos congelados</h2>' +
      (rows ? '<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Partido</th><th scope="col">Pronóstico</th><th scope="col">Apuesta de valor</th><th scope="col">Resultado</th><th scope="col">Sello</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty slim">' + (XP.illus ? XP.illus('net') : '') + '<p class="muted">El primer pronóstico se congela 90 minutos antes del próximo partido. Deja el servidor encendido y el historial se llena solo.</p></div>') + '</section>';
    return head + '<div class="grid-2 gap-lg">' + card + howCard() + '</div>' + table;
  }
  function howCard() {
    return '<section class="card"><h2 class="h3">' + I('shield', 18) + ' Cómo lo auditamos</h2><ul class="detail-list">' +
      '<li>' + I('clock', 16) + '<span class="dl-k">Antes del partido</span><span class="dl-v">Congelamos el pronóstico entre 90 y 0 minutos antes del inicio, nunca después.</span></li>' +
      '<li>' + I('padlock', 16) + '<span class="dl-k">Sello digital</span><span class="dl-v">Cada pronóstico tiene una huella única. Pulsa «Verificar» y tu navegador comprueba que no cambió.</span></li>' +
      '<li>' + I('flag', 16) + '<span class="dl-k">Después</span><span class="dl-v">Calificamos aciertos, fallos y apuestas de valor. Nada se borra.</span></li>' +
      '</ul></section>';
  }
  function kpi(label, value, sub) { return '<div class="kpi"><span class="kpi-l">' + label + '</span><strong class="kpi-v">' + value + '</strong><span class="kpi-s muted small">' + sub + '</span></div>'; }

  // ════════════════════════════════ /cuenta ════════════════════════════════
  pages.cuenta = {
    title: 'Cuenta y límites',
    render() {
      const s = XP.settings;
      const ex = XP.isSelfExcluded();
      const mins = Math.round((Date.now() - XP.session.start) / 60000);
      return '<div class="container page narrow">' +
        '<header class="page-head"><div><p class="eyebrow">Cuenta</p><h1 class="h1">Preferencias y límites</h1><p class="lead-sm muted">En esta versión los ajustes se guardan solo en este navegador. El registro con correo o Google (con fecha de nacimiento) llega con el backend.</p></div></header>' +
        '<form class="card settings" id="settings-form">' +
        '<h2 class="h3">Visualización</h2><div class="form-row">' +
        sel('theme', 'Tema', [['dark', 'Oscuro'], ['light', 'Claro']], s.theme) +
        sel('motion', 'Movimiento', [['system', 'Según el sistema'], ['full', 'Completo'], ['reduce', 'Reducido']], s.motion) +
        sel('oddsFormat', 'Formato de cuotas', [['decimal', 'Decimal (1,90)'], ['american', 'Americana (−111)'], ['fractional', 'Fraccional (9/10)']], s.oddsFormat) +
        sel('tz', 'Zona horaria', [['America/Bogota', 'Bogotá'], ['America/Mexico_City', 'Ciudad de México'], ['America/Lima', 'Lima'], ['America/Argentina/Buenos_Aires', 'Buenos Aires'], ['America/Santiago', 'Santiago'], ['Europe/Madrid', 'Madrid']], s.tz) +
        sel('lang', 'Idioma', [['es-CO', 'Español (Colombia)']], 'es-CO') +
        '</div>' +
        '<h2 class="h3">Gestión de banca</h2><div class="form-row">' +
        '<label class="field"><span>Banca de referencia (COP)</span><input name="bankroll" inputmode="numeric" value="' + s.bankroll + '"></label>' +
        sel('kellyFraction', 'Fracción de Kelly κ', [['0.25', '0,25 (recomendado)'], ['0.33', '0,33'], ['0.5', '0,50 (máximo)']], String(s.kellyFraction)) +
        sel('maxStakePct', 'Tope por apuesta', [['0.005', '0,5 %'], ['0.01', '1 %'], ['0.02', '2 % (máximo)']], String(s.maxStakePct)) +
        '</div>' +
        '<h2 class="h3">Tiempo de uso</h2><div class="form-row">' +
        sel('sessionLimitMin', 'Aviso de sesión', [['30', 'A los 30 min'], ['60', 'A los 60 min'], ['90', 'A los 90 min'], ['0', 'Sin aviso']], String(s.sessionLimitMin)) +
        '<div class="field"><span>Sesión actual</span><strong>' + mins + ' min</strong></div></div>' +
        '</form>' +
        '<section class="card"><h2 class="h3">Pausa y autoexclusión</h2>' +
        (ex ? '<p class="banner banner-warn">Autoexclusión activa hasta el ' + F.dateLong(new Date(s.selfExcludedUntil)) + '. Las funciones de apuestas (radar de valor, stake y medidor) están ocultas y no se puede cancelar antes de tiempo.</p>'
          : '<p>Oculta el radar de valor, las marcas de valor, el medidor y las calculadoras de stake. Las probabilidades, lecciones y la página de rendimiento siguen disponibles. No se puede cancelar antes de que termine.</p><div class="cta-row">' + [['1', '24 horas'], ['7', '7 días'], ['30', '30 días'], ['180', '6 meses']].map((x) => '<button class="btn" type="button" data-exclude="' + x[0] + '">Pausar ' + x[1] + '</button>').join('') + '</div>') +
        '<p class="muted small">Si sientes que pierdes el control, visita <a href="#/juego-responsable">Juego responsable</a>.</p></section>' +
        '<section class="card"><h2 class="h3">Tus datos</h2><p class="muted">Ley 1581 de 2012: puedes conocer, actualizar y suprimir tus datos. Aquí solo existen en tu navegador.</p><div class="cta-row"><button class="btn" type="button" id="export">Exportar mis datos (JSON)</button><button class="btn btn-danger" type="button" id="wipe">Borrar datos de este navegador</button><button class="btn btn-ghost" type="button" id="cookies">Preferencias de cookies</button></div></section>' +
        '</div>';
    },
    mount(root) {
      const form = XP.$('#settings-form', root);
      form.addEventListener('change', (e) => {
        const t = e.target;
        if (!t.name || t.name === 'lang') return;
        let v = t.value;
        if (['kellyFraction', 'maxStakePct'].includes(t.name)) v = parseFloat(v);
        if (['bankroll', 'sessionLimitMin'].includes(t.name)) { v = Math.max(0, Math.round(parseFloat(String(v).replace(/[^\d]/g, '')) || 0)); }
        XP.setSetting(t.name, v);
        XP.toast('Preferencia guardada.');
      });
      root.addEventListener('click', (e) => {
        const ex = e.target.closest('[data-exclude]');
        if (ex) {
          const days = +ex.dataset.exclude;
          if (!window.confirm('¿Activar la pausa por ' + ex.textContent.replace('Pausar ', '') + '? No podrás cancelarla antes de tiempo.')) return;
          XP.setSetting('selfExcludedUntil', new Date(Date.now() + days * 86400e3).toISOString());
          XP.router.render(true);
          XP.toast('Pausa activada.');
        }
        if (e.target.closest('#export')) XP.download('xpected-mis-datos.json', JSON.stringify({ settings: XP.settings, consent: XP.LS.get('consent', null), ageVerifiedAt: XP.LS.get('age', null) }, null, 2), 'application/json');
        if (e.target.closest('#wipe') && window.confirm('Se borrarán tus preferencias, consentimiento y verificación de edad de este navegador. La autoexclusión activa se conserva.')) {
          const keep = XP.settings.selfExcludedUntil;
          XP.LS.clearAll();
          if (keep && new Date(keep) > new Date()) XP.LS.set('settings', { selfExcludedUntil: keep });
          location.reload();
        }
        if (e.target.closest('#cookies')) XP.showCookieConsent(true);
      });
    },
  };
  function sel(name, label, opts, val) { return '<label class="field"><span>' + label + '</span><select name="' + name + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>'; }

  // ════════════════════════════════ textos ════════════════════════════════
  function doc(eyebrow, title, intro, sections, draft) {
    return '<div class="container page narrow doc">' +
      '<header class="page-head"><div><p class="eyebrow">' + eyebrow + '</p><h1 class="h1">' + title + '</h1>' + (intro ? '<p class="lead-sm muted">' + intro + '</p>' : '') + '</div></header>' +
      (draft ? '<p class="banner banner-info">Borrador pendiente de revisión por un abogado especializado en juegos de azar y datos personales antes del lanzamiento.</p>' : '') +
      sections.map((s) => '<section class="reveal"><h2 class="h3">' + s[0] + '</h2>' + s[1] + '</section>').join('') + '</div>';
  }

  pages.metodologia = {
    title: 'Cómo funciona',
    render() {
      return doc('Cómo funciona', 'De dónde sale cada pronóstico', 'En palabras simples, sin ecuaciones.', [
        ['1. Datos reales', '<p>Partidos, horarios, resultados, goles, tarjetas, tablas de posiciones y la cuota de referencia llegan en tiempo real desde una fuente pública de marcadores. Hoy en día vemos Liga BetPlay, Premier League, LaLiga, Champions League y Copa Libertadores.</p>'],
        ['2. Fuerza de cada equipo', '<p>Con la tabla medimos cuántos goles marca y recibe cada equipo por partido frente a la media de su liga, y le damos un pequeño ajuste por su forma en las últimas cinco jornadas. Jugar de local suma un poco.</p>'],
        ['3. Goles esperados y marcadores', '<p>Con esa fuerza estimamos cuántos goles hará cada equipo y la probabilidad de cada marcador. De ahí salen todos los mercados: ganador, doble oportunidad, más/menos goles, ambos marcan y empate no apuesta.</p>'],
        ['4. Lo que dice la casa', '<p>Le quitamos a la cuota de la casa su margen para saber qué probabilidad le da realmente a cada resultado, y la mezclamos con la nuestra. Así el pronóstico no se aleja demasiado del mercado.</p>'],
        ['5. Cuándo hay valor', '<p>Calculamos la cuota justa de cada resultado. Solo marcamos «valor» cuando la casa paga claramente más que esa cuota justa (4 % o más, y un poco más si hay incertidumbre). Las combinadas nunca se marcan como valor.</p>'],
        ['6. En vivo', '<p>Durante el partido recalculamos con el minuto, el marcador y las expulsiones. Si los datos en vivo se atrasan, lo avisamos y atenuamos las cifras.</p>'],
        ['7. Historial honesto', '<p>Cada pronóstico se congela antes del inicio con un sello digital y se califica al final, acierte o no. Puedes verlo en <a href="#/rendimiento">Historial</a>.</p>'],
      ], false);
    },
  };

  pages['juego-responsable'] = {
    title: 'Juego responsable',
    render() {
      return doc('Juego responsable', 'Apostar no es una forma de ganar dinero', 'Xpected es un servicio informativo para mayores de 18 años. No recibimos apuestas ni promocionamos operadores.', [
        ['Principios', '<ul class="plain"><li>Ningún modelo garantiza ganancias. Trata cualquier apuesta como un gasto de entretenimiento.</li><li>Define un presupuesto y un tiempo antes de empezar y no los aumentes para recuperar pérdidas.</li><li>No apuestes dinero que necesitas para vivir, ni bajo los efectos del alcohol o con emociones intensas.</li><li>En el registro de apuestas los resultados se muestran de forma neutra: sin celebraciones, a propósito.</li></ul>'],
        ['Señales de alerta', '<ul class="plain"><li>Apuestas más de lo que planeaste o persigues pérdidas.</li><li>Ocultas cuánto apuestas o pides dinero prestado para hacerlo.</li><li>Apostar afecta tu trabajo, tus estudios o tus relaciones.</li></ul><p>Si te identificas con alguna, haz una pausa y busca ayuda.</p>'],
        ['Herramientas en Xpected', '<p>Aviso de tiempo de sesión, tope de stake, Kelly fraccional y pausa o autoexclusión de 24 horas a 6 meses en <a href="#/cuenta">Cuenta</a>.</p>'],
        ['Ayuda en Colombia', '<p>Coljuegos es la entidad que regula los juegos de suerte y azar y mantiene información de juego responsable: <a href="' + XP.cfg.coljuegosUrl + '" target="_blank" rel="noopener">coljuegos.gov.co</a>.</p><p class="banner banner-info">Las líneas de ayuda telefónica se publicarán tras verificarlas antes del lanzamiento.</p>'],
      ], false);
    },
  };

  pages.privacidad = {
    title: 'Política de privacidad',
    render() {
      return doc('Legal', 'Política de tratamiento de datos personales', 'Conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.', [
        ['Responsable', '<p>Xpected (nombre provisional). Datos de contacto y NIT por definir antes del lanzamiento.</p>'],
        ['Datos que tratamos', '<ul class="plain"><li>Cuenta: correo y fecha de nacimiento (verificación de mayoría de edad).</li><li>Preferencias y límites de juego responsable.</li><li>Registro privado de apuestas que el usuario ingresa a mano (fase 2), aislado por cuenta.</li><li>Analítica de producto solo con consentimiento.</li></ul>'],
        ['Finalidades', '<p>Prestar el servicio informativo, aplicar límites y autoexclusión, mejorar el producto con datos agregados y cumplir obligaciones legales. No vendemos datos. No enviamos datos personales al proveedor de IA; el registro de apuestas solo se usa en forma agregada y con consentimiento explícito.</p>'],
        ['Derechos del titular', '<p>Conocer, actualizar, rectificar y suprimir tus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio. Desde <a href="#/cuenta">Cuenta</a> puedes exportar y borrar los datos locales.</p>'],
        ['Cookies', '<p>Usamos almacenamiento necesario para recordar tu verificación de edad y preferencias. La analítica solo se activa si la aceptas en el banner de cookies, con consentimiento granular.</p>'],
      ], true);
    },
  };

  pages.terminos = {
    title: 'Términos de uso',
    render() {
      return doc('Legal', 'Términos de uso', null, [
        ['Naturaleza del servicio', '<p>Xpected publica probabilidades, análisis y herramientas educativas. No es un operador de juegos de suerte y azar: no recibe apuestas, no custodia dinero y no ofrece asesoría financiera.</p>'],
        ['Mayoría de edad', '<p>El servicio es solo para mayores de 18 años.</p>'],
        ['Sin garantías', '<p>Las probabilidades son estimaciones con incertidumbre. No garantizamos resultados ni ganancias. Las decisiones del usuario son de su exclusiva responsabilidad.</p>'],
        ['Operadores', '<p>No enlazamos ni promocionamos operadores no autorizados por Coljuegos. Las cuotas de referencia se muestran sin marca.</p>'],
        ['Datos de terceros', '<p>Los datos deportivos y de cuotas provienen de proveedores licenciados con su atribución. Prohibido redistribuir las cuotas en bloque.</p>'],
      ], true);
    },
  };
})();

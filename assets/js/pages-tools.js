/* Xpected · /herramientas (calculadoras) y /aprender (lecciones). */
(function () {
  'use strict';
  const XP = window.XP, Q = window.XQ, F = XP.fmt, esc = XP.esc, ui = XP.ui;
  const pages = (XP.pages = XP.pages || {});

  const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : NaN; };
  const field = (id, label, value, attrs) => '<label class="field"><span>' + label + '</span><input id="' + id + '" inputmode="decimal" value="' + value + '" ' + (attrs || '') + '></label>';
  // para apostadores: solo qué hace la herramienta, sin fórmulas
  const explain = (concept) => '<p class="tool-desc">' + XP.icon('info', 16) + '<span>' + concept + '</span></p>';
  const bad = (msg) => '<p class="banner banner-warn">' + esc(msg) + '</p>';

  const TOOLS = [
    ['kelly', '¿Cuánto apostar?'], ['ev', '¿Tiene valor?'], ['devig', 'Cuota justa'], ['combinadas', 'Combinadas'],
    ['conversor', 'Conversor'], ['simulador', 'Simulador de banca'], ['clv', '¿Le gané al cierre?'],
  ];
  const TOOL_ICON = { kelly: 'wallet', ev: 'bolt', devig: 'scale', combinadas: 'swap', conversor: 'calc', simulador: 'chart', clv: 'flag' };
  const noSteps = (html) => html.replace(/<ol class="steps compact">[\s\S]*?<\/ol>/g, '');

  const T = {};

  T.conversor = {
    html: () => explain('Pasa una cuota entre formato decimal (1,90), americano (−110) y fraccional (9/10), y mira qué probabilidad representa.', 'q = 1/o · A>0: o = 1 + A/100 · A<0: o = 1 + 100/|A|', [['o', 'cuota decimal'], ['A', 'cuota americana'], ['q', 'probabilidad implícita']]) +
      '<div class="form-row">' + field('cv-in', 'Cuota', '2,50') + '<label class="field"><span>Formato de entrada</span><select id="cv-fmt"><option value="decimal">Decimal</option><option value="american">Americana</option><option value="fractional">Fraccional (n/d)</option></select></label></div><div id="cv-out" class="result"></div>',
    run(root) {
      const raw = XP.$('#cv-in', root).value.trim(), f = XP.$('#cv-fmt', root).value;
      let o = NaN;
      if (f === 'decimal') o = num(raw);
      if (f === 'american') { const a = num(raw); if (Math.abs(a) >= 100) o = Q.americanToDecimal(a); }
      if (f === 'fractional') { const [n, d] = raw.split('/').map(num); if (n > 0 && d > 0) o = Q.fractionalToDecimal(n, d); }
      if (!(o > 1)) return bad('Escribe una cuota válida: decimal mayor que 1, americana con |A| ≥ 100 o fraccional n/d.');
      return '<dl class="kv big"><div><dt>Decimal</dt><dd>' + F.num(o, 3) + '</dd></div><div><dt>Americana</dt><dd>' + F.odds(o, 'american') + '</dd></div><div><dt>Fraccional</dt><dd>' + F.odds(o, 'fractional') + '</dd></div><div><dt>Prob. implícita</dt><dd>' + F.prob(1 / o, 2) + '</dd></div></dl>' +
        '<ol class="steps compact"><li><span class="step-n">1</span><div>q = 1 / ' + F.num(o, 3) + ' = <span class="step-res">' + F.prob(1 / o, 2) + '</span></div></li></ol>';
    },
  };

  T.devig = {
    html: () => explain('Escribe las cuotas de un mercado y te decimos cuánto se queda la casa y cuál sería la cuota justa de cada resultado sin ese margen.', 'Mult: pᵢ = qᵢ/B · Potencia: Σ qᵢᵏ = 1 · Shin: pᵢ = (√(z² + 4(1−z)qᵢ²/B) − z) / (2(1−z))', [['qᵢ', 'probabilidad implícita'], ['B', 'Σ qᵢ (libro total)'], ['k', 'exponente del método potencia'], ['z', 'proporción de apostadores informados (Shin)']]) +
      '<div class="form-row">' + field('dv-1', 'Cuota 1', '1,90') + field('dv-2', 'Cuota 2 (X)', '3,50') + field('dv-3', 'Cuota 3 (vacío = dos vías)', '5,00') + '</div><div id="dv-out" class="result"></div>',
    run(root) {
      const odds = ['#dv-1', '#dv-2', '#dv-3'].map((s) => XP.$(s, root).value.trim()).filter((v) => v !== '').map(num);
      if (odds.length < 2 || odds.some((o) => !(o > 1))) return bad('Necesitas al menos dos cuotas decimales mayores que 1.');
      const q = odds.map(Q.implied), B = Q.sum(q);
      if (B <= 1) return bad('Las probabilidades implícitas suman ' + F.num(B, 4) + ': no hay margen que quitar (posible arbitraje o error de datos).');
      const sh = Q.devigShin(odds);
      return '<dl class="kv big"><div><dt>Margen que se queda la casa</dt><dd class="down">' + F.pct(B - 1, 1) + '</dd></div></dl>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Resultado</th><th scope="col">Paga la casa</th><th scope="col">Probabilidad real</th><th scope="col">Cuota justa</th></tr></thead><tbody>' +
        odds.map((o, i) => '<tr><th scope="row">' + ['Local (1)', odds.length === 3 ? 'Empate (X)' : 'Visitante (2)', 'Visitante (2)'][i] + '</th><td>' + F.num(o, 2) + '</td><td><strong>' + F.prob(sh[i], 1) + '</strong></td><td>' + F.num(1 / sh[i], 2) + '</td></tr>').join('') +
        '</tbody></table></div>' +
        '<ol class="steps compact"><li><span class="step-n">1</span><div>B = ' + q.map((x) => F.num(x, 4)).join(' + ') + ' = <span class="step-res">' + F.num(B, 4) + '</span> → margen ' + F.pct(B - 1, 2) + '</div></li>' +
        '<li><span class="step-n">2</span><div>Potencia: k = <span class="step-res">' + F.num(Q.powerExponent(odds), 4) + '</span></div></li>' +
        '<li><span class="step-n">3</span><div>Shin: z = <span class="step-res">' + F.num(Q.shinZ(odds), 4) + '</span></div></li></ol>' +
        '<p class="muted small">Si otra casa paga más que la cuota justa, ese precio juega a tu favor.</p>';
    },
  };

  T.ev = {
    html: () => explain('Pon qué tan probable crees que es el resultado y la cuota que te ofrecen: te decimos si la apuesta tiene valor y cuánto ganarías o perderías a la larga.', 'EV = p · o − 1', [['p', 'probabilidad estimada'], ['o', 'cuota decimal ofrecida']]) +
      '<div class="form-row">' + field('ev-p', 'Probabilidad (%)', '55') + field('ev-o', 'Cuota decimal', '2,00') + '</div><div id="ev-out" class="result"></div>',
    run(root) {
      const p = num(XP.$('#ev-p', root).value) / 100, o = num(XP.$('#ev-o', root).value);
      if (!(p > 0 && p < 1) || !(o > 1)) return bad('Probabilidad entre 0 y 100 (sin incluirlos) y cuota mayor que 1.');
      const e = Q.ev(p, o);
      return '<dl class="kv big"><div><dt>EV por unidad</dt><dd class="' + (e > 0 ? 'up' : 'down') + '">' + F.signedPct(e, 2) + '</dd></div><div><dt>Cuota de equilibrio</dt><dd>' + F.num(1 / p, 3) + '</dd></div><div><dt>Prob. implícita</dt><dd>' + F.prob(1 / o, 2) + '</dd></div></dl>' +
        '<ol class="steps compact"><li><span class="step-n">1</span><div>EV = ' + F.num(p, 4) + ' × ' + F.num(o, 2) + ' − 1 = <span class="step-res">' + F.signedPct(e, 2) + '</span></div></li></ol>' +
        '<p class="muted small">Si p tiene error (siempre lo tiene), el EV también. Por eso el radar exige un umbral que crece con la incertidumbre.</p>';
    },
  };

  T.kelly = {
    html: () => explain('Te sugerimos cuánto arriesgar según la probabilidad, la cuota y tu banca, de forma prudente y con un tope para que una mala racha no te deje sin banca.', 'f* = (p·o − 1)/(o − 1) · f = min(κ·f*, tope)', [['f*', 'Kelly completo'], ['κ', 'fracción (0,25–0,5)'], ['tope', 'máximo por apuesta (2 %)']]) +
      '<div class="form-row">' + field('k-p', 'Probabilidad (%)', '55') + field('k-o', 'Cuota decimal', '2,00') + field('k-b', 'Banca (COP)', String(XP.settings.bankroll)) +
      '<label class="field"><span>κ = <output id="k-kv">' + F.num(XP.settings.kellyFraction, 2) + '</output></span><input type="range" id="k-k" min="0.25" max="0.5" step="0.05" value="' + XP.settings.kellyFraction + '"></label></div><div id="k-out" class="result"></div>',
    run(root) {
      if (XP.isSelfExcluded()) return '<p class="banner banner-warn">Calculadora de stake en pausa por tu autoexclusión.</p>';
      const p = num(XP.$('#k-p', root).value) / 100, o = num(XP.$('#k-o', root).value), b = num(XP.$('#k-b', root).value), k = num(XP.$('#k-k', root).value);
      XP.$('#k-kv', root).textContent = F.num(k, 2);
      if (!(p > 0 && p < 1) || !(o > 1) || !(b > 0)) return bad('Revisa probabilidad, cuota y banca.');
      const r = Q.kellyStake(p, o, { fraction: k, maxPct: XP.settings.maxStakePct, bankroll: b });
      return '<dl class="kv big"><div><dt>Kelly completo f*</dt><dd>' + F.pct(r.fFull, 2) + '</dd></div><div><dt>Fracción aplicada</dt><dd>' + F.pct(r.f, 2) + (r.capped ? ' <small class="chip chip-warn">tope</small>' : '') + '</dd></div><div><dt>Stake sugerido por la fórmula</dt><dd>' + F.money(r.stake) + '</dd></div></dl>' +
        '<ol class="steps compact"><li><span class="step-n">1</span><div>f* = (' + F.num(p, 4) + '×' + F.num(o, 2) + ' − 1)/(' + F.num(o, 2) + ' − 1) = <span class="step-res">' + F.pct(r.fFull, 2) + '</span></div></li>' +
        '<li><span class="step-n">2</span><div>κ·f* = ' + F.pct(r.fFrac, 2) + (r.capped ? ' → supera el tope de ' + F.pct(XP.settings.maxStakePct, 1) + ', se recorta' : '') + '</div></li></ol>' +
        (r.fFull <= 0 ? '<p class="muted">Con EV negativo, Kelly dice no apostar.</p>' : '') +
        '<p class="muted small">Las apuestas del mismo partido cuentan como una sola exposición; tope de exposición simultánea: ' + F.pct(XP.settings.maxExposurePct, 0) + ' de la banca.</p>';
    },
  };

  T.simulador = {
    html: () => explain('Simulamos 10.000 veces una temporada de apuestas para mostrarte cómo puede subir y bajar tu banca, incluso cuando apuestas con ventaja.', 'Bₜ₊₁ = Bₜ + stake·(o − 1) si gana · Bₜ − stake si pierde', [['p', 'probabilidad real supuesta'], ['o', 'cuota'], ['N', 'número de apuestas']]) +
      '<div class="form-row">' + field('s-p', 'Probabilidad real (%)', '52') + field('s-o', 'Cuota', '2,00') + field('s-n', 'Apuestas', '500') +
      '<label class="field"><span>Stake</span><select id="s-m"><option value="kelly">Kelly fraccional (κ de tus ajustes, con tope)</option><option value="flat">Plano 1 % de la banca inicial</option></select></label></div>' +
      '<button class="btn btn-accent" id="s-run" type="button">Simular 10.000 trayectorias</button><div id="s-out" class="result"></div>',
    manual: true,
    run(root) {
      const p = num(XP.$('#s-p', root).value) / 100, o = num(XP.$('#s-o', root).value), N = Math.round(num(XP.$('#s-n', root).value)), mode = XP.$('#s-m', root).value;
      if (!(p > 0 && p < 1) || !(o > 1) || !(N >= 10 && N <= 3000)) return bad('Probabilidad válida, cuota > 1 y entre 10 y 3.000 apuestas.');
      const start = XP.settings.bankroll, paths = 10000, checkpoints = 40;
      const stepEvery = Math.max(1, Math.floor(N / checkpoints));
      const steps = [];
      for (let t = 0; t <= N; t += stepEvery) steps.push(t);
      if (steps[steps.length - 1] !== N) steps.push(N);
      const snap = steps.map(() => new Float64Array(paths));
      const kf = Math.min(Math.max(0, Q.kelly(p, o)) * XP.settings.kellyFraction, XP.settings.maxStakePct);
      const rand = Q.mulberry32(Date.now() & 0xffffffff);
      let ruin50 = 0, loss = 0;
      const dds = new Float64Array(paths);
      for (let i = 0; i < paths; i++) {
        let b = start, peak = start, dd = 0, hit = false, si = 0;
        for (let t = 0; t <= N; t++) {
          if (t === steps[si]) { snap[si][i] = b; si++; }
          if (t === N) break;
          const stake = mode === 'kelly' ? b * kf : Math.min(b, start * 0.01);
          b += rand() < p ? stake * (o - 1) : -stake;
          if (b > peak) peak = b;
          dd = Math.max(dd, (peak - b) / peak);
          if (b <= start * 0.5) hit = true;
        }
        dds[i] = dd; if (hit) ruin50++; if (b < start) loss++;
      }
      const pct = (arr, q) => Q.quantile(Array.from(arr).sort((a, b) => a - b), q);
      const d = { start, steps, p5: snap.map((a) => pct(a, 0.05)), p50: snap.map((a) => pct(a, 0.5)), p95: snap.map((a) => pct(a, 0.95)) };
      ui.chartArgs.sim = d;
      const evv = Q.ev(p, o);
      return '<div class="chart" data-chart="fan" data-arg="sim"></div>' +
        '<dl class="kv"><div><dt>Banca final p5 / p50 / p95</dt><dd>' + F.money(d.p5[d.p5.length - 1]) + ' / ' + F.money(d.p50[d.p50.length - 1]) + ' / ' + F.money(d.p95[d.p95.length - 1]) + '</dd></div>' +
        '<div><dt>Caída máxima mediana</dt><dd>' + F.pct(pct(dds, 0.5), 1) + '</dd></div><div><dt>Prob. de tocar −50 %</dt><dd>' + F.pct(ruin50 / paths, 1) + '</dd></div><div><dt>Prob. de terminar en pérdida</dt><dd>' + F.pct(loss / paths, 1) + '</dd></div>' +
        '<div><dt>EV por apuesta</dt><dd>' + F.signedPct(evv, 2) + '</dd></div><div><dt>Stake</dt><dd>' + (mode === 'kelly' ? F.pct(kf, 2) + ' de la banca actual' : '1 % de la inicial') + '</dd></div></dl>' +
        '<p class="muted small">Resultado de simulación con p supuesta exacta. En la realidad p es incierta, lo que empeora estas cifras.</p>';
    },
  };

  T.combinadas = {
    html: () => explain('Mira cuánto paga tu combinada y cuánto se queda la casa: en cada selección que agregas, el margen se acumula.', 'margen efectivo = 1 − 1 / Π Bᵢ', [['Bᵢ', 'libro total de la pierna i'], ['Π', 'producto de todas las piernas']]) +
      '<p class="muted small">Para cada pierna escribe la cuota elegida y la del resultado contrario (mercado de dos vías).</p>' +
      '<div id="pl-legs">' + [['1,90', '1,95'], ['1,85', '2,00'], ['2,10', '1,75']].map((l, i) => legRow(i, l)).join('') + '</div>' +
      '<div class="cta-row"><button class="btn btn-sm" id="pl-add" type="button">Añadir pierna</button><button class="btn btn-sm btn-ghost" id="pl-del" type="button">Quitar pierna</button></div><div id="pl-out" class="result"></div>',
    run(root) {
      const legs = XP.$$('.pl-leg', root).map((el) => [num(XP.$('.a', el).value), num(XP.$('.b', el).value)]);
      if (legs.some((l) => !(l[0] > 1 && l[1] > 1))) return bad('Todas las cuotas deben ser mayores que 1.');
      const Bs = legs.map((l) => Q.overround(l));
      const fair = legs.map((l) => Q.devigMultiplicative(l)[0]);
      const odds = legs.reduce((a, l) => a * l[0], 1), pf = fair.reduce((a, x) => a * x, 1);
      const pm = Q.parlayMargin(Bs);
      return '<dl class="kv big"><div><dt>Cuota combinada</dt><dd>' + F.num(odds, 2) + '</dd></div><div><dt>Cuota justa</dt><dd>' + F.num(1 / pf, 2) + '</dd></div><div><dt>Margen efectivo</dt><dd class="down">' + F.pct(pm.margin, 2) + '</dd></div><div><dt>EV a probabilidades justas</dt><dd>' + F.signedPct(Q.ev(pf, odds), 2) + '</dd></div></dl>' +
        '<ol class="steps compact">' + Bs.map((b, i) => '<li><span class="step-n">' + (i + 1) + '</span><div>Pierna ' + (i + 1) + ': B = ' + F.num(b, 4) + ' (margen ' + F.pct(b - 1, 2) + ')</div></li>').join('') + '</ol>';
    },
  };
  function legRow(i, l) { return '<div class="form-row pl-leg">' + '<label class="field"><span>Pierna ' + (i + 1) + ' · elegida</span><input class="a" inputmode="decimal" value="' + l[0] + '"></label><label class="field"><span>Contraria</span><input class="b" inputmode="decimal" value="' + l[1] + '"></label></div>'; }

  T.clv = {
    html: () => explain('Compara la cuota que tomaste con la que había justo antes de empezar el partido. Si tomaste mejor precio que el cierre de forma constante, estás apostando bien.', 'CLV = o_tomada · p_justa_cierre − 1', [['o_tomada', 'cuota que obtuviste'], ['p_justa_cierre', 'probabilidad de cierre sin margen (Shin)']]) +
      '<div class="form-row">' + field('c-t', 'Cuota tomada', '2,10') + '<label class="field"><span>Tu selección</span><select id="c-s"><option value="0">Resultado 1</option><option value="1">Resultado 2</option><option value="2">Resultado 3</option></select></label></div>' +
      '<div class="form-row">' + field('c-1', 'Cierre 1', '1,95') + field('c-2', 'Cierre 2', '3,60') + field('c-3', 'Cierre 3 (vacío = dos vías)', '4,20') + '</div><div id="c-out" class="result"></div>',
    run(root) {
      const t = num(XP.$('#c-t', root).value), s = +XP.$('#c-s', root).value;
      const close = ['#c-1', '#c-2', '#c-3'].map((x) => XP.$(x, root).value.trim()).filter((v) => v !== '').map(num);
      if (!(t > 1) || close.length < 2 || close.some((o) => !(o > 1)) || s >= close.length) return bad('Revisa la cuota tomada y las de cierre.');
      const p = Q.devigShin(close)[s];
      const c = Q.clv(t, p);
      return '<dl class="kv big"><div><dt>CLV</dt><dd class="' + (c > 0 ? 'up' : 'down') + '">' + F.signedPct(c, 2) + '</dd></div><div><dt>Prob. justa de cierre</dt><dd>' + F.prob(p, 2) + '</dd></div><div><dt>Cuota justa de cierre</dt><dd>' + F.num(1 / p, 3) + '</dd></div></dl>' +
        '<ol class="steps compact"><li><span class="step-n">1</span><div>CLV = ' + F.num(t, 2) + ' × ' + F.num(p, 4) + ' − 1 = <span class="step-res">' + F.signedPct(c, 2) + '</span></div></li></ol>' +
        '<p class="muted small">Solo tiene sentido contra un cierre que «sabe»: mercado afilado o exchange, no el cierre de un libro blando.</p>';
    },
  };

  pages.herramientas = {
    title: 'Herramientas',
    render(params) {
      const tool = T[params.tool] ? params.tool : 'kelly';
      this.tool = tool;
      return '<div class="container page">' +
        '<header class="page-head"><div><p class="eyebrow">' + XP.icon('calc', 14) + ' Calculadoras</p><h1 class="h1">Decide cuánto y dónde apostar</h1><p class="lead-sm muted">Escribe tus números y obtén la respuesta al instante: cuánto arriesgar, si una cuota tiene valor y cuánto se queda la casa.</p></div></header>' +
        ui.tabs('t', TOOLS, tool, (t) => '#/herramientas/' + t) +
        '<section class="card tool" role="tabpanel" aria-labelledby="tab-t-' + tool + '"><h2 class="h3 tool-title"><span class="feat-ico">' + XP.icon(TOOL_ICON[tool], 22) + '</span>' + TOOLS.find((t) => t[0] === tool)[1] + '</h2>' + T[tool].html() + '</section>' +
        '</div>';
    },
    mount(root) {
      const tool = T[this.tool];
      const out = XP.$('.result', root);
      const run = () => { out.innerHTML = noSteps(tool.run(root)); ui.mountCharts(out); };
      if (tool.manual) {
        XP.$('#s-run', root).addEventListener('click', () => { out.innerHTML = '<p class="muted">Calculando…</p>'; setTimeout(run, 30); });
      } else {
        root.addEventListener('input', run);
        root.addEventListener('change', run);
        run();
      }
      if (this.tool === 'combinadas') {
        XP.$('#pl-add', root).addEventListener('click', () => { const host = XP.$('#pl-legs', root); const n = host.children.length; if (n < 8) host.insertAdjacentHTML('beforeend', legRow(n, ['1,90', '1,90'])); run(); });
        XP.$('#pl-del', root).addEventListener('click', () => { const host = XP.$('#pl-legs', root); if (host.children.length > 2) host.lastElementChild.remove(); run(); });
      }
    },
  };

  // ════════════════════════════════ /aprender ════════════════════════════════
  const LESSONS = [
    { id: 'implicita', title: 'Probabilidad implícita', concept: 'Una cuota decimal o paga o unidades por cada unidad apostada, incluida la apuesta. Su inverso es la probabilidad que esa cuota «implica».', formula: 'q = 1 / o', symbols: [['o', 'cuota decimal'], ['q', 'probabilidad implícita']], example: 'Cuota 1,90 → q = 1/1,90 = 52,6 %. Cuota 5,00 → q = 20 %.', q: '¿Qué probabilidad implícita tiene una cuota de 2,50? (en %)', a: 40, tol: 0.3 },
    { id: 'margen', title: 'El margen de la casa', concept: 'Si sumas las probabilidades implícitas de todos los resultados, el total B supera 1. El exceso es el margen: lo que la casa cobra por ofrecer el mercado.', formula: 'B = Σ qᵢ · margen = B − 1', symbols: [['qᵢ', 'implícita de cada resultado'], ['B', 'libro total']], example: '1,90 / 3,50 / 5,00 → 0,526 + 0,286 + 0,200 = 1,012: margen de 1,2 %. Un libro blando suele cargar 4–8 %.', q: 'Mercado de dos vías a 1,80 y 2,10. ¿Margen? (en %, un decimal)', a: 3.2, tol: 0.15 },
    { id: 'ev', title: 'Valor esperado', concept: 'El EV compara tu probabilidad con la cuota. Si es positivo, la cuota paga más de lo que vale el resultado… siempre que tu probabilidad sea correcta.', formula: 'EV = p · o − 1', symbols: [['p', 'probabilidad estimada'], ['o', 'cuota ofrecida']], example: 'p = 0,55 a cuota 2,00 → EV = 0,55 × 2,00 − 1 = +10 % por unidad.', q: 'p = 45 % y cuota 2,40. ¿EV? (en %)', a: 8, tol: 0.2 },
    { id: 'kelly', title: 'Kelly y gestión de banca', concept: 'Kelly da la fracción de la banca que maximiza el crecimiento si p fuera exacta. Como no lo es, usamos κ entre 0,25 y 0,5 y un tope duro del 2 % por apuesta. Estrategias «óptimas» sin control de riesgo llevan a la ruina con frecuencia.', formula: 'f* = (p·o − 1)/(o − 1) · f = min(κ·f*, 2 %)', symbols: [['f*', 'Kelly completo'], ['κ', 'fracción'], ['b = o − 1', 'ganancia neta']], example: 'p = 0,55, o = 2,00 → f* = 10 %. Con κ = 0,25 serían 2,5 %, pero el tope lo deja en 2 %.', q: 'p = 60 % y cuota 2,00. ¿Kelly completo f*? (en %)', a: 20, tol: 0.3 },
    { id: 'xg', title: 'xG, Poisson y varianza', concept: 'El xG asigna a cada tiro su probabilidad de gol; los goles de un equipo se modelan como Poisson con media λ. Y aunque tengas ventaja, la varianza la esconde durante miles de apuestas.', formula: 'P(X = x) = λˣ e^(−λ) / x! · N_min ≈ (z·o·√(p(1−p)) / ventaja)²', symbols: [['λ', 'goles esperados'], ['N_min', 'apuestas para que un resultado sea significativo']], example: 'Con z = 1,96, o = 2,00, p = 0,5 y ventaja del 3 %, hacen falta unas 4.268 apuestas.', q: 'Si λ = 1,5, ¿probabilidad de que el equipo no marque? (en %, un decimal)', a: 22.3, tol: 0.15 },
  ];

  pages.aprender = {
    title: 'Aprender',
    render() {
      return '<div class="container page learn">' +
        '<header class="page-head"><div><p class="eyebrow">Guía del apostador</p><h1 class="h1">Lo básico para apostar con cabeza</h1><p class="lead-sm muted">Cinco ideas cortas con un ejemplo y una pregunta para practicar.</p></div></header>' +
        '<div class="learn-layout"><nav class="toc" aria-label="Lecciones"><ol>' + LESSONS.map((l, i) => '<li><button type="button" data-goto="' + l.id + '"><span>' + (i + 1) + '</span>' + esc(l.title) + '</button></li>').join('') + '</ol></nav>' +
        '<div class="lessons">' + LESSONS.map((l, i) => lesson(l, i)).join('') + '</div></div></div>';
    },
    mount(root) {
      root.addEventListener('click', (e) => {
        const g = e.target.closest('[data-goto]');
        if (g) { const el = XP.$('#lesson-' + g.dataset.goto, root); el.scrollIntoView({ behavior: XP.reducedMotion() ? 'auto' : 'smooth', block: 'start' }); el.querySelector('h2').focus({ preventScroll: true }); return; }
        const c = e.target.closest('[data-check]');
        if (c) {
          const l = LESSONS.find((x) => x.id === c.dataset.check);
          const v = num(XP.$('#ans-' + l.id, root).value);
          const fb = XP.$('#fb-' + l.id, root);
          const ok = Math.abs(v - l.a) <= l.tol;
          fb.className = 'feedback ' + (ok ? 'ok' : 'ko');
          fb.textContent = !isFinite(v) ? 'Escribe un número.' : ok ? '✓ Correcto: ' + F.num(l.a, 1) + ' %.' : '✗ Aún no. Revisa la fórmula: la respuesta es ' + F.num(l.a, 1) + ' %.';
        }
      });
      const lam = XP.$('#poi-l', root), edge = XP.$('#nmin-e', root);
      const drawPoi = () => { const L = num(lam.value); XP.$('#poi-v', root).textContent = F.num(L, 1); XP.$('#poi-bars', root).innerHTML = [0, 1, 2, 3, 4, 5, 6].map((k) => { const p = Q.poissonPmf(k, L); return '<div class="pb"><span class="pb-bar"><i style="transform:scaleY(' + Math.min(1, p / 0.45).toFixed(3) + ')"></i></span><b>' + F.num(p * 100, 0) + '%</b><small>' + k + '</small></div>'; }).join(''); };
      const drawN = () => { const e = num(edge.value); XP.$('#nmin-v', root).textContent = F.pct(e, 0); XP.$('#nmin-out', root).textContent = F.int(Q.nMin(1.96, 2, 0.5, e)); XP.$('#sig-out', root).textContent = F.pct(Q.sigmaROI(2, 0.5, 500), 1); };
      lam.addEventListener('input', drawPoi); edge.addEventListener('input', drawN);
      drawPoi(); drawN();
    },
  };

  function lesson(l, i) {
    const extra = l.id === 'xg'
      ? '<div class="playground"><h3 class="h4">Juega con λ</h3><label class="field"><span>λ = <output id="poi-v"></output></span><input type="range" id="poi-l" min="0.2" max="3.5" step="0.1" value="1.5"></label><div class="poi-bars" id="poi-bars" aria-label="Distribución de Poisson de goles"></div>' +
        '<h3 class="h4">Varianza: ¿cuántas apuestas necesitas?</h3><label class="field"><span>Ventaja real = <output id="nmin-v"></output></span><input type="range" id="nmin-e" min="0.01" max="0.1" step="0.01" value="0.03"></label><p>A cuota 2,00 necesitarías unas <strong id="nmin-out"></strong> apuestas para distinguir esa ventaja de la suerte (95 %). Tras 500 apuestas, la desviación del ROI es ±<strong id="sig-out"></strong>.</p></div>'
      : '';
    return '<article class="lesson reveal" id="lesson-' + l.id + '"><p class="eyebrow">Lección ' + (i + 1) + '</p><h2 class="h2" tabindex="-1">' + esc(l.title) + '</h2>' +
      '<p>' + esc(l.concept) + '</p>' +
      '<div class="example"><strong>Ejemplo.</strong> ' + esc(l.example) + '</div>' + extra +
      '<div class="exercise"><label class="field"><span>' + esc(l.q) + '</span><input id="ans-' + l.id + '" inputmode="decimal" autocomplete="off"></label><button class="btn" type="button" data-check="' + l.id + '">Comprobar</button><p id="fb-' + l.id + '" class="feedback" role="status"></p></div>' +
      '</article>';
  }
})();

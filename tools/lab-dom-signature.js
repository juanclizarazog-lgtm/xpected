/*
 * Fase 6 · firma de las pantallas existentes (se ejecuta en el navegador, ver tools/lab-baseline.js dom).
 * Captura lo que no depende de los datos en vivo: menús, pestañas, títulos, tokens de diseño, estilos
 * calculados de los elementos base y la geometría del encabezado. Devuelve huellas cortas por ruta.
 */
window.labDomSignature = async function (matchId, mode) {
  const XP = window.XP, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const h = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  const TOK = ['--bg', '--surface-1', '--surface-2', '--border', '--text', '--text-2', '--text-3', '--accent', '--accent-ink', '--up', '--down', '--info', '--warn', '--home', '--away', '--draw', '--font-display', '--font-ui', '--r-ctl', '--r-card', '--r-pill', '--gutter', '--maxw', '--dur-instant', '--dur-fast', '--dur-base', '--dur-slow', '--dur-story', '--ease-standard', '--ease-exit', '--ease-spring'];
  const PROPS = ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'background-color', 'border-radius', 'padding-top', 'padding-left', 'height', 'backdrop-filter'];
  const css = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return PROPS.map((p) => cs.getPropertyValue(p)).join('|'); };
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.height)].join(','); };
  const STATIC = /^\/(herramientas|aprender|metodologia|juego-responsable|privacidad|terminos|cuenta|no-existe)/;
  const routes = ['/', '/hoy', '/valor', '/mercados', '/rendimiento', '/aprender', '/metodologia', '/juego-responsable', '/privacidad', '/terminos', '/cuenta', '/no-existe', '/herramientas']
    .concat(['kelly', 'ev', 'devig', 'combinadas', 'conversor', 'simulador', 'clv'].map((t) => '/herramientas/' + t))
    .concat(['', '/mercados', '/en-vivo', '/equipos', '/movimiento', '/explicacion'].map((t) => '/partido/' + matchId + t));
  const rs = getComputedStyle(document.documentElement);
  const out = {
    nav: [...document.querySelectorAll('.mainnav a')].map(txt),
    bottom: [...document.querySelectorAll('.bottomnav a')].map(txt),
    footer: [...document.querySelectorAll('.rg-footer nav a')].map(txt),
    tokens: h(TOK.map((t) => rs.getPropertyValue(t).trim()).join('|')),
    shell: null,
    routes: {},
  };
  // la estructura base se mide siempre en la misma pantalla (sin enlace activo en el menú) y arriba del todo
  location.hash = '#/terminos'; await wait(60); XP.router.render(true); window.scrollTo(0, 0); await wait(260);
  out.shell = h([css('body'), css('.topbar'), css('.mainnav a'), css('.bottomnav'), rect('.topbar'), css('.rg-footer')].join('#'));
  if (mode === 'shell') return out;
  for (const r of routes) {
    location.hash = '#' + r;
    await wait(60);
    XP.router.render(true);
    await wait(260);
    const app = document.querySelector('#app');
    const tabs = [...app.querySelectorAll('[role=tab]')].map(txt);
    const h1 = app.querySelector('h1');
    const key = r.replace(matchId, ':id');
    const parts = [h1 ? txt(h1) : '', css('#app h1'), css('#app .tabs'), rect('#app .page')];
    // en pantallas sin datos en vivo también se firman subtítulos, tarjetas y botones
    if (STATIC.test(r)) parts.push([...app.querySelectorAll('h2')].map(txt).join('/'), css('#app .card'), css('#app .btn'));
    out.routes[key] = { tabs, h: h(parts.join('#')) };
  }
  location.hash = '#/';
  return out;
};

/**
 * Compara contra docs/lab/linea-base-dom.json. Solo se aceptan las diferencias que pide el plan:
 * el enlace «Laboratorio» en los menús y la pestaña «Avanzado» al final del partido.
 * Uso: await labDomCompare({ dark, light, reduce, mobile })  → { same, diffs: [...] }
 */
window.labDomCompare = async function (after) {
  const base = await (await fetch('/docs/lab/linea-base-dom.json?' + Date.now())).json();
  const norm = (a) => (a || []).map((t) => t.replace(/\s+\d+$/, ''));
  const diffs = [];
  let same = 0;
  const eq = (label, x, y) => { if (JSON.stringify(x) === JSON.stringify(y)) same++; else diffs.push(label + ': ' + JSON.stringify(x).slice(0, 120) + ' → ' + JSON.stringify(y).slice(0, 120)); };
  for (const mode of Object.keys(base.modes)) {
    const a = base.modes[mode], b = after[mode];
    if (!b) { diffs.push('falta el modo ' + mode); continue; }
    eq(mode + ' menú superior', base.nav, b.nav.filter((t) => t !== 'Laboratorio'));
    eq(mode + ' menú móvil', base.bottom, b.bottom);
    if (b.footer) eq(mode + ' pie', base.footer, b.footer.filter((t) => t !== 'Laboratorio'));
    eq(mode + ' tokens', a.tokens, b.tokens);
    eq(mode + ' estructura base', a.shell, b.shell);
    for (const r of Object.keys(a.routes)) {
      const y = b.routes[r];
      if (!y) { diffs.push('falta ' + mode + ' ' + r); continue; }
      eq(mode + ' ' + r, a.routes[r], y.h);
      const tk = r.startsWith('/partido') ? '/partido' : r.startsWith('/herramientas') ? '/herramientas' : r;
      if (base.tabs[tk]) eq(mode + ' ' + r + ' pestañas', base.tabs[tk], norm(y.tabs).filter((t) => !(tk === '/partido' && t === 'Avanzado')));
    }
  }
  return { same, diffs };
};

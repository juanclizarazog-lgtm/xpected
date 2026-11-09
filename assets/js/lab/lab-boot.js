/* Xpected · Laboratorio · cargador (lo único del laboratorio en el paquete inicial). Registra las páginas
   #/laboratorio y #/ligas/:slug, la pestaña «Avanzado» y la capa opcional de rangos; el resto se carga al usarlo. */
(function () {
  'use strict';
  const XP = window.XP, pages = (XP.pages = XP.pages || {});
  let loading = null;
  XP.labLoad = function () {
    if (window.XLab) return Promise.resolve(window.XLab);
    if (loading) return loading;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'assets/js/lab/lab.css'; document.head.appendChild(css);
    const js = (src) => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    loading = js('assets/js/lab/lab-quant.js').then(() => js('assets/js/lab/lab.js')).then(() => window.XLab).catch(() => { loading = null; return null; });
    return loading;
  };
  const shell = (id, title, sub) => '<div class="container page lab-page" id="' + id + '"><h1 class="h2">' + title + '</h1><p class="muted">' + sub + '</p><div class="lab-loading muted">Cargando…</div></div>';
  const mountWith = (fn) => function (root, params) { XP.labLoad().then((L) => { if (!L) { root.querySelector('.lab-loading').textContent = 'No se pudo cargar el laboratorio. Revisa tu conexión.'; return; } if (root.isConnected) L[fn](root, params); }); };
  pages.laboratorio = {
    title: 'Laboratorio',
    render: (p) => shell('lab-root', p && p.view === 'catalogo' ? 'Laboratorio · catálogo de tarjetas' : 'Laboratorio', 'Herramientas avanzadas, explicadas fácil.'),
    mount: mountWith('mountLab'),
    destroy() { if (window.XLab) window.XLab.destroy(); },
  };
  pages.ligas = {
    title: 'Simulador de temporada',
    render: () => shell('lab-league', 'Simulador de temporada', 'Miles de temporadas jugadas con la fuerza real de cada equipo.'),
    mount: mountWith('mountLeague'),
    destroy() { if (window.XLab) window.XLab.destroy(); },
  };
  // pestaña «Avanzado» del partido: el contenido llega al cargar el laboratorio
  XP.labTab = (m) => '<div class="lab-adv" data-lab-adv="' + m.id + '"><p class="muted lab-loading">Cargando herramientas avanzadas…</p></div>';
  function scan() {
    const adv = document.querySelector('[data-lab-adv]:not([data-ready])');
    if (adv) { adv.setAttribute('data-ready', '1'); XP.labLoad().then((L) => { if (L && adv.isConnected) L.mountAdvanced(adv, adv.getAttribute('data-lab-adv')); }); }
    if (XP.settings.labRanges && document.querySelector('[data-bind*="|pf"]')) XP.labLoad().then((L) => L && L.ranges.decorate());
  }
  let pend = 0;
  const watch = () => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; scan(); }); };
  const start = () => {
    // enlace al final del pie «Producto» (esa nav es una sola línea de index.html: se agrega aquí para no modificarla)
    const prod = document.querySelector('.rg-footer nav[aria-label="Producto"]');
    if (prod && !prod.querySelector('a[href="#/laboratorio"]')) { const a = document.createElement('a'); a.href = '#/laboratorio'; a.textContent = 'Laboratorio'; prod.appendChild(a); }
    const app = document.getElementById('app'); if (app) new MutationObserver(watch).observe(app, { childList: true, subtree: true }); watch();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

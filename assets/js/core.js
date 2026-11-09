/* Xpected · núcleo: configuración, ajustes, bus de eventos, formato y utilidades. */
(function () {
  'use strict';
  const XP = (window.XP = window.XP || {});

  // ── config/brand + config/operators ──────────────────────────────────────────
  XP.cfg = {
    brand: {
      name: 'Xpected',
      promise: 'La probabilidad real de cada partido, explicada, actualizada en vivo y auditada en público.',
    },
    // Lista blanca de operadores autorizados por Coljuegos. Vacía hasta validación legal:
    // ningún enlace, logo, bono ni código de casas fuera de esta lista (Parte VI).
    operators: [],
    referenceLabel: 'Mercado de referencia',
    books: ['Libro A', 'Libro B', 'Libro C'],
    coljuegosUrl: 'https://www.coljuegos.gov.co/',
    secondsPerMatchMinute: 4, // simulación acelerada de la demo
    staleAfterMs: 3 * 60 * 1000,
    modelVersion: 'dc-elo-blend 1.0.0',
  };

  // ── almacenamiento seguro (puede fallar en modo privado) ─────────────────────
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('xp:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('xp:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem('xp:' + k); } catch (e) { /* noop */ } },
    clearAll() { try { Object.keys(localStorage).filter((k) => k.startsWith('xp:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* noop */ } },
  };
  XP.LS = LS;

  // ── bus ──────────────────────────────────────────────────────────────────────
  const handlers = {};
  XP.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => { handlers[ev] = handlers[ev].filter((f) => f !== fn); }; },
    emit(ev, data) { (handlers[ev] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  // ── ajustes del usuario (user_settings) ──────────────────────────────────────
  const DEFAULTS = {
    theme: 'dark',
    palette: 'aurora',
    stage3d: true,
    motion: 'system',
    oddsFormat: 'decimal',
    tz: 'America/Bogota',
    devig: 'shin',
    bankroll: 1000000,
    kellyFraction: 0.25,
    maxStakePct: 0.02,
    maxExposurePct: 0.1,
    sessionLimitMin: 60,
    selfExcludedUntil: null,
  };
  XP.DEFAULTS = DEFAULTS;
  XP.settings = Object.assign({}, DEFAULTS, LS.get('settings', {}));

  XP.setSetting = function (k, v) {
    XP.settings[k] = v;
    LS.set('settings', XP.settings);
    XP.applySettings();
    XP.bus.emit('settings', { k, v });
  };

  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  XP.reducedMotion = () => XP.settings.motion === 'reduce' || (XP.settings.motion === 'system' && mqReduce.matches);
  XP.applySettings = function () {
    const r = document.documentElement;
    r.dataset.theme = XP.settings.theme;
    r.dataset.palette = XP.settings.palette || 'aurora';
    r.dataset.motion = XP.reducedMotion() ? 'reduce' : 'full';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = XP.settings.theme === 'light' ? '#FAFAF7' : '#0A0B0D';
  };
  XP.isSelfExcluded = () => !!XP.settings.selfExcludedUntil && new Date(XP.settings.selfExcludedUntil) > new Date();

  // ── formato (Intl, es-CO, America/Bogota) ────────────────────────────────────
  const nf = (min, max) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max });
  const NF = { 0: nf(0, 0), 1: nf(1, 1), 2: nf(2, 2), 3: nf(3, 3), 4: nf(4, 4) };
  const num = (x, d = 2) => (NF[d] || nf(d, d)).format(x);

  XP.fmt = {
    num,
    int: (x) => NF[0].format(Math.round(x)),
    /** Probabilidad: nunca se muestra 0 ni el máximo absoluto (Parte III). */
    prob(p, d = 1) { const lo = Math.pow(10, -d) / 100; return num(Math.min(1 - lo, Math.max(lo, p)) * 100, d) + ' %'; },
    pct(x, d = 1) { return num(x * 100, d) + ' %'; },
    signedPct(x, d = 1) { const v = x * 100; return (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d) + ' %'; },
    pp(x, d = 1) { const v = x * 100; return (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v), d) + ' pp'; },
    odds(o, format) {
      if (o == null || !isFinite(o)) return '—';
      const f = format || XP.settings.oddsFormat;
      if (f === 'american') { const a = window.XQ.decimalToAmerican(o); return (a > 0 ? '+' : '−') + NF[0].format(Math.abs(Math.round(a))); }
      if (f === 'fractional') { const [n, d] = window.XQ.decimalToFractional(o); return n + '/' + d; }
      return num(o, 2);
    },
    money(x) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x); },
    time(d) { return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: XP.settings.tz }).format(d); },
    dateLong(d) { return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: XP.settings.tz }).format(d); },
    dateTime(d) { return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: XP.settings.tz }).format(d); },
    dayKey(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: XP.settings.tz }).format(d); },
    ago(ts) {
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return 'hace ' + s + ' s';
      const m = Math.round(s / 60);
      if (m < 60) return 'hace ' + m + ' min';
      return 'hace ' + Math.round(m / 60) + ' h';
    },
  };

  // ── DOM ──────────────────────────────────────────────────────────────────────
  XP.$ = (sel, ctx) => (ctx || document).querySelector(sel);
  XP.$$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  XP.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  XP.slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  XP.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  XP.toast = function (msg) {
    let host = XP.$('#toasts');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 3200);
  };

  // ── SHA-256 (sincrónico, para congelar predicciones) ─────────────────────────
  XP.sha256 = function (input) {
    const ascii = unescape(encodeURIComponent(input));
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32);
    let i, j;
    const words = [];
    const bitLen = ascii.length * 8;
    const hash = [], k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let c = 2; primeCounter < 64; c++) {
      if (!isComposite[c]) {
        for (i = 0; i < 313; i += c) isComposite[i] = c;
        if (primeCounter < 8) hash[primeCounter] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    let msg = ascii + '\x80';
    while ((msg.length % 64) - 56) msg += '\x00';
    for (i = 0; i < msg.length; i++) {
      j = msg.charCodeAt(i);
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    let H = hash.slice(0, 8);
    for (j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16));
      const old = H;
      H = H.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = H[0], e = H[4];
        const t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H);
        H[4] = (H[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
    }
    let out = '';
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { const b = (H[i] >> (j * 8)) & 255; out += (b < 16 ? '0' : '') + b.toString(16); }
    return out;
  };

  XP.applySettings();
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', () => { XP.applySettings(); XP.bus.emit('settings', { k: 'motion' }); });
})();

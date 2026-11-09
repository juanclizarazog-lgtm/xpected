/*
 * Fase 6 · línea base de no regresión (adaptación de Playwright/Lighthouse al stack real, ver docs/lab/adr-002).
 *   node tools/lab-baseline.js save     → guarda huella (SHA-256), tamaño y copia de cada archivo existente
 *   node tools/lab-baseline.js check    → compara: un archivo existente solo puede GANAR líneas, nunca perderlas
 *                                          ni cambiarlas, y solo si figura en docs/lab/adr-001 (puntos de enganche)
 * La firma de las pantallas se compara en el navegador: tools/lab-dom-signature.js (labDomSignature + labDomCompare)
 * contra docs/lab/linea-base-dom.json, en oscuro, claro, movimiento reducido (1280 px) y móvil (375 px).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/lab/linea-base.json');
const COPY = path.join(ROOT, 'data/lab/baseline');
const SKIP = /^(data|docs[\\/](lab|reports)|lib[\\/]lab|assets[\\/]js[\\/]lab|node_modules|\.)/;
// Archivos existentes que la fase 6 puede tocar (solo agregando líneas), según docs/lab/adr-001-puntos-de-enganche.md
const HOOKS = ['index.html', 'assets/js/app.js', 'assets/js/pages-main.js', 'server.js', 'tools/lint-copy.js', 'CLAUDE.md', 'README.md', '.gitignore'];

function walk(dir, acc) {
  for (const f of fs.readdirSync(dir)) {
    const abs = path.join(dir, f), rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (SKIP.test(rel) || f === '.env') continue;
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, acc); else acc.push(rel);
  }
  return acc;
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const cmd = process.argv[2] || 'check';
if (cmd === 'save') {
  const files = walk(ROOT, []).filter((f) => !/^tools\/lab-|^tests\/lab/.test(f));
  const manifest = {};
  for (const f of files) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    manifest[f] = { sha256: sha(buf), bytes: buf.length, lines: buf.toString('utf8').split(/\r?\n/).length };
    fs.mkdirSync(path.dirname(path.join(COPY, f)), { recursive: true });
    fs.writeFileSync(path.join(COPY, f), buf);
  }
  const bundle = ['index.html', 'assets/css/styles.css', 'assets/css/experience.css'].concat(files.filter((f) => /^assets\/js\/[^/]+\.js$/.test(f)));
  const total = bundle.reduce((s, f) => s + manifest[f].bytes, 0);
  fs.writeFileSync(OUT, JSON.stringify({ savedAt: new Date().toISOString(), initialBundleBytes: total, bundle, files: manifest }, null, 1));
  console.log('✓ Línea base guardada: ' + files.length + ' archivos · paquete inicial ' + (total / 1024).toFixed(1) + ' KB');
} else if (cmd === 'check') {
  const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  let bad = 0, touched = [];
  for (const [f, info] of Object.entries(base.files)) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) { bad++; console.error('✗ borrado: ' + f); continue; }
    const now = fs.readFileSync(abs);
    if (sha(now) === info.sha256) continue;
    if (/^data\//.test(f)) continue;
    const before = fs.readFileSync(path.join(COPY, f), 'utf8').split(/\r?\n/), after = now.toString('utf8').split(/\r?\n/);
    // cada línea original debe seguir presente y en el mismo orden (solo inserciones)
    let j = 0, lost = [];
    for (const line of before) { const k = after.indexOf(line, j); if (k < 0) lost.push(line); else j = k + 1; }
    const added = after.length - (before.length - lost.length);
    touched.push(f + ' (+' + added + ' líneas' + (lost.length ? ', ' + lost.length + ' cambiadas' : '') + ')');
    if (!HOOKS.includes(f)) { bad++; console.error('✗ ' + f + ' cambió y no es un punto de enganche aprobado'); }
    if (lost.length && !['README.md', 'CLAUDE.md'].includes(f)) { bad++; console.error('✗ ' + f + ': ' + lost.length + ' línea(s) original(es) modificada(s):\n    ' + lost.slice(0, 5).map((l) => l.trim().slice(0, 120)).join('\n    ')); }
  }
  const bundleNow = base.bundle.reduce((s, f) => s + (fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : 0), 0);
  const boot = ['assets/js/lab/lab-boot.js'].filter((f) => fs.existsSync(path.join(ROOT, f))).reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log('Archivos existentes tocados (solo puntos de enganche): ' + (touched.join(' · ') || 'ninguno'));
  console.log('Paquete inicial: ' + (base.initialBundleBytes / 1024).toFixed(1) + ' KB → ' + ((bundleNow + boot) / 1024).toFixed(1) + ' KB (' + (((bundleNow + boot) - base.initialBundleBytes) / 1024).toFixed(2) + ' KB: enlaces del menú, rutas, pestaña y cargador del laboratorio; el resto se carga solo en sus rutas)');
  if (bad) { console.error('\n✗ ' + bad + ' problema(s) de no regresión'); process.exit(1); }
  console.log('✓ Ningún archivo existente perdió ni cambió líneas; solo se agregaron enganches aprobados.');
} else if (cmd === 'dom') {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/lab/linea-base-dom.json'), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lab/dom-after.json'), 'utf8'));
  // diferencias permitidas por el plan: el enlace «Laboratorio» en los menús y la pestaña «Avanzado» del partido
  const without = (arr, re) => JSON.stringify(arr.filter((t) => !re.test(t)));
  let diffs = 0, same = 0;
  const cmp = (label, x, y, re) => {
    const ok = JSON.stringify(x) === JSON.stringify(y) || (re && Array.isArray(y) && without(y, re) === JSON.stringify(x));
    if (ok) same++; else { diffs++; console.error('✗ ' + label + '\n    antes: ' + JSON.stringify(x).slice(0, 200) + '\n    ahora: ' + JSON.stringify(y).slice(0, 200)); }
  };
  for (const mode of Object.keys(a)) {
    const x = a[mode], y = b[mode];
    if (!y) { diffs++; console.error('✗ falta el modo ' + mode); continue; }
    cmp(mode + ' · menú superior', x.nav, y.nav, /^Laboratorio$/);
    cmp(mode + ' · menú móvil', x.bottom, y.bottom);
    cmp(mode + ' · pie de página', x.footer, y.footer, /^Laboratorio$/);
    cmp(mode + ' · tokens de diseño', x.tokens, y.tokens);
    cmp(mode + ' · estructura base', x.shell, y.shell);
    for (const r of Object.keys(x.routes)) {
      const yr = y.routes[r];
      if (!yr) { diffs++; console.error('✗ falta ' + mode + ' ' + r); continue; }
      cmp(mode + ' ' + r + ' · pestañas', x.routes[r].tabs, yr.tabs, r.startsWith('/partido') ? /^Avanzado$/ : null);
      cmp(mode + ' ' + r + ' · pantalla', x.routes[r].h, yr.h);
    }
  }
  if (diffs) { console.error('\n✗ ' + diffs + ' diferencia(s) en pantallas existentes'); process.exit(1); }
  console.log('✓ ' + same + ' firmas de pantalla idénticas (oscuro, claro, móvil y movimiento reducido); solo cambian el enlace del laboratorio y la pestaña Avanzado.');
}

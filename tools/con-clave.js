/*
 * Despliegue · para auditar un servidor publicado con contraseña sin tocar las herramientas:
 *   XPECTED_PASSWORD=tu-clave node -r ./tools/con-clave.js tools/verify-lab.js https://tu-sitio
 * Agrega la contraseña (HTTP Basic) a cada fetch que hagan las herramientas hacia ese sitio.
 */
'use strict';
const pass = (process.env.XPECTED_PASSWORD || '').trim();
if (pass && typeof globalThis.fetch === 'function') {
  const orig = globalThis.fetch;
  const target = (process.argv.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/+$/, '');
  globalThis.fetch = (url, opts) => {
    const u = String(url && url.url ? url.url : url);
    if (!target || !u.startsWith(target)) return orig(url, opts);
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({}, o.headers || {}, { Authorization: 'Basic ' + Buffer.from('xpected:' + pass).toString('base64') });
    return orig(url, o);
  };
}

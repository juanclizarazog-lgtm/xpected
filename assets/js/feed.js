/*
 * Xpected · cliente del gateway de cuotas (SSE).
 * Contrato: mensajes { type: 'odds' | 'remove' | 'snapshot', version, ts, payload } con versión monótona;
 * el cliente descarta mensajes viejos y reconecta solo (EventSource + retry).
 */
(function () {
  'use strict';
  const XP = window.XP, F = XP.fmt;
  const feed = (XP.feed = { mode: 'demo', status: null, connected: false, version: -1, lastMsg: 0, messages: 0, es: null });

  function label() {
    if (feed.mode === 'demo') return { cls: 'demo', text: 'Demo simulada', title: 'Sin proveedor de cuotas configurado: el navegador simula el mercado.' };
    const s = feed.status || {};
    if (!feed.connected) return { cls: 'warn', text: 'Reconectando…', title: 'Conexión con el gateway perdida; reintento automático.' };
    if (s.error) return { cls: 'warn', text: 'Proveedor con error', title: s.error };
    const ago = s.lastSync ? F.ago(new Date(s.lastSync).getTime()) : '—';
    return { cls: 'ok', text: (feed.mode === 'mock' ? 'Feed simulado' : 'Sincronizado') + ' · ' + ago, title: (s.provider || '') + ' · ' + (s.events || 0) + ' eventos · ' + (s.books || 0) + ' casas' };
  }
  function paint() {
    XP.$$('[data-feed-status]').forEach((el) => {
      const l = label();
      el.className = 'feed-pill ' + l.cls;
      el.title = l.title;
      const t = el.querySelector('.fp-text');
      if (t && t.textContent !== l.text) t.textContent = l.text;
    });
  }
  feed.paint = paint;

  function onMessage(d, structural) {
    feed.lastMsg = Date.now();
    feed.messages++;
    if (d.version != null) {
      if (d.version <= feed.version) return; // fuera de orden: se descarta
      feed.version = d.version;
    }
    const before = XP.data.matches.length;
    const m = XP.data.upsertExternal(d.payload);
    const wasOn = XP.data.feedOn;
    if (!wasOn && m) XP.data.useFeed(true);
    XP.data.syncFeedList();
    if (m) XP.bus.emit('match', m);
    if (structural || !wasOn || before !== XP.data.matches.length) XP.bus.emit('matches-changed');
  }

  async function init() {
    paint();
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('sin gateway');
      feed.status = await r.json();
    } catch (e) { return paint(); }
    feed.mode = feed.status.mode;
    paint();
    if (feed.mode === 'demo') return;
    const es = (feed.es = new EventSource('/api/stream'));
    es.onopen = () => { feed.connected = true; paint(); };
    es.onerror = () => { feed.connected = false; paint(); };
    es.addEventListener('status', (e) => { feed.status = JSON.parse(e.data); paint(); XP.bus.emit('feed-status', feed.status); });
    es.addEventListener('snapshot', (e) => {
      const d = JSON.parse(e.data);
      feed.version = d.version;
      let any = false;
      d.events.forEach((ev) => { if (XP.data.upsertExternal(ev)) any = true; });
      if (any) XP.data.useFeed(true);
      XP.data.syncFeedList();
      XP.bus.emit('matches-changed');
    });
    es.addEventListener('odds', (e) => onMessage(JSON.parse(e.data), false));
    es.addEventListener('remove', (e) => {
      const d = JSON.parse(e.data);
      if (d.version <= feed.version) return;
      feed.version = d.version;
      XP.data.removeExternal(d.eventId);
      XP.bus.emit('matches-changed');
    });
  }

  XP.bus.on('heartbeat', paint);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/*
 * Xpected · servidor de desarrollo + gateway de cuotas en tiempo real (SSE).
 *
 *   node server.js [puerto]
 *
 * Modos (variable ODDS_PROVIDER):
 *   demo        (por defecto sin clave)  el navegador usa su simulación interna.
 *   theoddsapi  (por defecto con clave)  cuotas reales de The Odds API v4, normalizadas y empujadas por SSE.
 *   mock                                 mismo formato que The Odds API, generado aquí: prueba el flujo completo sin gastar créditos.
 *
 * Variables:
 *   ODDS_API_KEY        clave del proveedor (solo en el servidor; nunca llega al navegador)
 *   ODDS_SPORTS         claves de competición separadas por coma (consulta /api/sports)
 *   ODDS_REGIONS        regiones de casas (por defecto eu, incluye la referencia afilada)
 *   ODDS_POLL_SECONDS   intervalo de consulta (mín. 15 s; cada consulta consume créditos)
 *   ODDS_ALLOWED_BOOKS  lista blanca de operadores autorizados por Coljuegos (claves del proveedor).
 *                       Las demás casas se muestran anonimizadas: «Libro A», «Libro B»…
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const Q = require('./assets/js/quant.js');
const LAB = require('./lib/lab/index.js'); // Fase 6 · laboratorio (solo agrega /api/lab/* y el mensaje SSE «intensity»)

const ROOT = __dirname;

// ── .env local: la clave vive solo en este archivo del servidor (nunca se sirve ni se envía al navegador) ──
(function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line) => {
    if (/^\s*#/.test(line)) return;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) return;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[m[1]]) process.env[m[1]] = v;
  });
})();

const PORT = +process.argv.slice(2).find((a) => /^\d+$/.test(a)) || +process.env.PORT || 5173;
const KEY = (process.env.ODDS_API_KEY || '').trim();
// espn (por defecto): partidos, resultados, tablas y cuota de referencia reales, sin clave.
const PROVIDER = process.env.ODDS_PROVIDER || (process.argv.includes('--mock') ? 'mock' : process.argv.includes('--demo') ? 'demo' : KEY ? 'theoddsapi' : 'espn');
const ESPN = require('./lib/espn.js');
const MODEL = require('./lib/model.js');
require('./lib/seed.js')(ROOT); // despliegue: datos iniciales de lib/seed/ si data/ está vacía (nunca sobrescribe)
// despliegue: contraseña opcional para que el sitio no sea público mientras la fuente de datos sea solo de desarrollo
const SITE_PASSWORD = (process.env.XPECTED_PASSWORD || '').trim();
const TRACK = require('./lib/track.js').createTrack(path.join(ROOT, 'data'));
const LEAGUES = (process.env.ESPN_LEAGUES || 'col.1,eng.1,esp.1,uefa.champions,conmebol.libertadores').split(',').map((s) => s.trim()).filter(Boolean);
const CFG = {
  sports: (process.env.ODDS_SPORTS || 'soccer_epl,soccer_spain_la_liga,soccer_conmebol_copa_libertadores').split(',').map((s) => s.trim()).filter(Boolean),
  regions: process.env.ODDS_REGIONS || 'eu',
  markets: process.env.ODDS_MARKETS || 'h2h,totals',
  poll: PROVIDER === 'mock' ? Math.max(2, +process.env.ODDS_POLL_SECONDS || 5) : Math.max(15, +process.env.ODDS_POLL_SECONDS || 60),
  minCredits: Math.max(0, +process.env.ODDS_MIN_CREDITS || 15),
  allowed: (process.env.ODDS_ALLOWED_BOOKS || '').split(',').map((s) => s.trim()).filter(Boolean),
};
/** Créditos que consume una sincronización de cuotas: competiciones × mercados × regiones. */
const COST = CFG.sports.length * CFG.markets.split(',').length * CFG.regions.split(',').length;
const SHARP = { pinnacle: 'Referencia afilada', betfair_ex_eu: 'Exchange de referencia', matchbook: 'Exchange de referencia 2' };

// ── estado del gateway ────────────────────────────────────────────────────────
const events = new Map();
const clients = new Set();
let version = 0;
const status = {
  mode: PROVIDER === 'demo' ? 'demo' : PROVIDER === 'mock' ? 'mock' : 'live',
  provider: PROVIDER === 'theoddsapi' ? 'The Odds API v4' : PROVIDER === 'mock' ? 'Simulador con formato The Odds API' : PROVIDER === 'espn' ? 'Marcadores públicos de ESPN' : null,
  sports: PROVIDER === 'espn' ? LEAGUES : CFG.sports, pollSeconds: PROVIDER === 'espn' ? 20 : CFG.poll, lastSync: null, latencyMs: null,
  remaining: null, used: null, error: null, events: 0, books: 0,
  costPerSync: PROVIDER === 'theoddsapi' ? COST : 0, paced: false, idle: false, nextPollAt: null,
};

// ── anonimización de casas (Parte VI: sin marca salvo lista blanca) ───────────
const bookLabels = new Map();
function labelFor(key, title) {
  if (CFG.allowed.includes(key)) return title;
  if (SHARP[key]) return SHARP[key];
  if (!bookLabels.has(key)) {
    const n = bookLabels.size;
    bookLabels.set(key, 'Libro ' + (n < 26 ? String.fromCharCode(65 + n) : 'A' + String.fromCharCode(65 + (n - 26))));
  }
  return bookLabels.get(key);
}

/** Normaliza un evento con el formato de The Odds API v4. Nunca reenvía la clave ni la marca de la casa. */
function normalize(e) {
  const books = (e.bookmakers || []).map((b) => {
    const h2h = (b.markets || []).find((m) => m.key === 'h2h');
    const tot = (b.markets || []).find((m) => m.key === 'totals');
    const price = (name) => { const o = h2h && h2h.outcomes.find((x) => x.name === name); return o ? o.price : null; };
    let totals = null;
    if (tot) {
      const points = [...new Set(tot.outcomes.map((o) => o.point))].sort((a, b) => Math.abs(a - 2.5) - Math.abs(b - 2.5));
      const pt = points[0];
      const over = tot.outcomes.find((o) => o.name === 'Over' && o.point === pt);
      const under = tot.outcomes.find((o) => o.name === 'Under' && o.point === pt);
      if (over && under) totals = { point: pt, over: over.price, under: under.price };
    }
    return {
      label: labelFor(b.key, b.title), sharp: !!SHARP[b.key], updated: b.last_update,
      h2h: h2h ? { home: price(e.home_team), draw: price('Draw'), away: price(e.away_team) } : null,
      totals,
    };
  }).filter((b) => (b.h2h && b.h2h.home && b.h2h.draw && b.h2h.away) || b.totals)
    .sort((a, b) => (b.sharp - a.sharp) || a.label.localeCompare(b.label));
  return {
    id: e.id, sportKey: e.sport_key, league: e.sport_title || e.sport_key,
    home: e.home_team, away: e.away_team, commence: e.commence_time,
    completed: false, scores: null, books,
    lastUpdate: books.reduce((t, b) => (b.updated && b.updated > t ? b.updated : t), ''),
  };
}

function applyScores(list) {
  (list || []).forEach((s) => {
    const ev = events.get(s.id);
    if (!ev) return;
    ev.completed = !!s.completed;
    if (Array.isArray(s.scores)) {
      const h = s.scores.find((x) => x.name === ev.home), a = s.scores.find((x) => x.name === ev.away);
      if (h && a) ev.scores = [parseInt(h.score, 10) || 0, parseInt(a.score, 10) || 0];
    }
  });
}

// ── SSE ───────────────────────────────────────────────────────────────────────
function send(res, type, data) { res.write('id: ' + version + '\nevent: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
function broadcast(type, data) { clients.forEach((res) => send(res, type, data)); }

function commit(nextList, source) {
  const seen = new Set();
  let changed = 0;
  nextList.forEach((ev) => {
    seen.add(ev.id);
    const prev = events.get(ev.id);
    if (prev) { ev.completed = ev.completed || prev.completed; ev.scores = ev.scores || prev.scores; }
    // firma sin marcas de tiempo: solo se reenvía si cambió algo que el usuario ve
    const sig = JSON.stringify(ev, (k, v) => (k === 'updated' || k === 'lastUpdate' ? undefined : v));
    if (!prev || prev._sig !== sig) {
      version++;
      Object.defineProperty(ev, '_sig', { value: sig, enumerable: false });
      events.set(ev.id, ev);
      broadcast('odds', { type: 'odds', eventId: ev.id, version, ts: Date.now(), payload: ev });
      changed++;
    }
  });
  if (source === 'full') {
    events.forEach((ev, id) => {
      if (!seen.has(id) && Date.now() - new Date(ev.commence).getTime() > 4 * 3600e3) {
        events.delete(id); version++; broadcast('remove', { type: 'remove', eventId: id, version });
      }
    });
  }
  status.events = events.size;
  status.books = new Set([...events.values()].flatMap((e) => e.books.map((b) => b.label))).size;
  return changed;
}

// ── proveedor real: The Odds API v4 ───────────────────────────────────────────
async function getJSON(url) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  status.latencyMs = Date.now() - t0;
  if (r.headers.get('x-requests-remaining') != null) status.remaining = +r.headers.get('x-requests-remaining');
  if (r.headers.get('x-requests-used') != null) status.used = +r.headers.get('x-requests-used');
  if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 401 ? ' (clave inválida)' : r.status === 429 ? ' (límite de créditos)' : ''));
  return r.json();
}
async function pollTheOddsApi() {
  const base = 'https://api.the-odds-api.com/v4/sports/';
  const all = [];
  for (const sport of CFG.sports) {
    const url = base + encodeURIComponent(sport) + '/odds/?apiKey=' + encodeURIComponent(KEY) + '&regions=' + encodeURIComponent(CFG.regions) + '&markets=' + encodeURIComponent(CFG.markets) + '&oddsFormat=decimal&dateFormat=iso';
    const data = await getJSON(url);
    data.filter((e) => new Date(e.commence_time).getTime() - Date.now() < 48 * 3600e3).forEach((e) => all.push(normalize(e)));
  }
  commit(all, 'full');
  const live = new Set([...events.values()].filter((e) => new Date(e.commence) < new Date() && !e.completed).map((e) => e.sportKey));
  for (const sport of live) {
    const scores = await getJSON(base + encodeURIComponent(sport) + '/scores/?apiKey=' + encodeURIComponent(KEY) + '&dateFormat=iso');
    applyScores(scores);
    const touched = [...events.values()].filter((e) => e.sportKey === sport).map((e) => Object.assign({}, e));
    commit(touched, 'partial');
  }
}

// ── proveedor simulado con el mismo formato (para probar sin créditos) ────────
const MOCK = (() => {
  const rand = Q.mulberry32(20261107);
  const g = () => Q.gaussian(rand);
  const leagues = [
    ['soccer_epl', 'EPL', [['Arsenal', 0.36], ['Liverpool', 0.34], ['Chelsea', 0.2], ['Newcastle United', 0.14], ['Aston Villa', 0.1], ['Brighton and Hove Albion', 0.02]]],
    ['soccer_spain_la_liga', 'La Liga - Spain', [['Real Madrid', 0.4], ['Barcelona', 0.39], ['Atlético Madrid', 0.26], ['Athletic Bilbao', 0.14], ['Villarreal', 0.12], ['Sevilla', -0.02]]],
    ['soccer_conmebol_copa_libertadores', 'Copa Libertadores', [['Flamengo', 0.32], ['Palmeiras', 0.3], ['River Plate', 0.27], ['Boca Juniors', 0.2], ['Atlético Nacional', 0.16], ['Racing Club', 0.17]]],
  ];
  const books = [['pinnacle', 'Pinnacle', 0.022], ['alpha', 'Alpha', 0.05], ['bravo', 'Bravo', 0.058], ['charlie', 'Charlie', 0.045], ['delta', 'Delta', 0.064]];
  const list = [];
  let n = 0;
  leagues.forEach(([key, title, teams], li) => {
    for (let i = 0; i < teams.length; i += 2) {
      const [hn, hs] = teams[i], [an, as] = teams[i + 1];
      const live = (i === 0 && li < 2) || (i === 2 && li === 2);
      const startMin = live ? [27, 64, 81][li] : 0;
      list.push({
        id: 'mock' + (++n).toString(16).padStart(6, '0') + key.length.toString(16),
        sport_key: key, sport_title: title, home_team: hn, away_team: an,
        commence: live ? Date.now() - startMin * 60e3 : Date.now() + (1 + n * 0.8) * 3600e3,
        lam: Math.exp(Math.log(1.3) + hs * 0.8 - as * 0.65 + 0.22), mu: Math.exp(Math.log(1.3) + as * 0.8 - hs * 0.65),
        score: [0, 0], noise: books.map(() => [g() * 0.03, g() * 0.03, g() * 0.03, g() * 0.02]),
      });
    }
  });
  function minuteOf(ev) { const m = (Date.now() - ev.commence) / 60000; return Math.max(0, m > 60 ? m - 15 : m); }
  function tick() {
    list.forEach((ev) => {
      ev.lam *= Math.exp(g() * 0.01); ev.mu *= Math.exp(g() * 0.01);
      ev.noise.forEach((nz) => { for (let k = 0; k < nz.length; k++) nz[k] = nz[k] * 0.9 + g() * 0.008; });
      const min = minuteOf(ev);
      if (ev.commence < Date.now() && min < 93) {
        const dt = (CFG.poll / 60) * 8; // goles acelerados ×8 para que la prueba muestre eventos
        if (rand() < (ev.lam / 90) * dt) ev.score[0]++;
        if (rand() < (ev.mu / 90) * dt) ev.score[1]++;
      }
    });
  }
  function raw() {
    return list.map((ev) => {
      const min = minuteOf(ev);
      const started = ev.commence < Date.now();
      const done = started && min >= 93;
      const l = started ? Q.liveLambda(ev.lam, min) : ev.lam, u = started ? Q.liveLambda(ev.mu, min) : ev.mu;
      const mk = Q.marketsFromMatrix(Q.scoreMatrix(l, u, started ? 0 : -0.07, 10), started ? ev.score[0] : 0, started ? ev.score[1] : 0);
      const ts = new Date().toISOString();
      return {
        id: ev.id, sport_key: ev.sport_key, sport_title: ev.sport_title, commence_time: new Date(ev.commence).toISOString(),
        home_team: ev.home_team, away_team: ev.away_team, _done: done, _score: ev.score.slice(),
        bookmakers: done ? [] : books.map(([key, title, mg], bi) => {
          const nz = ev.noise[bi];
          const p = [mk.home, mk.draw, mk.away].map((x, k) => Math.max(0.004, x * (1 + (key === 'pinnacle' ? nz[k] * 0.2 : nz[k]))));
          const s = p.reduce((a, b) => a + b, 0);
          const o = Q.applyMargin(p.map((x) => x / s), mg).map((x) => Math.max(1.01, Math.floor(x * 100) / 100));
          const po = Math.min(0.97, Math.max(0.03, mk.over[2.5] * (1 + nz[3])));
          const ot = Q.applyMargin([po, 1 - po], mg).map((x) => Math.max(1.01, Math.floor(x * 100) / 100));
          return { key, title, last_update: ts, markets: [
            { key: 'h2h', outcomes: [{ name: ev.home_team, price: o[0] }, { name: 'Draw', price: o[1] }, { name: ev.away_team, price: o[2] }] },
            { key: 'totals', outcomes: [{ name: 'Over', price: ot[0], point: 2.5 }, { name: 'Under', price: ot[1], point: 2.5 }] },
          ] };
        }),
      };
    });
  }
  return { tick, raw };
})();

async function pollMock() {
  MOCK.tick();
  const raw = MOCK.raw();
  const list = raw.map((e) => {
    const ev = normalize(e);
    if (new Date(e.commence_time) < new Date()) ev.scores = e._score;
    ev.completed = e._done;
    return ev;
  });
  status.latencyMs = 3 + Math.round(Math.random() * 8);
  commit(list, 'full');
}

// ── fuente pública (ESPN): partidos, resultados, tablas y cuota de referencia ─
const espnPoller = PROVIDER === 'espn' ? ESPN.createPoller({ leagues: LEAGUES }) : null;
async function pollEspn() {
  const t0 = Date.now();
  const r = await espnPoller.cycle(!clients.size);
  if (r.requests) status.latencyMs = Math.round((Date.now() - t0) / Math.max(1, Math.ceil(r.requests / 6)));
  if (!r.events.length && r.errors) throw new Error('No se pudo contactar la fuente de datos (' + r.errors + ' errores de red)');
  r.events.forEach((ev) => {
    try { ev.model = MODEL.build(ev); TRACK.update(ev); } catch (e) { console.error('[modelo] ' + ev.id + ': ' + e.message); }
  });
  commit(r.events, 'full');
  LAB.afterPoll([...events.values()], broadcast);
  status.live = r.live;
}

async function poll() {
  try {
    if (PROVIDER === 'theoddsapi') await pollTheOddsApi();
    else if (PROVIDER === 'mock') await pollMock();
    else if (PROVIDER === 'espn') await pollEspn();
    status.lastSync = new Date().toISOString();
    status.error = null;
  } catch (err) {
    status.error = String(err.message || err);
    console.error('[odds] ' + status.error);
  }
  broadcast('status', status);
}

// ── planificador con presupuesto de créditos ──────────────────────────────────
// 1) Sin visitantes conectados no se consulta (no se gastan créditos).
// 2) El intervalo se estira para que los créditos restantes alcancen hasta fin de mes.
// 3) Por debajo de ODDS_MIN_CREDITS se pausa para no superar el plan.
let pollTimer = 0;
function pacedDelay() {
  let d = CFG.poll;
  status.paced = false;
  if (PROVIDER === 'theoddsapi' && status.remaining != null) {
    const now = new Date();
    const secsLeft = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime()) / 1000;
    const syncsLeft = Math.max(1, (status.remaining - CFG.minCredits) / COST);
    const paced = Math.min(3600, secsLeft / syncsLeft);
    if (paced > d) { d = paced; status.paced = true; }
  }
  return Math.round(d);
}
function schedule(sec) {
  clearTimeout(pollTimer);
  status.nextPollAt = new Date(Date.now() + sec * 1000).toISOString();
  pollTimer = setTimeout(cycle, sec * 1000);
}
async function cycle() {
  if (PROVIDER === 'theoddsapi') {
    if (status.remaining != null && status.remaining <= CFG.minCredits) {
      status.error = 'Créditos casi agotados (' + status.remaining + ' restantes): consultas en pausa para no superar el plan.';
      broadcast('status', status);
      return schedule(3600);
    }
    if (!clients.size && status.lastSync) {
      status.idle = true;
      clearTimeout(pollTimer); pollTimer = setTimeout(cycle, 5000);
      return;
    }
  }
  status.idle = false;
  await poll();
  if (status.error && /HTTP 401/.test(status.error)) {
    // clave rechazada: no tiene sentido reintentar; se corrige en .env y se reinicia el servidor
    status.error = 'Clave rechazada por The Odds API (HTTP 401). Revisa ODDS_API_KEY en .env y reinicia el servidor.';
    status.nextPollAt = null;
    broadcast('status', status);
    return;
  }
  status.pollSeconds = PROVIDER === 'espn' ? (status.live ? 10 : 30) : pacedDelay();
  schedule(status.pollSeconds);
  broadcast('status', status);
}
function wake() {
  // un visitante llegó tras un periodo sin consultas: sincroniza ya si los datos están viejos
  if (PROVIDER !== 'theoddsapi' || !status.idle) return;
  const age = status.lastSync ? Date.now() - new Date(status.lastSync).getTime() : Infinity;
  if (age > status.pollSeconds * 1000) { clearTimeout(pollTimer); cycle(); }
}

if (PROVIDER !== 'demo') {
  if (PROVIDER === 'theoddsapi' && !KEY) { status.error = 'Falta ODDS_API_KEY'; }
  else cycle();
}
setInterval(() => clients.forEach((res) => res.write(': hb ' + Date.now() + '\n\n')), 15000);

// ── HTTP ──────────────────────────────────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };

function json(res, code, data) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SEC)); res.end(JSON.stringify(data)); }
/** Despliegue: acceso con contraseña (HTTP Basic; cualquier usuario). Comparación en tiempo constante. */
function passwordOk(req) {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const given = Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':');
  const h = (s) => require('crypto').createHash('sha256').update(s).digest();
  return require('crypto').timingSafeEqual(h(given), h(SITE_PASSWORD));
}

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/healthz') return json(res, 200, { ok: true }); // despliegue: chequeo de salud del hosting (sin datos)
  if (SITE_PASSWORD && !passwordOk(req)) { res.writeHead(401, Object.assign({ 'WWW-Authenticate': 'Basic realm="Xpected", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' }, SEC)); return res.end('Xpected es privada por ahora: escribe la contraseña de acceso.'); }

  if (url === '/api/status') return json(res, 200, status);
  if (url === '/api/track') return json(res, 200, TRACK.summary());
  if (url === '/api/events') return json(res, 200, { version, lastSync: status.lastSync, events: [...events.values()] });
  if (url.startsWith('/api/lab/')) return LAB.handle(url, res, json, [...events.values()]);

  if (url === '/api/stream') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' }, SEC));
    res.write('retry: 3000\n\n');
    send(res, 'status', status);
    send(res, 'snapshot', { type: 'snapshot', version, ts: Date.now(), events: [...events.values()] });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    wake();
    return;
  }

  if (url === '/api/sports') {
    if (PROVIDER !== 'theoddsapi' || !KEY) return json(res, 200, { note: 'Configura ODDS_API_KEY para listar competiciones', sports: CFG.sports });
    try { return json(res, 200, await getJSON('https://api.the-odds-api.com/v4/sports/?apiKey=' + encodeURIComponent(KEY))); }
    catch (err) { return json(res, 502, { error: String(err.message) }); }
  }

  let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  // nunca servir archivos ocultos (.env, .claude…) ni el código del servidor
  if (!file.startsWith(ROOT) || /(^|[\\/])\.|^server\.js$|^(lib|data)([\\/]|$)/.test(path.relative(ROOT, file))) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) file = path.join(ROOT, 'index.html');
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }, SEC));
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log('Xpected en http://localhost:' + PORT + ' · cuotas: ' + status.mode + (status.provider ? ' (' + status.provider + ')' : '')));
LAB.init({ log: (m) => console.log('[laboratorio] ' + m) });

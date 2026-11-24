const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

/** Load simple KEY=VALUE pairs from .env if present without external deps. */
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3010);
const TMDB_API_KEY = process.env.TMDB_API_KEY || '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const DEFAULT_REGION = process.env.DEFAULT_REGION || 'US';
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'netfilla.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_watchlist (
    user_id INTEGER PRIMARY KEY,
    items_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_history (
    user_id INTEGER PRIMARY KEY,
    items_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const DEFAULT_PREFERENCES = {
  region: DEFAULT_REGION,
  industries: [],
  platforms: [],
  genres: [],
  contentTypes: [],
  languages: []
};

/** Ensure default guest profile exists so unauthenticated browsing persists seamlessly. */
function ensureGuestUser() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('guest');
  if (existing) return existing.id;
  const info = db
    .prepare(
      'INSERT INTO users (username, display_name, password_hash, salt, is_guest, created_at) VALUES (?, ?, ?, ?, 1, ?)'
    )
    .run('guest', 'Guest Viewer', 'guest', 'guest', Date.now());
  const userId = Number(info.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO user_preferences (user_id, preferences_json, updated_at) VALUES (?, ?, ?)')
    .run(userId, JSON.stringify(DEFAULT_PREFERENCES), Date.now());
  db.prepare('INSERT OR IGNORE INTO user_watchlist (user_id, items_json, updated_at) VALUES (?, ?, ?)')
    .run(userId, '[]', Date.now());
  db.prepare('INSERT OR IGNORE INTO user_history (user_id, items_json, updated_at) VALUES (?, ?, ?)')
    .run(userId, '[]', Date.now());
  return userId;
}

const GUEST_USER_ID = ensureGuestUser();
const inFlightRequests = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getSessionUser(req) {
  const token = req.headers['x-session-token'] || parseCookies(req).nf_session;
  if (token) {
    const row = db
      .prepare(
        'SELECT u.id, u.username, u.display_name, u.is_guest FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
      )
      .get(token, Date.now());
    if (row) return { ...row, is_guest: Boolean(row.is_guest), token };
  }
  const guest = db
    .prepare('SELECT id, username, display_name, is_guest FROM users WHERE id = ?')
    .get(GUEST_USER_ID);
  return { ...guest, is_guest: true, token: null };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

function getUserState(userId) {
  const prefRow = db.prepare('SELECT preferences_json FROM user_preferences WHERE user_id = ?').get(userId);
  const watchRow = db.prepare('SELECT items_json FROM user_watchlist WHERE user_id = ?').get(userId);
  const histRow = db.prepare('SELECT items_json FROM user_history WHERE user_id = ?').get(userId);
  return {
    preferences: prefRow ? { ...DEFAULT_PREFERENCES, ...JSON.parse(prefRow.preferences_json) } : { ...DEFAULT_PREFERENCES },
    watchlist: watchRow ? JSON.parse(watchRow.items_json) : [],
    history: histRow ? JSON.parse(histRow.items_json) : []
  };
}

/** Cache wrapper with SQLite persistence and in-flight request deduplication. */
async function cachedFetchJson(cacheKey, ttlMs, fetcher) {
  const now = Date.now();
  const cached = db.prepare('SELECT payload_json, expires_at FROM api_cache WHERE cache_key = ?').get(cacheKey);
  if (cached && cached.expires_at > now) {
    return { data: JSON.parse(cached.payload_json), cached: true };
  }
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }
  const promise = (async () => {
    try {
      const payload = await fetcher();
      db.prepare('INSERT OR REPLACE INTO api_cache (cache_key, payload_json, expires_at) VALUES (?, ?, ?)').run(
        cacheKey,
        JSON.stringify(payload),
        Date.now() + ttlMs
      );
      return { data: payload, cached: false };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();
  inFlightRequests.set(cacheKey, promise);
  return promise;
}

function getTmdbTtl(tmdbPath) {
  if (tmdbPath.includes('/watch/providers') || tmdbPath.includes('/genre/')) return 6 * 60 * 60 * 1000;
  if (tmdbPath.includes('/trending') || tmdbPath.includes('/search/')) return 15 * 60 * 1000;
  if (tmdbPath.includes('/upcoming') || tmdbPath.includes('/on_the_air') || tmdbPath.includes('/airing_today')) {
    return 30 * 60 * 1000;
  }
  return 60 * 60 * 1000;
}

async function handleApiRequest(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, mode: 'backend', defaultRegion: DEFAULT_REGION });
  }

  if (pathname.startsWith('/api/tmdb/') && req.method === 'GET') {
    const tmdbPath = pathname.slice('/api/tmdb'.length);
    if (!/^\/[a-zA-Z0-9_./-]+$/.test(tmdbPath)) {
      return sendJson(res, 400, { error: 'Invalid TMDB path' });
    }
    const upstreamUrl = new URL(`https://api.themoviedb.org/3${tmdbPath}`);
    for (const [k, v] of parsedUrl.searchParams.entries()) {
      if (k !== 'api_key') upstreamUrl.searchParams.set(k, v);
    }
    upstreamUrl.searchParams.set('api_key', TMDB_API_KEY);
    const cacheKey = `tmdb:${tmdbPath}?${[...parsedUrl.searchParams.entries()]
      .filter(([k]) => k !== 'api_key')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')}`;
    try {
      const result = await cachedFetchJson(cacheKey, getTmdbTtl(tmdbPath), async () => {
        const upstream = await fetch(upstreamUrl.toString());
        if (!upstream.ok) {
          const text = await upstream.text();
          throw new Error(`TMDB ${upstream.status}: ${text.slice(0, 200)}`);
        }
        return upstream.json();
      });
      return sendJson(res, 200, result.data, { 'X-Cache': result.cached ? 'HIT' : 'MISS' });
    } catch (err) {
      return sendJson(res, 502, { error: err.message });
    }
  }

  if (pathname.startsWith('/api/tvmaze/') && req.method === 'GET') {
    const mazePath = pathname.slice('/api/tvmaze'.length);
    if (!/^\/[a-zA-Z0-9_./-]+$/.test(mazePath)) {
      return sendJson(res, 400, { error: 'Invalid TVmaze path' });
    }
    const upstreamUrl = new URL(`https://api.tvmaze.com${mazePath}`);
    for (const [k, v] of parsedUrl.searchParams.entries()) {
      upstreamUrl.searchParams.set(k, v);
    }
    const cacheKey = `tvmaze:${upstreamUrl.pathname}${upstreamUrl.search}`;
    try {
      const result = await cachedFetchJson(cacheKey, 30 * 60 * 1000, async () => {
        const upstream = await fetch(upstreamUrl.toString());
        if (!upstream.ok) throw new Error(`TVmaze ${upstream.status}`);
        return upstream.json();
      });
      return sendJson(res, 200, result.data, { 'X-Cache': result.cached ? 'HIT' : 'MISS' });
    } catch (err) {
      return sendJson(res, 502, { error: err.message });
    }
  }

  if (pathname === '/api/anilist' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const query = String(body.query || '');
      const variables = body.variables || {};
      if (!query) return sendJson(res, 400, { error: 'Missing GraphQL query' });
      const hash = crypto.createHash('sha256').update(JSON.stringify({ query, variables })).digest('hex');
      const result = await cachedFetchJson(`anilist:${hash}`, 30 * 60 * 1000, async () => {
        const upstream = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables })
        });
        if (!upstream.ok) throw new Error(`AniList ${upstream.status}`);
        return upstream.json();
      });
      return sendJson(res, 200, result.data, { 'X-Cache': result.cached ? 'HIT' : 'MISS' });
    } catch (err) {
      return sendJson(res, 502, { error: err.message });
    }
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const { username, displayName, password } = await readJsonBody(req);
      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanPass = String(password || '');
      const cleanName = String(displayName || cleanUser).trim();
      if (!/^[a-z0-9_.-]{3,32}$/.test(cleanUser)) {
        return sendJson(res, 400, { error: 'Username must be 3-32 alphanumeric/underscore characters.' });
      }
      if (cleanPass.length < 4) {
        return sendJson(res, 400, { error: 'Password must be at least 4 characters.' });
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
      if (existing) return sendJson(res, 409, { error: 'Username already taken.' });

      const { salt, hash } = hashPassword(cleanPass);
      const info = db
        .prepare('INSERT INTO users (username, display_name, password_hash, salt, is_guest, created_at) VALUES (?, ?, ?, ?, 0, ?)')
        .run(cleanUser, cleanName, hash, salt, Date.now());
      const userId = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO user_preferences (user_id, preferences_json, updated_at) VALUES (?, ?, ?)').run(
        userId,
        JSON.stringify(DEFAULT_PREFERENCES),
        Date.now()
      );
      db.prepare('INSERT INTO user_watchlist (user_id, items_json, updated_at) VALUES (?, ?, ?)').run(userId, '[]', Date.now());
      db.prepare('INSERT INTO user_history (user_id, items_json, updated_at) VALUES (?, ?, ?)').run(userId, '[]', Date.now());

      const token = createSession(userId);
      return sendJson(
        res,
        201,
        { user: { id: userId, username: cleanUser, display_name: cleanName, is_guest: false }, token },
        { 'Set-Cookie': `nf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` }
      );
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { username, password } = await readJsonBody(req);
      const cleanUser = String(username || '').trim().toLowerCase();
      const row = db.prepare('SELECT * FROM users WHERE username = ? AND is_guest = 0').get(cleanUser);
      if (!row) return sendJson(res, 401, { error: 'Invalid username or password.' });
      const { hash } = hashPassword(String(password || ''), row.salt);
      if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(row.password_hash, 'hex'))) {
        return sendJson(res, 401, { error: 'Invalid username or password.' });
      }
      const token = createSession(row.id);
      return sendJson(
        res,
        200,
        {
          user: { id: row.id, username: row.username, display_name: row.display_name, is_guest: false },
          token,
          state: getUserState(row.id)
        },
        { 'Set-Cookie': `nf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` }
      );
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const user = getSessionUser(req);
    if (user.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(user.token);
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': 'nf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }
    );
  }

  if (pathname === '/api/user/state' && req.method === 'GET') {
    const user = getSessionUser(req);
    return sendJson(res, 200, {
      user: { id: user.id, username: user.username, display_name: user.display_name, is_guest: user.is_guest },
      ...getUserState(user.id)
    });
  }

  if (pathname === '/api/user/preferences' && req.method === 'PUT') {
    try {
      const user = getSessionUser(req);
      const body = await readJsonBody(req);
      const merged = { ...DEFAULT_PREFERENCES, ...body };
      db.prepare('INSERT OR REPLACE INTO user_preferences (user_id, preferences_json, updated_at) VALUES (?, ?, ?)').run(
        user.id,
        JSON.stringify(merged),
        Date.now()
      );
      return sendJson(res, 200, { ok: true, preferences: merged });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/user/watchlist' && req.method === 'PUT') {
    try {
      const user = getSessionUser(req);
      const body = await readJsonBody(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
      db.prepare('INSERT OR REPLACE INTO user_watchlist (user_id, items_json, updated_at) VALUES (?, ?, ?)').run(
        user.id,
        JSON.stringify(items),
        Date.now()
      );
      return sendJson(res, 200, { ok: true, count: items.length });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/user/history' && req.method === 'PUT') {
    try {
      const user = getSessionUser(req);
      const body = await readJsonBody(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
      db.prepare('INSERT OR REPLACE INTO user_history (user_id, items_json, updated_at) VALUES (?, ?, ?)').run(
        user.id,
        JSON.stringify(items),
        Date.now()
      );
      return sendJson(res, 200, { ok: true, count: items.length });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

function serveStaticFile(req, res, parsedUrl) {
  let reqPath = decodeURIComponent(parsedUrl.pathname);
  if (reqPath === '/') reqPath = '/index.html';
  const resolved = path.resolve(__dirname, '.' + reqPath);
  if (
    (resolved !== __dirname && !resolved.startsWith(__dirname + path.sep)) ||
    resolved.endsWith('.env') ||
    resolved.includes(`${path.sep}data${path.sep}`)
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      return res.end(err.code === 'ENOENT' ? '404 Not Found' : 'Server Error');
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (parsedUrl.pathname.startsWith('/api/')) {
      return await handleApiRequest(req, res, parsedUrl);
    }
    return serveStaticFile(req, res, parsedUrl);
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NetFilla + DISCOVER server running at http://localhost:${PORT}`);
});

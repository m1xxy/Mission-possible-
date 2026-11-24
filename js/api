(function () {
  const IMG_URL = 'https://image.tmdb.org/t/p/w500';
  const BACKDROP_URL = 'https://image.tmdb.org/t/p/w780';
  const LOGO_URL = 'https://image.tmdb.org/t/p/original';

  const memCache = new Map();
  const inFlight = new Map();
  const LS_CACHE_PREFIX = 'nf_api_cache_v1_';

  const state = {
    backendAvailable: false,
    hasUserDb: false,
    checkedBackend: false,
    sessionToken: localStorage.getItem('nf_session_token') || null,
    user: { id: 1, username: 'guest', display_name: 'Guest Viewer', is_guest: true },
    preferences: {
      region: 'US',
      industries: [],
      platforms: [],
      genres: [],
      contentTypes: [],
      languages: []
    }
  };

  function getStandaloneKey() {
    return window.__NF_STANDALONE_KEY__ || localStorage.getItem('nf_standalone_tmdb_key') || '';
  }

  function readMemOrStorage(key) {
    const now = Date.now();
    const mem = memCache.get(key);
    if (mem && mem.expiresAt > now) return mem.data;
    try {
      const raw = localStorage.getItem(LS_CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt > now) {
        memCache.set(key, parsed);
        return parsed.data;
      }
      localStorage.removeItem(LS_CACHE_PREFIX + key);
    } catch {}
    return null;
  }

  function writeCache(key, data, ttlMs) {
    const entry = { data, expiresAt: Date.now() + ttlMs };
    memCache.set(key, entry);
    if (key.length < 140) {
      try {
        localStorage.setItem(LS_CACHE_PREFIX + key, JSON.stringify(entry));
      } catch {
        // Evict old API cache keys if quota is reached
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith(LS_CACHE_PREFIX))
            .slice(0, 20)
            .forEach((k) => localStorage.removeItem(k));
        } catch {}
      }
    }
  }

  async function dedupedCachedFetch(cacheKey, ttlMs, fetcher) {
    const hit = readMemOrStorage(cacheKey);
    if (hit !== null) return hit;
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
    const p = (async () => {
      try {
        const data = await fetcher();
        if (data) writeCache(cacheKey, data, ttlMs);
        return data;
      } finally {
        inFlight.delete(cacheKey);
      }
    })();
    inFlight.set(cacheKey, p);
    return p;
  }

  function buildQueryString(params = {}) {
    const sp = new URLSearchParams();
    Object.keys(params)
      .sort()
      .forEach((k) => {
        const val = params[k];
        if (val !== undefined && val !== null && val !== '') {
          sp.set(k, String(val));
        }
      });
    return sp.toString();
  }

  async function init() {
    if (state.checkedBackend) return state.backendAvailable;
    state.checkedBackend = true;
    if (window.location.protocol === 'file:' || window.__NF_FORCE_STANDALONE__) {
      state.backendAvailable = false;
      return false;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1800);
      const res = await fetch('/api/health', { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const info = await res.json();
        state.backendAvailable = Boolean(info && info.ok);
        state.hasUserDb = info && info.mode === 'backend';
        if (info.defaultRegion && !localStorage.getItem('nf_region_touched')) {
          state.preferences.region = info.defaultRegion;
        }
      }
    } catch {
      state.backendAvailable = false;
    }
    return state.backendAvailable;
  }

  async function tmdb(endpoint, params = {}, ttlMs = 20 * 60 * 1000) {
    await init();
    const cleanPath = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const qs = buildQueryString(params);
    const cacheKey = `tmdb:${cleanPath}?${qs}`;

    return dedupedCachedFetch(cacheKey, ttlMs, async () => {
      if (state.backendAvailable) {
        const url = `/api/tmdb${cleanPath}${qs ? '?' + qs : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`TMDB proxy error ${res.status}`);
        return res.json();
      }
      const key = getStandaloneKey();
      if (!key) {
        throw new Error('Standalone TMDB key not configured. Start server.js or use netfilla-standalone.html.');
      }
      const url = `https://api.themoviedb.org/3${cleanPath}?api_key=${encodeURIComponent(key)}${qs ? '&' + qs : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TMDB error ${res.status}`);
      return res.json();
    });
  }

  async function tvmaze(endpoint, params = {}, ttlMs = 30 * 60 * 1000) {
    await init();
    const cleanPath = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const qs = buildQueryString(params);
    const cacheKey = `tvmaze:${cleanPath}?${qs}`;

    return dedupedCachedFetch(cacheKey, ttlMs, async () => {
      const url = state.backendAvailable
        ? `/api/tvmaze${cleanPath}${qs ? '?' + qs : ''}`
        : `https://api.tvmaze.com${cleanPath}${qs ? '?' + qs : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TVmaze error ${res.status}`);
      return res.json();
    });
  }

  async function anilist(query, variables = {}, ttlMs = 30 * 60 * 1000) {
    await init();
    const keySeed = JSON.stringify({ query, variables });
    let hash = 0;
    for (let i = 0; i < keySeed.length; i++) {
      hash = (hash * 31 + keySeed.charCodeAt(i)) >>> 0;
    }
    const cacheKey = `anilist:${hash}`;

    return dedupedCachedFetch(cacheKey, ttlMs, async () => {
      const url = state.backendAvailable ? '/api/anilist' : 'https://graphql.anilist.co';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      if (!res.ok) throw new Error(`AniList error ${res.status}`);
      return res.json();
    });
  }

  function authHeaders(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (state.sessionToken) h['x-session-token'] = state.sessionToken;
    return h;
  }

  async function loadUserState() {
    await init();
    const localPrefs = (() => {
      try {
        return JSON.parse(localStorage.getItem('netfilla_preferences') || 'null');
      } catch {
        return null;
      }
    })();

    if (state.hasUserDb) {
      try {
        const res = await fetch('/api/user/state', { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data.user) state.user = data.user;
          if (data.preferences) state.preferences = { ...state.preferences, ...data.preferences };
          if (Array.isArray(data.watchlist) && data.watchlist.length > 0) {
            localStorage.setItem('netfilla_favs', JSON.stringify(data.watchlist));
          }
          if (Array.isArray(data.history) && data.history.length > 0) {
            localStorage.setItem('netfilla_history', JSON.stringify(data.history));
          }
          localStorage.setItem('netfilla_preferences', JSON.stringify(state.preferences));
          return {
            user: state.user,
            preferences: state.preferences,
            watchlist: JSON.parse(localStorage.getItem('netfilla_favs') || '[]'),
            history: JSON.parse(localStorage.getItem('netfilla_history') || '[]')
          };
        }
      } catch {}
    }

    if (localPrefs) state.preferences = { ...state.preferences, ...localPrefs };
    const localUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('netfilla_local_user') || 'null');
      } catch {
        return null;
      }
    })();
    if (localUser) state.user = localUser;
    return {
      user: state.user,
      preferences: state.preferences,
      watchlist: JSON.parse(localStorage.getItem('netfilla_favs') || '[]'),
      history: JSON.parse(localStorage.getItem('netfilla_history') || '[]')
    };
  }

  async function savePreferences(prefs) {
    state.preferences = { ...state.preferences, ...prefs };
    localStorage.setItem('netfilla_preferences', JSON.stringify(state.preferences));
    localStorage.setItem('nf_region_touched', '1');
    if (state.hasUserDb) {
      try {
        await fetch('/api/user/preferences', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(state.preferences)
        });
      } catch {}
    }
    return state.preferences;
  }

  async function saveWatchlist(items) {
    localStorage.setItem('netfilla_favs', JSON.stringify(items));
    if (state.hasUserDb) {
      try {
        await fetch('/api/user/watchlist', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ items })
        });
      } catch {}
    }
  }

  async function saveHistory(items) {
    localStorage.setItem('netfilla_history', JSON.stringify(items));
    if (state.hasUserDb) {
      try {
        await fetch('/api/user/history', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ items })
        });
      } catch {}
    }
  }

  async function registerAccount(username, displayName, password) {
    await init();
    if (state.hasUserDb) {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      state.user = data.user;
      state.sessionToken = data.token;
      localStorage.setItem('nf_session_token', data.token);
      await savePreferences(state.preferences);
      return data.user;
    }
    const localUser = {
      id: Date.now(),
      username: username.trim().toLowerCase(),
      display_name: (displayName || username).trim(),
      is_guest: false
    };
    state.user = localUser;
    localStorage.setItem('netfilla_local_user', JSON.stringify(localUser));
    return localUser;
  }

  async function loginAccount(username, password) {
    await init();
    if (state.hasUserDb) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      state.user = data.user;
      state.sessionToken = data.token;
      localStorage.setItem('nf_session_token', data.token);
      if (data.state) {
        state.preferences = { ...state.preferences, ...(data.state.preferences || {}) };
        localStorage.setItem('netfilla_preferences', JSON.stringify(state.preferences));
        localStorage.setItem('netfilla_favs', JSON.stringify(data.state.watchlist || []));
        localStorage.setItem('netfilla_history', JSON.stringify(data.state.history || []));
      }
      return data.user;
    }
    const localUser = {
      id: 1,
      username: username.trim().toLowerCase(),
      display_name: username.trim(),
      is_guest: false
    };
    state.user = localUser;
    localStorage.setItem('netfilla_local_user', JSON.stringify(localUser));
    return localUser;
  }

  async function logoutAccount() {
    if (state.hasUserDb && state.sessionToken) {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
      } catch {}
    }
    state.sessionToken = null;
    localStorage.removeItem('nf_session_token');
    localStorage.removeItem('netfilla_local_user');
    state.user = { id: 1, username: 'guest', display_name: 'Guest Viewer', is_guest: true };
    return loadUserState();
  }

  /** Resolve external TVmaze / AniList titles to real TMDB records so existing details & player work seamlessly. */
  async function resolveToTmdb(title, isTv = true, imdbId = null) {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle && !imdbId) return null;
    try {
      if (imdbId) {
        const findData = await tmdb(`/find/${encodeURIComponent(imdbId)}`, { external_source: 'imdb_id' }, 6 * 60 * 60 * 1000);
        const tvHit = findData.tv_results && findData.tv_results[0];
        const mvHit = findData.movie_results && findData.movie_results[0];
        const pick = isTv ? (tvHit || mvHit) : (mvHit || tvHit);
        if (pick) {
          pick.is_tv = Boolean(tvHit && pick.id === tvHit.id);
          return pick;
        }
      }
      const endpoint = isTv ? '/search/tv' : '/search/movie';
      const res = await tmdb(endpoint, { query: cleanTitle }, 2 * 60 * 60 * 1000);
      if (res && res.results && res.results.length > 0) {
        const best = res.results[0];
        best.is_tv = isTv;
        return best;
      }
      const multi = await tmdb('/search/multi', { query: cleanTitle }, 2 * 60 * 60 * 1000);
      if (multi && multi.results) {
        const media = multi.results.find((r) => r.media_type === 'tv' || r.media_type === 'movie');
        if (media) {
          media.is_tv = media.media_type === 'tv';
          return media;
        }
      }
    } catch {}
    return null;
  }

  window.nfApi = {
    IMG_URL,
    BACKDROP_URL,
    LOGO_URL,
    state,
    init,
    tmdb,
    tvmaze,
    anilist,
    loadUserState,
    savePreferences,
    saveWatchlist,
    saveHistory,
    registerAccount,
    loginAccount,
    logoutAccount,
    resolveToTmdb
  };
})();

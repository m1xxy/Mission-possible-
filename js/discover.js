(function () {
  const {
    INDUSTRIES,
    PLATFORMS,
    CONTENT_TYPES,
    GENRES,
    LANGUAGES,
    POPULAR_REGIONS
  } = window.DISCOVER_TAXONOMY;

  const state = {
    initialized: false,
    activeSubTab: 'overview',
    region: 'US',
    regionsList: [...POPULAR_REGIONS],
    regionProvidersMap: new Map(), // provider_id -> { id, name, logo_path }
    otherServices: [],
    showOtherServices: false,

    // Explore multi-filter selections
    selectedIndustries: new Set(),
    selectedPlatforms: new Set(),
    selectedContentTypes: new Set(),
    selectedGenres: new Set(),
    explorePage: 1,
    exploreHasMore: false,
    exploreResults: [],
    exploreLoading: false,

    // Calendar state
    calMode: 'month', // month | week | day
    calCursor: new Date(),
    calSelectedDate: null,
    calFilter: 'all', // all | movie | tv | anime | episode | theatrical | streaming
    calUsePrefs: false,
    calEventsByDate: new Map(),
    calMonthKeyLoaded: '',
    calLoading: false,

    // Preferences draft
    prefs: {
      region: 'US',
      industries: [],
      platforms: [],
      genres: [],
      contentTypes: [],
      languages: []
    }
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalIsoDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseIsoLocal(iso) {
    const [y, m, d] = (iso || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCountdown(isoDate, epochSec = null) {
    const now = Date.now();
    let targetMs;
    if (epochSec) {
      targetMs = epochSec * 1000;
    } else {
      const dt = parseIsoLocal(isoDate);
      if (!dt) return '';
      dt.setHours(23, 59, 0, 0);
      targetMs = dt.getTime();
    }
    const diffMs = targetMs - now;
    const todayIso = toLocalIsoDate(new Date());
    if (isoDate === todayIso && diffMs > -12 * 3600 * 1000) {
      if (diffMs > 0) {
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return hrs > 0 ? `Today • In ${hrs}h ${mins}m` : `Today • In ${mins}m`;
      }
      return 'Releasing Today';
    }
    if (diffMs < 0) return 'Released';
    const days = Math.floor(diffMs / 86400000);
    const hrs = Math.floor((diffMs % 86400000) / 3600000);
    if (days === 0) return `In ${hrs}h`;
    if (days === 1) return `Tomorrow${hrs > 0 ? ` • ${hrs}h` : ''}`;
    return `In ${days}d ${hrs}h`;
  }

  function syncPreferencesFromApi() {
    const saved = (window.nfApi && window.nfApi.state && window.nfApi.state.preferences) || {};
    state.prefs = {
      region: saved.region || 'US',
      industries: Array.isArray(saved.industries) ? [...saved.industries] : [],
      platforms: Array.isArray(saved.platforms) ? [...saved.platforms] : [],
      genres: Array.isArray(saved.genres) ? [...saved.genres] : [],
      contentTypes: Array.isArray(saved.contentTypes) ? [...saved.contentTypes] : [],
      languages: Array.isArray(saved.languages) ? [...saved.languages] : []
    };
    state.region = state.prefs.region || 'US';
    const regionSel = document.getElementById('discover-region-select');
    if (regionSel) regionSel.value = state.region;
    renderPreferencesTab();
  }

  async function onViewActivated() {
    if (!state.initialized) {
      state.initialized = true;
      state.calSelectedDate = toLocalIsoDate(new Date());
      syncPreferencesFromApi();
      bindGlobalSearch();
      await loadRegionsAndProviders();
      renderExploreSelectors();
      renderPreferencesTab();
      await loadOverviewDashboard();
    }
  }

  async function loadRegionsAndProviders() {
    try {
      const regRes = await window.nfApi.tmdb('/watch/providers/regions', {}, 24 * 60 * 60 * 1000);
      if (regRes && Array.isArray(regRes.results) && regRes.results.length > 0) {
        const popCodes = new Set(POPULAR_REGIONS.map((r) => r.code));
        const rest = regRes.results
          .filter((r) => !popCodes.has(r.iso_3166_1))
          .map((r) => ({ code: r.iso_3166_1, name: r.english_name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        state.regionsList = [...POPULAR_REGIONS, ...rest];
      }
    } catch {}

    const sel = document.getElementById('discover-region-select');
    if (sel) {
      sel.innerHTML = state.regionsList
        .map((r) => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.name)} (${escapeHtml(r.code)})</option>`)
        .join('');
      sel.value = state.region;
    }

    await refreshRegionalProviders();
  }

  async function refreshRegionalProviders() {
    state.regionProvidersMap.clear();
    state.otherServices = [];
    try {
      const [mProv, tProv] = await Promise.all([
        window.nfApi.tmdb('/watch/providers/movie', { watch_region: state.region }, 6 * 60 * 60 * 1000),
        window.nfApi.tmdb('/watch/providers/tv', { watch_region: state.region }, 6 * 60 * 60 * 1000)
      ]);
      const combined = [...(mProv.results || []), ...(tProv.results || [])];
      combined.forEach((p) => {
        if (!state.regionProvidersMap.has(p.provider_id)) {
          state.regionProvidersMap.set(p.provider_id, p);
        }
      });

      const canonicalIds = new Set(PLATFORMS.flatMap((p) => p.providerIds));
      state.otherServices = Array.from(state.regionProvidersMap.values())
        .filter((p) => !canonicalIds.has(p.provider_id))
        .sort((a, b) => (a.display_priority || 999) - (b.display_priority || 999))
        .slice(0, 18);
    } catch {}
    renderPlatformCards();
    renderPreferencesTab();
  }

  function getActiveRegionName() {
    const found = state.regionsList.find((r) => r.code === state.region);
    return found ? found.name : state.region;
  }

  async function changeRegion(newRegion) {
    state.region = newRegion || 'US';
    state.prefs.region = state.region;
    await window.nfApi.savePreferences(state.prefs);
    await refreshRegionalProviders();
    state.calMonthKeyLoaded = '';
    if (state.activeSubTab === 'overview') await loadOverviewDashboard();
    if (state.activeSubTab === 'calendar') await loadCalendarEvents(true);
    if (state.activeSubTab === 'explore') await runExploreQuery(true);
    window.showToast(`Region switched to ${getActiveRegionName()}`);
  }

  function switchDiscoverSubTab(subTab) {
    state.activeSubTab = subTab;
    document.querySelectorAll('.discover-subtab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.subtab === subTab);
    });
    document.querySelectorAll('.discover-subpanel').forEach((p) => {
      p.classList.toggle('hidden', p.id !== `discover-panel-${subTab}`);
    });
    if (subTab === 'calendar') loadCalendarEvents();
    if (subTab === 'explore' && state.exploreResults.length === 0) runExploreQuery(true);
    if (subTab === 'preferences') renderPreferencesTab();
  }

  // =========================================================================
  // 1. GLOBAL SEARCH INSIDE DISCOVER (Movies, Series, Actors, Directors, Taxonomy)
  // =========================================================================
  function bindGlobalSearch() {
    const input = document.getElementById('discover-global-search');
    const dropdown = document.getElementById('discover-search-dropdown');
    if (!input || !dropdown) return;

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
      }
      timer = setTimeout(() => runDiscoverAutocomplete(q), 260);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#discover-search-wrap')) {
        dropdown.classList.add('hidden');
      }
    });
  }

  async function runDiscoverAutocomplete(query) {
    const dropdown = document.getElementById('discover-search-dropdown');
    if (!dropdown) return;
    const ql = query.toLowerCase();

    const matchedIndustries = INDUSTRIES.filter(
      (i) => i.name.toLowerCase().includes(ql) || i.subtitle.toLowerCase().includes(ql)
    ).slice(0, 4);
    const matchedPlatforms = PLATFORMS.filter((p) => p.name.toLowerCase().includes(ql)).slice(0, 4);
    const matchedGenres = GENRES.filter((g) => g.name.toLowerCase().includes(ql)).slice(0, 4);
    const matchedRegions = state.regionsList
      .filter((r) => r.name.toLowerCase().includes(ql) || r.code.toLowerCase() === ql)
      .slice(0, 3);

    dropdown.classList.remove('hidden');
    dropdown.innerHTML = '<div class="p-4 text-xs text-gray-400">Searching global catalog...</div>';

    let mediaHits = [];
    let personHits = [];
    try {
      const res = await window.nfApi.tmdb('/search/multi', { query }, 10 * 60 * 1000);
      const results = res.results || [];
      mediaHits = results.filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path).slice(0, 6);
      personHits = results.filter((r) => r.media_type === 'person').slice(0, 4);
    } catch {}

    let html = '';

    // Quick taxonomy jumps
    if (matchedIndustries.length || matchedPlatforms.length || matchedGenres.length || matchedRegions.length) {
      html += `<div class="p-3 border-b border-white/10 bg-[#0d0d12]">
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Industries, Platforms, Countries &amp; Genres</p>
        <div class="flex flex-wrap gap-1.5">`;
      matchedIndustries.forEach((ind) => {
        html += `<button onclick="window.nfDiscover.jumpToExplore({industry:'${ind.id}'})" class="select-tile px-2.5 py-1.5 text-[11px] font-bold text-white">Industry: ${escapeHtml(ind.name)}</button>`;
      });
      matchedPlatforms.forEach((pl) => {
        html += `<button onclick="window.nfDiscover.jumpToExplore({platform:'${pl.id}'})" class="select-tile px-2.5 py-1.5 text-[11px] font-bold text-white">Platform: ${escapeHtml(pl.name)}</button>`;
      });
      matchedGenres.forEach((g) => {
        html += `<button onclick="window.nfDiscover.jumpToExplore({genre:'${g.id}'})" class="select-tile px-2.5 py-1.5 text-[11px] font-bold text-white">Genre: ${escapeHtml(g.name)}</button>`;
      });
      matchedRegions.forEach((rg) => {
        html += `<button onclick="window.nfDiscover.changeRegion('${escapeHtml(rg.code)}')" class="select-tile px-2.5 py-1.5 text-[11px] font-bold text-[#E50914]">Region: ${escapeHtml(rg.name)}</button>`;
      });
      html += `</div></div>`;
    }

    // Actors & Directors
    if (personHits.length) {
      html += `<div class="p-3 border-b border-white/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Actors &amp; Directors</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">`;
      personHits.forEach((p) => {
        const img = p.profile_path ? window.nfApi.IMG_URL + p.profile_path : '';
        html += `
          <div onclick="window.nfDiscover.openPersonCredits(${p.id}, ${escapeHtml(JSON.stringify(p.name || ''))})" class="flex items-center gap-3 p-2 bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition">
            <div class="w-9 h-9 bg-[#1b1b22] flex-shrink-0 overflow-hidden border border-white/15">
              ${img ? `<img src="${escapeHtml(img)}" class="w-full h-full object-cover">` : ''}
            </div>
            <div class="min-w-0">
              <p class="text-xs font-bold text-white truncate">${escapeHtml(p.name)}</p>
              <p class="text-[10px] text-gray-400 uppercase">${escapeHtml(p.known_for_department || 'Talent')}</p>
            </div>
          </div>`;
      });
      html += `</div></div>`;
    }

    // Movies & TV Series
    if (mediaHits.length) {
      html += `<div class="p-3">
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Movies &amp; TV Series</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">`;
      mediaHits.forEach((m) => {
        m.is_tv = m.media_type === 'tv';
        window.globalMovieData[m.id] = m;
        const yr = (m.release_date || m.first_air_date || '').split('-')[0] || 'TBA';
        html += `
          <div onclick="document.getElementById('discover-search-dropdown').classList.add('hidden'); showMovieDetails(${m.id})" class="flex items-center gap-3 p-2 bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition">
            <img src="${window.nfApi.IMG_URL + m.poster_path}" class="w-9 h-12 object-cover flex-shrink-0 border border-white/15">
            <div class="min-w-0 flex-1">
              <p class="text-xs font-bold text-white truncate">${escapeHtml(m.title || m.name)}</p>
              <p class="text-[10px] text-gray-400 uppercase">${m.is_tv ? 'TV Series' : 'Movie'} • ${escapeHtml(yr)} ${m.vote_average ? `• ★ ${m.vote_average.toFixed(1)}` : ''}</p>
            </div>
          </div>`;
      });
      html += `</div></div>`;
    }

    if (!html) {
      html = '<div class="p-4 text-xs text-gray-400">No direct matches found. Try another movie, actor, director, industry, or platform.</div>';
    }
    dropdown.innerHTML = html;
  }

  async function openPersonCredits(personId, personName) {
    document.getElementById('discover-search-dropdown')?.classList.add('hidden');
    const panel = document.getElementById('discover-person-credits-panel');
    const titleEl = document.getElementById('discover-person-title');
    const grid = document.getElementById('discover-person-grid');
    if (!panel || !grid) return;

    switchDiscoverSubTab('overview');
    panel.classList.remove('hidden');
    titleEl.textContent = `Filmography & Credits: ${personName}`;
    grid.innerHTML = '<div class="col-span-full py-6 text-center"><div class="nf-spinner animate-spin w-6 h-6 border-2 border-[#E50914] border-t-transparent mx-auto"></div></div>';

    try {
      const data = await window.nfApi.tmdb(`/person/${personId}/combined_credits`, {}, 60 * 60 * 1000);
      const all = [...(data.cast || []), ...(data.crew || [])];
      const seen = new Set();
      const unique = [];
      all
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .forEach((item) => {
          if (!item.poster_path || seen.has(`${item.media_type}:${item.id}`)) return;
          seen.add(`${item.media_type}:${item.id}`);
          item.is_tv = item.media_type === 'tv';
          unique.push(item);
        });
      grid.innerHTML = unique.slice(0, 18).map((m) => window.renderPosterCard(m, { isTv: m.is_tv })).join('') ||
        '<p class="col-span-full text-xs text-gray-400">No credited posters found.</p>';
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {
      grid.innerHTML = '<p class="col-span-full text-xs text-red-400">Could not load credits.</p>';
    }
  }

  function jumpToExplore({ industry, platform, genre, contentType }) {
    document.getElementById('discover-search-dropdown')?.classList.add('hidden');
    state.selectedIndustries.clear();
    state.selectedPlatforms.clear();
    state.selectedGenres.clear();
    state.selectedContentTypes.clear();

    if (industry) selectIndustryWithChildren(industry, true);
    if (platform) state.selectedPlatforms.add(platform);
    if (genre) state.selectedGenres.add(genre);
    if (contentType) state.selectedContentTypes.add(contentType);

    switchDiscoverSubTab('explore');
    renderExploreSelectors();
    runExploreQuery(true);
  }

  // =========================================================================
  // 2. DISCOVER OVERVIEW DASHBOARD
  // =========================================================================
  function renderRailHtml(items, opts = {}) {
    if (!items || items.length === 0) {
      return '<p class="text-xs text-gray-500 px-1 py-4">No verified titles available for this filter.</p>';
    }
    return items
      .map((item) => {
        const card = window.renderPosterCard(item, {
          ...opts,
          cardClass: 'w-[132px] sm:w-[148px] flex-shrink-0',
          topTag: item._topTag || '',
          extraBottom: item._extraBottom || '',
          onClick: item._customClick || `showMovieDetails(${JSON.stringify(item.id)})`
        });
        return card;
      })
      .join('');
  }

  async function loadOverviewDashboard() {
    const today = new Date();
    const todayIso = toLocalIsoDate(today);
    const weekLater = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const weekIso = toLocalIsoDate(weekLater);
    const monthLater = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    const monthLaterIso = toLocalIsoDate(monthLater);

    const badgeEl = document.getElementById('discover-region-badge');
    if (badgeEl) badgeEl.textContent = `${getActiveRegionName()} (${state.region})`;

    // Personalized row if user has preferences
    await renderPersonalizedOverviewRow();

    // Load Trending Worldwide, Coming This Week, Upcoming Movies, TV Episodes, Newly Announced in parallel
    const [trendingRes, weekMvRes, weekTvRes, upMvRes, tvAirRes, futureMvRes, mazeToday, aniUpcoming] = await Promise.allSettled([
      window.nfApi.tmdb('/trending/all/day', {}, 15 * 60 * 1000),
      window.nfApi.tmdb('/discover/movie', {
        region: state.region,
        'primary_release_date.gte': todayIso,
        'primary_release_date.lte': weekIso,
        sort_by: 'popularity.desc'
      }, 20 * 60 * 1000),
      window.nfApi.tmdb('/discover/tv', {
        'air_date.gte': todayIso,
        'air_date.lte': weekIso,
        sort_by: 'popularity.desc'
      }, 20 * 60 * 1000),
      window.nfApi.tmdb('/movie/upcoming', { region: state.region }, 30 * 60 * 1000),
      window.nfApi.tmdb('/tv/on_the_air', {}, 25 * 60 * 1000),
      window.nfApi.tmdb('/discover/movie', {
        'primary_release_date.gte': monthLaterIso,
        sort_by: 'popularity.desc'
      }, 60 * 60 * 1000),
      window.nfApi.tvmaze('/schedule', { country: state.region === 'GB' || state.region === 'US' ? state.region : 'US', date: todayIso }, 30 * 60 * 1000),
      window.nfApi.anilist(`query {
        Page(page: 1, perPage: 12) {
          media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
            id
            title { romaji english }
            coverImage { large }
            bannerImage
            format
            episodes
            startDate { year month day }
            description(asHtml: false)
          }
        }
      }`, {}, 60 * 60 * 1000)
    ]);

    // Trending Worldwide
    const trendEl = document.getElementById('discover-trending-rail');
    if (trendEl) {
      const items = trendingRes.status === 'fulfilled' ? (trendingRes.value.results || []).filter((x) => x.poster_path).slice(0, 15) : [];
      items.forEach((m, i) => {
        m.is_tv = m.media_type === 'tv' || Boolean(m.first_air_date);
        m._topTag = `<span class="bg-[#E50914] text-white text-[9px] font-black px-1.5 py-0.5">#${i + 1}</span>`;
      });
      trendEl.innerHTML = renderRailHtml(items);
    }

    // Coming This Week (Confirmed)
    const weekEl = document.getElementById('discover-week-rail');
    if (weekEl) {
      const mv = weekMvRes.status === 'fulfilled' ? (weekMvRes.value.results || []).map((x) => ({ ...x, is_tv: false })) : [];
      const tv = weekTvRes.status === 'fulfilled' ? (weekTvRes.value.results || []).map((x) => ({ ...x, is_tv: true })) : [];
      const combined = [...mv, ...tv]
        .filter((x) => x.poster_path)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 14)
        .map((m) => {
          const dt = m.release_date || m.first_air_date || todayIso;
          return {
            ...m,
            _topTag: `<span class="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 uppercase">CONFIRMED</span>`,
            _extraBottom: `<div class="p-2 bg-[#0d0d11] border-t border-white/10"><p class="text-[11px] font-bold text-white truncate">${escapeHtml(m.title || m.name)}</p><p class="text-[10px] text-emerald-400 font-bold">${escapeHtml(dt)} • ${escapeHtml(formatCountdown(dt))}</p></div>`
          };
        });
      weekEl.innerHTML = renderRailHtml(combined);
    }

    // Upcoming Movies
    const upMvEl = document.getElementById('discover-upcoming-movies-rail');
    if (upMvEl) {
      const items = upMvRes.status === 'fulfilled'
        ? (upMvRes.value.results || [])
            .filter((x) => x.poster_path && (!x.release_date || x.release_date >= todayIso))
            .slice(0, 15)
            .map((m) => ({
              ...m,
              is_tv: false,
              _topTag: `<span class="bg-black/85 border border-white/25 text-white text-[9px] font-black px-1.5 py-0.5 uppercase">${m.release_date ? 'CONFIRMED' : 'TBA'}</span>`,
              _extraBottom: `<div class="p-2 bg-[#0d0d11] border-t border-white/10"><p class="text-[11px] font-bold text-white truncate">${escapeHtml(m.title)}</p><p class="text-[10px] text-gray-300 font-semibold">${escapeHtml(m.release_date || 'Date TBA')} ${m.release_date ? '• ' + escapeHtml(formatCountdown(m.release_date)) : ''}</p></div>`
            }))
        : [];
      upMvEl.innerHTML = renderRailHtml(items);
    }

    // Upcoming TV Episodes (TMDB On The Air + TVmaze Schedule enrichment)
    const upEpEl = document.getElementById('discover-upcoming-episodes-rail');
    if (upEpEl) {
      const tmdbShows = tvAirRes.status === 'fulfilled' ? (tvAirRes.value.results || []).filter((x) => x.poster_path).slice(0, 10) : [];
      const mazeList = mazeToday.status === 'fulfilled' && Array.isArray(mazeToday.value) ? mazeToday.value.slice(0, 12) : [];

      const enriched = await Promise.all(
        tmdbShows.map(async (show) => {
          let detail = null;
          try {
            detail = await window.nfApi.tmdb(`/tv/${show.id}`, {}, 60 * 60 * 1000);
          } catch {}
          const nextEp = detail && detail.next_episode_to_air;
          const airDate = nextEp ? nextEp.air_date : (show.first_air_date || todayIso);
          const epTag = nextEp ? `S${pad2(nextEp.season_number)} E${pad2(nextEp.episode_number)}` : 'ON AIR';
          const mazeMatch = mazeList.find((mz) => mz.show && mz.show.name && mz.show.name.toLowerCase() === (show.name || '').toLowerCase());
          const airTime = mazeMatch && mazeMatch.airtime ? ` • ${mazeMatch.airtime}` : '';
          return {
            ...show,
            is_tv: true,
            _topTag: `<span class="bg-[#E50914] text-white text-[9px] font-black px-1.5 py-0.5">${escapeHtml(epTag)}</span>`,
            _extraBottom: `<div class="p-2 bg-[#0d0d11] border-t border-white/10"><p class="text-[11px] font-bold text-white truncate">${escapeHtml(show.name)}</p><p class="text-[10px] text-gray-300 font-semibold truncate">${escapeHtml(nextEp ? nextEp.air_date : airDate)}${escapeHtml(airTime)}</p></div>`
          };
        })
      );
      upEpEl.innerHTML = renderRailHtml(enriched);
    }

    // Newly Announced Releases (TMDB Future + AniList Not Yet Released, Confirmed vs Estimated)
    const annEl = document.getElementById('discover-announced-rail');
    if (annEl) {
      const tmdbFuture = futureMvRes.status === 'fulfilled'
        ? (futureMvRes.value.results || []).filter((x) => x.poster_path).slice(0, 10).map((m) => ({
            ...m,
            is_tv: false,
            _topTag: `<span class="bg-emerald-700 text-white text-[9px] font-black px-1.5 py-0.5 uppercase">CONFIRMED</span>`,
            _extraBottom: `<div class="p-2 bg-[#0d0d11] border-t border-white/10"><p class="text-[11px] font-bold text-white truncate">${escapeHtml(m.title)}</p><p class="text-[10px] text-emerald-400 font-semibold">${escapeHtml(m.release_date || 'TBA')}</p></div>`
          }))
        : [];

      const aniMedia =
        aniUpcoming.status === 'fulfilled' && aniUpcoming.value?.data?.Page?.media
          ? aniUpcoming.value.data.Page.media.slice(0, 6).map((a) => {
              const title = a.title.english || a.title.romaji;
              const sd = a.startDate || {};
              const hasExact = Boolean(sd.year && sd.month && sd.day);
              const dateText = hasExact
                ? `${sd.year}-${pad2(sd.month)}-${pad2(sd.day)}`
                : sd.year && sd.month
                  ? `${sd.year}-${pad2(sd.month)} (Est.)`
                  : sd.year
                    ? `${sd.year} (Est.)`
                    : 'Date TBA';
              const fakeId = `anilist_${a.id}`;
              const item = {
                id: fakeId,
                title,
                name: title,
                customPoster: a.coverImage?.large || '',
                customBackdrop: a.bannerImage || a.coverImage?.large || '',
                overview: (a.description || '').replace(/<[^>]+>/g, ''),
                is_tv: a.format !== 'MOVIE',
                isExternalOnly: true,
                releaseDateLabel: dateText,
                dateStatus: hasExact ? 'CONFIRMED' : 'ESTIMATED',
                sourceNote: `AniList Anime • ${a.format || 'TV'}`,
                _topTag: `<span class="${hasExact ? 'bg-emerald-700' : 'bg-amber-600'} text-white text-[9px] font-black px-1.5 py-0.5 uppercase">${hasExact ? 'CONFIRMED' : 'ESTIMATED'}</span>`,
                _extraBottom: `<div class="p-2 bg-[#0d0d11] border-t border-white/10"><p class="text-[11px] font-bold text-white truncate">${escapeHtml(title)}</p><p class="text-[10px] ${hasExact ? 'text-emerald-400' : 'text-amber-300'} font-semibold truncate">Anime • ${escapeHtml(dateText)}</p></div>`,
                _customClick: `window.nfDiscover.openExternalTitle(${JSON.stringify(fakeId)}, ${JSON.stringify(title)}, ${a.format !== 'MOVIE'})`
              };
              window.globalMovieData[fakeId] = item;
              return item;
            })
          : [];

      annEl.innerHTML = renderRailHtml([...tmdbFuture.slice(0, 8), ...aniMedia]);
    }
  }

  async function renderPersonalizedOverviewRow() {
    const container = document.getElementById('discover-personalized-section');
    const rail = document.getElementById('discover-personalized-rail');
    if (!container || !rail) return;

    const p = state.prefs;
    const hasPrefs =
      p.industries.length > 0 ||
      p.platforms.length > 0 ||
      p.genres.length > 0 ||
      p.contentTypes.length > 0 ||
      p.languages.length > 0;

    if (!hasPrefs) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    rail.innerHTML = '<div class="py-6 px-2 text-xs text-gray-400">Personalizing picks for your preferences...</div>';

    const params = { sort_by: 'popularity.desc' };
    const countries = [];
    const langs = [...p.languages];
    p.industries.forEach((indId) => {
      const ind = INDUSTRIES.find((x) => x.id === indId);
      if (ind) {
        if (ind.country) countries.push(ind.country);
        if (ind.lang) langs.push(ind.lang);
      }
    });
    if (countries.length) params.with_origin_country = [...new Set(countries)].join('|');
    if (langs.length) params.with_original_language = [...new Set(langs)].join('|');

    const provIds = [];
    p.platforms.forEach((pid) => {
      const pl = PLATFORMS.find((x) => x.id === pid);
      if (pl) {
        pl.providerIds.forEach((id) => {
          if (state.regionProvidersMap.has(id)) provIds.push(id);
        });
      }
    });
    if (provIds.length) {
      params.watch_region = state.region;
      params.with_watch_providers = [...new Set(provIds)].join('|');
    }

    const mvGenres = p.genres
      .map((gid) => GENRES.find((g) => g.id === gid)?.movieId)
      .filter(Boolean);
    if (mvGenres.length) params.with_genres = [...new Set(mvGenres)].join('|');

    try {
      const preferTvOnly = p.contentTypes.length === 1 && ['tv', 'kdrama', 'tdrama', 'webseries'].includes(p.contentTypes[0]);
      const data = await window.nfApi.tmdb(preferTvOnly ? '/discover/tv' : '/discover/movie', params, 20 * 60 * 1000);
      const items = (data.results || []).filter((x) => x.poster_path).slice(0, 14).map((m) => ({
        ...m,
        is_tv: preferTvOnly,
        _topTag: `<span class="bg-[#E50914] text-white text-[9px] font-black px-1.5 py-0.5 uppercase">FOR YOU</span>`
      }));
      rail.innerHTML = renderRailHtml(items);
    } catch {
      rail.innerHTML = '<p class="text-xs text-gray-500 py-4">Could not load personalized feed.</p>';
    }
  }

  async function openExternalTitle(fallbackId, title, isTv = true, imdbId = null) {
    const resolved = await window.nfApi.resolveToTmdb(title, isTv, imdbId);
    if (resolved && resolved.id) {
      window.globalMovieData[resolved.id] = resolved;
      window.showMovieDetails(resolved.id);
      return;
    }
    window.showMovieDetails(fallbackId, window.globalMovieData[fallbackId]);
  }

  // =========================================================================
  // 3. INTERACTIVE RELEASE CALENDAR (Monthly / Weekly / Daily + Real Posters)
  // =========================================================================
  function setCalendarMode(mode) {
    state.calMode = mode;
    document.querySelectorAll('.cal-mode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    renderCalendar();
  }

  function setCalendarFilter(filter) {
    state.calFilter = filter;
    document.querySelectorAll('.cal-filter-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
    renderCalendar();
  }

  function toggleCalendarPrefsFilter() {
    state.calUsePrefs = !state.calUsePrefs;
    const btn = document.getElementById('cal-prefs-toggle');
    if (btn) btn.classList.toggle('active', state.calUsePrefs);
    renderCalendar();
  }

  function shiftCalendar(delta) {
    const c = new Date(state.calCursor);
    if (state.calMode === 'month') {
      c.setMonth(c.getMonth() + delta);
    } else if (state.calMode === 'week') {
      c.setDate(c.getDate() + delta * 7);
    } else {
      c.setDate(c.getDate() + delta);
      state.calSelectedDate = toLocalIsoDate(c);
    }
    state.calCursor = c;
    loadCalendarEvents();
  }

  function jumpCalendarToday() {
    const now = new Date();
    state.calCursor = now;
    state.calSelectedDate = toLocalIsoDate(now);
    loadCalendarEvents();
  }

  function selectCalendarDate(iso) {
    state.calSelectedDate = iso;
    renderCalendar();
    renderDaySchedulePanel(iso);
  }

  async function loadCalendarEvents(force = false) {
    const y = state.calCursor.getFullYear();
    const m = state.calCursor.getMonth();
    const monthKey = `${y}-${pad2(m + 1)}-${state.region}`;
    if (!force && state.calMonthKeyLoaded === monthKey) {
      renderCalendar();
      return;
    }

    state.calLoading = true;
    const gridEl = document.getElementById('calendar-grid-container');
    if (gridEl) {
      gridEl.innerHTML = '<div class="py-16 text-center"><div class="nf-spinner animate-spin w-8 h-8 border-4 border-[#E50914] border-t-transparent mx-auto"></div><p class="text-xs text-gray-400 mt-3 uppercase tracking-widest">Loading TMDB, TVmaze &amp; AniList Release Schedules...</p></div>';
    }

    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const startIso = toLocalIsoDate(firstDay);
    const endIso = toLocalIsoDate(lastDay);

    const startEpoch = Math.floor(firstDay.getTime() / 1000);
    const endEpoch = Math.floor((lastDay.getTime() + 86400000) / 1000);

    const eventsMap = new Map();
    const pushEvent = (ev) => {
      if (!ev.date) return;
      if (!eventsMap.has(ev.date)) eventsMap.set(ev.date, []);
      const list = eventsMap.get(ev.date);
      if (!list.some((x) => x.uid === ev.uid)) list.push(ev);
    };

    const todayIso = toLocalIsoDate(new Date());
    const mazeCountry = ['US', 'GB', 'CA', 'AU', 'JP', 'KR', 'IN'].includes(state.region) ? state.region : 'US';

    const requests = [
      // Theatrical movies in month
      window.nfApi.tmdb('/discover/movie', {
        region: state.region,
        'release_date.gte': startIso,
        'release_date.lte': endIso,
        with_release_type: '2|3',
        sort_by: 'popularity.desc',
        page: 1
      }, 30 * 60 * 1000),
      // Streaming / digital movies in month
      window.nfApi.tmdb('/discover/movie', {
        region: state.region,
        'release_date.gte': startIso,
        'release_date.lte': endIso,
        with_release_type: '4',
        sort_by: 'popularity.desc',
        page: 1
      }, 30 * 60 * 1000),
      // TV series premieres in month
      window.nfApi.tmdb('/discover/tv', {
        'first_air_date.gte': startIso,
        'first_air_date.lte': endIso,
        sort_by: 'popularity.desc',
        page: 1
      }, 30 * 60 * 1000),
      // TMDB currently airing TV shows (gives exact next_episode_to_air dates!)
      window.nfApi.tmdb('/tv/on_the_air', { page: 1 }, 30 * 60 * 1000),
      // AniList airing schedule for the month
      window.nfApi.anilist(`query ($start: Int, $end: Int) {
        Page(page: 1, perPage: 50) {
          airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
            airingAt
            episode
            media {
              id
              title { romaji english }
              coverImage { large }
              bannerImage
              format
              genres
              description(asHtml: false)
            }
          }
        }
      }`, { start: startEpoch, end: endEpoch }, 30 * 60 * 1000),
      // TVmaze schedule for selected day or today
      window.nfApi.tvmaze('/schedule', { country: mazeCountry, date: state.calSelectedDate || todayIso }, 30 * 60 * 1000)
    ];

    const [thRes, stRes, tvNewRes, onAirRes, aniRes, mazeRes] = await Promise.allSettled(requests);

    // Process Theatrical Movies
    if (thRes.status === 'fulfilled' && thRes.value?.results) {
      thRes.value.results.forEach((m) => {
        if (!m.poster_path || !m.release_date) return;
        m.is_tv = false;
        window.globalMovieData[m.id] = m;
        pushEvent({
          uid: `tmdb-mv-th-${m.id}`,
          tmdbId: m.id,
          isTv: false,
          category: 'movie',
          releaseChannel: 'theatrical',
          title: m.title,
          date: m.release_date,
          poster: window.nfApi.IMG_URL + m.poster_path,
          status: 'CONFIRMED',
          source: 'TMDB',
          originCountries: m.origin_country || [],
          originalLanguage: m.original_language || '',
          genreIds: m.genre_ids || []
        });
      });
    }

    // Process Streaming Movies
    if (stRes.status === 'fulfilled' && stRes.value?.results) {
      stRes.value.results.forEach((m) => {
        if (!m.poster_path || !m.release_date) return;
        m.is_tv = false;
        window.globalMovieData[m.id] = m;
        pushEvent({
          uid: `tmdb-mv-st-${m.id}`,
          tmdbId: m.id,
          isTv: false,
          category: 'movie',
          releaseChannel: 'streaming',
          title: m.title,
          date: m.release_date,
          poster: window.nfApi.IMG_URL + m.poster_path,
          status: 'CONFIRMED',
          source: 'TMDB',
          originCountries: m.origin_country || [],
          originalLanguage: m.original_language || '',
          genreIds: m.genre_ids || []
        });
      });
    }

    // Process TV Premieres
    if (tvNewRes.status === 'fulfilled' && tvNewRes.value?.results) {
      tvNewRes.value.results.forEach((t) => {
        if (!t.poster_path || !t.first_air_date) return;
        t.is_tv = true;
        window.globalMovieData[t.id] = t;
        const isAnime = (t.genre_ids || []).includes(16) && (t.origin_country || []).includes('JP');
        pushEvent({
          uid: `tmdb-tv-${t.id}`,
          tmdbId: t.id,
          isTv: true,
          category: isAnime ? 'anime' : 'tv',
          releaseChannel: 'streaming',
          title: t.name,
          date: t.first_air_date,
          season: 1,
          episode: 1,
          poster: window.nfApi.IMG_URL + t.poster_path,
          status: 'CONFIRMED',
          source: 'TMDB',
          originCountries: t.origin_country || [],
          originalLanguage: t.original_language || '',
          genreIds: t.genre_ids || []
        });
      });
    }

    // Enrich top On-The-Air TV shows for exact episode air dates
    if (onAirRes.status === 'fulfilled' && onAirRes.value?.results) {
      const topAir = onAirRes.value.results.filter((x) => x.poster_path).slice(0, 12);
      const details = await Promise.allSettled(
        topAir.map((s) => window.nfApi.tmdb(`/tv/${s.id}`, {}, 60 * 60 * 1000))
      );
      details.forEach((r) => {
        if (r.status !== 'fulfilled' || !r.value?.next_episode_to_air) return;
        const show = r.value;
        const ep = show.next_episode_to_air;
        if (!ep.air_date || !show.poster_path) return;
        show.is_tv = true;
        window.globalMovieData[show.id] = show;
        const isAnime = (show.genres || []).some((g) => g.id === 16) && (show.origin_country || []).includes('JP');
        pushEvent({
          uid: `tmdb-ep-${show.id}-${ep.season_number}-${ep.episode_number}`,
          tmdbId: show.id,
          isTv: true,
          category: isAnime ? 'anime' : 'episode',
          releaseChannel: 'streaming',
          title: show.name,
          episodeName: ep.name,
          date: ep.air_date,
          season: ep.season_number,
          episode: ep.episode_number,
          poster: window.nfApi.IMG_URL + show.poster_path,
          status: 'CONFIRMED',
          source: 'TMDB',
          originCountries: show.origin_country || [],
          originalLanguage: show.original_language || '',
          genreIds: (show.genres || []).map((g) => g.id)
        });
      });
    }

    // Process AniList exact airing schedule timestamps
    if (aniRes.status === 'fulfilled' && aniRes.value?.data?.Page?.airingSchedules) {
      aniRes.value.data.Page.airingSchedules.forEach((sc) => {
        if (!sc.media?.coverImage?.large || !sc.airingAt) return;
        const dt = new Date(sc.airingAt * 1000);
        const iso = toLocalIsoDate(dt);
        const timeStr = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
        const title = sc.media.title.english || sc.media.title.romaji;
        const extId = `anilist_${sc.media.id}`;
        window.globalMovieData[extId] = {
          id: extId,
          title,
          name: title,
          customPoster: sc.media.coverImage.large,
          customBackdrop: sc.media.bannerImage || sc.media.coverImage.large,
          overview: (sc.media.description || '').replace(/<[^>]+>/g, ''),
          is_tv: sc.media.format !== 'MOVIE',
          isExternalOnly: true,
          releaseDateLabel: `${iso} ${timeStr}`,
          episodeLabel: `Episode ${sc.episode} airs at ${timeStr}`,
          dateStatus: 'CONFIRMED',
          sourceNote: `AniList Airing Schedule • ${sc.media.format || 'TV'}`
        };
        pushEvent({
          uid: `ani-${sc.media.id}-${sc.episode}`,
          externalId: extId,
          isTv: sc.media.format !== 'MOVIE',
          category: 'anime',
          releaseChannel: 'streaming',
          title,
          date: iso,
          epochSec: sc.airingAt,
          time: timeStr,
          episode: sc.episode,
          poster: sc.media.coverImage.large,
          status: 'CONFIRMED',
          source: 'AniList',
          originCountries: ['JP'],
          originalLanguage: 'ja',
          genreIds: [16]
        });
      });
    }

    // Process TVmaze scheduled episodes (with exact season, episode, airtime)
    if (mazeRes.status === 'fulfilled' && Array.isArray(mazeRes.value)) {
      mazeRes.value
        .filter((ep) => ep.show && ep.show.image && ep.show.image.medium && ep.airdate)
        .slice(0, 28)
        .forEach((ep) => {
          const extId = `tvmaze_${ep.show.id}`;
          window.globalMovieData[extId] = {
            id: extId,
            title: ep.show.name,
            name: ep.show.name,
            customPoster: ep.show.image.original || ep.show.image.medium,
            customBackdrop: ep.show.image.original || ep.show.image.medium,
            overview: (ep.summary || ep.show.summary || '').replace(/<[^>]+>/g, ''),
            is_tv: true,
            isExternalOnly: true,
            releaseDateLabel: `${ep.airdate}${ep.airtime ? ' ' + ep.airtime : ''}`,
            episodeLabel: `Season ${ep.season || 1}, Episode ${ep.number || 1}: ${ep.name || ''}`,
            dateStatus: 'CONFIRMED',
            sourceNote: `TVmaze • ${(ep.show.network && ep.show.network.name) || (ep.show.webChannel && ep.show.webChannel.name) || 'Broadcast'}`
          };
          pushEvent({
            uid: `maze-${ep.id}`,
            externalId: extId,
            imdbId: ep.show.externals?.imdb || null,
            isTv: true,
            category: 'episode',
            releaseChannel: ep.show.webChannel ? 'streaming' : 'tv',
            title: ep.show.name,
            episodeName: ep.name,
            date: ep.airdate,
            time: ep.airtime || '',
            season: ep.season || 1,
            episode: ep.number || 1,
            poster: ep.show.image.medium,
            status: 'CONFIRMED',
            source: 'TVmaze',
            originCountries: ep.show.network?.country?.code ? [ep.show.network.country.code] : [],
            originalLanguage: ''
          });
        });
    }

    state.calEventsByDate = eventsMap;
    state.calMonthKeyLoaded = monthKey;
    state.calLoading = false;
    renderCalendar();
  }

  function eventMatchesFilter(ev) {
    const f = state.calFilter;
    if (f === 'movie' && ev.category !== 'movie') return false;
    if (f === 'tv' && ev.category !== 'tv' && ev.category !== 'episode') return false;
    if (f === 'anime' && ev.category !== 'anime') return false;
    if (f === 'episode' && !ev.episode) return false;
    if (f === 'theatrical' && ev.releaseChannel !== 'theatrical') return false;
    if (f === 'streaming' && ev.releaseChannel !== 'streaming') return false;

    if (state.calUsePrefs) {
      const p = state.prefs;
      const prefLangs = new Set(p.languages);
      p.industries.forEach((indId) => {
        const ind = INDUSTRIES.find((i) => i.id === indId);
        if (ind && ind.lang) ind.lang.split('|').forEach((l) => prefLangs.add(l));
      });
      if (prefLangs.size > 0 && ev.originalLanguage && !prefLangs.has(ev.originalLanguage)) {
        return false;
      }
    }
    return true;
  }

  function getFilteredEventsForDate(iso) {
    return (state.calEventsByDate.get(iso) || []).filter(eventMatchesFilter);
  }

  function openCalendarItem(ev) {
    if (ev.tmdbId) {
      window.showMovieDetails(ev.tmdbId);
    } else if (ev.externalId) {
      openExternalTitle(ev.externalId, ev.title, ev.isTv, ev.imdbId || null);
    }
  }

  function renderCalendar() {
    const titleEl = document.getElementById('cal-period-title');
    const gridEl = document.getElementById('calendar-grid-container');
    if (!gridEl || !titleEl) return;

    const c = state.calCursor;
    const todayIso = toLocalIsoDate(new Date());
    const selectedIso = state.calSelectedDate || todayIso;

    if (state.calMode === 'month') {
      titleEl.textContent = c.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const year = c.getFullYear();
      const month = c.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset = firstDay.getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      let html = `
        <div class="grid grid-cols-7 border-b border-white/15 bg-[#0e0e13]">
          ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
            .map((d) => `<div class="py-2 text-center text-[10px] font-black tracking-widest text-gray-400 border-r border-white/10 last:border-r-0">${d}</div>`)
            .join('')}
        </div>
        <div class="grid grid-cols-7 gap-[1px] bg-white/10">
      `;

      for (let i = 0; i < startOffset; i++) {
        html += `<div class="min-h-[96px] sm:min-h-[120px] bg-[#060608] opacity-50"></div>`;
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
        const events = getFilteredEventsForDate(iso);
        const isToday = iso === todayIso;
        const isSelected = iso === selectedIso;
        const thumbs = events.slice(0, 4);
        const extra = events.length - thumbs.length;

        html += `
          <div onclick="window.nfDiscover.selectCalendarDate('${iso}')" class="calendar-cell min-h-[96px] sm:min-h-[120px] p-1.5 flex flex-col justify-between cursor-pointer ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] sm:text-xs font-black ${isToday ? 'bg-[#E50914] text-white px-1.5 py-0.5' : 'text-gray-200'}">${day}</span>
              ${events.length > 0 ? `<span class="text-[9px] font-black px-1 bg-white/10 text-gray-200">${events.length}</span>` : ''}
            </div>
            <div class="grid ${thumbs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-1 flex-1 items-end">
              ${thumbs
                .map(
                  (ev) => `
                  <div onclick="event.stopPropagation(); window.nfDiscover.openCalendarItemByUid('${iso}', '${escapeHtml(ev.uid)}')" title="${escapeHtml(ev.title)}" class="calendar-poster-thumb aspect-[2/3] w-full bg-black">
                    <img src="${escapeHtml(ev.poster)}" class="w-full h-full object-cover" loading="lazy">
                  </div>`
                )
                .join('')}
            </div>
            ${extra > 0 ? `<div class="mt-1 text-[9px] font-black text-center bg-black/80 text-white border border-white/15 py-0.5">+${extra} MORE</div>` : ''}
          </div>
        `;
      }
      html += `</div>`;
      gridEl.innerHTML = html;
    } else if (state.calMode === 'week') {
      const start = new Date(c.getFullYear(), c.getMonth(), c.getDate() - c.getDay());
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      titleEl.textContent = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      let html = `<div class="grid grid-cols-1 sm:grid-cols-7 gap-2">`;
      for (let i = 0; i < 7; i++) {
        const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const iso = toLocalIsoDate(dt);
        const events = getFilteredEventsForDate(iso);
        const isToday = iso === todayIso;
        const isSelected = iso === selectedIso;

        html += `
          <div onclick="window.nfDiscover.selectCalendarDate('${iso}')" class="calendar-cell p-2.5 flex flex-col gap-2 cursor-pointer ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}">
            <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span class="text-[11px] font-black uppercase text-gray-400">${dt.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span class="text-xs font-black ${isToday ? 'bg-[#E50914] text-white px-1.5 py-0.5' : 'text-white'}">${dt.getDate()}</span>
            </div>
            <div class="flex flex-col gap-2">
              ${
                events.length === 0
                  ? '<p class="text-[10px] text-gray-600 py-3">No releases</p>'
                  : events
                      .slice(0, 6)
                      .map(
                        (ev) => `
                        <div onclick="event.stopPropagation(); window.nfDiscover.openCalendarItemByUid('${iso}', '${escapeHtml(ev.uid)}')" class="flex gap-2 items-center bg-black/50 p-1.5 border border-white/10 hover:border-white/40 transition">
                          <img src="${escapeHtml(ev.poster)}" class="w-9 h-12 object-cover flex-shrink-0">
                          <div class="min-w-0">
                            <p class="text-[11px] font-bold text-white truncate">${escapeHtml(ev.title)}</p>
                            <p class="text-[9px] text-gray-400">${ev.episode ? `S${pad2(ev.season || 1)}E${pad2(ev.episode)}` : ev.category.toUpperCase()} ${ev.time ? '• ' + ev.time : ''}</p>
                          </div>
                        </div>`
                      )
                      .join('')
              }
            </div>
          </div>
        `;
      }
      html += `</div>`;
      gridEl.innerHTML = html;
    } else {
      // Daily view
      const dt = parseIsoLocal(selectedIso) || c;
      titleEl.textContent = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const events = getFilteredEventsForDate(selectedIso);
      if (events.length === 0) {
        gridEl.innerHTML = `<div class="ios-card p-8 text-center text-sm text-gray-400">No verified releases found for ${escapeHtml(selectedIso)} under the current filter.</div>`;
      } else {
        gridEl.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${events.map(renderScheduleItemCard).join('')}</div>`;
      }
    }

    renderDaySchedulePanel(selectedIso);
  }

  function renderScheduleItemCard(ev) {
    const countdown = formatCountdown(ev.date, ev.epochSec);
    const seBadge = ev.episode ? `S${pad2(ev.season || 1)} • E${pad2(ev.episode)}` : ev.category.toUpperCase();
    return `
      <div onclick="window.nfDiscover.openCalendarItemByUid('${ev.date}', '${escapeHtml(ev.uid)}')" class="ios-card p-3 flex gap-3 cursor-pointer hover:border-white/40">
        <div class="w-16 h-24 flex-shrink-0 bg-black border border-white/15 overflow-hidden">
          <img src="${escapeHtml(ev.poster)}" class="w-full h-full object-cover" loading="lazy">
        </div>
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="bg-[#E50914] text-white text-[9px] font-black px-1.5 py-0.5 uppercase">${escapeHtml(seBadge)}</span>
              <span class="text-[9px] font-black px-1.5 py-0.5 border ${ev.status === 'CONFIRMED' ? 'border-emerald-500/50 text-emerald-400 bg-emerald-950/30' : 'border-amber-500/50 text-amber-300 bg-amber-950/30'}">${escapeHtml(ev.status)}</span>
            </div>
            <h4 class="text-sm font-extrabold text-white truncate">${escapeHtml(ev.title)}</h4>
            ${ev.episodeName ? `<p class="text-[11px] text-gray-300 truncate">${escapeHtml(ev.episodeName)}</p>` : ''}
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-gray-400 mt-2">
            <span>${ev.time ? `Release: ${escapeHtml(ev.time)} • ` : ''}${escapeHtml(ev.releaseChannel || 'release').toUpperCase()} • ${escapeHtml(ev.source)}</span>
            <span class="text-white font-bold">${escapeHtml(countdown)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderDaySchedulePanel(iso) {
    const panel = document.getElementById('cal-day-schedule');
    if (!panel) return;
    if (state.calMode === 'day') {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const events = getFilteredEventsForDate(iso);
    const dt = parseIsoLocal(iso);
    const label = dt ? dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : iso;

    panel.innerHTML = `
      <div class="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
        <div>
          <h3 class="text-base font-black text-white">Release Schedule • ${escapeHtml(label)}</h3>
          <p class="text-[11px] text-gray-400">${events.length} verified release${events.length === 1 ? '' : 's'} matching active filters</p>
        </div>
        <button onclick="window.nfDiscover.setCalendarMode('day')" class="ios-glass-light px-3 py-1.5 text-[11px] font-bold text-white uppercase">Focus Day</button>
      </div>
      ${
        events.length === 0
          ? '<p class="text-xs text-gray-500 py-4">Select another highlighted date or adjust calendar filters to view titles.</p>'
          : `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${events.map(renderScheduleItemCard).join('')}</div>`
      }
    `;
  }

  function openCalendarItemByUid(iso, uid) {
    const list = state.calEventsByDate.get(iso) || [];
    const ev = list.find((x) => x.uid === uid);
    if (ev) openCalendarItem(ev);
  }

  // =========================================================================
  // 4, 5, 6. EXPLORE BY COUNTRY/INDUSTRY, STREAMING PLATFORM, CONTENT TYPE & GENRE
  // =========================================================================
  function selectIndustryWithChildren(id, forceSelect = null) {
    const item = INDUSTRIES.find((i) => i.id === id);
    if (!item) return;
    const willSelect = forceSelect !== null ? forceSelect : !state.selectedIndustries.has(id);

    if (willSelect) state.selectedIndustries.add(id);
    else state.selectedIndustries.delete(id);

    if (item.isParent && item.children) {
      item.children.forEach((cid) => {
        if (willSelect) state.selectedIndustries.add(cid);
        else state.selectedIndustries.delete(cid);
      });
    } else if (item.parentId) {
      const parent = INDUSTRIES.find((i) => i.id === item.parentId);
      if (parent && parent.children) {
        const allKids = parent.children.every((cid) => state.selectedIndustries.has(cid));
        if (allKids) state.selectedIndustries.add(parent.id);
        else state.selectedIndustries.delete(parent.id);
      }
    }
  }

  function toggleExploreFilter(kind, id) {
    if (kind === 'industry') {
      selectIndustryWithChildren(id);
    } else if (kind === 'platform') {
      if (state.selectedPlatforms.has(id)) state.selectedPlatforms.delete(id);
      else state.selectedPlatforms.add(id);
    } else if (kind === 'contentType') {
      if (state.selectedContentTypes.has(id)) state.selectedContentTypes.delete(id);
      else state.selectedContentTypes.add(id);
    } else if (kind === 'genre') {
      if (state.selectedGenres.has(id)) state.selectedGenres.delete(id);
      else state.selectedGenres.add(id);
    }
    renderExploreSelectors();
    runExploreQuery(true);
  }

  function clearAllExploreFilters() {
    state.selectedIndustries.clear();
    state.selectedPlatforms.clear();
    state.selectedContentTypes.clear();
    state.selectedGenres.clear();
    renderExploreSelectors();
    runExploreQuery(true);
  }

  function toggleOtherServices() {
    state.showOtherServices = !state.showOtherServices;
    renderPlatformCards();
  }

  function renderExploreSelectors() {
    const majorEl = document.getElementById('explore-industries-major');
    const intlEl = document.getElementById('explore-industries-intl');
    const typesEl = document.getElementById('explore-content-types');
    const genresEl = document.getElementById('explore-genres');

    const renderIndCard = (ind) => {
      const active = state.selectedIndustries.has(ind.id);
      const isChild = Boolean(ind.parentId);
      return `
        <div onclick="window.nfDiscover.toggleExploreFilter('industry', '${ind.id}')" class="select-tile p-3 ${active ? 'selected' : ''} ${isChild ? 'border-l-2 border-l-[#E50914]/60' : ''}">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-[9px] font-black uppercase px-1.5 py-0.5 bg-white/10 text-gray-200">${escapeHtml(ind.badge)}</span>
            ${ind.isParent ? '<span class="text-[9px] font-black uppercase text-[#E50914]">PARENT GROUP</span>' : ''}
          </div>
          <p class="text-xs font-extrabold text-white leading-tight">${escapeHtml(ind.name)}</p>
          <p class="text-[10px] text-gray-400 mt-0.5 truncate">${escapeHtml(ind.subtitle)}</p>
        </div>
      `;
    };

    if (majorEl) majorEl.innerHTML = INDUSTRIES.filter((i) => i.group === 'major').map(renderIndCard).join('');
    if (intlEl) intlEl.innerHTML = INDUSTRIES.filter((i) => i.group === 'international').map(renderIndCard).join('');

    if (typesEl) {
      typesEl.innerHTML = CONTENT_TYPES.map((ct) => {
        const active = state.selectedContentTypes.has(ct.id);
        return `
          <div onclick="window.nfDiscover.toggleExploreFilter('contentType', '${ct.id}')" class="select-tile p-3 ${active ? 'selected' : ''}">
            <p class="text-xs font-extrabold text-white">${escapeHtml(ct.name)}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">${escapeHtml(ct.desc)}</p>
          </div>
        `;
      }).join('');
    }

    if (genresEl) {
      genresEl.innerHTML = GENRES.map((g) => {
        const active = state.selectedGenres.has(g.id);
        return `
          <div onclick="window.nfDiscover.toggleExploreFilter('genre', '${g.id}')" class="select-tile px-3 py-2.5 text-center ${active ? 'selected' : ''}">
            <p class="text-xs font-extrabold text-white">${escapeHtml(g.name)}</p>
          </div>
        `;
      }).join('');
    }

    renderPlatformCards();
  }

  function renderPlatformCards() {
    const platEl = document.getElementById('explore-platforms');
    const regionLbl = document.getElementById('explore-platform-region-label');
    if (regionLbl) regionLbl.textContent = `${getActiveRegionName()} (${state.region})`;
    if (!platEl) return;

    const cards = PLATFORMS.map((pl) => {
      const active = state.selectedPlatforms.has(pl.id);
      const regionMatch = pl.providerIds.map((pid) => state.regionProvidersMap.get(pid)).find(Boolean);
      const isAvailableInRegion = state.regionProvidersMap.size === 0 || Boolean(regionMatch);
      const logoUrl = regionMatch && regionMatch.logo_path ? window.nfApi.LOGO_URL + regionMatch.logo_path : '';

      return `
        <div onclick="window.nfDiscover.toggleExploreFilter('platform', '${pl.id}')" class="select-tile p-3 flex items-center gap-3 ${active ? 'selected' : ''} ${!isAvailableInRegion ? 'opacity-55' : ''}">
          <div class="w-10 h-10 flex-shrink-0 border border-white/20 flex items-center justify-center overflow-hidden" style="background:${pl.color};">
            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="w-full h-full object-cover">` : `<span class="text-xs font-black text-white">${escapeHtml(pl.mark)}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-extrabold text-white truncate">${escapeHtml(pl.name)}</p>
            <p class="text-[10px] ${isAvailableInRegion ? 'text-emerald-400' : 'text-amber-400'} font-semibold truncate">
              ${isAvailableInRegion ? `Available in ${state.region}` : `Unavailable in ${state.region}`}
            </p>
          </div>
        </div>
      `;
    });

    // Other Available Services button & expandable services
    cards.push(`
      <div onclick="window.nfDiscover.toggleOtherServices()" class="select-tile p-3 flex items-center gap-3 ${state.showOtherServices ? 'selected' : ''}">
        <div class="w-10 h-10 flex-shrink-0 border border-white/25 bg-white/10 flex items-center justify-center text-white font-black text-sm">+</div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-extrabold text-white truncate">Other Services</p>
          <p class="text-[10px] text-gray-400 truncate">${state.otherServices.length} regional services in ${state.region}</p>
        </div>
      </div>
    `);

    if (state.showOtherServices) {
      state.otherServices.forEach((op) => {
        const key = `tmdb_prov_${op.provider_id}`;
        const active = state.selectedPlatforms.has(key);
        const logoUrl = op.logo_path ? window.nfApi.LOGO_URL + op.logo_path : '';
        cards.push(`
          <div onclick="window.nfDiscover.toggleExploreFilter('platform', '${key}')" class="select-tile p-3 flex items-center gap-3 ${active ? 'selected' : ''}">
            <div class="w-10 h-10 flex-shrink-0 border border-white/20 bg-black overflow-hidden">
              ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="w-full h-full object-cover">` : ''}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-extrabold text-white truncate">${escapeHtml(op.provider_name)}</p>
              <p class="text-[10px] text-emerald-400 font-semibold truncate">Active in ${state.region}</p>
            </div>
          </div>
        `);
      });
    }

    platEl.innerHTML = cards.join('');
  }

  function buildDiscoverQueries() {
    const baseMovieParams = { sort_by: 'popularity.desc' };
    const baseTvParams = { sort_by: 'popularity.desc' };

    const countries = [];
    const langs = [];
    let wantMovie = true;
    let wantTv = true;

    // Industries
    state.selectedIndustries.forEach((indId) => {
      const ind = INDUSTRIES.find((i) => i.id === indId);
      if (!ind) return;
      if (ind.country) countries.push(ind.country);
      if (ind.lang) langs.push(ind.lang);
    });

    // Content Types
    if (state.selectedContentTypes.size > 0) {
      let hasMovieType = false;
      let hasTvType = false;
      const typeGenres = [];
      state.selectedContentTypes.forEach((ctId) => {
        const ct = CONTENT_TYPES.find((c) => c.id === ctId);
        if (!ct) return;
        if (ct.media === 'movie') hasMovieType = true;
        else if (ct.media === 'tv') hasTvType = true;
        else {
          hasMovieType = true;
          hasTvType = true;
        }
        if (ct.originCountry) countries.push(ct.originCountry);
        if (ct.lang) langs.push(ct.lang);
        if (ct.genres) typeGenres.push(...ct.genres);
      });
      wantMovie = hasMovieType;
      wantTv = hasTvType;
      if (typeGenres.length) {
        baseMovieParams._extraGenres = typeGenres;
        baseTvParams._extraGenres = typeGenres;
      }
    }

    if (countries.length) {
      const cStr = [...new Set(countries.join('|').split('|').filter(Boolean))].join('|');
      baseMovieParams.with_origin_country = cStr;
      baseTvParams.with_origin_country = cStr;
    }
    if (langs.length) {
      const lStr = [...new Set(langs.join('|').split('|').filter(Boolean))].join('|');
      baseMovieParams.with_original_language = lStr;
      baseTvParams.with_original_language = lStr;
    }

    // Streaming Platforms (strictly region-verified IDs!)
    let providerBlockedInRegion = false;
    if (state.selectedPlatforms.size > 0) {
      const activeIds = [];
      state.selectedPlatforms.forEach((pid) => {
        if (pid.startsWith('tmdb_prov_')) {
          activeIds.push(Number(pid.replace('tmdb_prov_', '')));
        } else {
          const pl = PLATFORMS.find((p) => p.id === pid);
          if (pl) {
            const matched = pl.providerIds.filter((id) => state.regionProvidersMap.size === 0 || state.regionProvidersMap.has(id));
            activeIds.push(...matched);
          }
        }
      });
      if (activeIds.length === 0) {
        providerBlockedInRegion = true;
      } else {
        const provStr = [...new Set(activeIds)].join('|');
        baseMovieParams.watch_region = state.region;
        baseMovieParams.with_watch_providers = provStr;
        baseTvParams.watch_region = state.region;
        baseTvParams.with_watch_providers = provStr;
      }
    }

    // Genres (verified separate Movie vs TV IDs!)
    const mvGenres = [...(baseMovieParams._extraGenres || [])];
    const tvGenres = [...(baseTvParams._extraGenres || [])];
    delete baseMovieParams._extraGenres;
    delete baseTvParams._extraGenres;

    state.selectedGenres.forEach((gid) => {
      const g = GENRES.find((x) => x.id === gid);
      if (!g) return;
      if (g.movieId) mvGenres.push(g.movieId);
      if (g.tvId) tvGenres.push(g.tvId);
    });
    if (mvGenres.length) baseMovieParams.with_genres = [...new Set(mvGenres)].join(',');
    if (tvGenres.length) baseTvParams.with_genres = [...new Set(tvGenres)].join(',');

    return { wantMovie, wantTv, baseMovieParams, baseTvParams, providerBlockedInRegion };
  }

  async function runExploreQuery(reset = true) {
    const grid = document.getElementById('explore-results-grid');
    const summaryEl = document.getElementById('explore-active-summary');
    const loadMoreBtn = document.getElementById('explore-load-more-btn');
    if (!grid) return;

    if (reset) {
      state.explorePage = 1;
      state.exploreResults = [];
      grid.innerHTML = '<div class="col-span-full py-12 text-center"><div class="nf-spinner animate-spin w-7 h-7 border-4 border-[#E50914] border-t-transparent mx-auto"></div></div>';
    }

    const q = buildDiscoverQueries();

    // Update active filter summary
    if (summaryEl) {
      const chips = [
        ...[...state.selectedIndustries].map((id) => INDUSTRIES.find((i) => i.id === id)?.name).filter(Boolean),
        ...[...state.selectedPlatforms].map((id) => PLATFORMS.find((p) => p.id === id)?.name || state.regionProvidersMap.get(Number(id.replace('tmdb_prov_', '')))?.provider_name).filter(Boolean),
        ...[...state.selectedContentTypes].map((id) => CONTENT_TYPES.find((c) => c.id === id)?.name).filter(Boolean),
        ...[...state.selectedGenres].map((id) => GENRES.find((g) => g.id === id)?.name).filter(Boolean)
      ];
      summaryEl.innerHTML = chips.length
        ? `<span class="text-xs font-bold text-gray-300">Active (${state.region}):</span> ${chips.map((c) => `<span class="bg-[#E50914] text-white text-[10px] font-black px-2 py-0.5 uppercase">${escapeHtml(c)}</span>`).join('')}`
        : `<span class="text-xs text-gray-400">Showing global trending &amp; popular titles across ${escapeHtml(getActiveRegionName())} (${state.region})</span>`;
    }

    if (q.providerBlockedInRegion) {
      grid.innerHTML = `
        <div class="col-span-full ios-card p-6 text-center">
          <p class="text-sm font-bold text-amber-300 mb-1">Selected streaming platform is unavailable in ${escapeHtml(getActiveRegionName())} (${state.region})</p>
          <p class="text-xs text-gray-400">Switch your country above or choose a platform active in ${state.region} to avoid inaccurate availability results.</p>
        </div>
      `;
      loadMoreBtn?.classList.add('hidden');
      return;
    }

    try {
      const calls = [];
      if (q.wantMovie) calls.push(window.nfApi.tmdb('/discover/movie', { ...q.baseMovieParams, page: state.explorePage }));
      if (q.wantTv) calls.push(window.nfApi.tmdb('/discover/tv', { ...q.baseTvParams, page: state.explorePage }));
      const settled = await Promise.all(calls);

      const batch = [];
      let anyMore = false;
      settled.forEach((res, idx) => {
        const isTv = q.wantMovie ? idx === 1 : true;
        if (res && res.page < res.total_pages) anyMore = true;
        (res?.results || []).forEach((item) => {
          if (!item.poster_path) return;
          item.is_tv = isTv;
          batch.push(item);
        });
      });

      batch.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      state.exploreResults = reset ? batch : [...state.exploreResults, ...batch];
      state.exploreHasMore = anyMore;

      if (state.exploreResults.length === 0) {
        grid.innerHTML = '<div class="col-span-full ios-card p-6 text-center text-sm text-gray-400">No titles matched this exact filter combination in ' + escapeHtml(state.region) + '. Try removing one filter.</div>';
      } else {
        const html = state.exploreResults.map((m) => window.renderPosterCard(m, { isTv: m.is_tv })).join('');
        grid.innerHTML = html;
      }
      if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', !state.exploreHasMore);
    } catch {
      grid.innerHTML = '<div class="col-span-full text-center text-red-400 text-sm py-8">Failed to load filtered catalog.</div>';
    }
  }

  function loadMoreExploreResults() {
    if (!state.exploreHasMore) return;
    state.explorePage++;
    runExploreQuery(false);
  }

  // =========================================================================
  // 7. MY PREFERENCES (Personalized Discovery Saved to Account)
  // =========================================================================
  function togglePrefItem(field, val) {
    const arr = state.prefs[field] || [];
    const idx = arr.indexOf(val);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(val);
    state.prefs[field] = arr;
    renderPreferencesTab();
  }

  async function saveUserPreferences() {
    state.prefs.region = state.region;
    await window.nfApi.savePreferences(state.prefs);
    await renderPersonalizedOverviewRow();
    window.showToast('Preferences saved to your account');
  }

  function applyPreferencesToExplore() {
    state.selectedIndustries = new Set(state.prefs.industries);
    state.selectedPlatforms = new Set(state.prefs.platforms);
    state.selectedContentTypes = new Set(state.prefs.contentTypes);
    state.selectedGenres = new Set(state.prefs.genres);
    switchDiscoverSubTab('explore');
    renderExploreSelectors();
    runExploreQuery(true);
  }

  function renderPreferencesTab() {
    const root = document.getElementById('discover-preferences-body');
    if (!root) return;
    const p = state.prefs;

    const chipGrid = (items, field, keyProp = 'id', labelProp = 'name') =>
      items
        .map((item) => {
          const val = item[keyProp];
          const active = (p[field] || []).includes(val);
          return `<button onclick="window.nfDiscover.togglePrefItem('${field}', '${escapeHtml(val)}')" class="select-tile px-3 py-2 text-xs font-bold text-left ${active ? 'selected text-white' : 'text-gray-300'}">${escapeHtml(item[labelProp])}</button>`;
        })
        .join('');

    root.innerHTML = `
      <div class="ios-card p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-lg font-black text-white">My Discovery Preferences</h2>
          <p class="text-xs text-gray-400">Personalize your Discover homepage, recommendations, and Release Calendar filters. Saved to your ${window.nfApi.state.hasUserDb ? 'user database' : 'browser profile'}.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="window.nfDiscover.saveUserPreferences()" class="ios-btn-red px-5 py-2.5 text-xs font-black uppercase tracking-wider">Save Preferences</button>
          <button onclick="window.nfDiscover.applyPreferencesToExplore()" class="ios-glass-light px-4 py-2.5 text-xs font-bold uppercase text-white">Browse Matching Titles</button>
        </div>
      </div>

      <div class="space-y-5">
        <div class="ios-card p-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">1. Preferred Country &amp; Film Industries</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${chipGrid(INDUSTRIES, 'industries')}</div>
        </div>

        <div class="ios-card p-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">2. Favourite Streaming Platforms</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${chipGrid(PLATFORMS, 'platforms')}</div>
        </div>

        <div class="ios-card p-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">3. Favourite Content Types</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${chipGrid(CONTENT_TYPES, 'contentTypes')}</div>
        </div>

        <div class="ios-card p-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">4. Favourite Genres</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">${chipGrid(GENRES, 'genres')}</div>
        </div>

        <div class="ios-card p-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">5. Preferred Languages</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">${chipGrid(LANGUAGES, 'languages', 'code', 'name')}</div>
        </div>
      </div>
    `;
  }

  window.nfDiscover = {
    onViewActivated,
    syncPreferencesFromApi,
    changeRegion,
    switchDiscoverSubTab,
    jumpToExplore,
    openPersonCredits,
    setCalendarMode,
    setCalendarFilter,
    toggleCalendarPrefsFilter,
    shiftCalendar,
    jumpCalendarToday,
    selectCalendarDate,
    openCalendarItemByUid,
    toggleExploreFilter,
    clearAllExploreFilters,
    toggleOtherServices,
    loadMoreExploreResults,
    togglePrefItem,
    saveUserPreferences,
    applyPreferencesToExplore
  };
})();

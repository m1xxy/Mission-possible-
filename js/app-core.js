(function () {
  const IMG_URL = 'https://image.tmdb.org/t/p/w500';
  const BACKDROP_URL = 'https://image.tmdb.org/t/p/w780';

  window.globalMovieData = window.globalMovieData || {};
  window.currentDetailMovieId = null;
  window.currentDetailType = 'movie';
  window.homeHeroMovieId = null;

  let myFavourites = JSON.parse(localStorage.getItem('netfilla_favs') || '[]');
  let watchHistory = JSON.parse(localStorage.getItem('netfilla_history') || '[]');

  window.endpoints = {
    trending: { path: '/trending/all/day', params: {} },

    movies_all: { path: '/movie/popular', params: {} },
    movies_hollywood: { path: '/discover/movie', params: { with_original_language: 'en', sort_by: 'popularity.desc' } },
    movies_bollywood: { path: '/discover/movie', params: { with_original_language: 'hi', sort_by: 'popularity.desc' } },
    movies_tollywood: { path: '/discover/movie', params: { with_original_language: 'te', sort_by: 'popularity.desc' } },
    movies_korean: { path: '/discover/movie', params: { with_original_language: 'ko', sort_by: 'popularity.desc' } },
    movies_indonesian: { path: '/discover/movie', params: { with_original_language: 'id', sort_by: 'popularity.desc' } },
    movies_punjabi: { path: '/discover/movie', params: { with_original_language: 'pa', sort_by: 'popularity.desc' } },

    series_all: { path: '/discover/tv', params: { sort_by: 'popularity.desc' } },
    series_hollywood: { path: '/discover/tv', params: { with_original_language: 'en', sort_by: 'popularity.desc' } },
    series_bollywood: { path: '/discover/tv', params: { with_original_language: 'hi', sort_by: 'popularity.desc' } },
    series_tollywood: { path: '/discover/tv', params: { with_original_language: 'te', sort_by: 'popularity.desc' } },
    series_korean: { path: '/discover/tv', params: { with_original_language: 'ko', sort_by: 'popularity.desc' } },
    series_indonesian: { path: '/discover/tv', params: { with_original_language: 'id', sort_by: 'popularity.desc' } },
    series_punjabi: { path: '/discover/tv', params: { with_original_language: 'pa', sort_by: 'popularity.desc' } }
  };

  window.currentPage = { home: 1, movies: 1, series: 1 };
  window.currentCategoryUrl = {
    movies: window.endpoints.movies_all,
    series: window.endpoints.series_all
  };
  window.isLoading = { home: false, movies: false, series: false };
  let lastMainTab = 'home';

  let toastTimer = null;
  window.showToast = function (msg) {
    const el = document.getElementById('nf-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Shared sharp rectangular poster card with iOS shadow and interactive hover details overlay. */
  window.renderPosterCard = function (item, opts = {}) {
    if (!item || (!item.poster_path && !item.customPoster)) return '';
    const isTv = typeof opts.isTv === 'boolean' ? opts.isTv : Boolean(item.is_tv || item.media_type === 'tv' || item.first_air_date);
    item.is_tv = isTv;
    window.globalMovieData[item.id] = item;

    const imgSrc = item.customPoster || (IMG_URL + item.poster_path);
    const title = escapeHtml(item.title || item.name || 'Untitled');
    const rawDate = item.release_date || item.first_air_date || '';
    const year = rawDate ? rawDate.split('-')[0] : (opts.year || '');
    const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
    const typeLabel = opts.typeBadge || (isTv ? 'SERIES' : 'MOVIE');
    const topTag = opts.topTag || '';
    const extraBottom = opts.extraBottom || '';
    const clickAction = opts.onClick || `showMovieDetails(${JSON.stringify(item.id)})`;

    return `
      <div class="movie-card cursor-pointer group ${opts.cardClass || ''}" onclick="${escapeHtml(clickAction)}">
        <img src="${escapeHtml(imgSrc)}" alt="${title}" loading="lazy" class="poster-img w-full aspect-[2/3] object-cover block">
        ${topTag ? `<div class="absolute top-0 left-0 z-10">${topTag}</div>` : ''}
        ${opts.removeBtn ? opts.removeBtn : ''}
        <div class="poster-hover-overlay">
          <div class="flex items-center justify-between gap-1">
            <span class="bg-black/85 border border-white/25 text-white text-[9px] font-extrabold px-1.5 py-0.5 tracking-wider uppercase">${escapeHtml(typeLabel)}</span>
            ${rating ? `<span class="bg-[#E50914] text-white text-[10px] font-black px-1.5 py-0.5">★ ${rating}</span>` : ''}
          </div>
          <div class="poster-hover-cta">
            <p class="text-white text-[12px] font-extrabold leading-tight line-clamp-2 mb-1">${title}</p>
            <div class="flex items-center justify-between text-[10px] font-semibold text-gray-300">
              <span>${escapeHtml(year || 'TBA')}</span>
              <span class="text-white uppercase tracking-wider font-black flex items-center gap-1">
                Details <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </span>
            </div>
          </div>
        </div>
        ${extraBottom}
      </div>
    `;
  };

  window.switchTab = function (tabId, btn = null) {
    let scrollToWatchlist = false;
    if (tabId === 'my-list') {
      tabId = 'profile';
      scrollToWatchlist = true;
    }
    if (tabId !== 'search') {
      lastMainTab = tabId;
    }

    const navBtn = btn || document.getElementById(`nav-${tabId}`);
    document.querySelectorAll('#main-bottom-nav .nav-item').forEach((n) => n.classList.remove('active', 'text-white'));
    if (navBtn) navBtn.classList.add('active', 'text-white');

    document.querySelectorAll('.app-view').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById(`view-${tabId}`);
    if (target) target.classList.add('active');

    const header = document.getElementById('app-header');
    const searchBtn = document.getElementById('header-search-btn');
    if (header) {
      if (tabId === 'search') header.classList.add('hidden');
      else header.classList.remove('hidden');
    }
    if (searchBtn) {
      const showSearch = tabId === 'home' || tabId === 'movies' || tabId === 'series';
      searchBtn.classList.toggle('hidden', !showSearch);
    }

    try {
      if (tabId === 'home') {
        if (document.getElementById('home-infinite-grid').innerHTML.trim() === '') window.renderHomeGrids();
        loadHistoryUI();
      }
      if (tabId === 'discover' && window.nfDiscover) {
        window.nfDiscover.onViewActivated();
      }
      if (tabId === 'movies' && document.getElementById('movies-grid').innerHTML.trim() === '') {
        window.fetchMoviesInit(window.endpoints.movies_all, 'movies-grid', 'movies');
      }
      if (tabId === 'series' && document.getElementById('series-grid').innerHTML.trim() === '') {
        window.fetchMoviesInit(window.endpoints.series_all, 'series-grid', 'series');
      }
      if (tabId === 'profile') {
        window.renderProfileView();
        window.renderMyList();
        if (scrollToWatchlist) {
          document.getElementById('profile-watchlist-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      if (tabId === 'search') {
        setTimeout(() => document.getElementById('search-input')?.focus(), 80);
      }
    } catch (e) {
      console.error('Tab switch error:', e);
    }
  };

  window.closeSearchView = function () {
    window.switchTab(lastMainTab || 'home');
  };

  window.handleInfiniteScroll = function (e, type) {
    if (e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 400) {
      if (type === 'home') window.appendMoreMovies(window.endpoints.trending, 'home-infinite-grid', 'home');
      if (type === 'movies') window.appendMoreMovies(window.currentCategoryUrl.movies, 'movies-grid', 'movies');
      if (type === 'series') window.appendMoreMovies(window.currentCategoryUrl.series, 'series-grid', 'series');
    }
  };

  window.fetchMoviesInit = async function (endpointSpec, gridId, type) {
    window.currentPage[type] = 1;
    window.currentCategoryUrl[type] = endpointSpec;
    const grid = document.getElementById(gridId);
    if (grid) grid.innerHTML = '';
    await window.appendMoreMovies(endpointSpec, gridId, type);
  };

  window.appendMoreMovies = async function (endpointSpec, gridId, type) {
    if (window.isLoading[type]) return;
    window.isLoading[type] = true;
    document.getElementById(`${type}-loader`)?.classList.remove('hidden');
    try {
      const spec = typeof endpointSpec === 'string' ? { path: endpointSpec, params: {} } : endpointSpec;
      const data = await window.nfApi.tmdb(spec.path, { ...(spec.params || {}), page: window.currentPage[type] });
      const grid = document.getElementById(gridId);
      if (data && data.results && grid) {
        let html = '';
        data.results.forEach((m) => {
          if (!m.poster_path) return;
          const isTv = type === 'series' || m.media_type === 'tv' || Boolean(m.first_air_date);
          html += window.renderPosterCard(m, { isTv });
        });
        grid.insertAdjacentHTML('beforeend', html);
        window.currentPage[type]++;
      }
    } catch (e) {
      console.log('Append Error:', e);
    } finally {
      window.isLoading[type] = false;
      document.getElementById(`${type}-loader`)?.classList.add('hidden');
    }
  };

  window.fetchCategory = function (type, category, btn) {
    document.querySelectorAll(`#${type}-tabs button`).forEach((b) => {
      b.className = 'bg-transparent text-white/70 hover:text-white px-4 py-2 text-[13px] font-bold flex-shrink-0 transition-all border border-transparent';
    });
    if (btn) {
      btn.className = 'bg-white text-black px-4 py-2 text-[13px] font-bold flex-shrink-0 transition-all border border-white shadow-md';
    }
    window.fetchMoviesInit(window.endpoints[`${type}_${category}`], `${type}-grid`, type);
  };

  // Search view logic (supports movies, TV shows, and actors/directors!)
  let searchTimeout = null;
  let searchFilterMode = 'all';
  window.setGlobalSearchFilter = function (mode, btn) {
    searchFilterMode = mode;
    document.querySelectorAll('#search-filter-tabs button').forEach((b) => {
      b.className = 'discover-tab-btn px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider';
    });
    if (btn) btn.className = 'discover-tab-btn active px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider';
    runMainSearch(document.getElementById('search-input')?.value.trim() || '');
  };

  async function runMainSearch(query) {
    const grid = document.getElementById('search-grid');
    if (!grid) return;
    if (!query) {
      grid.innerHTML = '<p class="col-span-full text-center text-gray-500 text-sm mt-8">Type a movie, TV series, actor, or director name to search.</p>';
      return;
    }
    grid.innerHTML = '<div class="col-span-full text-center py-10"><div class="nf-spinner animate-spin w-8 h-8 border-4 border-[#E50914] border-t-transparent mx-auto"></div></div>';
    try {
      const endpoint = searchFilterMode === 'movie'
        ? '/search/movie'
        : searchFilterMode === 'tv'
          ? '/search/tv'
          : searchFilterMode === 'person'
            ? '/search/person'
            : '/search/multi';
      const data = await window.nfApi.tmdb(endpoint, { query }, 10 * 60 * 1000);
      grid.innerHTML = '';
      const results = (data.results || []).filter((item) => item.poster_path || item.profile_path);
      if (results.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-400 text-sm mt-6">No matching titles or people found.</p>';
        return;
      }
      let html = '';
      results.forEach((m) => {
        if (m.media_type === 'person' || searchFilterMode === 'person') {
          const dept = escapeHtml(m.known_for_department || 'Cast & Crew');
          const img = m.profile_path ? IMG_URL + m.profile_path : '';
          html += `
            <div class="movie-card cursor-pointer" onclick="openPersonInDiscover(${m.id}, ${escapeHtml(JSON.stringify(m.name || ''))})">
              <img src="${escapeHtml(img)}" alt="${escapeHtml(m.name)}" loading="lazy" class="poster-img w-full aspect-[2/3] object-cover block">
              <div class="poster-hover-overlay">
                <div class="flex justify-between"><span class="bg-black/85 border border-white/25 text-white text-[9px] font-extrabold px-1.5 py-0.5 uppercase">${dept}</span></div>
                <div class="poster-hover-cta">
                  <p class="text-white text-[12px] font-extrabold leading-tight line-clamp-2 mb-1">${escapeHtml(m.name)}</p>
                  <span class="text-[10px] text-gray-300 font-bold uppercase">View Credits →</span>
                </div>
              </div>
              <div class="p-2 bg-[#0d0d11] border-t border-white/10">
                <p class="text-white text-[12px] font-bold truncate">${escapeHtml(m.name)}</p>
                <p class="text-gray-400 text-[10px] truncate uppercase">${dept}</p>
              </div>
            </div>
          `;
        } else {
          const isTv = searchFilterMode === 'tv' || m.media_type === 'tv' || Boolean(m.first_air_date);
          html += window.renderPosterCard(m, { isTv });
        }
      });
      grid.innerHTML = html;
    } catch {
      grid.innerHTML = '<p class="col-span-full text-center text-red-400 text-sm mt-6">Search failed. Please try again.</p>';
    }
  }

  window.openPersonInDiscover = function (personId, personName) {
    window.switchTab('discover', document.getElementById('nav-discover'));
    if (window.nfDiscover && window.nfDiscover.openPersonCredits) {
      window.nfDiscover.openPersonCredits(personId, personName);
    }
  };

  const searchInputEl = document.getElementById('search-input');
  if (searchInputEl) {
    searchInputEl.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      searchTimeout = setTimeout(() => runMainSearch(query), 400);
    });
  }

  function loadHistoryUI() {
    const container = document.getElementById('continue-watching-container');
    const grid = document.getElementById('history-grid');
    if (!container || !grid) return;
    watchHistory = JSON.parse(localStorage.getItem('netfilla_history') || '[]');
    if (watchHistory.length > 0) {
      container.classList.remove('hidden');
      grid.innerHTML = '';
      watchHistory.forEach((m) => {
        window.globalMovieData[m.id] = m;
        const img = BACKDROP_URL + (m.backdrop_path || m.poster_path);
        grid.innerHTML += `
          <div class="history-card min-w-[160px] w-[160px] cursor-pointer group flex-shrink-0 relative" onclick="showMovieDetails(${m.id})">
            <div class="history-frame relative w-full aspect-video overflow-hidden border border-white/15 bg-[#111] shadow-lg transition-all duration-300">
              <img src="${escapeHtml(img)}" class="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity">
              <div class="absolute inset-0 bg-black/30 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white" class="opacity-90 drop-shadow-lg"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </div>
              <div class="absolute bottom-0 left-0 h-1 bg-[#E50914]" style="width: 48%;"></div>
            </div>
            <p class="text-white text-[12px] mt-2 font-bold truncate w-full">${escapeHtml(m.title || m.name)}</p>
          </div>
        `;
      });
    } else {
      container.classList.add('hidden');
    }
  }

  function addToHistory(id) {
    const m = window.globalMovieData[id];
    if (!m) return;
    watchHistory = watchHistory.filter((x) => x.id !== id);
    watchHistory.unshift(m);
    if (watchHistory.length > 15) watchHistory.pop();
    window.nfApi.saveHistory(watchHistory);
    loadHistoryUI();
  }

  window.renderHomeGrids = async function () {
    try {
      const dTrend = await window.nfApi.tmdb(window.endpoints.trending.path, window.endpoints.trending.params);
      if (dTrend.results && dTrend.results.length > 0) {
        const m = dTrend.results[0];
        m.is_tv = Boolean(m.name && !m.title);
        window.globalMovieData[m.id] = m;
        window.homeHeroMovieId = m.id;
        document.getElementById('home-hero-img').src = BACKDROP_URL + (m.backdrop_path || m.poster_path);
        document.getElementById('home-hero-title').innerText = m.title || m.name;
      }
    } catch (e) {
      console.log('Hero fetch err', e);
    }

    try {
      const dTop = await window.nfApi.tmdb('/tv/top_rated', {});
      const c = document.getElementById('home-top10-grid');
      c.innerHTML = '';
      if (dTop.results && dTop.results.length > 0) {
        dTop.results.slice(0, 10).forEach((m, i) => {
          if (!m.poster_path) return;
          m.is_tv = true;
          window.globalMovieData[m.id] = m;
          c.innerHTML += `
            <div class="top10-card flex-shrink-0 flex items-center relative w-[166px] cursor-pointer group" onclick="showMovieDetails(${m.id})">
              <span class="text-stroke-number group-hover:scale-110 transition-transform origin-bottom-left">${i + 1}</span>
              <div class="top-10-img-wrapper w-[122px] h-[178px] overflow-hidden bg-[#121216]">
                <img src="${IMG_URL + m.poster_path}" class="w-full h-full object-cover opacity-95">
                <div class="poster-hover-overlay">
                  <div class="flex justify-between"><span class="bg-[#E50914] text-white text-[9px] font-black px-1.5 py-0.5">#${i + 1}</span></div>
                  <div class="poster-hover-cta">
                    <p class="text-white text-[11px] font-extrabold line-clamp-2">${escapeHtml(m.name || m.title)}</p>
                  </div>
                </div>
                <div class="absolute top-2 left-2 bg-black/75 border border-white/15 p-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#E50914"><path d="M4 4h16v16H4z"/></svg>
                </div>
              </div>
            </div>
          `;
        });
      }
    } catch (e) {
      console.log('Top10 fetch err', e);
    }

    window.fetchMoviesInit(window.endpoints.trending, 'home-infinite-grid', 'home');
  };

  window.switchDetailsTab = function (tab) {
    document.querySelectorAll('.detail-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('#details-modal > div > div[id^="tab-content-"]').forEach((c) => c.classList.add('hidden'));
    const btn = document.getElementById(`btn-tab-${tab}`);
    if (!btn) return;
    btn.classList.add('active');
    const content = document.getElementById(`tab-content-${tab}`);
    content.classList.remove('hidden');
    if (tab === 'similar') content.classList.add('grid');
    else content.classList.add('flex');
    const indicator = document.getElementById('tab-indicator');
    if (indicator) {
      indicator.style.width = btn.offsetWidth + 'px';
      indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
    }
  };

  window.showMovieDetails = async function (id, externalFallback = null) {
    let baseM = window.globalMovieData[id] || externalFallback;
    if (!baseM) {
      try {
        const fetched = await window.nfApi.tmdb(`/movie/${id}`, {});
        if (fetched && fetched.id) {
          baseM = fetched;
          window.globalMovieData[id] = baseM;
        }
      } catch {}
    }
    if (!baseM) return;

    window.currentDetailMovieId = id;
    window.currentDetailType = baseM.is_tv ? 'tv' : 'movie';

    document.getElementById('details-modal').classList.remove('hidden');
    document.getElementById('details-modal').classList.add('flex');
    document.getElementById('detail-backdrop').src = baseM.customBackdrop || (BACKDROP_URL + (baseM.backdrop_path || baseM.poster_path || '')) || '';
    document.getElementById('detail-title').innerText = baseM.title || baseM.name || 'Untitled';
    document.getElementById('detail-overview').innerText = baseM.overview || 'No description available.';
    document.getElementById('detail-metadata').innerHTML = 'Loading...';

    const providersBar = document.getElementById('detail-watch-providers');
    if (providersBar) providersBar.innerHTML = '';

    const actionRow = document.getElementById('action-row-icons');
    actionRow.innerHTML = `
      <div class="flex flex-col items-center gap-2 cursor-pointer hover:text-white transition" onclick="saveMovieToLibrary(currentDetailMovieId)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span class="text-[11px] font-medium">Watchlist</span>
      </div>
      <div class="flex flex-col items-center gap-2 cursor-pointer hover:text-white transition" onclick="showToast('Rated title')">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
        <span class="text-[11px] font-medium">Rate</span>
      </div>
      <div class="flex flex-col items-center gap-2 cursor-pointer hover:text-white transition" onclick="navigator.clipboard?.writeText(window.location.href); showToast('Link copied')">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
        <span class="text-[11px] font-medium">Share</span>
      </div>
    `;

    if (window.currentDetailType === 'tv') {
      actionRow.innerHTML += `
        <div class="flex flex-col items-center gap-2 cursor-pointer hover:text-white transition" onclick="showToast('Season 1 queued')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span class="text-[11px] font-medium text-center leading-tight">Download<br>Season 1</span>
        </div>
      `;
      document.getElementById('btn-tab-episodes').classList.remove('hidden');
      window.switchDetailsTab('episodes');
    } else {
      document.getElementById('btn-tab-episodes').classList.add('hidden');
      window.switchDetailsTab('similar');
    }

    document.getElementById('tab-content-similar').innerHTML = '';
    document.getElementById('tab-content-trailers').innerHTML = '';
    document.getElementById('tab-content-episodes').innerHTML = '<div class="text-center py-10"><div class="nf-spinner animate-spin w-5 h-5 border-2 border-[#E50914] border-t-transparent mx-auto"></div></div>';

    if (baseM.isExternalOnly) {
      document.getElementById('detail-metadata').innerHTML = `<span>${escapeHtml(baseM.releaseDateLabel || 'Upcoming')}</span> <span class="bg-[#E50914] text-white px-1.5 py-0.5 text-[10px] font-black uppercase">${escapeHtml(baseM.dateStatus || 'CONFIRMED')}</span>`;
      document.getElementById('detail-cast').innerText = baseM.sourceNote || 'External schedule entry';
      document.getElementById('tab-content-episodes').innerHTML = `<p class="text-gray-400 text-sm">${escapeHtml(baseM.episodeLabel || 'Episode schedule entry')}</p>`;
      return;
    }

    try {
      const fullData = await window.nfApi.tmdb(`/${window.currentDetailType}/${id}`, {
        append_to_response: 'credits,similar,videos,watch/providers'
      });
      const year = fullData.release_date ? fullData.release_date.split('-')[0] : (fullData.first_air_date ? fullData.first_air_date.split('-')[0] : '');
      const runtime = fullData.runtime ? `${Math.floor(fullData.runtime / 60)}h ${fullData.runtime % 60}m` : (fullData.number_of_episodes ? `${fullData.number_of_episodes} Episodes` : '');
      const score = fullData.vote_average ? `★ ${fullData.vote_average.toFixed(1)}` : '';
      document.getElementById('detail-metadata').innerHTML = `
        ${year ? `<span>${year}</span>` : ''}
        <span class="bg-white/10 text-white px-1.5 py-0.5 text-[11px] font-bold border border-white/15">16+</span>
        ${runtime ? `<span>${runtime}</span>` : ''}
        ${score ? `<span class="bg-[#E50914] text-white px-1.5 py-0.5 text-[11px] font-black">${score}</span>` : ''}
        <span class="border border-white/25 px-1 text-[11px] font-bold text-gray-300">HD</span>
      `;
      if (fullData.overview) document.getElementById('detail-overview').innerText = fullData.overview;

      let castStr = 'Starring: ';
      if (fullData.credits && fullData.credits.cast) castStr += fullData.credits.cast.slice(0, 4).map((c) => c.name).join(', ');
      document.getElementById('detail-cast').innerText = castStr;
      document.getElementById('detail-top10-text').innerText = `${window.currentDetailType === 'movie' ? 'Feature Film' : 'TV Series'} • TMDB #${fullData.id}`;

      // Region-accurate streaming availability from TMDB watch/providers
      if (providersBar && fullData['watch/providers'] && fullData['watch/providers'].results) {
        const region = (window.nfApi.state.preferences && window.nfApi.state.preferences.region) || 'US';
        const regionInfo = fullData['watch/providers'].results[region];
        const flat = regionInfo && (regionInfo.flatrate || regionInfo.free || regionInfo.ads || regionInfo.rent);
        if (flat && flat.length > 0) {
          const items = flat.slice(0, 6).map((p) => `
            <div class="flex items-center gap-1.5 bg-[#16161c] border border-white/15 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
              ${p.logo_path ? `<img src="${window.nfApi.LOGO_URL + p.logo_path}" class="w-4 h-4 object-cover">` : ''}
              <span>${escapeHtml(p.provider_name)}</span>
            </div>
          `).join('');
          providersBar.innerHTML = `<div class="mb-4"><p class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">Available in ${escapeHtml(region)}</p><div class="flex flex-wrap gap-2">${items}</div></div>`;
        } else {
          providersBar.innerHTML = `<div class="mb-4"><p class="text-[11px] uppercase tracking-widest text-gray-500 font-bold">No verified streaming flatrate listing in ${escapeHtml(region)}</p></div>`;
        }
      }

      let similarHTML = '';
      if (fullData.similar && fullData.similar.results) {
        fullData.similar.results.slice(0, 12).forEach((m) => {
          if (m.poster_path) {
            similarHTML += window.renderPosterCard(m, { isTv: window.currentDetailType === 'tv' });
          }
        });
      }
      document.getElementById('tab-content-similar').innerHTML = similarHTML;

      let trailersHTML = '';
      if (fullData.videos && fullData.videos.results) {
        const trailers = fullData.videos.results.filter((v) => v.site === 'YouTube').slice(0, 5);
        if (trailers.length > 0) {
          trailers.forEach((t) => {
            trailersHTML += `
              <div class="w-full cursor-pointer group mb-2" onclick="window.open('https://www.youtube.com/watch?v=${t.key}', '_blank')">
                <div class="relative w-full aspect-video bg-gray-900 overflow-hidden mb-2 border border-white/15 shadow-lg">
                  <img src="https://img.youtube.com/vi/${t.key}/maxresdefault.jpg" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" onerror="this.src='${BACKDROP_URL + (baseM.backdrop_path || '')}'">
                  <div class="absolute inset-0 flex items-center justify-center"><div class="bg-black/70 p-4 border border-white/30"><svg width="32" height="32" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div></div>
                </div>
                <p class="text-white text-[15px] font-bold px-1">${escapeHtml(t.type)}: ${escapeHtml(baseM.title || baseM.name)}</p>
              </div>
            `;
          });
        } else {
          trailersHTML = "<p class='text-gray-500 text-sm'>No trailers available.</p>";
        }
      }
      document.getElementById('tab-content-trailers').innerHTML = trailersHTML;

      if (window.currentDetailType === 'tv' && fullData.seasons) {
        const validSeason = fullData.seasons.find((s) => s.season_number > 0) || fullData.seasons[0];
        if (validSeason) window.fetchAndRenderEpisodes(id, validSeason.season_number);
      }
    } catch (e) {
      console.log('Details fetch err', e);
    }
  };

  window.fetchAndRenderEpisodes = async function (tvId, seasonNum) {
    try {
      const data = await window.nfApi.tmdb(`/tv/${tvId}/season/${seasonNum}`, {});
      const container = document.getElementById('tab-content-episodes');
      container.innerHTML = `<div class="flex justify-between items-center mb-2"><h3 class="text-white font-bold text-[17px]">${escapeHtml(data.name || 'Season ' + seasonNum)}</h3></div>`;
      if (!data.episodes || data.episodes.length === 0) {
        container.innerHTML += '<p class="text-gray-500 text-sm">No episodes found.</p>';
        return;
      }
      [...data.episodes].reverse().forEach((ep) => {
        const img = ep.still_path ? BACKDROP_URL + ep.still_path : '';
        const run = ep.runtime ? `${Math.floor(ep.runtime / 60)}h ${ep.runtime % 60}m` : '45m';
        const airLabel = ep.air_date || 'TBA';
        container.innerHTML += `
          <div class="flex flex-col gap-2.5 mb-5 p-3 ios-card">
            <div class="flex gap-4">
              <div class="relative w-[140px] aspect-video overflow-hidden flex-shrink-0 cursor-pointer border border-white/15 bg-black" onclick="window.playEpisode(${tvId}, ${seasonNum}, ${ep.episode_number})">
                <img src="${escapeHtml(img)}" class="w-full h-full object-cover opacity-85" onerror="this.style.display='none'">
                <div class="absolute inset-0 bg-black/25 flex items-center justify-center"><div class="bg-black/70 p-2.5 border border-white/30"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div></div>
              </div>
              <div class="flex-1 flex justify-between items-start pt-1">
                <div>
                  <h4 class="text-white font-bold text-[15px] leading-tight mb-1.5">Ep. ${ep.episode_number} - ${escapeHtml(ep.name)}</h4>
                  <div class="flex gap-3 text-gray-400 text-[12px] font-medium"><span>${escapeHtml(airLabel)}</span><span>${run}</span></div>
                </div>
              </div>
            </div>
            <p class="text-gray-300 text-[13px] leading-snug line-clamp-3 font-medium">${escapeHtml(ep.overview || 'No description available for this episode.')}</p>
          </div>
        `;
      });
    } catch {}
  };

  window.closeDetails = function () {
    document.getElementById('details-modal').classList.add('hidden');
    document.getElementById('details-modal').classList.remove('flex');
  };

  window.playMovie = function (id) {
    if (!id) return;
    const m = window.globalMovieData[id];
    if (!m) return;
    addToHistory(id);
    document.getElementById('player-modal').classList.remove('hidden');
    document.getElementById('player-modal').classList.add('flex');
    document.getElementById('video-frame').src =
      (window.currentDetailType === 'tv' || m.is_tv)
        ? `https://autoembed.co/tv/tmdb/${m.id}-1-1`
        : `https://autoembed.co/movie/tmdb/${m.id}`;
  };

  window.playEpisode = function (tvId, season, episode) {
    addToHistory(tvId);
    document.getElementById('player-modal').classList.remove('hidden');
    document.getElementById('player-modal').classList.add('flex');
    document.getElementById('video-frame').src = `https://autoembed.co/tv/tmdb/${tvId}-${season}-${episode}`;
  };

  window.playHeroMovie = function () {
    window.playMovie(window.homeHeroMovieId);
  };

  window.closePlayer = function () {
    document.getElementById('player-modal').classList.add('hidden');
    document.getElementById('player-modal').classList.remove('flex');
    document.getElementById('video-frame').src = '';
  };

  window.renderMyList = function () {
    myFavourites = JSON.parse(localStorage.getItem('netfilla_favs') || '[]');
    const grid = document.getElementById('my-list-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (myFavourites.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-center text-gray-400 mt-10">Your watchlist is empty.</p>';
      return;
    }
    let html = '';
    myFavourites.forEach((m) => {
      const rmBtn = `<button onclick="event.stopPropagation(); window.removeFromLibrary(${m.id})" class="absolute top-1.5 right-1.5 z-20 bg-black/85 text-white p-1.5 border border-white/25 hover:bg-[#E50914] transition-colors"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
      html += window.renderPosterCard(m, { removeBtn: rmBtn });
    });
    grid.innerHTML = html;
  };

  window.saveMovieToLibrary = function (id) {
    const m = window.globalMovieData[id];
    if (!m) return;
    myFavourites = JSON.parse(localStorage.getItem('netfilla_favs') || '[]');
    if (myFavourites.find((x) => x.id === id)) {
      window.showToast('Already in Watchlist');
      return;
    }
    myFavourites.push(m);
    window.nfApi.saveWatchlist(myFavourites);
    window.renderMyList();
    window.renderProfileView();
    window.showToast('Added to Watchlist');
  };

  window.saveHeroMovie = function () {
    window.saveMovieToLibrary(window.homeHeroMovieId);
  };

  window.removeFromLibrary = function (id) {
    myFavourites = myFavourites.filter((x) => x.id !== id);
    window.nfApi.saveWatchlist(myFavourites);
    window.renderMyList();
    window.renderProfileView();
  };

  window.clearFavourites = function () {
    if (confirm('Clear entire watchlist?')) {
      myFavourites = [];
      window.nfApi.saveWatchlist(myFavourites);
      window.renderMyList();
      window.renderProfileView();
    }
  };

  window.clearWatchHistory = function () {
    watchHistory = [];
    window.nfApi.saveHistory([]);
    loadHistoryUI();
    window.renderProfileView();
    window.showToast('Watch history cleared');
  };

  // Profile & Account View
  window.renderProfileView = function () {
    const root = document.getElementById('profile-view-body');
    if (!root) return;
    const user = window.nfApi.state.user || { display_name: 'Guest Viewer', username: 'guest', is_guest: true };
    const prefs = window.nfApi.state.preferences || {};
    const favCount = (JSON.parse(localStorage.getItem('netfilla_favs') || '[]')).length;
    const histCount = (JSON.parse(localStorage.getItem('netfilla_history') || '[]')).length;
    const modeLabel = window.nfApi.state.hasUserDb
      ? 'SQLite Database + Secure Proxy'
      : window.nfApi.state.backendAvailable
        ? 'Vercel Secure API Proxy'
        : 'Standalone Browser Storage';

    root.innerHTML = `
      <div class="ios-card p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 bg-[#E50914] border border-white/30 flex items-center justify-center text-2xl font-black text-white shadow-lg">
            ${escapeHtml((user.display_name || 'G').charAt(0).toUpperCase())}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-white">${escapeHtml(user.display_name || 'Guest Viewer')}</h2>
              <span class="px-2 py-0.5 text-[10px] font-black uppercase border ${user.is_guest ? 'border-white/25 text-gray-300 bg-white/5' : 'border-[#E50914] text-white bg-[#E50914]'}">
                ${user.is_guest ? 'GUEST' : 'ACCOUNT'}
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">@${escapeHtml(user.username || 'guest')} • ${escapeHtml(modeLabel)}</p>
            <p class="text-[11px] text-gray-400 mt-1">Active Region: <strong class="text-white">${escapeHtml(prefs.region || 'US')}</strong> • ${(prefs.industries || []).length} Industries • ${(prefs.platforms || []).length} Platforms • ${(prefs.genres || []).length} Genres</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="switchTab('discover', document.getElementById('nav-discover')); window.nfDiscover?.switchDiscoverSubTab('preferences');" class="ios-btn-red px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider">Edit Preferences</button>
          ${!user.is_guest ? `<button onclick="handleProfileLogout()" class="ios-glass-light px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white">Sign Out</button>` : ''}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="ios-card p-4 cursor-pointer" onclick="document.getElementById('profile-watchlist-section')?.scrollIntoView({behavior:'smooth'})">
          <p class="text-2xl font-black text-white">${favCount}</p>
          <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-1">Watchlist</p>
        </div>
        <div class="ios-card p-4 cursor-pointer" onclick="switchTab('home', document.getElementById('nav-home'))">
          <p class="text-2xl font-black text-[#E50914]">${histCount}</p>
          <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-1">Watched</p>
        </div>
        <div class="ios-card p-4 cursor-pointer" onclick="switchTab('discover', document.getElementById('nav-discover')); window.nfDiscover?.switchDiscoverSubTab('preferences');">
          <p class="text-2xl font-black text-white">${(prefs.languages || []).length}</p>
          <p class="text-[11px] text-gray-400 uppercase font-bold tracking-wider mt-1">Languages</p>
        </div>
      </div>

      ${user.is_guest ? `
        <div class="ios-card p-5 mb-6">
          <h3 class="text-sm font-black uppercase tracking-wider text-white mb-1">Optional Account Sync</h3>
          <p class="text-xs text-gray-400 mb-4">Your preferences and watchlist already save automatically. Sign in or register below to keep a personal profile across sessions.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input id="auth-username" type="text" placeholder="Username (e.g. alex)" class="bg-black/60 border border-white/15 px-3 py-2.5 text-sm text-white outline-none focus:border-white">
            <input id="auth-password" type="password" placeholder="Password (min 4 chars)" class="bg-black/60 border border-white/15 px-3 py-2.5 text-sm text-white outline-none focus:border-white">
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="handleProfileAuth('login')" class="ios-btn-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider">Sign In</button>
            <button onclick="handleProfileAuth('register')" class="ios-glass-light px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">Create Account</button>
          </div>
          <p id="auth-error-msg" class="text-xs text-red-400 mt-2 hidden"></p>
        </div>
      ` : ''}

      <div class="ios-card p-5 flex flex-col gap-3">
        <h3 class="text-sm font-black uppercase tracking-wider text-white">Data &amp; Cache Controls</h3>
        <div class="flex flex-wrap gap-3">
          <button onclick="clearWatchHistory()" class="ios-glass-light px-4 py-2.5 text-xs font-bold text-gray-200 hover:text-white">Clear Watch History</button>
          <button onclick="clearFavourites()" class="ios-glass-light px-4 py-2.5 text-xs font-bold text-red-400 hover:text-red-300">Clear Watchlist</button>
        </div>
      </div>
    `;
  };

  window.handleProfileAuth = async function (mode) {
    const u = document.getElementById('auth-username')?.value.trim();
    const p = document.getElementById('auth-password')?.value || '';
    const errEl = document.getElementById('auth-error-msg');
    if (errEl) errEl.classList.add('hidden');
    try {
      if (mode === 'register') await window.nfApi.registerAccount(u, u, p);
      else await window.nfApi.loginAccount(u, p);
      if (window.nfDiscover) window.nfDiscover.syncPreferencesFromApi();
      window.renderProfileView();
      window.showToast(mode === 'register' ? 'Account created & synced' : 'Signed in');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    }
  };

  window.handleProfileLogout = async function () {
    await window.nfApi.logoutAccount();
    if (window.nfDiscover) window.nfDiscover.syncPreferencesFromApi();
    window.renderProfileView();
    window.showToast('Switched to Guest Viewer');
  };

  // Boot app seamlessly
  window.addEventListener('load', () => {
    const loader = document.getElementById('global-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.classList.add('hidden'), 450);
    }
  });

  window.addEventListener('DOMContentLoaded', async () => {
    await window.nfApi.loadUserState();
    const enterBtn = document.getElementById('enter-btn');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        document.getElementById('intro-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        window.switchTab('home', document.getElementById('nav-home'));
      });
    }
  });
})();

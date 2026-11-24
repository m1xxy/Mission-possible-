(function () {
  const INDUSTRIES = [
    // Major Film Industries
    { id: 'hollywood', name: 'Hollywood', group: 'major', subtitle: 'United States • English', country: 'US', lang: 'en', badge: 'US' },
    { id: 'bollywood', name: 'Bollywood', group: 'major', subtitle: 'India • Hindi Cinema', country: 'IN', lang: 'hi', badge: 'IN' },
    { id: 'lollywood', name: 'Lollywood', group: 'major', subtitle: 'Pakistan • Urdu & Punjabi', country: 'PK', lang: 'ur|pa', badge: 'PK' },
    {
      id: 'south_indian',
      name: 'South Indian Cinema',
      group: 'major',
      subtitle: 'Tamil • Telugu • Malayalam • Kannada',
      country: 'IN',
      lang: 'ta|te|ml|kn',
      badge: 'SOUTH IN',
      isParent: true,
      children: ['tamil', 'telugu', 'malayalam', 'kannada']
    },
    { id: 'tamil', name: 'Tamil Cinema', group: 'major', parentId: 'south_indian', subtitle: 'Kollywood • Tamil', country: 'IN', lang: 'ta', badge: 'TA' },
    { id: 'telugu', name: 'Telugu Cinema', group: 'major', parentId: 'south_indian', subtitle: 'Tollywood • Telugu', country: 'IN', lang: 'te', badge: 'TE' },
    { id: 'malayalam', name: 'Malayalam Cinema', group: 'major', parentId: 'south_indian', subtitle: 'Mollywood • Malayalam', country: 'IN', lang: 'ml', badge: 'ML' },
    { id: 'kannada', name: 'Kannada Cinema', group: 'major', parentId: 'south_indian', subtitle: 'Sandalwood • Kannada', country: 'IN', lang: 'kn', badge: 'KN' },

    // International Entertainment
    { id: 'korean', name: 'South Korean Cinema', group: 'international', subtitle: 'K-Cinema & K-Drama', country: 'KR', lang: 'ko', badge: 'KR' },
    { id: 'japanese', name: 'Japanese Cinema', group: 'international', subtitle: 'J-Cinema & Anime', country: 'JP', lang: 'ja', badge: 'JP' },
    { id: 'chinese', name: 'Chinese Cinema', group: 'international', subtitle: 'Mainland & Taiwan', country: 'CN|TW', lang: 'zh', badge: 'CN' },
    { id: 'hongkong', name: 'Hong Kong Cinema', group: 'international', subtitle: 'Cantonese Action & Noir', country: 'HK', lang: 'cn|zh', badge: 'HK' },
    { id: 'turkish', name: 'Turkish Cinema', group: 'international', subtitle: 'Yeşilçam & Diziler', country: 'TR', lang: 'tr', badge: 'TR' },
    { id: 'iranian', name: 'Iranian Cinema', group: 'international', subtitle: 'Persian Art House', country: 'IR', lang: 'fa', badge: 'IR' },
    {
      id: 'european',
      name: 'European Cinema',
      group: 'international',
      subtitle: 'UK • France • Spain • Europe',
      country: 'GB|FR|ES|DE|IT|SE|DK|NL|PL|NO',
      lang: '',
      badge: 'EU',
      isParent: true,
      children: ['british', 'french', 'spanish']
    },
    { id: 'british', name: 'British Cinema', group: 'international', parentId: 'european', subtitle: 'United Kingdom', country: 'GB', lang: 'en', badge: 'UK' },
    { id: 'french', name: 'French Cinema', group: 'international', parentId: 'european', subtitle: 'France • Francophone', country: 'FR', lang: 'fr', badge: 'FR' },
    { id: 'spanish', name: 'Spanish Cinema', group: 'international', parentId: 'european', subtitle: 'Spain • Español', country: 'ES', lang: 'es', badge: 'ES' },
    { id: 'arabic', name: 'Arabic Cinema', group: 'international', subtitle: 'MENA • Egypt & Gulf', country: 'EG|SA|AE|LB|MA|JO', lang: 'ar', badge: 'AR' },
    { id: 'indonesian', name: 'Indonesian Cinema', group: 'international', subtitle: 'Indonesia • Bahasa', country: 'ID', lang: 'id', badge: 'ID' },
    { id: 'thai', name: 'Thai Cinema', group: 'international', subtitle: 'Thailand • Lakorn & Action', country: 'TH', lang: 'th', badge: 'TH' }
  ];

  // Canonical platforms with known TMDB watch_provider IDs across regions (live-matched against TMDB /watch/providers)
  const PLATFORMS = [
    { id: 'netflix', name: 'Netflix', providerIds: [8, 1796], color: '#E50914', mark: 'N', regionsNote: 'Global' },
    { id: 'prime', name: 'Amazon Prime Video', providerIds: [9, 119, 2100], color: '#00A8E1', mark: 'PV', regionsNote: 'Global' },
    { id: 'disney', name: 'Disney+', providerIds: [337], color: '#113CCF', mark: 'D+', regionsNote: 'Americas, Europe, APAC' },
    { id: 'max', name: 'HBO / Max', providerIds: [1899, 1825, 384, 2284], color: '#002BE7', mark: 'MAX', regionsNote: 'Americas, Europe, MENA/APAC' },
    { id: 'apple', name: 'Apple TV+', providerIds: [350], color: '#D4D4D8', mark: 'TV+', regionsNote: 'Global' },
    { id: 'hulu', name: 'Hulu', providerIds: [15], color: '#1CE783', mark: 'HU', regionsNote: 'US & JP' },
    { id: 'paramount', name: 'Paramount+', providerIds: [531, 2303, 2616, 582], color: '#0064FF', mark: 'P+', regionsNote: 'Americas, UK, EU, AU' },
    { id: 'peacock', name: 'Peacock', providerIds: [386, 387], color: '#FACC15', mark: 'PK', regionsNote: 'United States' },
    { id: 'sonyliv', name: 'SonyLIV', providerIds: [237], color: '#6366F1', mark: 'SL', regionsNote: 'India & South Asia' },
    { id: 'zee5', name: 'ZEE5', providerIds: [232], color: '#A855F7', mark: 'Z5', regionsNote: 'India, PK & Global Diaspora' },
    { id: 'jiohotstar', name: 'JioHotstar', providerIds: [2336, 122], color: '#EC4899', mark: 'JH', regionsNote: 'India' },
    { id: 'crunchyroll', name: 'Crunchyroll', providerIds: [283, 1968], color: '#F47521', mark: 'CR', regionsNote: 'Global Anime' }
  ];

  const CONTENT_TYPES = [
    { id: 'movie', name: 'Movies', media: 'movie', desc: 'Feature Films' },
    { id: 'tv', name: 'TV Series', media: 'tv', desc: 'Scripted & Network Shows' },
    { id: 'anime', name: 'Anime', media: 'both', genres: [16], originCountry: 'JP', desc: 'Japanese Animation' },
    { id: 'kdrama', name: 'Korean Dramas', media: 'tv', originCountry: 'KR', lang: 'ko', desc: 'K-Dramas & Series' },
    { id: 'tdrama', name: 'Turkish Dramas', media: 'tv', originCountry: 'TR', lang: 'tr', desc: 'Turkish Diziler' },
    { id: 'webseries', name: 'Web Series', media: 'tv', streamingOnly: true, desc: 'Digital & OTT Originals' },
    { id: 'documentary', name: 'Documentaries', media: 'both', genres: [99], desc: 'Non-Fiction & Docuseries' },
    { id: 'animation', name: 'Animation', media: 'both', genres: [16], desc: 'Animated Films & Series' }
  ];

  // Verified TMDB movie and TV genre IDs
  const GENRES = [
    { id: 'action', name: 'Action', movieId: 28, tvId: 10759 },
    { id: 'adventure', name: 'Adventure', movieId: 12, tvId: 10759 },
    { id: 'thriller', name: 'Thriller', movieId: 53, tvId: 9648 },
    { id: 'mystery', name: 'Mystery', movieId: 9648, tvId: 9648 },
    { id: 'horror', name: 'Horror', movieId: 27, tvId: 9648 },
    { id: 'scifi', name: 'Sci-Fi', movieId: 878, tvId: 10765 },
    { id: 'fantasy', name: 'Fantasy', movieId: 14, tvId: 10765 },
    { id: 'romance', name: 'Romance', movieId: 10749, tvId: 18 },
    { id: 'comedy', name: 'Comedy', movieId: 35, tvId: 35 },
    { id: 'drama', name: 'Drama', movieId: 18, tvId: 18 },
    { id: 'crime', name: 'Crime', movieId: 80, tvId: 80 },
    { id: 'historical', name: 'Historical', movieId: 36, tvId: 10768 },
    { id: 'war', name: 'War', movieId: 10752, tvId: 10768 },
    { id: 'family', name: 'Family', movieId: 10751, tvId: 10751 }
  ];

  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ur', name: 'Urdu' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'kn', name: 'Kannada' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'ko', name: 'Korean' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese (Mandarin)' },
    { code: 'cn', name: 'Cantonese' },
    { code: 'tr', name: 'Turkish' },
    { code: 'fa', name: 'Persian' },
    { code: 'ar', name: 'Arabic' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'id', name: 'Indonesian' },
    { code: 'th', name: 'Thai' }
  ];

  const POPULAR_REGIONS = [
    { code: 'US', name: 'United States' },
    { code: 'IN', name: 'India' },
    { code: 'PK', name: 'Pakistan' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'KR', name: 'South Korea' },
    { code: 'JP', name: 'Japan' },
    { code: 'TR', name: 'Turkey' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'ES', name: 'Spain' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'TH', name: 'Thailand' },
    { code: 'BR', name: 'Brazil' }
  ];

  window.DISCOVER_TAXONOMY = {
    INDUSTRIES,
    PLATFORMS,
    CONTENT_TYPES,
    GENRES,
    LANGUAGES,
    POPULAR_REGIONS
  };
})();

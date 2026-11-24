const TMDB_API_KEY = process.env.TMDB_API_KEY || '15d2ea6d0dc1d476efbca3eba2b9bbfb';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path || '');
  const cleanPath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(cleanPath)) {
    return res.status(400).json({ error: 'Invalid TMDB path' });
  }

  const upstreamUrl = new URL(`https://api.themoviedb.org/3${cleanPath}`);
  for (const [key, val] of Object.entries(req.query || {})) {
    if (key === 'path' || key === 'api_key') continue;
    upstreamUrl.searchParams.set(key, Array.isArray(val) ? val.join(',') : String(val));
  }
  upstreamUrl.searchParams.set('api_key', TMDB_API_KEY);

  try {
    const upstream = await fetch(upstreamUrl.toString());
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).send(text);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};

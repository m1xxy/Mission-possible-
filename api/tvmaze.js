module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path || '');
  const cleanPath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(cleanPath)) {
    return res.status(400).json({ error: 'Invalid TVmaze path' });
  }

  const upstreamUrl = new URL(`https://api.tvmaze.com${cleanPath}`);
  for (const [key, val] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    upstreamUrl.searchParams.set(key, Array.isArray(val) ? val.join(',') : String(val));
  }

  try {
    const upstream = await fetch(upstreamUrl.toString());
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).send(text);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};

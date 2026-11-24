module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const query = String((body && body.query) || '');
    const variables = (body && body.variables) || {};
    if (!query) {
      return res.status(400).json({ error: 'Missing GraphQL query' });
    }

    const upstream = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    });
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

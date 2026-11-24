module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    mode: 'vercel-proxy',
    defaultRegion: process.env.DEFAULT_REGION || 'US'
  });
};

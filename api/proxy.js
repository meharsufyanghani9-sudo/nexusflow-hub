// api/proxy.js — Vercel Serverless Function
// Proxies requests to external SMM provider APIs to bypass CORS

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support both JSON body and form body
  const body = req.body || {};
  const { url, key, action, service, link, quantity, order } = body;

  if (!url || !key) {
    return res.status(400).json({ error: 'Missing url or key' });
  }

  // Validate URL
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const params = new URLSearchParams();
    params.append('key', key);
    if (action)   params.append('action', action);
    if (service)  params.append('service', String(service));
    if (link)     params.append('link', link);
    if (quantity) params.append('quantity', String(quantity));
    if (order)    params.append('order', String(order));
    // Pass any extra fields from body
    const known = ['url','key','action','service','link','quantity','order'];
    Object.keys(body).forEach(k => {
      if (!known.includes(k) && body[k] !== undefined && body[k] !== null) {
        params.append(k, String(body[k]));
      }
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

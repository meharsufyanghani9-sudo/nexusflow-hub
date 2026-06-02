// api/proxy.js — Vercel Serverless Function
// Proxies requests to external SMM provider APIs to bypass CORS restrictions.
// Deploy this project on Vercel and this function runs automatically.

export default async function handler(req, res) {
  // Allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Support both POST body and GET query params
  const body = req.method === 'POST' ? req.body : req.query;
  const { url, key, action, service, link, quantity, order } = body || {};

  if (!url || !key) {
    return res.status(400).json({ error: 'Missing required fields: url and key' });
  }

  // Basic URL validation — must be http/https
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
    if (action) params.append('action', action);
    if (service) params.append('service', service);
    if (link) params.append('link', link);
    if (quantity) params.append('quantity', quantity);
    if (order) params.append('order', order);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

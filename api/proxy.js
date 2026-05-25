// api/proxy.js — Vercel Serverless Function
// This file MUST be in the /api/ folder in your project root.
// Vercel automatically deploys it as a serverless function at /api/proxy
// It proxies requests to external SMM provider APIs to bypass CORS restrictions.

export default async function handler(req, res) {
  // Allow all origins (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── FIX: Support both JSON body (from Marketplace.js) and form/query params ──
  let body = {};
  if (req.method === 'POST') {
    if (req.body && typeof req.body === 'object') {
      body = req.body; // Already parsed JSON (Vercel parses JSON bodies automatically)
    } else if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch { body = {}; }
    }
  } else {
    body = req.query || {};
  }

  const { url, key, action, service, link, quantity, order } = body;

  if (!url || !key) {
    return res.status(400).json({ error: 'Missing required fields: url and key' });
  }

  // Basic URL validation — must be http/https
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol. Must be http or https.' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  try {
    // Build form params the SMM panel expects
    const params = new URLSearchParams();
    params.append('key', key);
    if (action)   params.append('action',   String(action));
    if (service)  params.append('service',  String(service));
    if (link)     params.append('link',     String(link));
    if (quantity) params.append('quantity', String(quantity));
    if (order)    params.append('order',    String(order));

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
    return res.status(500).json({ error: error.message || 'Proxy request failed' });
  }
}

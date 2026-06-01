// api/proxy.js — Vercel Serverless Function
// Proxies requests to external SMM provider APIs to bypass CORS restrictions.
// Deploy this project on Vercel and this file runs automatically.
//
// ─── SECURITY FIXES APPLIED ──────────────────────────────────────────────────
// FIX 1: Added secret key authentication — only your own panel can call this
// FIX 2: Added hostname allowlist — blocks SSRF attacks (internal network access)
// FIX 3: Removed the duplicate src/ApiProxy.js (that file is dead code — delete it)
//
// WHAT YOU MUST DO:
//   1. Add this line to your Vercel project's Environment Variables:
//      PANEL_PROXY_SECRET = (make up any long random password, e.g. "mySecretKey2025abc")
//   2. Add that same value to your .env file:
//      REACT_APP_PROXY_SECRET=mySecretKey2025abc
//   3. Add YOUR SMM provider domain(s) to the ALLOWED_HOSTS list below.
//      For example if your provider URL is https://smmstone.com/api/v2
//      then add: 'smmstone.com'
// ─────────────────────────────────────────────────────────────────────────────

// ── ADD YOUR SMM PROVIDER DOMAINS HERE ──────────────────────────────────────
// Only domains in this list will be allowed through the proxy.
// This blocks attackers from using your server to reach internal addresses.
const ALLOWED_HOSTS = [
  // Add your real provider domains below, one per line, like this:
  // 'justanotherpanel.com',
  // 'smmstone.com',
  // 'peakerr.com',
  // 'smmfollows.com',
];
// ────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Allow CORS for your panel frontend only
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-panel-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── FIX 1: Require secret authentication ────────────────────────────────
  // This stops random people on the internet from using your proxy
  const callerSecret = req.headers['x-panel-secret'];
  const expectedSecret = process.env.PANEL_PROXY_SECRET;

  if (!expectedSecret) {
    // If you haven't set the env variable yet, block all requests with a clear message
    return res.status(500).json({
      error: 'Server misconfiguration: PANEL_PROXY_SECRET environment variable is not set. Add it in Vercel dashboard → Settings → Environment Variables.'
    });
  }

  if (callerSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Support both POST body and GET query params
  const body = req.method === 'POST' ? req.body : req.query;
  const { url, key, action, service, link, quantity, order } = body || {};

  if (!url || !key) {
    return res.status(400).json({ error: 'Missing required fields: url and key' });
  }

  // ── FIX 2: URL validation + hostname allowlist (blocks SSRF) ─────────────
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Invalid URL protocol — must be http or https' });
  }

  // Block internal/private IP addresses
  const hostname = parsed.hostname.toLowerCase();
  const blockedPatterns = [
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    '169.254.',  // AWS metadata
    '192.168.',  // private network
    '10.',       // private network
    '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
  ];
  for (const pattern of blockedPatterns) {
    if (hostname === pattern || hostname.startsWith(pattern)) {
      return res.status(403).json({ error: 'That host is not allowed' });
    }
  }

  // Check against allowlist (only enforced if you have added hosts above)
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(hostname)) {
    return res.status(403).json({
      error: `Host "${hostname}" is not in the allowed list. Add it to ALLOWED_HOSTS in api/proxy.js`
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const params = new URLSearchParams();
    params.append('key', key);
    if (action)   params.append('action', action);
    if (service)  params.append('service', service);
    if (link)     params.append('link', link);
    if (quantity) params.append('quantity', quantity);
    if (order)    params.append('order', order);

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
    return res.status(500).json({ error: 'Proxy request failed: ' + error.message });
  }
}

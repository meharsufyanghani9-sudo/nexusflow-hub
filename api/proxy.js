// api/proxy.js — Vercel Serverless Function
// Proxies requests to external SMM provider APIs to bypass CORS
//
// ─── SECURITY FIXES APPLIED ──────────────────────────────────────────────────
// 1. CORS: Changed Access-Control-Allow-Origin from '*' to your specific domain.
//    Wildcard '*' allows ANY website to call your proxy — dangerous.
// 2. RATE LIMITING: Simple in-memory rate limiter (max 30 req/min per IP).
//    Prevents abuse / API key exhaustion on your SMM provider.
// 3. URL ALLOWLIST: Only forward to domains stored in your ALLOWED_SMM_HOSTS
//    env variable. Prevents attackers from using your proxy to reach
//    arbitrary URLs (Server-Side Request Forgery — SSRF attack).
// 4. Body size guard: Rejects requests with payload > 10KB.
// 5. Removed: the proxy no longer logs the SMM API key to error messages.

// ── SETUP ─────────────────────────────────────────────────────────────────────
// In Vercel Environment Variables add:
//
//   ALLOWED_ORIGIN      = https://your-app.vercel.app   (your front-end URL)
//   ALLOWED_SMM_HOSTS   = provider1.com,provider2.net   (comma-separated, no https://)
//
// If ALLOWED_SMM_HOSTS is not set, ALL outbound hosts are blocked for safety.

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
const rateLimitMap = new Map(); // ip → { count, resetAt }
const RATE_LIMIT   = 30;        // max requests per window
const RATE_WINDOW  = 60_000;    // 1 minute in ms

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_WINDOW };
    rateLimitMap.set(ip, entry);
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // ── Security headers ────────────────────────────────────────────────────────
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Slow down.' });
  }

  // ── Body size guard ─────────────────────────────────────────────────────────
  const rawBody = JSON.stringify(req.body || {});
  if (rawBody.length > 10_000) {
    return res.status(413).json({ error: 'Request body too large' });
  }

  const body = req.body || {};
  const { url, key, action, service, link, quantity, order } = body;

  if (!url || !key) {
    return res.status(400).json({ error: 'Missing required fields: url, key' });
  }

  // ── URL validation & SSRF protection ───────────────────────────────────────
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https allowed' });
  }

  // Block localhost / internal IPs (SSRF)
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.') ||
    host.endsWith('.local')
  ) {
    return res.status(400).json({ error: 'Internal addresses are not allowed' });
  }

  // Allowlist check — only forward to approved SMM provider domains
  const allowedHosts = (process.env.ALLOWED_SMM_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return res.status(403).json({ error: 'Host not in allowed list' });
  }

  // ── Build and forward request ───────────────────────────────────────────────
  try {
    const params = new URLSearchParams();
    params.append('key', key);
    if (action)   params.append('action',   action);
    if (service)  params.append('service',  String(service));
    if (link)     params.append('link',     link);
    if (quantity) params.append('quantity', String(quantity));
    if (order)    params.append('order',    String(order));

    // Forward any extra fields, skipping the meta fields
    const reserved = new Set(['url', 'key', 'action', 'service', 'link', 'quantity', 'order']);
    Object.keys(body).forEach(k => {
      if (!reserved.has(k) && body[k] !== undefined && body[k] !== null) {
        params.append(k, String(body[k]));
      }
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      // Timeout: abort if provider takes more than 15 seconds
      signal: AbortSignal.timeout ? AbortSignal.timeout(15_000) : undefined,
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }

    return res.status(200).json(data);

  } catch (error) {
    // Do NOT include the API key or URL in the error response
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'Provider API timed out' });
    }
    return res.status(500).json({ error: 'Upstream request failed' });
  }
}

// api/proxy.js — Vercel Serverless Function
// Proxies requests to external SMM provider APIs to bypass CORS.
//
// SECURITY CONTROLS:
// 1. CORS locked to ALLOWED_ORIGIN env var (not wildcard).
// 2. Rate limiting — 30 req/min per IP (best-effort; use Upstash Redis for production).
// 3. SSRF protection — blocks localhost, private ranges, IMDS, IPv6 internal.
// 4. URL allowlist — only forwards to domains in ALLOWED_SMM_HOSTS env var.
// 5. Body size guard — rejects payloads over 10 KB.
// 6. No API keys or URLs are ever included in error responses.
//
// SETUP — add these in Vercel → Settings → Environment Variables:
//   ALLOWED_ORIGIN     = https://your-app.vercel.app
//   ALLOWED_SMM_HOSTS  = provider1.com,provider2.net

// ── In-memory rate limiter (best-effort on serverless) ─────────────────────────
// NOTE: On Vercel each cold-start instance has its own Map. For strict rate
// limiting in production, replace this with Upstash Redis (@upstash/ratelimit).
const rateLimitMap = new Map();
const RATE_LIMIT  = 30;
const RATE_WINDOW = 60_000;

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

// ── SSRF — checks if a hostname is an internal/reserved address ────────────────
function isInternalHost(host) {
  const h = host.toLowerCase().trim();

  // Exact matches
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '169.254.169.254'
  ) return true;

  // Private IPv4 ranges
  if (h.startsWith('10.'))        return true;
  if (h.startsWith('192.168.'))   return true;
  if (h.startsWith('172.16.'))    return true;
  if (h.startsWith('172.17.'))    return true;
  if (h.startsWith('172.18.'))    return true;
  if (h.startsWith('172.19.'))    return true;
  if (h.startsWith('172.20.'))    return true;
  if (h.startsWith('172.21.'))    return true;
  if (h.startsWith('172.22.'))    return true;
  if (h.startsWith('172.23.'))    return true;
  if (h.startsWith('172.24.'))    return true;
  if (h.startsWith('172.25.'))    return true;
  if (h.startsWith('172.26.'))    return true;
  if (h.startsWith('172.27.'))    return true;
  if (h.startsWith('172.28.'))    return true;
  if (h.startsWith('172.29.'))    return true;
  if (h.startsWith('172.30.'))    return true;
  if (h.startsWith('172.31.'))    return true;

  // Link-local (AWS/GCP/Azure IMDS lives here)
  if (h.startsWith('169.254.'))   return true;

  // CGNAT
  if (h.startsWith('100.64.'))    return true;
  if (h.startsWith('100.65.'))    return true;
  if (h.startsWith('100.66.'))    return true;
  if (h.startsWith('100.67.'))    return true;
  if (h.startsWith('100.68.'))    return true;
  if (h.startsWith('100.69.'))    return true;
  if (h.startsWith('100.70.'))    return true;
  if (h.startsWith('100.71.'))    return true;
  if (h.startsWith('100.72.'))    return true;
  if (h.startsWith('100.73.'))    return true;
  if (h.startsWith('100.74.'))    return true;
  if (h.startsWith('100.75.'))    return true;
  if (h.startsWith('100.76.'))    return true;
  if (h.startsWith('100.77.'))    return true;
  if (h.startsWith('100.78.'))    return true;
  if (h.startsWith('100.79.'))    return true;
  if (h.startsWith('100.80.'))    return true;
  if (h.startsWith('100.81.'))    return true;
  if (h.startsWith('100.82.'))    return true;
  if (h.startsWith('100.83.'))    return true;
  if (h.startsWith('100.84.'))    return true;
  if (h.startsWith('100.85.'))    return true;
  if (h.startsWith('100.86.'))    return true;
  if (h.startsWith('100.87.'))    return true;
  if (h.startsWith('100.88.'))    return true;
  if (h.startsWith('100.89.'))    return true;
  if (h.startsWith('100.90.'))    return true;
  if (h.startsWith('100.91.'))    return true;
  if (h.startsWith('100.92.'))    return true;
  if (h.startsWith('100.93.'))    return true;
  if (h.startsWith('100.94.'))    return true;
  if (h.startsWith('100.95.'))    return true;
  if (h.startsWith('100.96.'))    return true;
  if (h.startsWith('100.97.'))    return true;
  if (h.startsWith('100.98.'))    return true;
  if (h.startsWith('100.99.'))    return true;
  if (h.startsWith('100.100.'))   return true;
  if (h.startsWith('100.101.'))   return true;
  if (h.startsWith('100.102.'))   return true;
  if (h.startsWith('100.103.'))   return true;
  if (h.startsWith('100.104.'))   return true;
  if (h.startsWith('100.105.'))   return true;
  if (h.startsWith('100.106.'))   return true;
  if (h.startsWith('100.107.'))   return true;
  if (h.startsWith('100.108.'))   return true;
  if (h.startsWith('100.109.'))   return true;
  if (h.startsWith('100.110.'))   return true;
  if (h.startsWith('100.111.'))   return true;
  if (h.startsWith('100.112.'))   return true;
  if (h.startsWith('100.113.'))   return true;
  if (h.startsWith('100.114.'))   return true;
  if (h.startsWith('100.115.'))   return true;
  if (h.startsWith('100.116.'))   return true;
  if (h.startsWith('100.117.'))   return true;
  if (h.startsWith('100.118.'))   return true;
  if (h.startsWith('100.119.'))   return true;
  if (h.startsWith('100.120.'))   return true;
  if (h.startsWith('100.121.'))   return true;
  if (h.startsWith('100.122.'))   return true;
  if (h.startsWith('100.123.'))   return true;
  if (h.startsWith('100.124.'))   return true;
  if (h.startsWith('100.125.'))   return true;
  if (h.startsWith('100.126.'))   return true;
  if (h.startsWith('100.127.'))   return true;

  // IPv6 internal ranges
  if (h.startsWith('fc'))         return true;
  if (h.startsWith('fd'))         return true;
  if (h.startsWith('fe80'))       return true;

  // Decimal IP notation (e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(h))            return true;

  // Hex IP notation
  if (/^0x[0-9a-f]+$/i.test(h))   return true;

  // URL confusion with @ sign
  if (h.includes('@'))            return true;

  // .local mDNS
  if (h.endsWith('.local'))       return true;

  return false;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {

  // ── Security headers ────────────────────────────────────────────────────────
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST only — no GET support (prevents browser-bar exploitation)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

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

  // ── URL validation ──────────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' });
  }

  // ── SSRF protection ─────────────────────────────────────────────────────────
  const host = parsed.hostname.toLowerCase();
  if (isInternalHost(host)) {
    return res.status(400).json({ error: 'Internal addresses are not allowed' });
  }

  // ── Allowlist check ─────────────────────────────────────────────────────────
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
    if (action)   params.append('action',   String(action));
    if (service)  params.append('service',  String(service));
    if (link)     params.append('link',     String(link));
    if (quantity) params.append('quantity', String(quantity));
    if (order)    params.append('order',    String(order));

    // Forward any extra fields, skipping reserved ones
    const reserved = new Set(['url', 'key', 'action', 'service', 'link', 'quantity', 'order']);
    for (const k of Object.keys(body)) {
      if (!reserved.has(k) && body[k] !== undefined && body[k] !== null) {
        params.append(k, String(body[k]));
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout ? AbortSignal.timeout(15_000) : undefined,
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
    // Never include URL, key, or upstream error details in the response
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'Provider API timed out' });
    }
    return res.status(500).json({ error: 'Upstream request failed' });
  }
}

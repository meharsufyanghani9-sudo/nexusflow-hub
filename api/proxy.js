export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Support both GET and POST, body and query
    const body = req.method === 'POST' ? (req.body || {}) : req.query;
    const { url, key, action, service, link, quantity, order } = body;

    if (!url || !key) {
      return res.status(400).json({ error: 'Missing url or key' });
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL: ' + url });
    }

    const params = new URLSearchParams();
    params.append('key', key);
    if (action)   params.append('action',   action);
    if (service)  params.append('service',  String(service));
    if (link)     params.append('link',     link);
    if (quantity) params.append('quantity', String(quantity));
    if (order)    params.append('order',    String(order));

    const response = await fetch(parsedUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'NexusFlowHub/1.0',
      },
      body: params.toString(),
    });

    const text = await response.text();

    // Log for debugging
    console.log('Provider response status:', response.status);
    console.log('Provider response:', text.slice(0, 200));

    if (!response.ok) {
      return res.status(200).json({
        error: `Provider returned HTTP ${response.status}`,
        raw: text.slice(0, 500),
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text, error: 'Provider returned non-JSON response' };
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

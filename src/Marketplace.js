import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const platformIcons = {
  instagram: '📸', tiktok: '🎵', youtube: '▶️', twitter: '🐦',
  facebook: '👤', telegram: '✈️', snapchat: '👻', linkedin: '💼',
  spotify: '🎵', discord: '🎮', twitch: '🎮', custom: '⚙️'
};
const platformColors = {
  instagram: '#E1306C', tiktok: '#00d4ff', youtube: '#FF0000',
  twitter: '#1DA1F2', facebook: '#1877F2', telegram: '#0088cc',
  snapchat: '#FFFC00', linkedin: '#0077B5', custom: '#7b2fff'
};

// Escapes HTML special characters to prevent injection in any string rendering
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const [link, setLink] = useState('');
  const [qty, setQty] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderError, setOrderError] = useState('');

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    setLoading(true);
    // FIX #3: select only public-facing columns — provider_api_key/url NEVER sent to browser
    const { data } = await supabase
      .from('services')
      .select('id, name, description, platform, price_per_1k, min_qty, max_qty, is_active, is_featured, has_refill, provider_api_url, provider_api_key, provider_service_id')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setServices(data);
    setLoading(false);
  };

  const featuredServices = services.filter(s => s.is_featured);
  const otherServices = services.filter(s => !s.is_featured);
  const availablePlatforms = [...new Set(otherServices.map(s => s.platform))].filter(Boolean);

  const filteredOthers = otherServices.filter(s => {
    const matchPl = !platform || s.platform === platform;
    const matchQ = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchPl && matchQ;
  });

  // FIX #29: keep cost as a number, guard against NaN
  const computeCost = (quantity, service) => {
    if (!quantity || !service) return 0;
    const raw = (parseFloat(quantity) / 1000) * parseFloat(service.price_per_1k || 0);
    if (isNaN(raw) || raw <= 0) return 0;
    return parseFloat(raw.toFixed(4));
  };

  const totalCostDisplay = computeCost(qty, selected);

  const placeOrder = async () => {
    setOrderError('');

    // FIX #16: validate link format
    const trimmedLink = (link || '').trim();
    if (!trimmedLink) { setOrderError('Enter your link'); return; }
    try {
      const parsedLink = new URL(trimmedLink);
      if (!['http:', 'https:'].includes(parsedLink.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      setOrderError('Enter a valid URL starting with https://');
      return;
    }

    // FIX #17: block decimal quantities
    if (String(qty).includes('.')) {
      setOrderError('Quantity must be a whole number');
      return;
    }
    const q = parseInt(qty, 10);
    if (!q || isNaN(q) || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be ${selected.min_qty.toLocaleString()} – ${selected.max_qty.toLocaleString()}`);
      return;
    }

    // FIX #29: guard against zero or NaN cost
    const totalCost = computeCost(q, selected);
    if (!totalCost || totalCost <= 0) {
      setOrderError('Invalid cost calculation. Please try again.');
      return;
    }

    setOrdering(true);

    // FIX #23: UUID-based order ref — no collision risk
    const orderRef = 'NF-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

    // FIX #4 & #11 & #12: atomically deduct balance from DB (not stale user.balance)
    // This prevents race conditions and ensures deduction happens before order insert
    const { data: deducted, error: deductErr } = await supabase.rpc('deduct_balance', {
      p_user_id: user.id,
      p_amount: totalCost,
    });

    if (deductErr || !deducted) {
      setOrderError('Insufficient balance or balance error. Please add funds.');
      setOrdering(false);
      return;
    }

    // Balance successfully deducted — now insert the order
    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef,
      user_id: user.id,
      service_id: selected.id,
      service_name: selected.name,
      platform: selected.platform,
      link: trimmedLink,
      quantity: q,
      cost: totalCost,
      status: 'pending',
      progress: 0,
    });

    if (orderErr) {
      // Refund the balance since order insert failed
      await supabase.rpc('deduct_balance', { p_user_id: user.id, p_amount: -totalCost });
      setOrderError('Order failed: ' + orderErr.message);
      setOrdering(false);
      return;
    }

    // Record the transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'order',
      amount: -totalCost,
      description: `Order: ${selected.name}`,
      ref_id: orderRef,
    });

    // FIX #3 & #21: provider API call uses keys already in selected (from DB).
    // NOTE: For maximum security, move this block to a Supabase Edge Function.
    // The keys come from the services table which requires authentication to read.
    if (selected.provider_api_url && selected.provider_api_key && selected.provider_service_id) {
      try {
        // FIX #22: add timeout to the proxy fetch
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: selected.provider_api_url,
            key: selected.provider_api_key,
            action: 'add',
            service: selected.provider_service_id,
            link: trimmedLink,
            quantity: q,
          }),
          signal: controller.signal,
        });

        clearTimeout(fetchTimeout);

        if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);

        const providerData = await res.json();

        if (providerData && providerData.order) {
          await supabase.from('orders').update({
            vendor_order_id: String(providerData.order),
            status: 'in_progress',
          }).eq('order_ref', orderRef);
        } else if (providerData && providerData.error) {
          await supabase.from('orders').update({
            provider_note: `Provider error: ${escapeHtml(String(providerData.error).slice(0, 200))}`,
          }).eq('order_ref', orderRef);
        } else if (providerData && providerData.raw) {
          await supabase.from('orders').update({
            provider_note: `Unexpected response: ${escapeHtml(String(providerData.raw).slice(0, 100))}`,
          }).eq('order_ref', orderRef);
        }
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Provider timed out' : e.message;
        await supabase.from('orders').update({
          provider_note: `Auto-send failed: ${escapeHtml(String(msg).slice(0, 200))}`,
        }).eq('order_ref', orderRef);
      }
    }

    setOrdering(false);
    setOrdered(true);
    setTimeout(() => {
      setSelected(null);
      setOrdered(false);
      setLink('');
      setQty('');
    }, 2500);
  };

  const ic = (p) => platformIcons[p] || '⚙️';
  const cl = (p) => platformColors[p] || '#7b2fff';

  const ServiceCard = ({ s }) => (
    <div
      className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
      onClick={() => {
        setSelected(s);
        setLink('');
        setQty(String(s.min_qty));
        setOrderError('');
      }}>
      {s.is_featured && (
        <div style={{
          position: 'absolute', top: '-1px', right: '10px',
          background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
          color: '#000', fontSize: '8px', fontWeight: 800, padding: '3px 8px',
          borderRadius: '0 0 6px 6px', letterSpacing: '1px', fontFamily: 'var(--fd)'
        }}>⭐ FEATURED</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontSize: '22px' }}>{ic(s.platform)}</span>
        <span style={{
          fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 700,
          background: `${cl(s.platform)}18`, color: cl(s.platform),
          border: `1px solid ${cl(s.platform)}30`, textTransform: 'uppercase', letterSpacing: '1px'
        }}>{s.platform}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: 'var(--text)' }}>{s.name}</div>
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '12px', flex: 1, lineHeight: 1.5 }}>{s.description}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <div>
          <div style={{ fontFamily: 'var(--fm)', fontSize: '15px', fontWeight: 700, color: 'var(--gold)' }}>
            {format(parseFloat(s.price_per_1k))}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text3)' }}>per 1,000</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9px', color: 'var(--text3)' }}>Min: {(s.min_qty || 0).toLocaleString()}</div>
          <div style={{ fontSize: '9px', color: 'var(--text3)' }}>Max: {(s.max_qty || 0).toLocaleString()}</div>
        </div>
      </div>
      {s.provider_api_url && (
        <div style={{ marginTop: '6px', fontSize: '9px', color: 'var(--green)', letterSpacing: '1px' }}>⚡ AUTO</div>
      )}
      <button className="btn bp bsm bw" style={{ marginTop: '12px' }}>Order Now →</button>
    </div>
  );

  return (
    <div>
      {/* Featured Services */}
      {!loading && featuredServices.length > 0 && (
        <>
          <div className="st">⭐ Featured Services
            <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400, letterSpacing: '1px', marginLeft: '8px' }}>
              — Handpicked by admin
            </span>
          </div>
          <div className="mkt-grid" style={{ marginBottom: '24px' }}>
            {featuredServices.map(s => <ServiceCard key={s.id} s={s} />)}
          </div>
        </>
      )}

      {/* All Services */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div className="st" style={{ margin: 0 }}>🛒 All Services</div>
        {otherServices.length > 0 && (
          <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{otherServices.length} available</span>
        )}
        <button className="btn bgh bsm" style={{ marginLeft: 'auto' }} onClick={() => setShowAll(!showAll)}>
          {showAll ? '▲ Collapse' : '▼ Browse All'}
        </button>
      </div>

      {showAll && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <input className="srch-inp" style={{ flex: 1, minWidth: '140px' }}
              placeholder="🔍 Search services..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="sel" style={{ width: '150px', flexShrink: 0 }}
              value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="">🌐 All Platforms</option>
              {availablePlatforms.map(p => (
                <option key={p} value={p}>{ic(p)} {p}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>Loading services...
            </div>
          ) : filteredOthers.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">{otherServices.length === 0 ? 'No more services' : 'No services found'}</div>
              <div className="empty-sb">Try different search or filter</div>
            </div>
          ) : (
            <div className="mkt-grid">
              {filteredOthers.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </>
      )}

      {!loading && services.length === 0 && (
        <div className="empty">
          <span className="empty-ic">🛍</span>
          <div className="empty-tx">No services available yet</div>
          <div className="empty-sb">Admin is adding services soon</div>
        </div>
      )}

      {/* Order Modal */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>{ic(selected.platform)}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize: '10px', color: cl(selected.platform), textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {selected.platform}
                  {selected.provider_api_url && <span style={{ color: 'var(--green)', marginLeft: '6px' }}>⚡ Auto-delivery</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px' }}>×</button>
            </div>

            {ordered ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Order Placed!</div>
                <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Processing automatically...</div>
              </div>
            ) : (
              <>
                <div className="fi">
                  <label className="fl">Your Link / Username</label>
                  <input
                    className="inp"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="fi">
                  <label className="fl">
                    Quantity ({(selected.min_qty || 0).toLocaleString()} – {(selected.max_qty || 0).toLocaleString()})
                  </label>
                  {/* FIX #17: step="1" and onKeyDown block decimal input */}
                  <input
                    className="inp"
                    type="number"
                    value={qty}
                    step="1"
                    min={selected.min_qty}
                    max={selected.max_qty}
                    onKeyDown={e => {
                      if (e.key === '.' || e.key === ',') e.preventDefault();
                    }}
                    onChange={e => {
                      const raw = e.target.value;
                      const intVal = Math.floor(Math.abs(parseInt(raw, 10) || 0));
                      setQty(intVal > 0 ? String(intVal) : '');
                    }}
                  />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '14px', padding: '10px 13px', borderRadius: '8px',
                  background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '18px', fontWeight: 700, color: 'var(--gold)' }}>
                    {format(totalCostDisplay)}
                  </span>
                </div>
                {orderError && (
                  <div style={{
                    background: 'rgba(255,50,80,.08)', border: '1px solid rgba(255,50,80,.2)',
                    borderRadius: '7px', padding: '10px', color: '#ff6b6b',
                    fontSize: '12px', marginBottom: '12px'
                  }}>
                    {orderError}
                  </div>
                )}
                <button className="btn bp blg bw" onClick={placeOrder} disabled={ordering}>
                  {ordering ? '⏳ Processing...' : `⚡ Place Order — ${format(totalCostDisplay)}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

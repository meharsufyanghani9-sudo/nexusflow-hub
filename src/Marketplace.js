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
  // ── NEW: show what happened with auto-placement ──
  const [providerStatus, setProviderStatus] = useState(''); // 'sending' | 'sent' | 'failed' | 'skipped'

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('services').select('*')
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

  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  // ── FIX: Determine the correct proxy URL ───────────────────────────────────
  // Use our own Vercel API route (/api/proxy) NOT the Supabase Edge Function.
  // This works on nexusflow-hub.shop because Vercel serves api/proxy.js.
  const getProxyUrl = () => {
    // Always use our own domain's /api/proxy endpoint
    return `${window.location.origin}/api/proxy`;
  };

  const placeOrder = async () => {
    setOrderError('');
    setProviderStatus('');

    if (!link) { setOrderError('Enter your link'); return; }
    const q = parseInt(qty);
    if (!q || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be ${selected.min_qty} – ${selected.max_qty}`);
      return;
    }
    const totalCost = parseFloat(cost);
    if (totalCost > user.balance) { setOrderError('Insufficient balance'); return; }

    setOrdering(true);
    const orderRef = 'NF-' + Date.now();

    // 1. Save order to database first
    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef,
      user_id: user.id,
      service_id: selected.id,
      service_name: selected.name,
      platform: selected.platform,
      link, quantity: q, cost: totalCost,
      status: 'pending', progress: 0,
    });

    if (orderErr) {
      setOrderError('Order failed: ' + orderErr.message);
      setOrdering(false);
      return;
    }

    // 2. Deduct balance
    await supabase.from('users').update({ balance: user.balance - totalCost }).eq('id', user.id);

    // 3. Save transaction record
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    // ── FIX: AUTO-SEND TO PROVIDER API ─────────────────────────────────────
    // Only attempt if the service has all 3 provider fields filled in by admin
    const hasProvider = (
      selected.provider_api_url &&
      selected.provider_api_url.trim() !== '' &&
      selected.provider_api_key &&
      selected.provider_api_key.trim() !== '' &&
      selected.provider_service_id &&
      selected.provider_service_id.trim() !== ''
    );

    if (hasProvider) {
      setProviderStatus('sending');
      try {
        // ── FIX: Use /api/proxy (our own Vercel function) NOT Supabase Edge ──
        const proxyUrl = getProxyUrl();

        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: selected.provider_api_url.trim(),
            key: selected.provider_api_key.trim(),
            action: 'add',
            service: String(selected.provider_service_id).trim(),
            link: link.trim(),
            quantity: q,
          }),
        });

        if (!res.ok) {
          throw new Error(`Proxy returned HTTP ${res.status}`);
        }

        const providerData = await res.json();

        if (providerData && providerData.order) {
          // ✅ Provider accepted the order
          await supabase.from('orders').update({
            vendor_order_id: String(providerData.order),
            status: 'in_progress',
            provider_note: null,
          }).eq('order_ref', orderRef);
          setProviderStatus('sent');

        } else if (providerData && providerData.error) {
          // Provider returned an error message
          await supabase.from('orders').update({
            provider_note: `Provider error: ${providerData.error}`,
            status: 'pending',
          }).eq('order_ref', orderRef);
          setProviderStatus('failed');

        } else if (providerData && providerData.raw) {
          // Provider returned non-JSON (unusual)
          await supabase.from('orders').update({
            provider_note: `Unexpected response: ${String(providerData.raw).slice(0, 200)}`,
            status: 'pending',
          }).eq('order_ref', orderRef);
          setProviderStatus('failed');

        } else {
          // No order ID and no error — ambiguous
          await supabase.from('orders').update({
            provider_note: `No order ID returned. Response: ${JSON.stringify(providerData).slice(0, 200)}`,
            status: 'pending',
          }).eq('order_ref', orderRef);
          setProviderStatus('failed');
        }

      } catch (e) {
        // Network error or proxy error
        await supabase.from('orders').update({
          provider_note: `Auto-placement error: ${e.message}`,
          status: 'pending',
        }).eq('order_ref', orderRef);
        setProviderStatus('failed');
      }
    } else {
      // Service has no provider configured — manual fulfillment by admin
      setProviderStatus('skipped');
    }

    setOrdering(false);
    setOrdered(true);
    setTimeout(() => {
      setSelected(null);
      setOrdered(false);
      setLink('');
      setQty('');
      setProviderStatus('');
    }, 3000);
  };

  const ic = (p) => platformIcons[p] || '⚙️';
  const cl = (p) => platformColors[p] || '#7b2fff';

  const ServiceCard = ({ s }) => (
    <div
      className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
      onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); setProviderStatus(''); }}>
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
      {/* Show auto-API badge if configured */}
      {s.provider_api_url && s.provider_api_key && s.provider_service_id && (
        <div style={{
          marginTop: '8px', fontSize: '9px', color: 'var(--green)',
          background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.15)',
          borderRadius: '4px', padding: '2px 7px', display: 'inline-block'
        }}>⚡ Auto-fulfillment</div>
      )}
      <button className="btn bp bsm bw" style={{ marginTop: '12px' }}>Order Now →</button>
    </div>
  );

  return (
    <div>
      {/* ─── FEATURED SERVICES ─── */}
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

      {/* ─── ALL SERVICES ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div className="st" style={{ margin: 0 }}>🛒 All Services</div>
        {otherServices.length > 0 && (
          <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{otherServices.length} available</span>
        )}
        <button
          className="btn bgh bsm"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowAll(!showAll)}>
          {showAll ? '▲ Collapse' : '▼ Browse All'}
        </button>
      </div>

      {showAll && (
        <>
          {/* Search & Filter */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <input
              className="inp"
              placeholder="🔍 Search services..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '150px' }}
            />
            <select className="sel" value={platform} onChange={e => setPlatform(e.target.value)}
              style={{ minWidth: '120px' }}>
              <option value="">All Platforms</option>
              {availablePlatforms.map(p => (
                <option key={p} value={p}>{ic(p)} {p}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading services...</div>
          ) : filteredOthers.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🛒</span>
              <div className="empty-tx">No services found</div>
              <div className="empty-sb">Try a different search or platform filter</div>
            </div>
          ) : (
            <div className="mkt-grid">
              {filteredOthers.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </>
      )}

      {/* ─── ORDER MODAL ─── */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && !ordering && setSelected(null)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div className="mttl">{ic(selected.platform)} {selected.name}</div>
              {!ordering && (
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
              )}
            </div>

            {ordered ? (
              <div style={{ textAlign: 'center', padding: '28px' }}>
                <div style={{ fontSize: '44px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontFamily: 'var(--fd)', fontSize: '13px', color: 'var(--green)', marginBottom: '6px', letterSpacing: '1px' }}>
                  Order Placed!
                </div>
                {/* ── Show provider status to user ── */}
                {providerStatus === 'sent' && (
                  <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '6px' }}>
                    ⚡ Auto-sent to provider. Processing started!
                  </div>
                )}
                {providerStatus === 'failed' && (
                  <div style={{ fontSize: '11px', color: 'var(--warn)', marginTop: '6px' }}>
                    ⚠️ Auto-send failed. Admin will process manually.
                  </div>
                )}
                {providerStatus === 'skipped' && (
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
                    📋 Admin will fulfill your order shortly.
                  </div>
                )}
                {providerStatus === 'sending' && (
                  <div style={{ fontSize: '11px', color: 'var(--neon)', marginTop: '6px' }}>
                    ⏳ Sending to provider...
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Service info */}
                <div style={{
                  padding: '10px 12px', borderRadius: '8px', marginBottom: '14px',
                  background: `${cl(selected.platform)}0d`, border: `1px solid ${cl(selected.platform)}25`,
                  fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6,
                }}>
                  {selected.description}
                </div>

                {/* Price info */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    Rate: <span style={{ color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700 }}>{format(parseFloat(selected.price_per_1k))}</span> / 1K
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    Min: <span style={{ color: 'var(--neon)', fontFamily: 'var(--fm)' }}>{selected.min_qty?.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    Max: <span style={{ color: 'var(--neon)', fontFamily: 'var(--fm)' }}>{selected.max_qty?.toLocaleString()}</span>
                  </div>
                </div>

                <div className="fi">
                  <label className="fl">Your Link / Username / Page URL</label>
                  <input className="inp" placeholder="https://instagram.com/yourpage"
                    value={link} onChange={e => setLink(e.target.value)} />
                </div>

                <div className="fi">
                  <label className="fl" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Quantity</span>
                    <span style={{ color: 'var(--text3)', fontSize: '10px' }}>
                      {selected.min_qty?.toLocaleString()} – {selected.max_qty?.toLocaleString()}
                    </span>
                  </label>
                  <input className="inp" type="number"
                    placeholder={selected.min_qty}
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty}
                    max={selected.max_qty}
                  />
                </div>

                {/* Cost preview */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', borderRadius: '8px', marginBottom: '14px',
                  background: 'rgba(0,212,255,.06)', border: '1px solid rgba(0,212,255,.15)',
                }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>Total Cost</div>
                    <div style={{ fontFamily: 'var(--fm)', fontSize: '20px', fontWeight: 700, color: 'var(--gold)' }}>
                      ${cost}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>Your Balance</div>
                    <div style={{ fontFamily: 'var(--fm)', fontSize: '14px', fontWeight: 700, color: parseFloat(cost) > user.balance ? 'var(--danger)' : 'var(--green)' }}>
                      ${user.balance.toFixed(2)}
                    </div>
                  </div>
                </div>

                {orderError && (
                  <div style={{
                    color: 'var(--danger)', fontSize: '12px', marginBottom: '12px',
                    padding: '8px', borderRadius: '6px', textAlign: 'center',
                    background: 'rgba(255,51,85,.08)', border: '1px solid rgba(255,51,85,.2)'
                  }}>
                    {orderError}
                  </div>
                )}

                {/* Auto-fulfillment badge */}
                {selected.provider_api_url && selected.provider_api_key && selected.provider_service_id ? (
                  <div style={{
                    padding: '8px 12px', borderRadius: '7px', marginBottom: '12px',
                    background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.18)',
                    fontSize: '11px', color: 'var(--green)', display: 'flex', gap: '6px', alignItems: 'center'
                  }}>
                    <span>⚡</span>
                    <span>This service is auto-fulfilled — your order starts immediately after payment.</span>
                  </div>
                ) : (
                  <div style={{
                    padding: '8px 12px', borderRadius: '7px', marginBottom: '12px',
                    background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.12)',
                    fontSize: '11px', color: 'var(--text3)',
                  }}>
                    📋 Admin-fulfilled — your order will be processed by our team.
                  </div>
                )}

                <button
                  className="btn bp blg bw"
                  onClick={placeOrder}
                  disabled={ordering || parseFloat(cost) > user.balance}>
                  <span>{ordering ? (providerStatus === 'sending' ? '⚡ Sending to provider...' : 'Placing Order...') : `Place Order — $${cost}`}</span>
                  <span>→</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

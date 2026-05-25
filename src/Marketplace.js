import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const PROXY = 'https://ctbfovtqjwrxbepccthw.supabase.co/functions/v1/proxy';

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

async function autoPlaceOnProvider(service, link, quantity, orderRef) {
  if (!service.provider_api_url || !service.provider_api_key || !service.provider_service_id) {
    return { success: false, reason: 'no_provider_config' };
  }
  try {
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X',
      },
      body: JSON.stringify({
        url: service.provider_api_url,
        key: service.provider_api_key,
        action: 'add',
        service: service.provider_service_id,
        link,
        quantity,
      }),
    });
    if (!res.ok) return { success: false, reason: `HTTP ${res.status}` };
    const providerData = await res.json();
    if (providerData && providerData.order) {
      return { success: true, vendorOrderId: String(providerData.order) };
    } else if (providerData && providerData.error) {
      return { success: false, reason: providerData.error };
    }
    return { success: false, reason: 'unknown_response' };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

// ─── Fetch ALL services from Supabase (bypasses 1000 row limit) ─────────────
async function fetchAllServices() {
  const PAGE_SIZE = 1000;
  let allServices = [];
  let from = 0;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) { console.error('Services fetch error:', error.message); break; }
    if (!data || data.length === 0) break;

    allServices = [...allServices, ...data];
    if (data.length < PAGE_SIZE) keepFetching = false;
    else from += PAGE_SIZE;
  }

  return allServices;
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
    const all = await fetchAllServices();
    setServices(all);
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

  const placeOrder = async () => {
    setOrderError('');
    if (!link.trim()) { setOrderError('Please enter your link or username'); return; }
    const q = parseInt(qty);
    if (!q || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be between ${selected.min_qty.toLocaleString()} and ${selected.max_qty.toLocaleString()}`);
      return;
    }
    const totalCost = parseFloat(cost);
    if (totalCost <= 0) { setOrderError('Invalid cost calculated'); return; }

    const { data: freshUser } = await supabase.from('users').select('balance').eq('id', user.id).single();
    const currentBalance = parseFloat(freshUser?.balance || 0);
    if (totalCost > currentBalance) {
      setOrderError(`Insufficient balance. You have $${currentBalance.toFixed(4)}, need $${totalCost}`);
      return;
    }

    setOrdering(true);
    const orderRef = 'NF-' + Date.now();

    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef,
      user_id: user.id,
      service_id: selected.id,
      service_name: selected.name,
      platform: selected.platform,
      link: link.trim(),
      quantity: q,
      cost: totalCost,
      status: 'pending',
      progress: 0,
      auto_place_attempts: 0,
    });

    if (orderErr) {
      setOrderError('Order failed: ' + orderErr.message);
      setOrdering(false);
      return;
    }

    await supabase.from('users').update({ balance: currentBalance - totalCost }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    if (selected.provider_api_url && selected.provider_api_key && selected.provider_service_id) {
      const result = await autoPlaceOnProvider(selected, link.trim(), q, orderRef);
      if (result.success) {
        await supabase.from('orders').update({
          vendor_order_id: result.vendorOrderId,
          status: 'in_progress',
          auto_place_attempts: 1,
        }).eq('order_ref', orderRef);
      } else {
        await supabase.from('orders').update({
          provider_note: `Auto-placement failed: ${result.reason}`,
          auto_place_attempts: 1,
        }).eq('order_ref', orderRef);
      }
    }

    setOrdering(false);
    setOrdered(true);
    user.balance = currentBalance - totalCost;
    setTimeout(() => { setSelected(null); setOrdered(false); setLink(''); setQty(''); }, 2500);
  };

  const ic = (p) => platformIcons[p] || '⚙️';
  const cl = (p) => platformColors[p] || '#7b2fff';

  // ─── Service Card — matches Screenshot 1 style (full width on mobile) ────
  const ServiceCard = ({ s }) => (
    <div
      className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
      onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); }}>

      {/* FEATURED badge */}
      {s.is_featured && (
        <div style={{
          position: 'absolute', top: '-1px', right: '10px',
          background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
          color: '#000', fontSize: '8px', fontWeight: 800, padding: '3px 8px',
          borderRadius: '0 0 6px 6px', letterSpacing: '1px', fontFamily: 'var(--fd)'
        }}>⭐ FEATURED</div>
      )}

      {/* Platform badge top-right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <span style={{ fontSize: '22px' }}>{ic(s.platform)}</span>
        <span style={{
          fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 700,
          background: `${cl(s.platform)}18`, color: cl(s.platform),
          border: `1px solid ${cl(s.platform)}30`, textTransform: 'uppercase', letterSpacing: '1px'
        }}>{s.platform}</span>
      </div>

      {/* Service name */}
      <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: 'var(--text)', lineHeight: 1.4 }}>
        {s.name}
      </div>

      {/* Description */}
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '12px', lineHeight: 1.5 }}>
        {s.description}
      </div>

      {/* Price + Min/Max row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div>
          <div style={{ fontFamily: 'var(--fm)', fontSize: '18px', fontWeight: 700, color: 'var(--gold)' }}>
            {format(parseFloat(s.price_per_1k))}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text3)' }}>per 1,000</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Min: {(s.min_qty || 0).toLocaleString()}</div>
          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Max: {(s.max_qty || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Order Now button — full width like Screenshot 1 */}
      <button className="btn bp bsm bw" style={{ marginTop: 'auto' }}>
        ORDER NOW →
      </button>
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
          {/* Featured: single column on mobile, 2 col on tablet+ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px',
            marginBottom: '24px'
          }}>
            {featuredServices.map(s => <ServiceCard key={s.id} s={s} />)}
          </div>
        </>
      )}

      {/* ─── ALL SERVICES header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div className="st" style={{ margin: 0 }}>🛒 All Services</div>
        <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
          {loading ? 'Loading...' : `${services.length} available`}
        </span>
        <button
          className="btn bgh bsm"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowAll(!showAll)}>
          {showAll ? '▲ Collapse' : '▼ Browse All'}
        </button>
      </div>

      {/* ─── ALL SERVICES list ─── */}
      {showAll && (
        <>
          {/* Search + filter */}
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
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
              Loading all {services.length > 0 ? services.length + '+' : ''} services...
            </div>
          ) : filteredOthers.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">{otherServices.length === 0 ? 'No more services' : 'No services found'}</div>
              <div className="empty-sb">Try different search or platform filter</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '10px' }}>
                Showing {filteredOthers.length} services
              </div>
              <div className="mkt-grid">
                {filteredOthers.map(s => <ServiceCard key={s.id} s={s} />)}
              </div>
            </>
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

      {/* ─── ORDER MODAL ─── */}
      {selected && (
        <div className="mlay" onClick={() => { if (!ordering) setSelected(null); }}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>{ic(selected.platform)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)', lineHeight: 1.3 }}>{selected.name}</div>
                <div style={{ fontSize: '10px', color: cl(selected.platform), textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>
                  {selected.platform}
                </div>
              </div>
              <button onClick={() => { if (!ordering) setSelected(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px', flexShrink: 0 }}>×</button>
            </div>

            {/* Service description in modal */}
            {selected.description && (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(0,0,0,.2)', borderRadius: '6px' }}>
                {selected.description}
              </div>
            )}

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
                  <input className="inp" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
                </div>
                <div className="fi">
                  <label className="fl">Quantity ({(selected.min_qty || 0).toLocaleString()} – {(selected.max_qty || 0).toLocaleString()})</label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty} max={selected.max_qty} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '14px', padding: '10px 13px', borderRadius: '8px',
                  background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '18px', fontWeight: 700, color: 'var(--gold)' }}>
                    {format(parseFloat(cost))}
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
                  {ordering ? '⏳ Placing Order...' : `⚡ Place Order — ${format(parseFloat(cost))}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

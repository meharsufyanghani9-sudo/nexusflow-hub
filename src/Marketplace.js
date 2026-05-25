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

// ─── BUILT-IN QUALITY FILTERS ───────────────────────────────────────────────
// These are always available and work by matching service name/description or
// the has_refill field on the service.
const builtInFilters = [
  { id: 'with_refill',  label: '🔄 With Refill',   color: '#00ff88' },
  { id: 'no_refill',   label: '🚫 No Refill',      color: '#ff3355' },
  { id: 'non_drop',    label: '💎 Non-Drop',        color: '#00d4ff' },
  { id: 'guaranteed',  label: '✅ Guaranteed',      color: '#00d4ff' },
  { id: 'fast',        label: '⚡ Fast Delivery',   color: '#ffb800' },
  { id: 'budget',      label: '💰 Budget',          color: '#ffd700' },
  { id: 'instant',     label: '🚀 Instant Start',   color: '#a86bff' },
  { id: 'hq',          label: '🏆 High Quality',    color: '#ff9900' },
];

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();
  const [services, setServices] = useState([]);
  const [customFilters, setCustomFilters] = useState([]); // filters created by admin
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [category, setCategory] = useState('');
  const [activeFilter, setActiveFilter] = useState(''); // built-in filter id OR custom filter id
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const [link, setLink] = useState('');
  const [qty, setQty] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderError, setOrderError] = useState('');

  useEffect(() => {
    loadServices();
    loadCustomFilters();
  }, []);

  // ─── Load all active services ───────────────────────────────────────────
  const loadServices = async () => {
    setLoading(true);
    // Paginate to bypass Supabase's 1000-row default limit
    let allData = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setServices(allData);
    setLoading(false);
  };

  // ─── Load custom filters that admin created ──────────────────────────────
  const loadCustomFilters = async () => {
    // We store custom filters in the "service_filters" table.
    // If the table doesn't exist yet, this will just return empty — no crash.
    try {
      const { data } = await supabase
        .from('service_filters')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (data) setCustomFilters(data);
    } catch (e) {
      // Table not created yet — that's fine, filters just won't show
    }
  };

  const featuredServices = services.filter(s => s.is_featured);
  const otherServices = services.filter(s => !s.is_featured);
  const availablePlatforms = [...new Set(otherServices.map(s => s.platform))].filter(Boolean);

  // Categories for selected platform
  const platformSvcs = platform ? otherServices.filter(s => s.platform === platform) : otherServices;
  const availableCategories = [...new Set(platformSvcs.map(s => s.category).filter(Boolean))];

  // ─── Apply all filters ───────────────────────────────────────────────────
  const filteredServices = platformSvcs.filter(s => {
    // Category filter
    if (category && s.category !== category) return false;
    // Search filter
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;

    // Active filter — either built-in or custom
    if (activeFilter) {
      // Check if it's a custom filter (custom filters have numeric or uuid IDs)
      const customFilter = customFilters.find(f => String(f.id) === String(activeFilter));
      if (customFilter) {
        // Custom filter: service must be in the filter's service_ids array
        const ids = customFilter.service_ids || [];
        if (!ids.includes(s.id)) return false;
      } else {
        // Built-in filter: match by name/description text or has_refill field
        const nameDesc = (s.name + ' ' + (s.description || '')).toLowerCase();

        if (activeFilter === 'with_refill') {
          // WITH REFILL: only services where has_refill is true
          // OR name/description says "with refill" or "refill guarantee"
          const hasRefillField = s.has_refill === true || s.has_refill === 'true';
          const mentionsRefill = nameDesc.includes('with refill') || nameDesc.includes('refill guarantee') || nameDesc.includes('refillable');
          if (!hasRefillField && !mentionsRefill) return false;
        }

        if (activeFilter === 'no_refill') {
          // NO REFILL: services where has_refill is false AND no "with refill" mention
          const hasRefillField = s.has_refill === true || s.has_refill === 'true';
          const mentionsWithRefill = nameDesc.includes('with refill') || nameDesc.includes('refill guarantee') || nameDesc.includes('refillable');
          // Keep the service only if it does NOT have refill
          if (hasRefillField || mentionsWithRefill) return false;
        }

        if (activeFilter === 'non_drop') {
          if (!nameDesc.includes('non-drop') && !nameDesc.includes('nondrop') && !nameDesc.includes('non drop')) return false;
        }

        if (activeFilter === 'guaranteed') {
          if (!nameDesc.includes('guaranteed') && !nameDesc.includes('guarantee')) return false;
        }

        if (activeFilter === 'fast') {
          if (!nameDesc.includes('fast') && !nameDesc.includes('instant') && !nameDesc.includes('speed')) return false;
        }

        if (activeFilter === 'instant') {
          if (!nameDesc.includes('instant') && !nameDesc.includes('0-1h') && !nameDesc.includes('0-1 h') && !nameDesc.includes('start: 0')) return false;
        }

        if (activeFilter === 'hq') {
          if (!nameDesc.includes('high quality') && !nameDesc.includes('hq') && !nameDesc.includes('premium') && !nameDesc.includes('real')) return false;
        }

        if (activeFilter === 'budget') {
          // Cheapest 30% of services by price
          const prices = otherServices
            .map(x => parseFloat(x.price_per_1k || 0))
            .sort((a, b) => a - b);
          const threshold = prices[Math.floor(prices.length * 0.3)] ?? 9999;
          if (parseFloat(s.price_per_1k || 0) > threshold) return false;
        }
      }
    }

    return true;
  });

  // ─── Order cost calculation ──────────────────────────────────────────────
  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  // ─── Place order ─────────────────────────────────────────────────────────
  const placeOrder = async () => {
    setOrderError('');
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

    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef,
      user_id: user.id,
      service_id: selected.id,
      service_name: selected.name,
      platform: selected.platform,
      link, quantity: q, cost: totalCost,
      status: 'pending', progress: 0,
    });
    if (orderErr) { setOrderError('Order failed: ' + orderErr.message); setOrdering(false); return; }

    await supabase.from('users').update({ balance: user.balance - totalCost }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    // Fully automatic: send to provider API if configured
    if (selected.provider_api_url && selected.provider_api_key && selected.provider_service_id) {
      try {
        const res = await fetch('https://ctbfovtqjwrxbepccthw.supabase.co/functions/v1/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X',
          },
          body: JSON.stringify({
            url: selected.provider_api_url,
            key: selected.provider_api_key,
            action: 'add',
            service: selected.provider_service_id,
            link, quantity: q,
          }),
        });
        const providerData = await res.json();
        if (providerData && providerData.order) {
          await supabase.from('orders').update({
            vendor_order_id: String(providerData.order),
            status: 'in_progress',
          }).eq('order_ref', orderRef);
        } else if (providerData && providerData.error) {
          await supabase.from('orders').update({
            provider_note: `Provider error: ${providerData.error}`,
          }).eq('order_ref', orderRef);
        }
      } catch (e) {
        await supabase.from('orders').update({
          provider_note: `Auto-placement failed: ${e.message}`,
        }).eq('order_ref', orderRef);
      }
    }

    setOrdering(false);
    setOrdered(true);
    setTimeout(() => { setSelected(null); setOrdered(false); setLink(''); setQty(''); }, 2500);
  };

  const ic = (p) => platformIcons[p] || '⚙️';
  const cl = (p) => platformColors[p] || '#7b2fff';

  // ─── Service Card ─────────────────────────────────────────────────────────
  const ServiceCard = ({ s }) => (
    <div
      className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
      onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
          <span style={{
            fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 700,
            background: `${cl(s.platform)}18`, color: cl(s.platform),
            border: `1px solid ${cl(s.platform)}30`, textTransform: 'uppercase', letterSpacing: '1px'
          }}>{s.platform}</span>
          {/* Show refill badge if service has refill */}
          {(s.has_refill === true || s.has_refill === 'true') && (
            <span style={{
              fontSize: '8px', padding: '1px 5px', borderRadius: '8px', fontWeight: 700,
              background: 'rgba(0,255,136,.1)', color: 'var(--green)',
              border: '1px solid rgba(0,255,136,.25)'
            }}>🔄 Refill</span>
          )}
        </div>
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
      <button className="btn bp bsm bw" style={{ marginTop: '12px' }}>Order Now →</button>
    </div>
  );

  // ─── Filter pill style helper ─────────────────────────────────────────────
  const filterPillStyle = (filterId, color) => {
    const isActive = activeFilter === filterId;
    return {
      padding: '6px 12px', borderRadius: '20px', whiteSpace: 'nowrap', cursor: 'pointer',
      fontSize: '11px', fontWeight: 700, border: '1px solid',
      borderColor: isActive ? (color || 'var(--neon)') : 'var(--br)',
      background: isActive ? `${color || '#00d4ff'}18` : 'var(--gl)',
      color: isActive ? (color || 'var(--neon)') : 'var(--text2)',
      transition: 'all .18s',
      flexShrink: 0,
    };
  };

  return (
    <div>
      {/* ─── FEATURED SERVICES ─────────────────────────────────────── */}
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

      {/* ─── ALL SERVICES HEADER ────────────────────────────────────── */}
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
          {/* ── PLATFORM FILTER PILLS ───────────────────────────────── */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '8px' }}>
            <button
              onClick={() => { setPlatform(''); setCategory(''); }}
              style={filterPillStyle('', '#00d4ff')}>
              🌐 All
            </button>
            {availablePlatforms.map(p => (
              <button key={p}
                onClick={() => { setPlatform(p); setCategory(''); }}
                style={{
                  padding: '6px 12px', borderRadius: '20px', whiteSpace: 'nowrap', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, border: '1px solid',
                  borderColor: platform === p ? cl(p) : 'var(--br)',
                  background: platform === p ? `${cl(p)}18` : 'var(--gl)',
                  color: platform === p ? cl(p) : 'var(--text2)',
                  flexShrink: 0,
                }}>
                {ic(p)} {p}
              </button>
            ))}
          </div>

          {/* ── CATEGORY FILTER (shows when platform selected) ──────── */}
          {platform && availableCategories.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '6px', textTransform: 'uppercase' }}>
                Category
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setCategory('')}
                  style={{
                    padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                    border: `1px solid ${!category ? 'var(--neon)' : 'var(--br)'}`,
                    background: !category ? 'rgba(0,212,255,.1)' : 'var(--gl)',
                    color: !category ? 'var(--neon)' : 'var(--text3)',
                  }}>All</button>
                {availableCategories.map(cat => (
                  <button key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                      border: `1px solid ${category === cat ? 'var(--gold)' : 'var(--br)'}`,
                      background: category === cat ? 'rgba(255,200,0,.1)' : 'var(--gl)',
                      color: category === cat ? 'var(--gold)' : 'var(--text3)',
                    }}>{cat}</button>
                ))}
              </div>
            </div>
          )}

          {/* ── QUALITY / TYPE FILTERS ──────────────────────────────── */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '6px', textTransform: 'uppercase' }}>
              Filter by Type
            </div>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>

              {/* "All Types" clear button */}
              <button
                onClick={() => setActiveFilter('')}
                style={filterPillStyle('', '#00d4ff')}>
                🌐 All Types
              </button>

              {/* Built-in filters */}
              {builtInFilters.map(f => (
                <button key={f.id}
                  onClick={() => setActiveFilter(activeFilter === f.id ? '' : f.id)}
                  style={filterPillStyle(f.id, f.color)}>
                  {f.label}
                </button>
              ))}

              {/* Custom filters created by admin */}
              {customFilters.map(f => (
                <button key={f.id}
                  onClick={() => setActiveFilter(activeFilter === String(f.id) ? '' : String(f.id))}
                  style={filterPillStyle(String(f.id), f.color || '#7b2fff')}>
                  {f.icon || '🏷'} {f.name}
                </button>
              ))}
            </div>
          </div>

          {/* ── SEARCH ──────────────────────────────────────────────── */}
          <input className="srch-inp" style={{ width: '100%', marginBottom: '10px' }}
            placeholder="🔍 Search services..."
            value={search} onChange={e => setSearch(e.target.value)} />

          {/* ── RESULTS COUNT ───────────────────────────────────────── */}
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' }}>
            Showing {filteredServices.length} of {otherServices.length} services
            {activeFilter && (
              <span style={{ color: 'var(--neon)', marginLeft: '8px' }}>
                · Filter active
                <button
                  onClick={() => setActiveFilter('')}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '11px', marginLeft: '4px' }}>
                  ✕ Clear
                </button>
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>Loading services...
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">{otherServices.length === 0 ? 'No services available' : 'No services match this filter'}</div>
              <div className="empty-sb">Try a different filter or search</div>
              {activeFilter && (
                <button className="btn bgh bsm" style={{ marginTop: '12px' }} onClick={() => setActiveFilter('')}>
                  Clear Filter
                </button>
              )}
            </div>
          ) : (
            <div className="mkt-grid">
              {filteredServices.map(s => <ServiceCard key={s.id} s={s} />)}
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

      {/* ─── ORDER MODAL ────────────────────────────────────────────── */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>{ic(selected.platform)}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize: '10px', color: cl(selected.platform), textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {selected.platform}
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px' }}>×</button>
            </div>

            {/* Refill info in modal */}
            {(selected.has_refill === true || selected.has_refill === 'true') ? (
              <div style={{ fontSize: '11px', color: 'var(--green)', marginBottom: '10px',
                padding: '6px 12px', borderRadius: '6px', background: 'rgba(0,255,136,.06)',
                border: '1px solid rgba(0,255,136,.2)' }}>
                🔄 This service includes a {selected.refill_days || 30}-day refill guarantee
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px',
                padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,51,85,.04)',
                border: '1px solid rgba(255,51,85,.15)' }}>
                🚫 No refill on this service
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', padding: '10px 13px', borderRadius: '8px', background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '18px', fontWeight: 700, color: 'var(--gold)' }}>
                    {format(parseFloat(cost))}
                  </span>
                </div>
                {orderError && (
                  <div style={{ background: 'rgba(255,50,80,.08)', border: '1px solid rgba(255,50,80,.2)', borderRadius: '7px', padding: '10px', color: '#ff6b6b', fontSize: '12px', marginBottom: '12px' }}>
                    {orderError}
                  </div>
                )}
                <button className="btn bp blg bw" onClick={placeOrder} disabled={ordering}>
                  {ordering ? '⏳ Processing...' : `⚡ Place Order — ${format(parseFloat(cost))}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

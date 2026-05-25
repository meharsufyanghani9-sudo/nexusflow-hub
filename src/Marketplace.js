import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const platformIcons = {
  instagram:'📸',tiktok:'🎵',youtube:'▶️',twitter:'🐦',
  facebook:'👤',telegram:'✈️',snapchat:'👻',linkedin:'💼',
  spotify:'🎧',discord:'🎮',twitch:'📺',custom:'⚙️'
};
const platformColors = {
  instagram:'#E1306C',tiktok:'#00d4ff',youtube:'#FF0000',
  twitter:'#1DA1F2',facebook:'#1877F2',telegram:'#0088cc',
  snapchat:'#FFFC00',linkedin:'#0077B5',custom:'#7b2fff'
};

// ── Quality filters: properly detect refill vs no-refill ──────────────────
const qualityFilters = [
  { id:'', label:'All Types' },
  { id:'guaranteed', label:'Guaranteed' },
  { id:'non_drop', label:'Non-Drop' },
  { id:'budget', label:'Budget' },
  { id:'with_refill', label:'With Refill' },
  { id:'no_refill', label:'No Refill' },
  { id:'fast', label:'Fast Delivery' },
];

// Detect if a service has refill from its name/description
const hasRefillInText = (s) => {
  const text = ((s.name || '') + ' ' + (s.description || '')).toLowerCase();
  const hasRefill = text.includes('refill') && !text.includes('no refill') && !text.includes('no-refill') && !text.includes('non-refill') && !text.includes('🚫') && !text.includes('no refill 🔴');
  return hasRefill || s.has_refill === true;
};

const hasNoRefillInText = (s) => {
  const text = ((s.name || '') + ' ' + (s.description || '')).toLowerCase();
  return text.includes('no refill') || text.includes('no-refill') || (!hasRefillInText(s));
};

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('featured');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [link, setLink] = useState('');
  const [qty, setQty] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderError, setOrderError] = useState('');

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    setLoading(true);
    let allData = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('services').select('*')
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

  const featuredServices = services.filter(s => s.is_featured);
  const allServices = services.filter(s => !s.is_featured);
  const availablePlatforms = [...new Set(allServices.map(s => s.platform))].filter(Boolean);
  const platformServices = selectedPlatform ? allServices.filter(s => s.platform === selectedPlatform) : allServices;
  const availableCategories = [...new Set(platformServices.map(s => s.category).filter(Boolean))];

  const filteredServices = platformServices.filter(s => {
    if (selectedCategory && s.category !== selectedCategory) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (qualityFilter) {
      const n = ((s.name||'') + ' ' + (s.description||'')).toLowerCase();
      if (qualityFilter === 'guaranteed' && !n.includes('guarant')) return false;
      if (qualityFilter === 'non_drop' && !n.includes('non-drop') && !n.includes('non drop') && !n.includes('nondrop')) return false;
      if (qualityFilter === 'with_refill' && !hasRefillInText(s)) return false;
      if (qualityFilter === 'no_refill' && !hasNoRefillInText(s)) return false;
      if (qualityFilter === 'fast' && !n.includes('fast') && !n.includes('instant') && !n.includes('speed')) return false;
      if (qualityFilter === 'budget') {
        const prices = allServices.map(x => parseFloat(x.price_per_1k || 0)).sort((a, b) => a - b);
        const threshold = prices[Math.floor(prices.length * 0.35)] || 999;
        if (parseFloat(s.price_per_1k || 0) > threshold) return false;
      }
    }
    return true;
  });

  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  const placeOrder = async () => {
    setOrderError('');
    if (!link) { setOrderError('Enter your link'); return; }
    const q = parseInt(qty);
    if (!q || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be ${selected.min_qty} – ${selected.max_qty}`); return;
    }
    const totalCost = parseFloat(cost);
    if (totalCost > user.balance) { setOrderError('Insufficient balance'); return; }
    setOrdering(true);
    const orderRef = 'NF-' + Date.now();
    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef, user_id: user.id, service_id: selected.id,
      service_name: selected.name, platform: selected.platform,
      link, quantity: q, cost: totalCost, status: 'pending', progress: 0,
      has_refill: hasRefillInText(selected), refill_days: selected.refill_days || 30,
    });
    if (orderErr) { setOrderError('Order failed: ' + orderErr.message); setOrdering(false); return; }
    await supabase.from('users').update({ balance: user.balance - totalCost }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });
    if (selected.provider_api_url && selected.provider_api_key && selected.provider_service_id) {
      try {
        const res = await fetch('https://ctbfovtqjwrxbepccthw.supabase.co/functions/v1/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X' },
          body: JSON.stringify({ url: selected.provider_api_url, key: selected.provider_api_key, action: 'add', service: selected.provider_service_id, link, quantity: q }),
        });
        const pd = await res.json();
        if (pd?.order) await supabase.from('orders').update({ vendor_order_id: String(pd.order), status: 'in_progress' }).eq('order_ref', orderRef);
        else if (pd?.error) await supabase.from('orders').update({ provider_note: `Provider error: ${pd.error}` }).eq('order_ref', orderRef);
      } catch (e) {
        await supabase.from('orders').update({ provider_note: `Auto-placement failed: ${e.message}` }).eq('order_ref', orderRef);
      }
    }
    setOrdering(false); setOrdered(true);
    setTimeout(() => { setSelected(null); setOrdered(false); setLink(''); setQty(''); }, 2500);
  };

  const ic = p => platformIcons[p] || '⚙️';
  const cl = p => platformColors[p] || '#7b2fff';

  const ServiceCard = ({ s, compact }) => {
    const sHasRefill = hasRefillInText(s);
    return (
      <div
        className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
        onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); }}>
        {s.is_featured && (
          <div className="mkt-featured-badge">⭐ FEATURED</div>
        )}
        <div className="mkt-card-top">
          <div className="mkt-platform-icon">{ic(s.platform)}</div>
          <span className="mkt-platform-tag" style={{ color: cl(s.platform), background: `${cl(s.platform)}18`, border: `1px solid ${cl(s.platform)}30` }}>
            {s.platform?.toUpperCase()}
          </span>
        </div>
        <div className="mkt-card-name">{s.name}</div>
        {s.category && <div className="mkt-card-cat">{s.category}</div>}
        {!compact && s.description && <div className="mkt-card-desc">{s.description}</div>}
        <div className="mkt-card-badges">
          {sHasRefill
            ? <span className="mkt-badge mkt-badge-refill">🔄 Refill</span>
            : <span className="mkt-badge mkt-badge-norefill">⚡ No Refill</span>
          }
          {((s.name||'')+(s.description||'')).toLowerCase().includes('non-drop') && (
            <span className="mkt-badge mkt-badge-nondrop">💎 Non-Drop</span>
          )}
          {((s.name||'')+(s.description||'')).toLowerCase().includes('guarant') && (
            <span className="mkt-badge mkt-badge-guaranteed">✅ Guaranteed</span>
          )}
        </div>
        <div className="mkt-card-footer">
          <div>
            <div className="mkt-card-price">{format(parseFloat(s.price_per_1k))}</div>
            <div className="mkt-card-per">per 1,000</div>
          </div>
          <div className="mkt-card-qty">
            <div>Min: {(s.min_qty||0).toLocaleString()}</div>
            <div>Max: {(s.max_qty||0).toLocaleString()}</div>
          </div>
        </div>
        <button className="mkt-order-btn">Order Now →</button>
      </div>
    );
  };

  return (
    <div className="mkt-wrap">
      {/* Section Tabs */}
      <div className="mkt-tabs">
        <button className={`mkt-tab ${activeSection==='featured'?'mkt-tab-active':''}`} onClick={() => setActiveSection('featured')}>
          <span>⭐</span> Featured
        </button>
        <button className={`mkt-tab ${activeSection==='all'?'mkt-tab-active':''}`} onClick={() => setActiveSection('all')}>
          <span>🛒</span> Live Services
          <span className="mkt-tab-count">{allServices.length}</span>
        </button>
      </div>

      {/* FEATURED */}
      {activeSection === 'featured' && (
        <div>
          {loading ? (
            <div className="mkt-loading"><div className="mkt-spinner" /><span>Loading services...</span></div>
          ) : featuredServices.length === 0 ? (
            <div className="empty"><span className="empty-ic">⭐</span><div className="empty-tx">No featured services yet</div></div>
          ) : (
            <div className="mkt-featured-grid">
              {featuredServices.map(s => <ServiceCard key={s.id} s={s} compact={true} />)}
            </div>
          )}
          <button className="mkt-browse-btn" onClick={() => setActiveSection('all')}>
            Browse All {allServices.length} Services →
          </button>
        </div>
      )}

      {/* ALL SERVICES */}
      {activeSection === 'all' && (
        <div>
          {/* Platform pills */}
          <div className="mkt-filter-row">
            <button className={`mkt-pill ${!selectedPlatform?'mkt-pill-active':''}`} onClick={() => { setSelectedPlatform(''); setSelectedCategory(''); }}>
              🌐 All
            </button>
            {availablePlatforms.map(p => (
              <button key={p} className={`mkt-pill ${selectedPlatform===p?'mkt-pill-active':''}`}
                style={selectedPlatform===p ? { borderColor: cl(p), background: `${cl(p)}18`, color: cl(p) } : {}}
                onClick={() => { setSelectedPlatform(p); setSelectedCategory(''); }}>
                {ic(p)} {p}
              </button>
            ))}
          </div>

          {/* Categories */}
          {selectedPlatform && availableCategories.length > 0 && (
            <div>
              <div className="mkt-filter-label">Category</div>
              <div className="mkt-filter-row">
                <button className={`mkt-pill mkt-pill-sm ${!selectedCategory?'mkt-pill-cat-active':''}`} onClick={() => setSelectedCategory('')}>All</button>
                {availableCategories.map(cat => (
                  <button key={cat} className={`mkt-pill mkt-pill-sm ${selectedCategory===cat?'mkt-pill-cat-active':''}`} onClick={() => setSelectedCategory(cat)}>{cat}</button>
                ))}
              </div>
            </div>
          )}

          {/* Quality filters */}
          <div className="mkt-filter-row" style={{ marginTop: '6px' }}>
            {qualityFilters.map(f => (
              <button key={f.id} className={`mkt-pill mkt-pill-sm mkt-pill-quality ${qualityFilter===f.id?'mkt-pill-quality-active':''}`} onClick={() => setQualityFilter(f.id)}>
                {f.id === 'with_refill' && '🔄 '}
                {f.id === 'no_refill' && '⚡ '}
                {f.id === 'guaranteed' && '✅ '}
                {f.id === 'non_drop' && '💎 '}
                {f.id === 'budget' && '💰 '}
                {f.id === 'fast' && '⚡ '}
                {f.id === '' && '🌐 '}
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="mkt-search-row">
            <input className="mkt-search" placeholder="🔍 Search services..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <div className="mkt-count">Showing <strong>{filteredServices.length}</strong> of {allServices.length}</div>
          </div>

          {loading ? (
            <div className="mkt-loading"><div className="mkt-spinner" /><span>Loading services...</span></div>
          ) : filteredServices.length === 0 ? (
            <div className="empty"><span className="empty-ic">🔍</span><div className="empty-tx">No services found</div><div className="empty-sb">Try different filters</div></div>
          ) : (
            <div className="mkt-grid">
              {filteredServices.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </div>
      )}

      {/* ORDER MODAL */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <span style={{ fontSize: '32px' }}>{ic(selected.platform)}</span>
              <div className="mkt-modal-info">
                <div className="mkt-modal-name">{selected.name}</div>
                <span className="mkt-platform-tag" style={{ color: cl(selected.platform), background: `${cl(selected.platform)}18`, border: `1px solid ${cl(selected.platform)}30` }}>
                  {selected.platform?.toUpperCase()}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="mkt-modal-close">×</button>
            </div>

            {selected.description && (
              <div className="mkt-modal-desc">{selected.description}</div>
            )}

            {hasRefillInText(selected) && (
              <div className="mkt-refill-banner">
                🔄 This service includes a {selected.refill_days || 30}-day refill guarantee
              </div>
            )}

            {ordered ? (
              <div className="mkt-success">
                <div style={{ fontSize: '44px' }}>✅</div>
                <div className="mkt-success-title">Order Placed!</div>
                <div className="mkt-success-sub">Processing automatically...</div>
              </div>
            ) : (
              <>
                <div className="fi">
                  <label className="fl">Your Link / Username</label>
                  <input className="inp" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
                </div>
                <div className="fi">
                  <label className="fl">Quantity ({(selected.min_qty||0).toLocaleString()} – {(selected.max_qty||0).toLocaleString()})</label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)} min={selected.min_qty} max={selected.max_qty} />
                </div>
                <div className="mkt-cost-row">
                  <span>Total Cost</span>
                  <span className="mkt-cost-val">{format(parseFloat(cost))}</span>
                </div>
                {orderError && <div className="mkt-error">{orderError}</div>}
                <button className="btn bp blg bw mkt-place-btn" onClick={placeOrder} disabled={ordering}>
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

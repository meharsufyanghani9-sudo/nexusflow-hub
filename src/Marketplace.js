import React, { useState, useEffect, useRef } from 'react';
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

// ✅ FIXED: "With Refill" now only shows services with has_refill=true
// ✅ ADDED: "No Refill" filter for services without refill
const qualityFilters = [
  { id: '', label: '🌐 All Types' },
  { id: 'guaranteed', label: '✅ Guaranteed' },
  { id: 'non_drop', label: '💎 Non-Drop' },
  { id: 'cheap', label: '💰 Budget' },
  { id: 'refill', label: '🔄 With Refill' },
  { id: 'no_refill', label: '🚫 No Refill' },
  { id: 'fast', label: '⚡ Fast Delivery' },
];

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

  const platformServices = selectedPlatform
    ? allServices.filter(s => s.platform === selectedPlatform)
    : allServices;
  const availableCategories = [...new Set(platformServices.map(s => s.category).filter(Boolean))];

  // ✅ FIXED FILTER LOGIC
  const filteredServices = platformServices.filter(s => {
    if (selectedCategory && s.category !== selectedCategory) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (qualityFilter) {
      const n = (s.name + ' ' + (s.description || '')).toLowerCase();
      if (qualityFilter === 'guaranteed' && !n.includes('guaranteed') && !n.includes('guarant')) return false;
      if (qualityFilter === 'non_drop' && !n.includes('non-drop') && !n.includes('nondrop') && !n.includes('non drop')) return false;
      // ✅ FIX: "With Refill" — ONLY use the has_refill database field, not name matching
      // This prevents "No Refill" services from appearing in the "With Refill" tab
      if (qualityFilter === 'refill') {
        if (!s.has_refill) return false;
      }
      // ✅ NEW: "No Refill" filter — services that do NOT have refill
      if (qualityFilter === 'no_refill') {
        if (s.has_refill) return false;
      }
      if (qualityFilter === 'fast' && !n.includes('fast') && !n.includes('instant')) return false;
      if (qualityFilter === 'cheap') {
        const prices = allServices.map(x => parseFloat(x.price_per_1k || 0)).sort((a, b) => a - b);
        const threshold = prices[Math.floor(prices.length * 0.3)] || 999;
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
      has_refill: selected.has_refill || false,
      refill_days: selected.refill_days || 0,
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

  const ServiceCard = ({ s, compact }) => (
    <div
      className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
      style={compact ? { padding: '12px' } : {}}
      onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); }}>
      {s.is_featured && (
        <div className="mkt-featured-badge">⭐ FEATURED</div>
      )}
      <div className="mkt-card-top">
        <span className="mkt-card-icon">{ic(s.platform)}</span>
        <span className="mkt-platform-tag" style={{ background: `${cl(s.platform)}18`, color: cl(s.platform), border: `1px solid ${cl(s.platform)}35` }}>
          {s.platform}
        </span>
      </div>
      <div className="mkt-card-name">{s.name}</div>
      {!compact && s.description && (
        <div className="mkt-card-desc">{s.description}</div>
      )}
      <div className="mkt-card-footer">
        <div>
          <div className="mkt-price">{format(parseFloat(s.price_per_1k))}</div>
          <div className="mkt-price-label">per 1,000</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mkt-minmax">Min: {(s.min_qty || 0).toLocaleString()}</div>
          <div className="mkt-minmax">Max: {(s.max_qty || 0).toLocaleString()}</div>
        </div>
      </div>
      {s.has_refill && (
        <div className="mkt-refill-badge">🔄 {s.refill_days || 30}-day refill guarantee</div>
      )}
      <button className="btn bp bsm bw mkt-order-btn">ORDER NOW →</button>
    </div>
  );

  return (
    <div className="mkt-wrapper">
      {/* ─── SECTION TABS ─── */}
      <div className="mkt-tabs">
        <button
          className={`mkt-tab ${activeSection === 'featured' ? 'mkt-tab-gold' : ''}`}
          onClick={() => setActiveSection('featured')}>
          ⭐ Featured
        </button>
        <button
          className={`mkt-tab ${activeSection === 'all' ? 'mkt-tab-neon' : ''}`}
          onClick={() => setActiveSection('all')}>
          🛒 All Services <span className="mkt-count">({allServices.length})</span>
        </button>
      </div>

      {/* ─── FEATURED SECTION ─── */}
      {activeSection === 'featured' && (
        <>
          {loading ? (
            <div className="mkt-loading">⏳ Loading featured services...</div>
          ) : featuredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">⭐</span>
              <div className="empty-tx">No featured services yet</div>
              <div className="empty-sb">Admin will feature services soon</div>
            </div>
          ) : (
            <div className="mkt-featured-grid">
              {featuredServices.map(s => <ServiceCard key={s.id} s={s} compact={true} />)}
            </div>
          )}
          <button className="btn bp bmd bw mkt-browse-all" onClick={() => setActiveSection('all')}>
            Browse All {allServices.length} Services →
          </button>
        </>
      )}

      {/* ─── ALL SERVICES SECTION ─── */}
      {activeSection === 'all' && (
        <>
          {/* Platform pills */}
          <div className="mkt-filter-row">
            <button
              className={`mkt-pill ${!selectedPlatform ? 'mkt-pill-active' : ''}`}
              onClick={() => { setSelectedPlatform(''); setSelectedCategory(''); }}>
              🌐 All
            </button>
            {availablePlatforms.map(p => (
              <button key={p}
                className={`mkt-pill ${selectedPlatform === p ? 'mkt-pill-platform' : ''}`}
                style={selectedPlatform === p ? { borderColor: cl(p), background: `${cl(p)}18`, color: cl(p) } : {}}
                onClick={() => { setSelectedPlatform(p); setSelectedCategory(''); }}>
                {ic(p)} {p}
              </button>
            ))}
          </div>

          {/* Category filter */}
          {selectedPlatform && availableCategories.length > 0 && (
            <div className="mkt-cat-section">
              <div className="mkt-cat-label">SELECT CATEGORY</div>
              <div className="mkt-filter-row" style={{ flexWrap: 'wrap' }}>
                <button
                  className={`mkt-pill ${!selectedCategory ? 'mkt-pill-active' : ''}`}
                  onClick={() => setSelectedCategory('')}>All</button>
                {availableCategories.map(cat => (
                  <button key={cat}
                    className={`mkt-pill ${selectedCategory === cat ? 'mkt-pill-gold' : ''}`}
                    onClick={() => setSelectedCategory(cat)}>{cat}</button>
                ))}
              </div>
            </div>
          )}

          {/* Quality/type filter pills */}
          <div className="mkt-filter-row">
            {qualityFilters.map(f => (
              <button key={f.id}
                className={`mkt-pill mkt-pill-sm ${qualityFilter === f.id ? 'mkt-pill-purple' : ''}`}
                onClick={() => setQualityFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="mkt-search-wrap">
            <span className="mkt-search-icon">🔍</span>
            <input
              className="mkt-search-inp"
              placeholder="Search services..."
              value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Results count */}
          <div className="mkt-results-count">
            Showing <strong>{filteredServices.length}</strong> of <strong>{allServices.length}</strong> services
            {qualityFilter === 'refill' && <span className="mkt-filter-tag">🔄 With Refill</span>}
            {qualityFilter === 'no_refill' && <span className="mkt-filter-tag mkt-filter-tag-red">🚫 No Refill</span>}
          </div>

          {loading ? (
            <div className="mkt-loading">⏳ Loading services...</div>
          ) : filteredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">No services found</div>
              <div className="empty-sb">Try different filters</div>
            </div>
          ) : (
            <div className="mkt-grid">
              {filteredServices.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </>
      )}

      {/* ─── ORDER MODAL ─── */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox mkt-modal" onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <span className="mkt-modal-icon">{ic(selected.platform)}</span>
              <div className="mkt-modal-info">
                <div className="mkt-modal-name">{selected.name}</div>
                <div className="mkt-modal-platform" style={{ color: cl(selected.platform) }}>
                  {selected.platform}
                </div>
              </div>
              <button className="mkt-modal-close" onClick={() => setSelected(null)}>×</button>
            </div>

            {selected.description && (
              <div className="mkt-modal-desc">{selected.description}</div>
            )}

            {selected.has_refill && (
              <div className="mkt-modal-refill">
                🔄 Includes {selected.refill_days || 30}-day refill guarantee
              </div>
            )}

            {ordered ? (
              <div className="mkt-success">
                <div className="mkt-success-icon">✅</div>
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
                  <label className="fl">Quantity ({(selected.min_qty || 0).toLocaleString()} – {(selected.max_qty || 0).toLocaleString()})</label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty} max={selected.max_qty} />
                </div>
                <div className="mkt-cost-row">
                  <span className="mkt-cost-label">Total Cost</span>
                  <span className="mkt-cost-value">{format(parseFloat(cost))}</span>
                </div>
                {orderError && (
                  <div className="mkt-error">{orderError}</div>
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

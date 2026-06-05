import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const platformIcons = {
  instagram: '📸', tiktok: '🎵', youtube: '▶️', twitter: '🐦',
  facebook: '👤', telegram: '✈️', snapchat: '👻', linkedin: '💼',
  spotify: '🎵', discord: '🎮', twitch: '🟣', google: '🔍',
  whatsapp: '💬', website: '🌐', threads: '🧵', capcut: '🎬',
  custom: '⚙️', other: '⚙️',
};
const platformColors = {
  instagram: '#E1306C', tiktok: '#00d4ff', youtube: '#FF0000',
  twitter:   '#1DA1F2', facebook: '#1877F2', telegram: '#0088cc',
  snapchat:  '#FFFC00', linkedin: '#0077B5', custom:   '#7b2fff',
  spotify:   '#1DB954', discord:  '#5865F2', twitch:   '#9146FF',
  google:    '#4285F4', whatsapp: '#25D366', website:  '#7b2fff',
  threads:   '#888888', capcut:   '#00d4ff', other:    '#666666',
};

// How many services to show per "page" in infinite scroll
const PAGE_SIZE = 20;

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();

  // ── All services (loaded once from DB) ───────────────
  const [services,  setServices]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  // ── Filter data from DB ───────────────────────────────
  const [filterPlatforms,    setFilterPlatforms]    = useState([]);
  const [filterServiceTypes, setFilterServiceTypes] = useState([]);
  const [filterTypes,        setFilterTypes]        = useState([]);

  // Maps: filterId -> Set<serviceId>
  const [platformServiceMap, setPlatformServiceMap] = useState({});
  const [serviceTypeMap,     setServiceTypeMap]     = useState({});
  const [filterTypeMap,      setFilterTypeMap]      = useState({});

  // Custom prices: serviceId -> custom_price
  const [customPrices, setCustomPrices] = useState({});

  // ── User filter selections ────────────────────────────
  const [selPlatform,    setSelPlatform]    = useState(null);
  const [selServiceType, setSelServiceType] = useState(null);
  const [selFilterType,  setSelFilterType]  = useState(null);
  // Price sort: '' | 'low' | 'high'
  const [priceSort,      setPriceSort]      = useState('');

  // ── Search ────────────────────────────────────────────
  const [search, setSearch] = useState('');

  // ── Infinite scroll: how many services are currently visible ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef(null);

  // ── Active top tab: 'featured' | 'live' ──────────────
  const [activeTab, setActiveTab] = useState('featured');

  // ── Order modal ───────────────────────────────────────
  const [selected,   setSelected]   = useState(null);
  const [link,       setLink]       = useState('');
  const [qty,        setQty]        = useState('');
  const [ordering,   setOrdering]   = useState(false);
  const [ordered,    setOrdered]    = useState(false);
  const [orderError, setOrderError] = useState('');

  // ─────────────────────────────────────────────────────
  useEffect(() => { loadEverything(); }, []);

  // ── Infinite scroll IntersectionObserver ─────────────
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [loading]);

  // Reset infinite scroll whenever any filter/sort/tab changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selPlatform, selServiceType, selFilterType, priceSort, search, activeTab]);

  // ─────────────────────────────────────────────────────
  const loadEverything = async () => {
    setLoading(true);
    try {
      // Load ALL services — batch-paginate to handle 2500+
      const BATCH = 1000;
      let allSvc  = [];
      let from    = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from('services')
          .select('*')
          .eq('is_active', true)
          .order('is_featured', { ascending: false })
          .order('created_at',  { ascending: false })
          .range(from, from + BATCH - 1);
        if (!data || data.length === 0) break;
        allSvc = [...allSvc, ...data];
        if (data.length < BATCH) break;
        from += BATCH;
      }
      setServices(allSvc);

      // Filter platforms (stage 1)
      const { data: plats } = await supabase
        .from('filter_platforms')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      setFilterPlatforms(plats || []);

      const { data: platSvc } = await supabase
        .from('filter_platform_services')
        .select('*');
      const pm = {};
      (platSvc || []).forEach(r => {
        if (!pm[r.platform_id]) pm[r.platform_id] = new Set();
        pm[r.platform_id].add(r.service_id);
      });
      setPlatformServiceMap(pm);

      // Service types (stage 2)
      const { data: svcTypes } = await supabase
        .from('filter_service_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      setFilterServiceTypes(svcTypes || []);

      const { data: svcTypeSvc } = await supabase
        .from('filter_service_type_services')
        .select('*');
      const stm = {};
      (svcTypeSvc || []).forEach(r => {
        if (!stm[r.service_type_id]) stm[r.service_type_id] = new Set();
        stm[r.service_type_id].add(r.service_id);
      });
      setServiceTypeMap(stm);

      // Filter types (stage 3)
      const { data: ftypes } = await supabase
        .from('filter_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      setFilterTypes(ftypes || []);

      const { data: ftypeSvc } = await supabase
        .from('filter_type_services')
        .select('*');
      const ftm = {};
      (ftypeSvc || []).forEach(r => {
        if (!ftm[r.filter_type_id]) ftm[r.filter_type_id] = new Set();
        ftm[r.filter_type_id].add(r.service_id);
      });
      setFilterTypeMap(ftm);

      // Custom prices
      const { data: prices } = await supabase
        .from('service_custom_prices')
        .select('*');
      const cp = {};
      (prices || []).forEach(r => { cp[r.service_id] = r.custom_price; });
      setCustomPrices(cp);

    } catch (e) {
      console.error('Marketplace load error:', e);
    }
    setLoading(false);
  };

  // ─────────────────────────────────────────────────────
  // Effective price: custom price from admin > default price
  // ─────────────────────────────────────────────────────
  const effectivePrice = (s) => {
    if (customPrices[s.id] != null) return parseFloat(customPrices[s.id]);
    return parseFloat(s.price_per_1k);
  };

  const ic = (p) => platformIcons[(p || '').toLowerCase()]  || '⚙️';
  const cl = (p) => platformColors[(p || '').toLowerCase()] || '#7b2fff';

  // ─────────────────────────────────────────────────────
  // FILTERING + SORTING — runs on full in-memory array
  // ─────────────────────────────────────────────────────
  const applyFilters = useCallback((pool) => {
    let result = pool;

    // Stage 1
    if (selPlatform && selPlatform.slug !== 'everything') {
      const allowed = platformServiceMap[selPlatform.id] || new Set();
      result = result.filter(s => allowed.has(s.id));
    }
    // Stage 2
    if (selServiceType && selServiceType.slug !== 'all') {
      const allowed = serviceTypeMap[selServiceType.id] || new Set();
      result = result.filter(s => allowed.has(s.id));
    }
    // Stage 3
    if (selFilterType && selFilterType.slug !== 'all') {
      const allowed = filterTypeMap[selFilterType.id] || new Set();
      result = result.filter(s => allowed.has(s.id));
    }
    // Text search — name, platform, description, or numeric service ID
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(s =>
        (s.name        || '').toLowerCase().includes(q) ||
        (s.platform    || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        String(s.provider_service_id || '').includes(q)
      );
    }
    // Price sort
    if (priceSort === 'low') {
      result = [...result].sort((a, b) => effectivePrice(a) - effectivePrice(b));
    } else if (priceSort === 'high') {
      result = [...result].sort((a, b) => effectivePrice(b) - effectivePrice(a));
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPlatform, selServiceType, selFilterType, search, priceSort,
      platformServiceMap, serviceTypeMap, filterTypeMap, customPrices]);

  const featuredServices    = services.filter(s =>  s.is_featured);
  const nonFeaturedServices = services.filter(s => !s.is_featured);

  // Featured tab: filters on featured pool
  const filteredFeatured = applyFilters(featuredServices);
  // Live tab: filters on non-featured pool only (featured are in their own tab)
  const filteredLive     = applyFilters(nonFeaturedServices);

  const anyFilterActive = !!(selPlatform || selServiceType || selFilterType || search.trim() || priceSort);

  // Slice for infinite scroll
  const visibleLive = filteredLive.slice(0, visibleCount);
  const hasMoreLive = visibleCount < filteredLive.length;

  // ─────────────────────────────────────────────────────
  // Order placement (identical to original)
  // ─────────────────────────────────────────────────────
  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * effectivePrice(selected)).toFixed(4)
    : '0.00';

  const placeOrder = async () => {
    setOrderError('');
    if (!link) { setOrderError('Enter your link'); return; }
    const q = parseInt(qty);
    if (!q || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be ${selected.min_qty.toLocaleString()} – ${selected.max_qty.toLocaleString()}`);
      return;
    }
    const totalCost = parseFloat(cost);
    if (totalCost > user.balance) { setOrderError('Insufficient balance. Please add funds.'); return; }

    setOrdering(true);
    const orderRef = 'NF-' + Date.now();

    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref:    orderRef,
      user_id:      user.id,
      service_id:   selected.id,
      service_name: selected.name,
      platform:     selected.platform,
      link,
      quantity:     q,
      cost:         totalCost,
      status:       'pending',
      progress:     0,
    });
    if (orderErr) { setOrderError('Order failed: ' + orderErr.message); setOrdering(false); return; }

    await supabase.from('users')
      .update({ balance: user.balance - totalCost })
      .eq('id', user.id);

    await supabase.from('transactions').insert({
      user_id:     user.id,
      type:        'order',
      amount:      -totalCost,
      description: `Order: ${selected.name}`,
      ref_id:      orderRef,
    });

    if (selected.provider_api_url && selected.provider_api_key && selected.provider_service_id) {
      try {
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:      selected.provider_api_url,
            key:      selected.provider_api_key,
            action:   'add',
            service:  selected.provider_service_id,
            link,
            quantity: q,
          }),
        });
        if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
        const providerData = await res.json();
        if (providerData && providerData.order) {
          await supabase.from('orders').update({
            vendor_order_id: String(providerData.order),
            status:          'in_progress',
          }).eq('order_ref', orderRef);
        } else if (providerData && providerData.error) {
          await supabase.from('orders').update({
            provider_note: `Provider error: ${providerData.error}`,
          }).eq('order_ref', orderRef);
        } else if (providerData && providerData.raw) {
          await supabase.from('orders').update({
            provider_note: `Unexpected response: ${providerData.raw.slice(0, 100)}`,
          }).eq('order_ref', orderRef);
        }
      } catch (e) {
        await supabase.from('orders').update({
          provider_note: `Auto-send failed: ${e.message}`,
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

  // ─────────────────────────────────────────────────────
  // Filter Pill — used in stage 1 and stage 2 (box style)
  // ─────────────────────────────────────────────────────
  const FilterPill = ({ item, isSelected, onClick, color }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        padding: '10px 6px', borderRadius: '10px', cursor: 'pointer', minWidth: '62px',
        background:  isSelected ? `${color}18` : 'rgba(0,0,0,.2)',
        border:      `1.5px solid ${isSelected ? color : 'var(--br)'}`,
        transition:  'all .15s', userSelect: 'none', flexShrink: 0,
      }}>
      <span style={{ fontSize: '18px' }}>{item.icon}</span>
      <span style={{
        fontSize: '9px', fontWeight: isSelected ? 800 : 600,
        color:    isSelected ? color : 'var(--text3)',
        textAlign: 'center', lineHeight: 1.2, maxWidth: '60px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{item.name}</span>
    </div>
  );

  // ─────────────────────────────────────────────────────
  // Service Card — compact style matching original Image 2
  // ─────────────────────────────────────────────────────
  const ServiceCard = ({ s }) => {
    const price     = effectivePrice(s);
    const hasCustom = customPrices[s.id] != null;
    return (
      <div
        className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
        onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); }}>
        {s.is_featured && (
          <div style={{
            position: 'absolute', top: '-1px', right: '10px',
            background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
            color: '#000', fontSize: '8px', fontWeight: 800, padding: '3px 8px',
            borderRadius: '0 0 6px 6px', letterSpacing: '1px', fontFamily: 'var(--fd)',
          }}>⭐ FEATURED</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>{ic(s.platform)}</span>
          <span style={{
            fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 700,
            background: `${cl(s.platform)}18`, color: cl(s.platform),
            border: `1px solid ${cl(s.platform)}30`, textTransform: 'uppercase', letterSpacing: '1px',
          }}>{s.platform}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '3px', color: 'var(--text)', lineHeight: 1.4 }}>
          {s.name}
        </div>
        {s.description && (
          <div style={{
            fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {s.description}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>
              {format(price)}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text3)' }}>per 1,000</div>
            {hasCustom && (
              <div style={{ fontSize: '8px', color: 'var(--neon)', letterSpacing: '0.5px' }}>✦ Special</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)' }}>Min: {(s.min_qty || 0).toLocaleString()}</div>
            <div style={{ fontSize: '9px', color: 'var(--text3)' }}>Max: {(s.max_qty || 0).toLocaleString()}</div>
          </div>
        </div>
        {s.provider_api_url && (
          <div style={{ marginTop: '5px', fontSize: '9px', color: 'var(--green)', letterSpacing: '1px' }}>⚡ AUTO</div>
        )}
        <button className="btn bp bsm bw" style={{ marginTop: '10px' }}>Order Now →</button>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────
  return (
    <div>

      {/* ── TOP TABS: Featured | Live Services ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div
          onClick={() => setActiveTab('featured')}
          style={{
            flex: 1, padding: '10px 8px', borderRadius: '10px', textAlign: 'center',
            background: activeTab === 'featured'
              ? 'linear-gradient(135deg,rgba(212,175,55,.18),rgba(255,215,0,.08))'
              : 'rgba(0,0,0,.2)',
            border: `1.5px solid ${activeTab === 'featured' ? 'rgba(255,215,0,.5)' : 'var(--br)'}`,
            cursor: 'pointer', transition: 'all .15s',
            fontWeight: 800, fontSize: '11px',
            color: activeTab === 'featured' ? 'var(--gold)' : 'var(--text3)',
            fontFamily: 'var(--fd)', letterSpacing: '1px',
          }}>
          ⭐ FEATURED
        </div>
        <div
          onClick={() => setActiveTab('live')}
          style={{
            flex: 2, padding: '10px 8px', borderRadius: '10px', textAlign: 'center',
            background: activeTab === 'live'
              ? 'linear-gradient(135deg,rgba(0,212,255,.15),rgba(123,47,255,.1))'
              : 'rgba(0,0,0,.2)',
            border: `1.5px solid ${activeTab === 'live' ? 'rgba(0,212,255,.4)' : 'var(--br)'}`,
            cursor: 'pointer', transition: 'all .15s',
            fontWeight: 800, fontSize: '11px', color: 'var(--neon)',
            fontFamily: 'var(--fd)', letterSpacing: '1px',
          }}>
          🛒 LIVE SERVICES ({nonFeaturedServices.length.toLocaleString()})
        </div>
      </div>

      {/* ── SEARCH BAR — above all filters ── */}
      <div style={{ marginBottom: '12px' }}>
        <input
          className="srch-inp"
          style={{ width: '100%', boxSizing: 'border-box' }}
          placeholder="🔍 Search by name, platform, description or Service ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── STAGE 1: SELECT PLATFORM ── */}
      {!loading && filterPlatforms.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '2px', marginBottom: '7px', fontWeight: 700 }}>
            SELECT PLATFORM
          </div>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {/* Everything pill */}
            <FilterPill
              item={{ icon: '🌐', name: 'Everything' }}
              isSelected={!selPlatform || selPlatform?.slug === 'everything'}
              color="var(--neon)"
              onClick={() => {
                setSelPlatform(null);
                setSelServiceType(null);
                setSelFilterType(null);
              }}
            />
            {filterPlatforms.filter(p => p.slug !== 'everything').map(p => (
              <FilterPill
                key={p.id}
                item={p}
                isSelected={selPlatform?.id === p.id}
                color={p.color || '#00d4ff'}
                onClick={() => {
                  setSelPlatform(p);
                  setSelServiceType(null);
                  setSelFilterType(null);
                  setActiveTab('live');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── STAGE 2: SELECT SERVICE TYPE ── */}
      {!loading && filterServiceTypes.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '2px', marginBottom: '7px', fontWeight: 700 }}>
            SELECT SERVICE
          </div>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {/* All pill */}
            <FilterPill
              item={{ icon: '💎', name: 'All' }}
              isSelected={!selServiceType || selServiceType?.slug === 'all'}
              color="#7b2fff"
              onClick={() => {
                setSelServiceType(null);
                setSelFilterType(null);
              }}
            />
            {filterServiceTypes.filter(st => st.slug !== 'all').map(st => (
              <FilterPill
                key={st.id}
                item={st}
                isSelected={selServiceType?.id === st.id}
                color="#7b2fff"
                onClick={() => {
                  setSelServiceType(st);
                  setSelFilterType(null);
                  setActiveTab('live');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── STAGE 3: FILTER BY TYPE ── */}
      {!loading && filterTypes.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '2px', marginBottom: '7px', fontWeight: 700 }}>
            FILTER BY TYPE
          </div>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', flexWrap: 'wrap' }}>
            {/* All pill */}
            <div
              onClick={() => setSelFilterType(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                background: !selFilterType ? 'rgba(0,212,255,.12)' : 'rgba(0,0,0,.2)',
                border: `1.5px solid ${!selFilterType ? 'var(--neon)' : 'var(--br)'}`,
                fontSize: '10px', fontWeight: 700,
                color: !selFilterType ? 'var(--neon)' : 'var(--text3)',
                transition: 'all .15s', userSelect: 'none', flexShrink: 0,
              }}>
              💎 All
            </div>
            {filterTypes.filter(ft => ft.slug !== 'all').map(ft => (
              <div key={ft.id}
                onClick={() => {
                  setSelFilterType(selFilterType?.id === ft.id ? null : ft);
                  setActiveTab('live');
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                  background: selFilterType?.id === ft.id ? 'rgba(255,215,0,.1)' : 'rgba(0,0,0,.2)',
                  border: `1.5px solid ${selFilterType?.id === ft.id ? '#ffd700' : 'var(--br)'}`,
                  fontSize: '10px', fontWeight: 700,
                  color: selFilterType?.id === ft.id ? 'var(--gold)' : 'var(--text3)',
                  transition: 'all .15s', userSelect: 'none', flexShrink: 0,
                }}>
                {ft.icon} {ft.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRICE SORT + result count row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>💰 Price:</span>
        {[
          { val: '',     label: 'Default'    },
          { val: 'low',  label: 'Low → High' },
          { val: 'high', label: 'High → Low' },
        ].map(opt => {
          const isOn = priceSort === opt.val;
          return (
            <div key={opt.val}
              onClick={() => setPriceSort(opt.val)}
              style={{
                padding: '4px 10px', borderRadius: '16px', cursor: 'pointer', fontSize: '10px',
                fontWeight: isOn ? 800 : 600,
                background: isOn ? 'rgba(0,212,255,.12)' : 'rgba(0,0,0,.2)',
                border: `1.5px solid ${isOn ? 'var(--neon)' : 'var(--br)'}`,
                color: isOn ? 'var(--neon)' : 'var(--text3)',
                transition: 'all .15s', userSelect: 'none', flexShrink: 0,
              }}>
              {opt.label}
            </div>
          );
        })}
        {/* Result count + Clear */}
        {anyFilterActive && (
          <>
            <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: 'auto' }}>
              {(activeTab === 'featured' ? filteredFeatured : filteredLive).length} found
              {selPlatform    && ` · ${selPlatform.name}`}
              {selServiceType && ` · ${selServiceType.name}`}
              {selFilterType  && ` · ${selFilterType.name}`}
            </span>
            <button className="btn bgh bsm"
              onClick={() => {
                setSelPlatform(null);
                setSelServiceType(null);
                setSelFilterType(null);
                setSearch('');
                setPriceSort('');
              }}>
              Clear ×
            </button>
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* TAB CONTENT                                      */}
      {/* ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
          Loading services...
        </div>
      ) : (
        <>
          {/* ── FEATURED TAB ── */}
          {activeTab === 'featured' && (
            <>
              {filteredFeatured.length === 0 ? (
                <div className="empty">
                  <span className="empty-ic">⭐</span>
                  <div className="empty-tx">No featured services</div>
                  <div className="empty-sb">
                    {anyFilterActive
                      ? 'No featured services match your filters'
                      : 'Admin has not featured any services yet'}
                  </div>
                </div>
              ) : (
                <>
                  <div className="st">⭐ Featured Services
                    <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400,
                      letterSpacing: '1px', marginLeft: '8px' }}>
                      — Handpicked by admin
                    </span>
                  </div>
                  <div className="mkt-grid">
                    {filteredFeatured.map(s => <ServiceCard key={s.id} s={s} />)}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── LIVE SERVICES TAB ── */}
          {/* Services show immediately — no "Browse All" button needed.        */}
          {/* Infinite scroll loads 20 at a time as user scrolls.               */}
          {activeTab === 'live' && (
            <>
              {filteredLive.length === 0 ? (
                <div className="empty">
                  <span className="empty-ic">🔍</span>
                  <div className="empty-tx">
                    {nonFeaturedServices.length === 0
                      ? 'No services available yet'
                      : 'No services match your filters'}
                  </div>
                  <div className="empty-sb">
                    {nonFeaturedServices.length === 0
                      ? 'Admin is adding services soon'
                      : 'Try different filters or clear your selection'}
                  </div>
                  {anyFilterActive && (
                    <button className="btn bgh bsm" style={{ marginTop: '12px' }}
                      onClick={() => {
                        setSelPlatform(null);
                        setSelServiceType(null);
                        setSelFilterType(null);
                        setSearch('');
                        setPriceSort('');
                      }}>
                      🗑️ Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Count indicator */}
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '10px' }}>
                    Showing {Math.min(visibleCount, filteredLive.length).toLocaleString()} of {filteredLive.length.toLocaleString()} services
                  </div>

                  {/* Service cards grid */}
                  <div className="mkt-grid">
                    {visibleLive.map(s => <ServiceCard key={s.id} s={s} />)}
                  </div>

                  {/* Infinite scroll sentinel — when this div enters viewport, load more */}
                  {hasMoreLive && (
                    <div ref={loaderRef}
                      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '24px', gap: '10px', color: 'var(--text3)', fontSize: '12px' }}>
                      <div style={{
                        width: '16px', height: '16px', borderRadius: '50%',
                        border: '2px solid var(--neon)', borderTopColor: 'transparent',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      Loading more...
                    </div>
                  )}

                  {/* End of list indicator */}
                  {!hasMoreLive && filteredLive.length > PAGE_SIZE && (
                    <div style={{ textAlign: 'center', padding: '16px',
                      color: 'var(--text3)', fontSize: '11px' }}>
                      ✅ All {filteredLive.length.toLocaleString()} services loaded
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────── */}
      {/* ORDER MODAL                                      */}
      {/* ─────────────────────────────────────────────── */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '500px', width: '100%' }}>

            {/* Service header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <span style={{ fontSize: '26px' }}>{ic(selected.platform)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', lineHeight: 1.3 }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: '10px', color: cl(selected.platform),
                  textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>
                  {selected.platform}
                  {selected.provider_api_url && (
                    <span style={{ color: 'var(--green)', marginLeft: '6px' }}>⚡ Auto-delivery</span>
                  )}
                  {customPrices[selected.id] && (
                    <span style={{ color: 'var(--neon)', marginLeft: '6px' }}>✦ Special Price</span>
                  )}
                </div>
                {selected.provider_service_id && (
                  <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                    Service ID:&nbsp;
                    <span style={{ color: 'var(--neon)', fontFamily: 'monospace',
                      background: 'rgba(0,212,255,.08)', borderRadius: '3px', padding: '1px 5px' }}>
                      {selected.provider_service_id}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)',
                  cursor: 'pointer', fontSize: '22px', flexShrink: 0 }}>×</button>
            </div>

            {/* Service Description box */}
            {selected.description && selected.description.trim() && (
              <div style={{
                padding: '10px 13px', borderRadius: '8px', marginBottom: '14px',
                background: 'rgba(0,212,255,.04)', border: '1px solid rgba(0,212,255,.15)',
              }}>
                <div style={{ fontSize: '9px', color: 'var(--neon)', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '5px' }}>
                  📄 Service Description
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selected.description}
                </div>
              </div>
            )}

            {ordered ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: '15px',
                  marginBottom: '6px' }}>Order Placed!</div>
                <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Processing automatically...</div>
              </div>
            ) : (
              <>
                <div className="fi">
                  <label className="fl">Your Link / Username</label>
                  <input className="inp" value={link} onChange={e => setLink(e.target.value)}
                    placeholder="https://..." />
                </div>
                <div className="fi">
                  <label className="fl">
                    Quantity ({(selected.min_qty || 0).toLocaleString()} – {(selected.max_qty || 0).toLocaleString()})
                  </label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty} max={selected.max_qty} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '14px', padding: '10px 13px', borderRadius: '8px',
                  background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '18px', fontWeight: 700,
                    color: 'var(--gold)' }}>
                    {format(parseFloat(cost))}
                  </span>
                </div>
                {orderError && (
                  <div style={{ background: 'rgba(255,50,80,.08)', border: '1px solid rgba(255,50,80,.2)',
                    borderRadius: '7px', padding: '10px', color: '#ff6b6b',
                    fontSize: '12px', marginBottom: '12px' }}>
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

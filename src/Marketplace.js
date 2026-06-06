import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

// ─────────────────────────────────────────────────────────
// Platform icons and colors
// ─────────────────────────────────────────────────────────
const platformIcons = {
  instagram: '📸', tiktok: '🎵', youtube: '▶️',  twitter: '🐦',
  facebook:  '👤', telegram: '✈️', snapchat: '👻', linkedin: '💼',
  spotify:   '🎵', discord: '🎮', twitch: '🟣',  google: '🔍',
  whatsapp:  '💬', website: '🌐', threads: '🧵',  capcut: '🎬',
  custom:    '⚙️', other: '⚙️',
};
const platformColors = {
  instagram: '#E1306C', tiktok: '#00d4ff', youtube: '#FF0000',
  twitter:   '#1DA1F2', facebook: '#1877F2', telegram: '#0088cc',
  snapchat:  '#FFFC00', linkedin: '#0077B5', custom:   '#7b2fff',
  spotify:   '#1DB954', discord:  '#5865F2', twitch:   '#9146FF',
  google:    '#4285F4', whatsapp: '#25D366', website:  '#7b2fff',
  threads:   '#888888', capcut:   '#00d4ff', other:    '#666666',
};

// ─────────────────────────────────────────────────────────
// Infinite scroll page size
// ─────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────
// Helper: convert hex color to "r,g,b" string for rgba()
// ─────────────────────────────────────────────────────────
function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return null;
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return `${r},${g},${b}`;
}

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();

  // ── All services loaded from DB ───────────────────────
  const [services,  setServices]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  // ── Filter tables from DB ─────────────────────────────
  const [filterPlatforms,    setFilterPlatforms]    = useState([]);
  const [filterServiceTypes, setFilterServiceTypes] = useState([]);
  const [filterTypes,        setFilterTypes]        = useState([]);

  // Maps: filterId -> Set<serviceId>
  const [platformServiceMap, setPlatformServiceMap] = useState({});
  const [serviceTypeMap,     setServiceTypeMap]     = useState({});
  const [filterTypeMap,      setFilterTypeMap]      = useState({});

  // Direct admin-controlled stage links:
  // platform_id -> Set<service_type_id> (which Stage 2 appear per platform)
  const [platformServiceTypeMap,   setPlatformServiceTypeMap]   = useState({});
  // service_type_id -> Set<filter_type_id> (which Stage 3 appear per service type)
  const [serviceTypeFilterTypeMap, setServiceTypeFilterTypeMap] = useState({});

  // Custom prices from admin: serviceId -> price
  const [customPrices, setCustomPrices] = useState({});

  // ── User's filter selections ──────────────────────────
  const [selPlatform,    setSelPlatform]    = useState(null);
  const [selServiceType, setSelServiceType] = useState(null);
  const [selFilterType,  setSelFilterType]  = useState(null);

  // ── Price sort ────────────────────────────────────────
  const [priceSort, setPriceSort] = useState('');

  // ── Search text ───────────────────────────────────────
  const [search, setSearch] = useState('');

  // ── Infinite scroll for LIVE tab ─────────────────────
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef(null);

  // ── Infinite scroll for FEATURED tab ─────────────────
  const [featuredVisibleCount, setFeaturedVisibleCount] = useState(PAGE_SIZE);
  const featuredLoaderRef = useRef(null);

  // ── Active top tab ────────────────────────────────────
  const [activeTab, setActiveTab] = useState('featured');

  // ── Order modal state ─────────────────────────────────
  const [selected,   setSelected]   = useState(null);
  const [link,       setLink]       = useState('');
  const [qty,        setQty]        = useState('');
  const [ordering,   setOrdering]   = useState(false);
  const [ordered,    setOrdered]    = useState(false);
  const [orderError, setOrderError] = useState('');

  // ─────────────────────────────────────────────────────
  // Load everything on mount
  // ─────────────────────────────────────────────────────
  useEffect(() => { loadEverything(); }, []);

  // ─────────────────────────────────────────────────────
  // IntersectionObserver for LIVE infinite scroll
  // ─────────────────────────────────────────────────────
  useEffect(() => {
    const sentinel = loaderRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, activeTab]);

  // ─────────────────────────────────────────────────────
  // IntersectionObserver for FEATURED infinite scroll
  // ─────────────────────────────────────────────────────
  useEffect(() => {
    const sentinel = featuredLoaderRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setFeaturedVisibleCount(prev => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, activeTab]);

  // Reset visible counts when filters/search/tab changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setFeaturedVisibleCount(PAGE_SIZE);
  }, [selPlatform, selServiceType, selFilterType, priceSort, search, activeTab]);

  // ─────────────────────────────────────────────────────
  // loadEverything
  // ─────────────────────────────────────────────────────
  const loadEverything = async () => {
    setLoading(true);
    try {
      // ── Helper: fetch ALL rows from any table without hitting
      // Supabase's default 1000-row cap per request ──────────
      // optional=true: table may not exist yet (SQL migration not run)
      // — returns [] silently instead of crashing the whole marketplace
      const fetchAll = async (table, cols = '*', optional = false) => {
        const JB = 100000;
        let rows = [];
        let f    = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from(table).select(cols).range(f, f + JB - 1);
          if (error) {
            if (optional) return [];
            throw error;
          }
          if (!data || data.length === 0) break;
          rows = [...rows, ...data];
          if (data.length < JB) break;
          f += JB;
        }
        return rows;
      };

      // ── Services (active only, featured first) ────────────
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

      // ── Stage 1: platforms ────────────────────────────────
      const { data: plats } = await supabase
        .from('filter_platforms')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      setFilterPlatforms(plats || []);

      // platform → services (can be > 1000 rows)
      const platSvcRows = await fetchAll('filter_platform_services');
      const pm = {};
      platSvcRows.forEach(r => {
        if (!pm[r.platform_id]) pm[r.platform_id] = new Set();
        pm[r.platform_id].add(r.service_id);
      });
      setPlatformServiceMap(pm);

      // platform → directly linked service types (admin-controlled Stage 1→2)
      // optional=true: won't crash if SQL migration not run yet
      const platStRows = await fetchAll('filter_platform_service_types', '*', true);
      const pstm = {};
      platStRows.forEach(r => {
        if (!pstm[r.platform_id]) pstm[r.platform_id] = new Set();
        pstm[r.platform_id].add(r.service_type_id);
      });
      setPlatformServiceTypeMap(pstm);

      // ── Stage 2: service types ────────────────────────────
      const { data: svcTypes } = await supabase
        .from('filter_service_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      setFilterServiceTypes(svcTypes || []);

      // service type → services (can be > 1000 rows)
      const svcTypeSvcRows = await fetchAll('filter_service_type_services');
      const stm = {};
      svcTypeSvcRows.forEach(r => {
        if (!stm[r.service_type_id]) stm[r.service_type_id] = new Set();
        stm[r.service_type_id].add(r.service_id);
      });
      setServiceTypeMap(stm);

      // service type → directly linked filter types (admin-controlled Stage 2→3)
      // optional=true: won't crash if SQL migration not run yet
      const stFtRows = await fetchAll('filter_service_type_filter_types', '*', true);
      const stftm = {};
      stFtRows.forEach(r => {
        if (!stftm[r.service_type_id]) stftm[r.service_type_id] = new Set();
        stftm[r.service_type_id].add(r.filter_type_id);
      });
      setServiceTypeFilterTypeMap(stftm);

      // ── Stage 3: filter types ─────────────────────────────
      const { data: ftypes } = await supabase
        .from('filter_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      setFilterTypes(ftypes || []);

      // filter type → services (can be > 1000 rows)
      const ftypeSvcRows = await fetchAll('filter_type_services');
      const ftm = {};
      ftypeSvcRows.forEach(r => {
        if (!ftm[r.filter_type_id]) ftm[r.filter_type_id] = new Set();
        ftm[r.filter_type_id].add(r.service_id);
      });
      setFilterTypeMap(ftm);

      // custom prices (can be > 1000 rows)
      const priceRows = await fetchAll('service_custom_prices');
      const cp = {};
      priceRows.forEach(r => { cp[r.service_id] = r.custom_price; });
      setCustomPrices(cp);

    } catch (e) {
      console.error('Marketplace load error:', e);
    }
    setLoading(false);
  };

  // ─────────────────────────────────────────────────────
  // Effective price
  // ─────────────────────────────────────────────────────
  const effectivePrice = (s) => {
    if (customPrices[s.id] != null) return parseFloat(customPrices[s.id]);
    return parseFloat(s.price_per_1k);
  };

  const ic = (p) => platformIcons[(p || '').toLowerCase()]  || '⚙️';
  const cl = (p) => platformColors[(p || '').toLowerCase()] || '#7b2fff';

  // ─────────────────────────────────────────────────────
  // DERIVED: relevant Stage 2 service types for the
  // currently selected Stage 1 platform.
  //
  // Uses admin-controlled direct links from the table
  // filter_platform_service_types (set in Manage Filters
  // via the "🔗 Link Filters" button on each platform card).
  //
  // Fallback: if admin has not set any direct links for
  // this platform yet, show ALL service types so the
  // marketplace never shows an empty Stage 2.
  // ─────────────────────────────────────────────────────
  const relevantServiceTypes = React.useMemo(() => {
    if (!selPlatform || selPlatform.slug === 'everything') {
      // No platform selected → show all service types
      return filterServiceTypes;
    }
    const linked = platformServiceTypeMap[selPlatform.id];
    if (!linked || linked.size === 0) {
      // Admin has not linked any Stage 2 filters to this platform yet
      // → show all so marketplace is never broken
      return filterServiceTypes;
    }
    return filterServiceTypes.filter(st =>
      st.slug === 'all' || linked.has(st.id)
    );
  }, [selPlatform, filterServiceTypes, platformServiceTypeMap]);

  // ─────────────────────────────────────────────────────
  // DERIVED: relevant Stage 3 filter types for the
  // currently selected Stage 2 service type.
  //
  // Uses admin-controlled direct links from the table
  // filter_service_type_filter_types (set in Manage Filters
  // via the "🔗 Link Filters" button on each service type card).
  //
  // Fallback: if admin has not set any direct links for
  // this service type yet, show ALL filter types.
  // ─────────────────────────────────────────────────────
  const relevantFilterTypes = React.useMemo(() => {
    if (!selServiceType || selServiceType.slug === 'all') {
      // No service type selected → show all filter types
      return filterTypes;
    }
    const linked = serviceTypeFilterTypeMap[selServiceType.id];
    if (!linked || linked.size === 0) {
      // Admin has not linked any Stage 3 filters to this service type yet
      // → show all so marketplace is never broken
      return filterTypes;
    }
    return filterTypes.filter(ft =>
      ft.slug === 'all' || linked.has(ft.id)
    );
  }, [selServiceType, filterTypes, serviceTypeFilterTypeMap]);

  // ─────────────────────────────────────────────────────
  // FILTERING + SORTING
  // ─────────────────────────────────────────────────────
  const applyFilters = useCallback((pool) => {
    let result = pool;

    if (selPlatform && selPlatform.slug !== 'everything') {
      const allowed = platformServiceMap[selPlatform.id] || new Set();
      result = result.filter(s => allowed.has(s.id));
    }
    if (selServiceType && selServiceType.slug !== 'all') {
      const allowed = serviceTypeMap[selServiceType.id] || new Set();
      result = result.filter(s => allowed.has(s.id));
    }
    if (selFilterType && selFilterType.slug !== 'all') {
      const allowed = filterTypeMap[selFilterType.id] || new Set();
      result = result.filter(s => allowed.has(s.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(s =>
        (s.name        || '').toLowerCase().includes(q) ||
        (s.platform    || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        String(s.provider_service_id || '').includes(q)
      );
    }
    if (priceSort === 'low') {
      result = [...result].sort((a, b) => effectivePrice(a) - effectivePrice(b));
    } else if (priceSort === 'high') {
      result = [...result].sort((a, b) => effectivePrice(b) - effectivePrice(a));
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPlatform, selServiceType, selFilterType, search, priceSort,
      platformServiceMap, serviceTypeMap, filterTypeMap, customPrices]);

  // Split into pools
  const featuredServices    = services.filter(s =>  s.is_featured);
  const nonFeaturedServices = services.filter(s => !s.is_featured);

  // Featured tab: only text search applies (no platform/type filters)
  const filteredFeatured = search.trim()
    ? featuredServices.filter(s =>
        (s.name        || '').toLowerCase().includes(search.toLowerCase().trim()) ||
        (s.platform    || '').toLowerCase().includes(search.toLowerCase().trim()) ||
        (s.description || '').toLowerCase().includes(search.toLowerCase().trim()) ||
        String(s.provider_service_id || '').includes(search.toLowerCase().trim())
      )
    : featuredServices;

  // Live tab: all filters apply
  const filteredLive = applyFilters(nonFeaturedServices);

  const anyFilterActive = !!(
    selPlatform || selServiceType || selFilterType || search.trim() || priceSort
  );

  const visibleLive          = filteredLive.slice(0, visibleCount);
  const hasMoreLive          = visibleCount < filteredLive.length;
  const visibleFeatured      = filteredFeatured.slice(0, featuredVisibleCount);
  const hasMoreFeatured      = featuredVisibleCount < filteredFeatured.length;

  // ─────────────────────────────────────────────────────
  // Order placement
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
  // ServiceCard — shared card component
  // compact=true → smaller card for Featured tab 2-col grid
  // ─────────────────────────────────────────────────────
  const ServiceCard = ({ s, compact }) => {
    const price     = effectivePrice(s);
    const hasCustom = customPrices[s.id] != null;
    return (
      <div
        className={`mkt-card${compact ? ' mkt-card-compact' : ''} ${s.is_featured ? 'mkt-featured' : ''}`}
        onClick={() => {
          setSelected(s);
          setLink('');
          setQty(s.min_qty);
          setOrderError('');
        }}>
        {/* FEATURED badge */}
        {s.is_featured && (
          <div style={{
            position: 'absolute', top: 0, right: 0,
            background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
            color: '#000', fontSize: '7px', fontWeight: 800, padding: '3px 7px',
            borderRadius: '0 8px 0 8px', letterSpacing: '0.5px',
          }}>⭐ FEATURED</div>
        )}
        {/* Platform icon + badge row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: compact ? '4px' : '6px',
        }}>
          <span style={{ fontSize: compact ? '15px' : '18px' }}>{ic(s.platform)}</span>
          <span style={{
            fontSize: '8px', padding: '2px 5px', borderRadius: '8px', fontWeight: 700,
            background: `${cl(s.platform)}18`, color: cl(s.platform),
            border: `1px solid ${cl(s.platform)}28`,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>{s.platform}</span>
        </div>
        {/* Service name */}
        <div style={{
          fontWeight: 700, fontSize: compact ? '10px' : '11px', color: 'var(--text)',
          lineHeight: 1.35, marginBottom: '3px',
          display: '-webkit-box', WebkitLineClamp: compact ? 2 : 3,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {s.name}
        </div>
        {/* Description — hidden on compact to keep cards small */}
        {!compact && s.description && (
          <div style={{
            fontSize: '9px', color: 'var(--text3)', lineHeight: 1.35, marginBottom: '6px',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {s.description}
          </div>
        )}
        {/* Price + min/max row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', marginTop: 'auto',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--fm)', fontSize: compact ? '11px' : '13px',
              fontWeight: 700, color: 'var(--gold)',
            }}>
              {format(price)}
            </div>
            <div style={{ fontSize: '8px', color: 'var(--text3)' }}>per 1,000</div>
            {hasCustom && (
              <div style={{ fontSize: '7px', color: 'var(--neon)' }}>✦ Special</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', color: 'var(--text3)' }}>
              Min: {(s.min_qty || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '8px', color: 'var(--text3)' }}>
              Max: {(s.max_qty || 0).toLocaleString()}
            </div>
          </div>
        </div>
        {/* Auto badge */}
        {s.provider_api_url && (
          <div style={{ marginTop: '4px', fontSize: '8px', color: 'var(--green)' }}>
            ⚡ AUTO
          </div>
        )}
        {/* Order button */}
        <button
          className="btn bp bsm bw"
          style={{ marginTop: compact ? '6px' : '8px', fontSize: '10px', padding: '5px 4px' }}>
          Order Now →
        </button>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────
  return (
    <div>

      {/* ════════════════════════════════════════════════ */}
      {/* TOP TABS — Featured | Live Services               */}
      {/* ════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {/* FEATURED tab */}
        <div
          onClick={() => setActiveTab('featured')}
          style={{
            flex: 1, padding: '10px 8px', borderRadius: '10px', textAlign: 'center',
            cursor: 'pointer', transition: 'all .15s',
            background: activeTab === 'featured'
              ? 'linear-gradient(135deg,rgba(212,175,55,.2),rgba(255,215,0,.08))'
              : 'rgba(0,0,0,.2)',
            border: `1.5px solid ${activeTab === 'featured'
              ? 'rgba(255,215,0,.55)' : 'var(--br)'}`,
            fontWeight: 800, fontSize: '11px',
            color: activeTab === 'featured' ? 'var(--gold)' : 'var(--text3)',
            fontFamily: 'var(--fd)', letterSpacing: '1px',
          }}>
          ⭐ FEATURED
        </div>
        {/* LIVE SERVICES tab */}
        <div
          onClick={() => setActiveTab('live')}
          style={{
            flex: 2, padding: '10px 8px', borderRadius: '10px', textAlign: 'center',
            cursor: 'pointer', transition: 'all .15s',
            background: activeTab === 'live'
              ? 'linear-gradient(135deg,rgba(0,212,255,.15),rgba(123,47,255,.1))'
              : 'rgba(0,0,0,.2)',
            border: `1.5px solid ${activeTab === 'live'
              ? 'rgba(0,212,255,.45)' : 'var(--br)'}`,
            fontWeight: 800, fontSize: '11px', color: 'var(--neon)',
            fontFamily: 'var(--fd)', letterSpacing: '1px',
          }}>
          🛒 LIVE SERVICES ({nonFeaturedServices.length.toLocaleString()})
        </div>
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* SEARCH BAR — always visible                      */}
      {/* ════════════════════════════════════════════════ */}
      <div style={{ marginBottom: '12px' }}>
        <input
          className="srch-inp"
          style={{ width: '100%', boxSizing: 'border-box' }}
          placeholder="🔍 Search by name, platform, description or Service ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* FILTERS — LIVE TAB ONLY                          */}
      {/* Stage 1 (platform) → Stage 2 (service type)     */}
      {/* → Stage 3 (filter type) + price sort             */}
      {/* Stage 2 & 3 shown only when relevant options     */}
      {/* exist for the selected platform                  */}
      {/* ════════════════════════════════════════════════ */}
      {activeTab === 'live' && !loading && (
        <div>

          {/* ── STAGE 1: SELECT PLATFORM ────────────────── */}
          {/* Round pill style, FIXED (wrapped, not scrollable) */}
          {/* Matches Stage 2 & 3 exactly                       */}
          {filterPlatforms.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase',
                letterSpacing: '2px', marginBottom: '7px', fontWeight: 700,
              }}>
                SELECT PLATFORM
              </div>
              {/* flexWrap: wrap = fixed, same as Stage 2 & 3 — no horizontal scroll */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {/* Everything pill */}
                <div
                  onClick={() => {
                    setSelPlatform(null);
                    setSelServiceType(null);
                    setSelFilterType(null);
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                    background: !selPlatform ? 'rgba(0,212,255,.12)' : 'rgba(0,0,0,.2)',
                    border: `1.5px solid ${!selPlatform ? 'var(--neon)' : 'var(--br)'}`,
                    fontSize: '10px', fontWeight: !selPlatform ? 800 : 600,
                    color: !selPlatform ? 'var(--neon)' : 'var(--text3)',
                    transition: 'all .15s', userSelect: 'none',
                  }}>
                  🌐 Everything
                </div>
                {filterPlatforms.filter(p => p.slug !== 'everything').map(p => {
                  const isOn    = selPlatform?.id === p.id;
                  const pColor  = p.color || '#00d4ff';
                  const pRgb    = pColor.startsWith('#') && pColor.length === 7
                    ? `${parseInt(pColor.slice(1,3),16)},${parseInt(pColor.slice(3,5),16)},${parseInt(pColor.slice(5,7),16)}`
                    : '0,212,255';
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelPlatform(p);
                        setSelServiceType(null);
                        setSelFilterType(null);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                        background: isOn ? `rgba(${pRgb},.12)` : 'rgba(0,0,0,.2)',
                        border: `1.5px solid ${isOn ? pColor : 'var(--br)'}`,
                        fontSize: '10px', fontWeight: isOn ? 800 : 600,
                        color: isOn ? pColor : 'var(--text3)',
                        transition: 'all .15s', userSelect: 'none',
                      }}>
                      {p.icon} {p.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STAGE 2: SELECT SERVICE TYPE ────────────── */}
          {/* Round pill style, FIXED (wrapped, not scrollable) */}
          {/* Always shown as long as service types exist in DB  */}
          {filterServiceTypes.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase',
                letterSpacing: '2px', marginBottom: '7px', fontWeight: 700,
              }}>
                SELECT SERVICE
              </div>
              {/* flexWrap: wrap = fixed/non-scrollable, wraps to next line */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {/* All pill */}
                <div
                  onClick={() => {
                    setSelServiceType(null);
                    setSelFilterType(null);
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                    background: !selServiceType ? 'rgba(123,47,255,.12)' : 'rgba(0,0,0,.2)',
                    border: `1.5px solid ${!selServiceType ? '#7b2fff' : 'var(--br)'}`,
                    fontSize: '10px', fontWeight: !selServiceType ? 800 : 600,
                    color: !selServiceType ? '#b07eff' : 'var(--text3)',
                    transition: 'all .15s', userSelect: 'none',
                  }}>
                  💎 All
                </div>
                {relevantServiceTypes.filter(st => st.slug !== 'all').map(st => {
                  const isOn = selServiceType?.id === st.id;
                  return (
                    <div
                      key={st.id}
                      onClick={() => {
                        setSelServiceType(isOn ? null : st);
                        setSelFilterType(null);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                        background: isOn ? 'rgba(123,47,255,.12)' : 'rgba(0,0,0,.2)',
                        border: `1.5px solid ${isOn ? '#7b2fff' : 'var(--br)'}`,
                        fontSize: '10px', fontWeight: isOn ? 800 : 600,
                        color: isOn ? '#b07eff' : 'var(--text3)',
                        transition: 'all .15s', userSelect: 'none',
                      }}>
                      {st.icon} {st.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STAGE 3: FILTER BY TYPE ─────────────────── */}
          {/* Round pill style, FIXED (wrapped, not scrollable) */}
          {/* Always shown as long as filter types exist in DB  */}
          {filterTypes.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase',
                letterSpacing: '2px', marginBottom: '7px', fontWeight: 700,
              }}>
                FILTER BY TYPE
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                    transition: 'all .15s', userSelect: 'none',
                  }}>
                  💎 All
                </div>
                {relevantFilterTypes.filter(ft => ft.slug !== 'all').map(ft => {
                  const isOn = selFilterType?.id === ft.id;
                  return (
                    <div key={ft.id}
                      onClick={() => setSelFilterType(isOn ? null : ft)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                        background: isOn ? 'rgba(255,215,0,.1)' : 'rgba(0,0,0,.2)',
                        border: `1.5px solid ${isOn ? '#ffd700' : 'var(--br)'}`,
                        fontSize: '10px', fontWeight: isOn ? 800 : 600,
                        color: isOn ? 'var(--gold)' : 'var(--text3)',
                        transition: 'all .15s', userSelect: 'none',
                      }}>
                      {ft.icon} {ft.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PRICE SORT + COUNT + CLEAR ───────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: '12px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>
              💰 Price:
            </span>
            {[
              { val: '',     label: 'Default'    },
              { val: 'low',  label: 'Low → High' },
              { val: 'high', label: 'High → Low' },
            ].map(opt => {
              const isOn = priceSort === opt.val;
              return (
                <div
                  key={opt.val}
                  onClick={() => setPriceSort(opt.val)}
                  style={{
                    padding: '5px 11px', borderRadius: '16px', cursor: 'pointer',
                    fontSize: '10px', fontWeight: isOn ? 800 : 600,
                    background: isOn ? 'rgba(0,212,255,.12)' : 'rgba(0,0,0,.2)',
                    border: `1.5px solid ${isOn ? 'var(--neon)' : 'var(--br)'}`,
                    color: isOn ? 'var(--neon)' : 'var(--text3)',
                    transition: 'all .15s', userSelect: 'none', flexShrink: 0,
                  }}>
                  {opt.label}
                </div>
              );
            })}
            {anyFilterActive && (
              <>
                <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: 'auto' }}>
                  {filteredLive.length} found
                  {selPlatform    && ` · ${selPlatform.name}`}
                  {selServiceType && ` · ${selServiceType.name}`}
                  {selFilterType  && ` · ${selFilterType.name}`}
                </span>
                <button
                  className="btn bgh bsm"
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
        </div>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* LOADING STATE                                     */}
      {/* ════════════════════════════════════════════════ */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
          Loading services...
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════ */}
          {/* FEATURED TAB                                 */}
          {/* No platform/service/type filters here        */}
          {/* Only search bar is respected                 */}
          {/* Compact 2-col grid + lazy load               */}
          {/* ════════════════════════════════════════════ */}
          {activeTab === 'featured' && (
            <>
              {featuredServices.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '10px',
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                    ⭐ <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Featured Services</span>
                    &nbsp;—&nbsp;Handpicked by admin
                  </div>
                  {search.trim() && (
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                      {filteredFeatured.length} found
                    </div>
                  )}
                </div>
              )}

              {filteredFeatured.length === 0 ? (
                <div className="empty">
                  <span className="empty-ic">⭐</span>
                  <div className="empty-tx">No featured services</div>
                  <div className="empty-sb">
                    {search.trim()
                      ? 'No featured services match your search'
                      : 'Admin has not featured any services yet'}
                  </div>
                </div>
              ) : (
                <>
                  {/* Compact 2-col featured grid */}
                  <div className="mkt-grid-featured">
                    {visibleFeatured.map(s => (
                      <ServiceCard key={s.id} s={s} compact={true} />
                    ))}
                  </div>

                  {/* Lazy load sentinel for featured */}
                  {hasMoreFeatured && (
                    <div
                      ref={featuredLoaderRef}
                      style={{
                        display: 'flex', justifyContent: 'center',
                        alignItems: 'center', padding: '24px',
                        gap: '10px', color: 'var(--text3)', fontSize: '12px',
                      }}>
                      <div style={{
                        width: '16px', height: '16px', borderRadius: '50%',
                        border: '2px solid var(--gold)', borderTopColor: 'transparent',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      Loading more...
                    </div>
                  )}

                  {!hasMoreFeatured && filteredFeatured.length > PAGE_SIZE && (
                    <div style={{
                      textAlign: 'center', padding: '16px',
                      color: 'var(--text3)', fontSize: '11px',
                    }}>
                      ✅ All {filteredFeatured.length.toLocaleString()} featured services loaded
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════ */}
          {/* LIVE SERVICES TAB                            */}
          {/* All 3-stage filters + price sort apply here  */}
          {/* Infinite scroll: 20 shown → loads more       */}
          {/* ════════════════════════════════════════════ */}
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
                    <button
                      className="btn bgh bsm"
                      style={{ marginTop: '12px' }}
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
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '10px' }}>
                    Showing {Math.min(visibleCount, filteredLive.length).toLocaleString()} of {filteredLive.length.toLocaleString()} services
                  </div>

                  <div className="mkt-grid">
                    {visibleLive.map(s => <ServiceCard key={s.id} s={s} />)}
                  </div>

                  {hasMoreLive && (
                    <div
                      ref={loaderRef}
                      style={{
                        display: 'flex', justifyContent: 'center',
                        alignItems: 'center', padding: '24px',
                        gap: '10px', color: 'var(--text3)', fontSize: '12px',
                      }}>
                      <div style={{
                        width: '16px', height: '16px', borderRadius: '50%',
                        border: '2px solid var(--neon)', borderTopColor: 'transparent',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      Loading more...
                    </div>
                  )}

                  {!hasMoreLive && filteredLive.length > PAGE_SIZE && (
                    <div style={{
                      textAlign: 'center', padding: '16px',
                      color: 'var(--text3)', fontSize: '11px',
                    }}>
                      ✅ All {filteredLive.length.toLocaleString()} services loaded
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ORDER MODAL                                       */}
      {/* ════════════════════════════════════════════════ */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div
            className="mbox"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '500px', width: '100%' }}>

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: '12px', marginBottom: '14px',
            }}>
              <span style={{ fontSize: '26px' }}>{ic(selected.platform)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 800, fontSize: '13px',
                  color: 'var(--text)', lineHeight: 1.3,
                }}>
                  {selected.name}
                </div>
                <div style={{
                  fontSize: '10px', color: cl(selected.platform),
                  textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px',
                }}>
                  {selected.platform}
                  {selected.provider_api_url && (
                    <span style={{ color: 'var(--green)', marginLeft: '6px' }}>
                      ⚡ Auto-delivery
                    </span>
                  )}
                  {customPrices[selected.id] && (
                    <span style={{ color: 'var(--neon)', marginLeft: '6px' }}>
                      ✦ Special Price
                    </span>
                  )}
                </div>
                {selected.provider_service_id && (
                  <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                    Service ID:&nbsp;
                    <span style={{
                      color: 'var(--neon)', fontFamily: 'monospace',
                      background: 'rgba(0,212,255,.08)',
                      borderRadius: '3px', padding: '1px 5px',
                    }}>
                      {selected.provider_service_id}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text3)',
                  cursor: 'pointer', fontSize: '22px', flexShrink: 0,
                }}>×</button>
            </div>

            {/* Service Description */}
            {selected.description && selected.description.trim() && (
              <div style={{
                padding: '10px 13px', borderRadius: '8px', marginBottom: '14px',
                background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.2)',
              }}>
                <div style={{
                  fontSize: '9px', color: 'var(--neon)', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px',
                }}>
                  📄 Service Description
                </div>
                <div style={{
                  fontSize: '12px', color: 'var(--text2)',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {selected.description}
                </div>
              </div>
            )}

            {/* Order placed success */}
            {ordered ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                <div style={{
                  color: 'var(--green)', fontWeight: 700,
                  fontSize: '15px', marginBottom: '6px',
                }}>
                  Order Placed!
                </div>
                <div style={{ color: 'var(--text3)', fontSize: '12px' }}>
                  Processing automatically...
                </div>
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
                  <input
                    className="inp"
                    type="number"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty}
                    max={selected.max_qty}
                  />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '14px', padding: '10px 13px', borderRadius: '8px',
                  background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Total Cost</span>
                  <span style={{
                    fontFamily: 'var(--fm)', fontSize: '18px',
                    fontWeight: 700, color: 'var(--gold)',
                  }}>
                    {format(parseFloat(cost))}
                  </span>
                </div>
                {orderError && (
                  <div style={{
                    background: 'rgba(255,50,80,.08)', border: '1px solid rgba(255,50,80,.2)',
                    borderRadius: '7px', padding: '10px', color: '#ff6b6b',
                    fontSize: '12px', marginBottom: '12px',
                  }}>
                    {orderError}
                  </div>
                )}
                <button
                  className="btn bp blg bw"
                  onClick={placeOrder}
                  disabled={ordering}>
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

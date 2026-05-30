import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const PLATFORMS = [
  { id: 'all',       label: 'Everything', icon: '🌐',  color: '#00d4ff' },
  { id: 'instagram', label: 'Instagram',  icon: '📸',  color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',   icon: '👍',  color: '#1877F2' },
  { id: 'youtube',   label: 'YouTube',    icon: '▶️',  color: '#FF0000' },
  { id: 'twitter',   label: 'Twitter',    icon: '🐦',  color: '#1DA1F2' },
  { id: 'spotify',   label: 'Spotify',    icon: '🎵',  color: '#1DB954' },
  { id: 'tiktok',    label: 'TikTok',     icon: '🎵',  color: '#00d4ff' },
  { id: 'linkedin',  label: 'LinkedIn',   icon: '💼',  color: '#0077B5' },
  { id: 'google',    label: 'Google',     icon: '🔍',  color: '#4285F4' },
  { id: 'whatsapp',  label: 'WhatsApp',   icon: '💬',  color: '#25D366' },
  { id: 'telegram',  label: 'Telegram',   icon: '✈️',  color: '#0088cc' },
  { id: 'website',   label: 'Website',    icon: '🌐',  color: '#7b2fff' },
  { id: 'discord',   label: 'Discord',    icon: '🎮',  color: '#5865F2' },
  { id: 'snapchat',  label: 'Snapchat',   icon: '👻',  color: '#FFFC00' },
  { id: 'threads',   label: 'Threads',    icon: '🧵',  color: '#aaa' },
  { id: 'twitch',    label: 'Twitch',     icon: '🟣',  color: '#9146FF' },
  { id: 'capcut',    label: 'CapCut',     icon: '🎬',  color: '#aaa' },
  { id: 'custom',    label: 'Other',      icon: '⚙️',  color: '#888' },
];
const platformMap = {};
PLATFORMS.forEach(p => { platformMap[p.id] = p; });

const PAGE_SIZE = 15;

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();

  // Featured
  const [featuredServices, setFeaturedServices] = useState([]);
  const [featuredLoading, setFeaturedLoading]   = useState(true);

  // Live / paginated
  const [lsServices, setLsServices] = useState([]);
  const [lsPage, setLsPage]         = useState(1);
  const [lsLoading, setLsLoading]   = useState(false);
  const [lsHasMore, setLsHasMore]   = useState(true);
  const [lsTotal, setLsTotal]       = useState(0);

  // All services for category/service dropdowns
  const [allForDropdown, setAllForDropdown] = useState([]);

  // Filters
  const [tab, setTab]             = useState('featured');
  const [platform, setPlatform]   = useState('all');
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [priceSort, setPriceSort] = useState('');

  // Order modal
  const [selected, setSelected]     = useState(null);
  const [link, setLink]             = useState('');
  const [qty, setQty]               = useState('');
  const [ordering, setOrdering]     = useState(false);
  const [ordered, setOrdered]       = useState(false);
  const [orderError, setOrderError] = useState('');

  const sentinelRef   = useRef(null);
  const searchTimeout = useRef(null);

  // ─── Load featured ────────────────────────────────────────
  useEffect(() => {
    supabase.from('services').select('*')
      .eq('is_active', true).eq('is_featured', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setFeaturedServices(data); setFeaturedLoading(false); });
  }, []);

  // ─── Load all service names for category/service dropdowns ─
  useEffect(() => {
    supabase.from('services').select('id,name,category,platform')
      .eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setAllForDropdown(data); });
  }, []);

  // ─── Derived: unique categories for selected platform ─────
  const categories = [...new Set(
    allForDropdown
      .filter(s => platform === 'all' || s.platform === platform)
      .map(s => s.category)
      .filter(Boolean)
  )].sort();

  // ─── Derived: services for selected category ──────────────
  const categoryServices = allForDropdown.filter(s =>
    (platform === 'all' || s.platform === platform) &&
    (!category || s.category === category)
  );

  // ─── Load live page ───────────────────────────────────────
  const loadLivePage = useCallback(async (pageNum, reset = false, pf = 'all', cat = '', svcId = '', sort = '') => {
    setLsLoading(true);
    const from = (pageNum - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    let query = supabase.from('services').select('*', { count: 'exact' })
      .eq('is_active', true)
      .range(from, to);
    // Server-side price sort
    if (sort === 'asc') query = query.order('price_per_1k', { ascending: true });
    else if (sort === 'desc') query = query.order('price_per_1k', { ascending: false });
    else query = query.order('created_at', { ascending: false });
    if (pf && pf !== 'all') query = query.eq('platform', pf);
    if (cat) query = query.eq('category', cat);
    if (svcId) query = query.eq('id', svcId);
    const { data, count } = await query;
    if (data) {
      setLsServices(prev => reset ? data : [...prev, ...data]);
      setLsHasMore(data.length === PAGE_SIZE);
      if (count !== null) setLsTotal(count);
    }
    setLsLoading(false);
  }, []);

  // ─── Infinite scroll ──────────────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && lsHasMore && !lsLoading && !search && !serviceFilter) {
        const next = lsPage + 1;
        setLsPage(next);
        loadLivePage(next, false, platform, category, serviceFilter, priceSort);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [lsHasMore, lsLoading, lsPage, loadLivePage, search, platform, category, serviceFilter]);

  const switchToLive = (pf = platform, cat = category, svc = serviceFilter, sort = priceSort) => {
    setTab('live');
    setLsPage(1); setLsHasMore(true);
    loadLivePage(1, true, pf, cat, svc, sort);
  };

  // ─── Platform click ───────────────────────────────────────
  const handlePlatform = (p) => {
    setPlatform(p);
    setCategory('');
    setServiceFilter('');
    setSearch('');
    switchToLive(p, '', '');
  };

  // ─── Category change ──────────────────────────────────────
  const handleCategory = (cat) => {
    setCategory(cat);
    setServiceFilter('');
    setSearch('');
    switchToLive(platform, cat, '');
  };

  // ─── Service dropdown change ──────────────────────────────
  const handleServiceFilter = (svcId) => {
    setServiceFilter(svcId);
    setSearch('');
    switchToLive(platform, category, svcId);
  };

  // ─── Search ───────────────────────────────────────────────
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    if (val.trim()) {
      searchTimeout.current = setTimeout(async () => {
        setLsLoading(true);
        let query = supabase.from('services').select('*')
          .eq('is_active', true)
          .ilike('name', `%${val.trim()}%`)
          .order('name').limit(100);
        if (platform !== 'all') query = query.eq('platform', platform);
        if (category) query = query.eq('category', category);
        const { data } = await query;
        if (data) { setLsServices(data); setLsHasMore(false); }
        setLsLoading(false);
      }, 400);
    } else {
      setLsPage(1); setLsHasMore(true);
      loadLivePage(1, true, platform, category, serviceFilter);
    }
  };

  // Price sort is server-side — sortedLive is just lsServices
  const sortedLive = lsServices;

  const handlePriceSort = (val) => {
    setPriceSort(val);
    setLsPage(1); setLsHasMore(true);
    loadLivePage(1, true, platform, category, serviceFilter, val);
  };

  // ─── Cost ─────────────────────────────────────────────────
  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  // ─── Place order ──────────────────────────────────────────
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
      order_ref: orderRef, user_id: user.id,
      service_id: selected.id, service_name: selected.name,
      platform: selected.platform, link, quantity: q, cost: totalCost,
      status: 'pending', progress: 0,
      has_refill: selected.has_refill || false,
    });
    if (orderErr) { setOrderError('Order failed: ' + orderErr.message); setOrdering(false); return; }

    await supabase.from('users').update({ balance: user.balance - totalCost }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    // Auto-send to provider
    const providerServiceId = selected.provider_service_id || selected.provider_id;
    if (selected.provider_api_url && selected.provider_api_key && providerServiceId) {
      try {
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: selected.provider_api_url,
            key: selected.provider_api_key,
            action: 'add',
            service: String(providerServiceId),
            link, quantity: String(q),
          }),
        });
        const providerData = await res.json();
        if (providerData?.order) {
          await supabase.from('orders').update({
            vendor_order_id: String(providerData.order),
            status: 'in_progress',
          }).eq('order_ref', orderRef);
        } else if (providerData?.error) {
          await supabase.from('orders').update({
            provider_note: `Provider error: ${providerData.error}`,
          }).eq('order_ref', orderRef);
        } else {
          await supabase.from('orders').update({
            provider_note: `Response: ${JSON.stringify(providerData).slice(0, 200)}`,
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

  const getPf = (id) => platformMap[id] || platformMap['custom'];
  const ic = (id) => getPf(id).icon;
  const cl = (id) => getPf(id).color;

  const ServiceCard = ({ s }) => (
    <div className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
      onClick={() => { setSelected(s); setLink(''); setQty(s.min_qty); setOrderError(''); }}>
      {s.is_featured && (
        <div style={{
          position:'absolute', top:'-1px', right:'10px',
          background:'linear-gradient(135deg,var(--gold2),var(--gold))',
          color:'#000', fontSize:'8px', fontWeight:800, padding:'3px 8px',
          borderRadius:'0 0 6px 6px', letterSpacing:'1px', fontFamily:'var(--fd)'
        }}>⭐ FEATURED</div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
        <span style={{ fontSize:'22px' }}>{ic(s.platform)}</span>
        <span style={{
          fontSize:'9px', padding:'2px 7px', borderRadius:'10px', fontWeight:700,
          background:`${cl(s.platform)}18`, color:cl(s.platform),
          border:`1px solid ${cl(s.platform)}30`, textTransform:'uppercase', letterSpacing:'1px'
        }}>{s.platform}</span>
      </div>
      <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'4px', color:'var(--text)' }}>{s.name}</div>
      <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'12px', flex:1, lineHeight:1.5 }}>{s.description}</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto' }}>
        <div>
          <div style={{ fontFamily:'var(--fm)', fontSize:'15px', fontWeight:700, color:'var(--gold)' }}>
            {format(parseFloat(s.price_per_1k))}
          </div>
          <div style={{ fontSize:'9px', color:'var(--text3)' }}>per 1,000</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'9px', color:'var(--text3)' }}>Min: {(s.min_qty||0).toLocaleString()}</div>
          <div style={{ fontSize:'9px', color:'var(--text3)' }}>Max: {(s.max_qty||0).toLocaleString()}</div>
        </div>
      </div>
      <button className="btn bp bsm bw" style={{ marginTop:'12px' }}>Order Now →</button>
    </div>
  );

  return (
    <div>
      {/* ─── TAB SWITCHER ─── */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        <button onClick={() => setTab('featured')}
          className={tab === 'featured' ? 'btn bp bmd' : 'btn bgh bmd'} style={{ flex:1 }}>
          ⭐ Featured
        </button>
        <button onClick={() => { if (tab !== 'live') switchToLive(); else setTab('live'); }}
          className={tab === 'live' ? 'btn bp bmd' : 'btn bgh bmd'} style={{ flex:1 }}>
          🛒 Live Services {lsTotal > 0 ? `(${lsTotal.toLocaleString()})` : ''}
        </button>
      </div>

      {/* ─── FEATURED TAB ─── */}
      {tab === 'featured' && (
        <>
          {featuredLoading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading...</div>
          ) : featuredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">⭐</span>
              <div className="empty-tx">No featured services yet</div>
            </div>
          ) : (
            <div className="mkt-grid-2col">
              {featuredServices.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </>
      )}

      {/* ─── LIVE SERVICES TAB ─── */}
      {tab === 'live' && (
        <>
          {/* STAGE 1: Platform grid */}
          <div style={{ marginBottom:'16px' }}>
            <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', fontFamily:'var(--fd)', marginBottom:'8px' }}>
              SELECT PLATFORM
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'6px' }}>
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => handlePlatform(p.id)} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  padding:'8px 4px', borderRadius:'10px', cursor:'pointer', transition:'.15s', gap:'4px',
                  border: platform === p.id ? `2px solid ${p.color}` : '1px solid var(--br)',
                  background: platform === p.id ? `${p.color}18` : 'var(--gl)',
                }}>
                  <span style={{ fontSize:'18px', lineHeight:1 }}>{p.icon}</span>
                  <span style={{
                    fontSize:'8px', fontWeight:700, color: platform === p.id ? p.color : 'var(--text3)',
                    letterSpacing:'0.3px', textAlign:'center', lineHeight:1.2,
                    border: `1px solid ${platform === p.id ? p.color : 'var(--br)'}`,
                    padding:'1px 4px', borderRadius:'20px',
                    background: platform === p.id ? `${p.color}20` : 'transparent',
                  }}>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* STAGE 2: Category dropdown */}
          {categories.length > 0 && (
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', fontFamily:'var(--fd)', marginBottom:'6px' }}>
                CATEGORY
              </div>
              <select className="sel" style={{ width:'100%', fontSize:'14px' }}
                value={category} onChange={e => handleCategory(e.target.value)}>
                <option value="">✦ All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* STAGE 3: Service dropdown */}
          {category && categoryServices.length > 0 && (
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', fontFamily:'var(--fd)', marginBottom:'6px' }}>
                SERVICE
              </div>
              <select className="sel" style={{ width:'100%', fontSize:'14px' }}
                value={serviceFilter} onChange={e => handleServiceFilter(e.target.value)}>
                <option value="">✦ All Services in Category</option>
                {categoryServices.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Search + price sort */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <input className="srch-inp" style={{ flex:1, minWidth:'140px', fontSize:'16px' }}
              placeholder="🔍 Search services..."
              value={search} onChange={e => handleSearch(e.target.value)} />
            <select className="sel" style={{ minWidth:'130px', flexShrink:0, fontSize:'14px' }}
              value={priceSort} onChange={e => handlePriceSort(e.target.value)}>
              <option value="">💰 Price: Default</option>
              <option value="asc">💰 Low → High</option>
              <option value="desc">💰 High → Low</option>
            </select>
          </div>

          {/* Service grid */}
          {lsLoading && lsServices.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading services...</div>
          ) : sortedLive.length === 0 && !lsLoading ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">No services found</div>
              <div className="empty-sb">Try a different platform or category</div>
            </div>
          ) : (
            <>
              <div className="mkt-grid">
                {sortedLive.map(s => <ServiceCard key={s.id} s={s} />)}
              </div>
              <div ref={sentinelRef} style={{ height:'40px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {lsLoading && lsServices.length > 0 && (
                  <div style={{ width:'20px', height:'20px', border:'2px solid var(--br)', borderTopColor:'var(--neon)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── ORDER MODAL ─── */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
              <span style={{ fontSize:'28px' }}>{ic(selected.platform)}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:'15px', color:'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize:'10px', color:cl(selected.platform), textTransform:'uppercase', letterSpacing:'1px' }}>
                  {selected.platform}
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:'22px' }}>×</button>
            </div>
            {ordered ? (
              <div style={{ textAlign:'center', padding:'30px 0' }}>
                <div style={{ fontSize:'40px', marginBottom:'12px' }}>✅</div>
                <div style={{ color:'var(--green)', fontWeight:700, fontSize:'15px', marginBottom:'6px' }}>Order Placed!</div>
                <div style={{ color:'var(--text3)', fontSize:'12px' }}>Processing automatically...</div>
              </div>
            ) : (
              <>
                <div className="fi">
                  <label className="fl">Your Link / Username</label>
                  <input className="inp" value={link} onChange={e => setLink(e.target.value)}
                    placeholder="https://..." style={{ fontSize:'16px' }} />
                </div>
                <div className="fi">
                  <label className="fl">Quantity ({(selected.min_qty||0).toLocaleString()} – {(selected.max_qty||0).toLocaleString()})</label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty} max={selected.max_qty} style={{ fontSize:'16px' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', padding:'10px 13px', borderRadius:'8px', background:'rgba(0,0,0,.3)', border:'1px solid var(--br)' }}>
                  <span style={{ fontSize:'11px', color:'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily:'var(--fm)', fontSize:'18px', fontWeight:700, color:'var(--gold)' }}>
                    {format(parseFloat(cost))}
                  </span>
                </div>
                {orderError && (
                  <div style={{ background:'rgba(255,50,80,.08)', border:'1px solid rgba(255,50,80,.2)', borderRadius:'7px', padding:'10px', color:'#ff6b6b', fontSize:'12px', marginBottom:'12px' }}>
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

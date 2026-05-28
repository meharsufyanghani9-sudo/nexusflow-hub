import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const platformIcons = {
  instagram:'📸', tiktok:'🎵', youtube:'▶️', twitter:'🐦',
  facebook:'👍', telegram:'✈️', snapchat:'👻', linkedin:'💼',
  spotify:'🎶', discord:'🎮', twitch:'🟣', whatsapp:'💬',
  custom:'⚙️'
};
const platformColors = {
  instagram:'#E1306C', tiktok:'#00d4ff', youtube:'#FF0000',
  twitter:'#1DA1F2', facebook:'#1877F2', telegram:'#0088cc',
  snapchat:'#FFFC00', linkedin:'#0077B5', whatsapp:'#25D366',
  custom:'#7b2fff'
};

const PAGE_SIZE = 15;

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();

  // ─── Services state ───────────────────────────────────────
  const [allServices, setAllServices]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [lsPage, setLsPage]             = useState(1);
  const [lsLoading, setLsLoading]       = useState(false);
  const [lsHasMore, setLsHasMore]       = useState(true);
  const [lsServices, setLsServices]     = useState([]);

  const sentinelRef = useRef(null); // for infinite scroll
  const searchTimeout = useRef(null);

  // ─── Filter state ─────────────────────────────────────────
  const [adminFilters, setAdminFilters] = useState([]);   // from service_filters table
  const [stage1, setStage1]             = useState('');   // platform
  const [stage2, setStage2]             = useState('');   // service type (filter id)
  const [stage3, setStage3]             = useState('');   // quality tag (filter id)
  const [search, setSearch]             = useState('');
  const [priceSort, setPriceSort]       = useState('');   // 'asc' | 'desc' | ''
  const [liveTab, setLiveTab]           = useState('featured'); // 'featured' | 'live'

  // ─── Order modal ──────────────────────────────────────────
  const [selected, setSelected]         = useState(null);
  const [link, setLink]                 = useState('');
  const [qty, setQty]                   = useState('');
  const [ordering, setOrdering]         = useState(false);
  const [ordered, setOrdered]           = useState(false);
  const [orderError, setOrderError]     = useState('');

  // ─── Load admin-defined filters ──────────────────────────
  useEffect(() => {
    supabase.from('service_filters')
      .select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => { if (data) setAdminFilters(data); });
  }, []);

  // ─── Load featured / all services ─────────────────────────
  useEffect(() => {
    loadFeatured();
  }, []);

  const loadFeatured = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('services').select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false });
    if (data) setAllServices(data);
    setLoading(false);
  };

  // ─── Paginated live services loader ───────────────────────
  const loadLivePage = useCallback(async (pageNum, reset = false) => {
    setLsLoading(true);
    const from = (pageNum - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('services').select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (data) {
      setLsServices(prev => reset ? data : [...prev, ...data]);
      setLsHasMore(data.length === PAGE_SIZE);
    }
    setLsLoading(false);
  }, []);

  // ─── Infinite scroll observer ────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && lsHasMore && !lsLoading && !search && !stage1 && !stage2 && !stage3) {
          const next = lsPage + 1;
          setLsPage(next);
          loadLivePage(next);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [lsHasMore, lsLoading, lsPage, loadLivePage, search, stage1, stage2, stage3]);

  const handleTabSwitch = (tab) => {
    setLiveTab(tab);
    if (tab === 'live' && lsServices.length === 0) {
      loadLivePage(1, true);
    }
  };

  // ─── Filter live services in-memory ───────────────────────
  const filterServiceIds = (filterCategory) => {
    // returns set of service IDs that match a filter's service_ids list
    const f = adminFilters.find(f => f.id === filterCategory);
    if (!f || !f.service_ids || f.service_ids.length === 0) return null;
    return new Set(f.service_ids.map(String));
  };

  const filteredLive = lsServices.filter(s => {
    if (stage1 && s.platform !== stage1) return false;
    if (stage2) {
      const ids = filterServiceIds(stage2);
      if (ids && !ids.has(String(s.id))) return false;
    }
    if (stage3) {
      const ids = filterServiceIds(stage3);
      if (ids && !ids.has(String(s.id))) return false;
    }
    // search is handled server-side — skip local filter
    return true;
  });

  const sortedLive = priceSort
    ? [...filteredLive].sort((a, b) =>
        priceSort === 'asc'
          ? parseFloat(a.price_per_1k) - parseFloat(b.price_per_1k)
          : parseFloat(b.price_per_1k) - parseFloat(a.price_per_1k)
      )
    : filteredLive;

  // ─── Derive filter groups ─────────────────────────────────
  // We expect admin to tag filters with a "filter_type": 'platform'|'service_type'|'quality'
  // Fall back: derive platforms from live services
  const platforms = [...new Set(lsServices.map(s => s.platform).filter(Boolean))];

  const stage2Filters = adminFilters.filter(f => f.filter_type === 'service_type');
  const stage3Filters = adminFilters.filter(f => f.filter_type === 'quality');

  // ─── Cost calc ────────────────────────────────────────────
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
    });
    if (orderErr) { setOrderError('Order failed: ' + orderErr.message); setOrdering(false); return; }

    await supabase.from('users').update({ balance: user.balance - totalCost }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    // Auto-send to provider API via Supabase Edge Function (handles CORS)
    const providerServiceId = selected.provider_service_id || selected.provider_id;
    if (selected.provider_api_url && selected.provider_api_key && providerServiceId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(
          `https://ctbfovtqjwrxbepccthw.supabase.co/functions/v1/place-order`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              provider_url: selected.provider_api_url,
              provider_key: selected.provider_api_key,
              service_id: providerServiceId,
              link,
              quantity: q,
              order_ref: orderRef,
            }),
          }
        );
        const providerData = await res.json();
        console.log('Provider response:', providerData);
        if (providerData?.order) {
          await supabase.from('orders').update({
            vendor_order_id: String(providerData.order),
            status: 'in_progress',
          }).eq('order_ref', orderRef);
        } else if (providerData?.error) {
          await supabase.from('orders').update({
            provider_note: `Provider error: ${providerData.error}`,
            status: 'pending',
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

  const ServiceCard = ({ s }) => (
    <div
      className={`mkt-card ${s.is_featured ? 'mkt-featured' : ''}`}
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

  const FilterChip = ({ active, onClick, children, color }) => (
    <button onClick={onClick} style={{
      padding:'6px 12px', borderRadius:'20px', cursor:'pointer',
      fontSize:'11px', fontWeight:700, letterSpacing:'0.5px', transition:'.15s',
      background: active ? (color || 'var(--neon)') : 'var(--gl)',
      color: active ? '#000' : 'var(--text2)',
      border: active ? 'none' : '1px solid var(--br)',
      whiteSpace:'nowrap', flexShrink:0,
    }}>{children}</button>
  );

  return (
    <div>
      {/* ─── TAB SWITCHER ─── */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
        <button
          onClick={() => setLiveTab('featured')}
          className={liveTab === 'featured' ? 'btn bp bmd' : 'btn bgh bmd'}
          style={{ flex:1 }}>
          ⭐ Featured
        </button>
        <button
          onClick={() => handleTabSwitch('live')}
          className={liveTab === 'live' ? 'btn bp bmd' : 'btn bgh bmd'}
          style={{ flex:1 }}>
          🛒 Live Services {lsServices.length > 0 ? `(${lsServices.length}+)` : ''}
        </button>
      </div>

      {/* ─── FEATURED TAB ─── */}
      {liveTab === 'featured' && (
        <>
          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>
              <div style={{ fontSize:'28px', marginBottom:'10px' }}>⏳</div>Loading...
            </div>
          ) : allServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">⭐</span>
              <div className="empty-tx">No featured services yet</div>
              <div className="empty-sb">Admin hasn't featured any services</div>
            </div>
          ) : (
            <div className="mkt-grid-2col">
              {allServices.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </>
      )}

      {/* ─── LIVE SERVICES TAB ─── */}
      {liveTab === 'live' && (
        <>
          {/* STAGE 1: Platform */}
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'10px', color:'var(--text3)', fontFamily:'var(--fd)', letterSpacing:'2px', marginBottom:'8px' }}>
              PLATFORM
            </div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              <FilterChip active={stage1===''} onClick={() => { setStage1(''); setStage2(''); setStage3(''); }}>
                🌐 All
              </FilterChip>
              {platforms.map(p => (
                <FilterChip key={p} active={stage1===p} onClick={() => { setStage1(p); setStage2(''); setStage3(''); }} color={cl(p)}>
                  {ic(p)} {p.charAt(0).toUpperCase()+p.slice(1)}
                </FilterChip>
              ))}
            </div>
          </div>

          {/* STAGE 2: Service Type (admin-defined) */}
          {stage2Filters.length > 0 && (
            <div style={{ marginBottom:'12px' }}>
              <div style={{ fontSize:'10px', color:'var(--text3)', fontFamily:'var(--fd)', letterSpacing:'2px', marginBottom:'8px' }}>
                SERVICE TYPE
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                <FilterChip active={stage2===''} onClick={() => { setStage2(''); setStage3(''); }}>
                  All Types
                </FilterChip>
                {stage2Filters.map(f => (
                  <FilterChip key={f.id} active={stage2===f.id} onClick={() => { setStage2(f.id); setStage3(''); }}
                    color={f.color}>
                    {f.icon} {f.name}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          {/* STAGE 3: Quality (admin-defined) */}
          {stage3Filters.length > 0 && (
            <div style={{ marginBottom:'12px' }}>
              <div style={{ fontSize:'10px', color:'var(--text3)', fontFamily:'var(--fd)', letterSpacing:'2px', marginBottom:'8px' }}>
                QUALITY / TYPE
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                <FilterChip active={stage3===''} onClick={() => setStage3('')}>
                  All Quality
                </FilterChip>
                {stage3Filters.map(f => (
                  <FilterChip key={f.id} active={stage3===f.id} onClick={() => setStage3(f.id)}
                    color={f.color}>
                    {f.icon} {f.name}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          {/* SEARCH + PRICE SORT */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <input className="srch-inp" style={{ flex:1, minWidth:'140px' }}
              placeholder="🔍 Search services..."
              value={search} onChange={e => {
                const val = e.target.value;
                setSearch(val);
                // debounce: search all services server-side after 400ms
                clearTimeout(searchTimeout.current);
                if (val.trim()) {
                  searchTimeout.current = setTimeout(async () => {
                    setLsLoading(true);
                    const { data } = await supabase
                      .from('services').select('*')
                      .eq('is_active', true)
                      .ilike('name', `%${val.trim()}%`)
                      .order('name')
                      .limit(100);
                    if (data) {
                      setLsServices(data);
                      setLsHasMore(false); // disable infinite scroll during search
                    }
                    setLsLoading(false);
                  }, 400);
                } else {
                  // cleared search — reload normal paginated list
                  setLsPage(1);
                  setLsHasMore(true);
                  loadLivePage(1, true);
                }
              }} />
            <select className="sel" style={{ minWidth:'140px', flexShrink:0 }}
              value={priceSort} onChange={e => setPriceSort(e.target.value)}>
              <option value="">💰 Price: Default</option>
              <option value="asc">💰 Price: Low → High</option>
              <option value="desc">💰 Price: High → Low</option>
            </select>
          </div>

          {/* SERVICE GRID */}
          {lsLoading && lsServices.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>
              <div style={{ fontSize:'28px', marginBottom:'10px' }}>⏳</div>Loading services...
            </div>
          ) : sortedLive.length === 0 && !lsLoading ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">No services found</div>
              <div className="empty-sb">Try clearing filters or searching differently</div>
            </div>
          ) : (
            <>
              <div className="mkt-grid">
                {sortedLive.map(s => <ServiceCard key={s.id} s={s} />)}
              </div>

              {/* INFINITE SCROLL SENTINEL */}
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
              <div>
                <div style={{ fontWeight:800, fontSize:'15px', color:'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize:'10px', color:cl(selected.platform), textTransform:'uppercase', letterSpacing:'1px' }}>
                  {selected.platform}
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:'22px' }}>×</button>
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
                  <input className="inp" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
                </div>
                <div className="fi">
                  <label className="fl">Quantity ({(selected.min_qty||0).toLocaleString()} – {(selected.max_qty||0).toLocaleString()})</label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty} max={selected.max_qty} />
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

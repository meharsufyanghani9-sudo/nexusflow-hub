import React, { useState, useEffect, useRef, useCallback } from 'react';
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

const PAGE_SIZE = 15;

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();

  // Featured
  const [featuredServices, setFeaturedServices] = useState([]);
  const [featuredLoading, setFeaturedLoading]   = useState(true);

  // Live / paginated
  const [lsServices, setLsServices]   = useState([]);
  const [lsPage, setLsPage]           = useState(1);
  const [lsLoading, setLsLoading]     = useState(false);
  const [lsHasMore, setLsHasMore]     = useState(true);
  const [lsTotal, setLsTotal]         = useState(0);

  // UI
  const [tab, setTab]         = useState('featured');
  const [search, setSearch]   = useState('');
  const [platform, setPlatform] = useState('');
  const [priceSort, setPriceSort] = useState('');

  // Order modal
  const [selected, setSelected]   = useState(null);
  const [link, setLink]           = useState('');
  const [qty, setQty]             = useState('');
  const [ordering, setOrdering]   = useState(false);
  const [ordered, setOrdered]     = useState(false);
  const [orderError, setOrderError] = useState('');

  const sentinelRef  = useRef(null);
  const searchTimeout = useRef(null);

  // ─── Load featured ────────────────────────────────────────
  useEffect(() => {
    supabase.from('services').select('*')
      .eq('is_active', true).eq('is_featured', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setFeaturedServices(data); setFeaturedLoading(false); });
  }, []);

  // ─── Load live page ───────────────────────────────────────
  const loadLivePage = useCallback(async (pageNum, reset = false) => {
    setLsLoading(true);
    const from = (pageNum - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('services').select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (data) {
      setLsServices(prev => reset ? data : [...prev, ...data]);
      setLsHasMore(data.length === PAGE_SIZE);
      if (count !== null) setLsTotal(count);
    }
    setLsLoading(false);
  }, []);

  // ─── Infinite scroll observer ─────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && lsHasMore && !lsLoading && !search) {
        const next = lsPage + 1;
        setLsPage(next);
        loadLivePage(next);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [lsHasMore, lsLoading, lsPage, loadLivePage, search]);

  const handleTabSwitch = (t) => {
    setTab(t);
    if (t === 'live' && lsServices.length === 0) loadLivePage(1, true);
  };

  // ─── Server-side search ───────────────────────────────────
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    if (val.trim()) {
      searchTimeout.current = setTimeout(async () => {
        setLsLoading(true);
        const { data } = await supabase
          .from('services').select('*')
          .eq('is_active', true)
          .ilike('name', `%${val.trim()}%`)
          .order('name').limit(100);
        if (data) { setLsServices(data); setLsHasMore(false); }
        setLsLoading(false);
      }, 400);
    } else {
      setLsPage(1); setLsHasMore(true);
      loadLivePage(1, true);
    }
  };

  // ─── Filtered + sorted live list ─────────────────────────
  const filteredLive = lsServices.filter(s => {
    if (platform && s.platform !== platform) return false;
    return true;
  });
  const sortedLive = priceSort
    ? [...filteredLive].sort((a, b) =>
        priceSort === 'asc'
          ? parseFloat(a.price_per_1k) - parseFloat(b.price_per_1k)
          : parseFloat(b.price_per_1k) - parseFloat(a.price_per_1k))
    : filteredLive;

  const availablePlatforms = [...new Set(lsServices.map(s => s.platform))].filter(Boolean);

  // ─── Cost ────────────────────────────────────────────────
  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  // ─── Place order ─────────────────────────────────────────
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

    // ─── Auto-send to provider via Vercel /api/proxy ─────
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
            link,
            quantity: String(q),
          }),
        });
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

  const ic = (p) => platformIcons[p] || '⚙️';
  const cl = (p) => platformColors[p] || '#7b2fff';

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
      <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
        <button onClick={() => setTab('featured')}
          className={tab === 'featured' ? 'btn bp bmd' : 'btn bgh bmd'} style={{ flex:1 }}>
          ⭐ Featured
        </button>
        <button onClick={() => handleTabSwitch('live')}
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
              <div className="empty-sb">Admin hasn't featured any services</div>
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
          {/* Filters */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <input
              className="srch-inp" style={{ flex:1, minWidth:'140px', fontSize:'16px' }}
              placeholder="🔍 Search services..."
              value={search} onChange={e => handleSearch(e.target.value)} />
            <select className="sel" style={{ minWidth:'130px', flexShrink:0 }}
              value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="">🌐 All Platforms</option>
              {availablePlatforms.map(p => (
                <option key={p} value={p}>{ic(p)} {p}</option>
              ))}
            </select>
            <select className="sel" style={{ minWidth:'130px', flexShrink:0 }}
              value={priceSort} onChange={e => setPriceSort(e.target.value)}>
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
              <div className="empty-sb">Try a different search or filter</div>
            </div>
          ) : (
            <>
              <div className="mkt-grid">
                {sortedLive.map(s => <ServiceCard key={s.id} s={s} />)}
              </div>
              {/* Infinite scroll sentinel */}
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
                  <input className="inp" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." style={{ fontSize:'16px' }} />
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

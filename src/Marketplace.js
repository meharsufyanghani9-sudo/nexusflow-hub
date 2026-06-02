import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

// ─── Platform config ──────────────────────────────────────────────────────────
const platformIcons = {
  instagram:'📸', tiktok:'🎵', youtube:'▶️', twitter:'🐦',
  facebook:'👤', telegram:'✈️', snapchat:'👻', linkedin:'💼',
  spotify:'🎵', discord:'🎮', twitch:'🎮', google:'🔍',
  whatsapp:'💬', website:'🌐', threads:'🧵', capcut:'🎬',
  custom:'⚙️', other:'⚙️',
};
const platformColors = {
  instagram:'#E1306C', tiktok:'#00d4ff', youtube:'#FF0000',
  twitter:'#1DA1F2', facebook:'#1877F2', telegram:'#0088cc',
  snapchat:'#FFFC00', linkedin:'#0077B5', custom:'#7b2fff',
  google:'#4285F4', whatsapp:'#25D366', website:'#7b2fff',
  discord:'#5865F2', threads:'#000', twitch:'#9146FF', capcut:'#000',
};

// ─── Service type tags (for filter badges) ────────────────────────────────────
const TYPE_TAGS = [
  { id:'all',         label:'✦ All',              match: () => true },
  { id:'guaranteed',  label:'✅ Guaranteed',       match: s => /guaranteed|lifetime/i.test(s.name+s.description) },
  { id:'nondrop',     label:'💎 Non-Drop',         match: s => /non.?drop/i.test(s.name+s.description) },
  { id:'budget',      label:'💰 Budget',           match: s => parseFloat(s.price_per_1k) < 1 },
  { id:'refill',      label:'🔄 With Refill',      match: s => /refill/i.test(s.name+s.description) },
  { id:'norefill',    label:'🚫 No Refill',        match: s => /no refill/i.test(s.name+s.description) },
  { id:'fast',        label:'⚡ Fast Delivery',    match: s => /start: 0/i.test(s.name+s.description) },
  { id:'lifetime',    label:'♾ Lifetime',          match: s => /lifetime/i.test(s.name+s.description) },
];

const SERVICE_CATS = ['All','Followers','Likes','Views','Comments','Shares','Subscribers','Saves','Members','Reactions','Traffic'];

const SORT_OPTIONS = [
  { id:'featured', label:'⭐ Featured First' },
  { id:'low',      label:'💰 Low → High' },
  { id:'high',     label:'💰 High → Low' },
  { id:'new',      label:'🆕 Newest' },
];

const PAGE_SIZE = 20; // load 20 at a time for performance

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();

  // ─── Data state ───────────────────────────────────────────────────────────
  const [allServices,  setAllServices]  = useState([]);
  const [displayed,    setDisplayed]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [totalCount,   setTotalCount]   = useState(0);
  const offsetRef = useRef(0);

  // ─── Filter / sort state ──────────────────────────────────────────────────
  const [activePlatform, setActivePlatform] = useState('');
  const [activeType,     setActiveType]     = useState('all');
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortBy,         setSortBy]         = useState('featured');
  const [search,         setSearch]         = useState('');
  const [showAll,        setShowAll]        = useState(false);

  // ─── Order modal state ────────────────────────────────────────────────────
  const [selected,    setSelected]    = useState(null);
  const [link,        setLink]        = useState('');
  const [qty,         setQty]         = useState('');
  const [ordering,    setOrdering]    = useState(false);
  const [ordered,     setOrdered]     = useState(false);
  const [orderError,  setOrderError]  = useState('');

  // ─── Available platform list (derived from loaded services) ───────────────
  const [platforms, setPlatforms] = useState([]);

  // ─── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => { loadInitial(); }, []);

  const loadInitial = async () => {
    setLoading(true);
    offsetRef.current = 0;

    // Load first page + get total count
    const { data, count } = await supabase
      .from('services')
      .select('id,name,platform,description,price_per_1k,min_qty,max_qty,is_active,is_featured,category,created_at,provider_api_url,provider_api_key,provider_service_id,provider_id', { count: 'exact' })
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (data) {
      setDisplayed(data);
      offsetRef.current = data.length;
      // Extract unique platform list
      const { data: allPlat } = await supabase
        .from('services')
        .select('platform')
        .eq('is_active', true);
      if (allPlat) {
        const unique = [...new Set(allPlat.map(s => s.platform))].filter(Boolean).sort();
        setPlatforms(unique);
      }
    }
    if (count !== null) setTotalCount(count);
    setLoading(false);
  };

  // ─── Load more (infinite scroll / Load More button) ──────────────────────
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from('services')
      .select('id,name,platform,description,price_per_1k,min_qty,max_qty,is_active,is_featured,category,created_at,provider_api_url,provider_api_key,provider_service_id,provider_id')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offsetRef.current, offsetRef.current + PAGE_SIZE - 1);
    if (data && data.length > 0) {
      setDisplayed(prev => [...prev, ...data]);
      offsetRef.current += data.length;
    }
    setLoadingMore(false);
  };

  // ─── Client-side filter + sort on already-loaded services ─────────────────
  const applyFilters = useCallback((services) => {
    let result = [...services];

    // Platform filter
    if (activePlatform) result = result.filter(s => s.platform === activePlatform);

    // Category filter
    if (activeCategory !== 'All') {
      result = result.filter(s =>
        (s.name + (s.description || '') + (s.category || '')).toLowerCase()
          .includes(activeCategory.toLowerCase())
      );
    }

    // Type tag filter
    const typeMatch = TYPE_TAGS.find(t => t.id === activeType);
    if (typeMatch && activeType !== 'all') result = result.filter(typeMatch.match);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === 'low')  result.sort((a,b) => parseFloat(a.price_per_1k) - parseFloat(b.price_per_1k));
    if (sortBy === 'high') result.sort((a,b) => parseFloat(b.price_per_1k) - parseFloat(a.price_per_1k));
    if (sortBy === 'new')  result.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    if (sortBy === 'featured') result.sort((a,b) => (b.is_featured?1:0) - (a.is_featured?1:0));

    return result;
  }, [activePlatform, activeCategory, activeType, search, sortBy]);

  const featuredServices = displayed.filter(s => s.is_featured);
  const filteredAll      = applyFilters(displayed);
  const filteredNonFeatured = filteredAll.filter(s => !s.is_featured);
  const hasMore = offsetRef.current < totalCount;

  // ─── Cost calculation ─────────────────────────────────────────────────────
  const displayCost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.0000';

  // ─── Place Order ──────────────────────────────────────────────────────────
  const placeOrder = async () => {
    setOrderError('');
    if (!link.trim()) { setOrderError('Enter your link or username'); return; }

    // Strict quantity validation
    const rawQty = qty.toString().trim();
    if (!/^\d+$/.test(rawQty)) { setOrderError('Quantity must be a whole number'); return; }
    const q = parseInt(rawQty, 10);
    if (!q || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be between ${selected.min_qty.toLocaleString()} – ${selected.max_qty.toLocaleString()}`);
      return;
    }

    const totalCost = parseFloat((q / 1000 * parseFloat(selected.price_per_1k)).toFixed(4));

    // Read LIVE balance from DB to prevent race condition
    const { data: freshUser } = await supabase
      .from('users').select('balance').eq('id', user.id).single();
    if (!freshUser) { setOrderError('Could not verify balance. Please refresh.'); return; }
    if (totalCost > parseFloat(freshUser.balance || 0)) {
      setOrderError(`Insufficient balance. Need ${format(totalCost)}, have ${format(freshUser.balance)}`);
      return;
    }

    setOrdering(true);
    const orderRef = 'NF-' + Date.now();

    // Deduct balance first
    const { error: balErr } = await supabase
      .from('users')
      .update({ balance: parseFloat(freshUser.balance) - totalCost })
      .eq('id', user.id)
      .gte('balance', totalCost);
    if (balErr) { setOrderError('Balance error. Please retry.'); setOrdering(false); return; }

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
    });

    if (orderErr) {
      // Rollback
      await supabase.from('users').update({ balance: parseFloat(freshUser.balance) }).eq('id', user.id);
      setOrderError('Order failed: ' + orderErr.message + '. Balance restored.');
      setOrdering(false);
      return;
    }

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    // ─── Automatic provider API placement ────────────────────────────────────
    if (selected.provider_api_url && selected.provider_api_key && selected.provider_service_id) {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            url: selected.provider_api_url,
            key: selected.provider_api_key,
            action: 'add',
            service: selected.provider_service_id,
            link: link.trim(),
            quantity: q,
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

  const ic = p => platformIcons[p]  || '⚙️';
  const cl = p => platformColors[p] || '#7b2fff';

  // ─── Service Card ─────────────────────────────────────────────────────────
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

  return (
    <div>
      {/* ─── TOP TABS: Featured | Live Services ─── */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        <button
          onClick={() => setShowAll(false)}
          style={{
            flex:1, padding:'10px', borderRadius:'10px', cursor:'pointer',
            fontFamily:'var(--fd)', fontSize:'13px', fontWeight:800, letterSpacing:'1px',
            border:`1px solid ${!showAll ? 'var(--gold)' : 'var(--br)'}`,
            background: !showAll ? 'rgba(255,200,0,.08)' : 'var(--gl)',
            color: !showAll ? 'var(--gold)' : 'var(--text3)',
          }}>
          ⭐ FEATURED
        </button>
        <button
          onClick={() => setShowAll(true)}
          style={{
            flex:1, padding:'10px', borderRadius:'10px', cursor:'pointer',
            fontFamily:'var(--fd)', fontSize:'13px', fontWeight:800, letterSpacing:'1px',
            border:`1px solid ${showAll ? 'var(--neon)' : 'var(--br)'}`,
            background: showAll ? 'rgba(0,212,255,.08)' : 'var(--gl)',
            color: showAll ? 'var(--neon)' : 'var(--text3)',
          }}>
          🛒 LIVE SERVICES ({totalCount.toLocaleString()})
        </button>
      </div>

      {/* ─── FEATURED TAB ─── */}
      {!showAll && (
        <>
          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading...</div>
          ) : featuredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">⭐</span>
              <div className="empty-tx">No featured services yet</div>
              <div className="empty-sb">Admin will feature top services here</div>
              <button className="btn bgh bsm" style={{ marginTop:'12px' }} onClick={() => setShowAll(true)}>
                Browse All Services →
              </button>
            </div>
          ) : (
            <div className="mkt-grid">
              {featuredServices.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </>
      )}

      {/* ─── LIVE SERVICES TAB ─── */}
      {showAll && (
        <>
          {/* Platform selector */}
          <div style={{ overflowX:'auto', paddingBottom:'8px', marginBottom:'12px' }}>
            <div style={{ display:'flex', gap:'8px', minWidth:'max-content' }}>
              <button onClick={() => setActivePlatform('')}
                style={{
                  padding:'8px 14px', borderRadius:'20px', cursor:'pointer',
                  border:`1px solid ${!activePlatform ? 'var(--neon)' : 'var(--br)'}`,
                  background: !activePlatform ? 'rgba(0,212,255,.12)' : 'var(--gl)',
                  color: !activePlatform ? 'var(--neon)' : 'var(--text3)',
                  fontSize:'12px', fontWeight:700, whiteSpace:'nowrap',
                }}>🌐 Everything</button>
              {platforms.map(p => (
                <button key={p} onClick={() => setActivePlatform(p)}
                  style={{
                    padding:'8px 14px', borderRadius:'20px', cursor:'pointer',
                    border:`1px solid ${activePlatform===p ? cl(p) : 'var(--br)'}`,
                    background: activePlatform===p ? `${cl(p)}18` : 'var(--gl)',
                    color: activePlatform===p ? cl(p) : 'var(--text3)',
                    fontSize:'12px', fontWeight:700, whiteSpace:'nowrap',
                  }}>{ic(p)} {p.charAt(0).toUpperCase()+p.slice(1)}</button>
              ))}
            </div>
          </div>

          {/* Service category */}
          <div style={{ overflowX:'auto', paddingBottom:'6px', marginBottom:'12px' }}>
            <div style={{ display:'flex', gap:'6px', minWidth:'max-content' }}>
              {SERVICE_CATS.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  style={{
                    padding:'6px 12px', borderRadius:'20px', cursor:'pointer',
                    border:`1px solid ${activeCategory===cat ? 'var(--neon)' : 'var(--br)'}`,
                    background: activeCategory===cat ? 'var(--neon)' : 'var(--gl)',
                    color: activeCategory===cat ? '#000' : 'var(--text3)',
                    fontSize:'11px', fontWeight:700, whiteSpace:'nowrap',
                  }}>{cat}</button>
              ))}
            </div>
          </div>

          {/* Type tags filter */}
          <div style={{ overflowX:'auto', paddingBottom:'6px', marginBottom:'12px' }}>
            <div style={{ display:'flex', gap:'6px', minWidth:'max-content' }}>
              {TYPE_TAGS.map(t => (
                <button key={t.id} onClick={() => setActiveType(t.id)}
                  style={{
                    padding:'6px 12px', borderRadius:'20px', cursor:'pointer',
                    border:`1px solid ${activeType===t.id ? 'var(--purple)' : 'var(--br)'}`,
                    background: activeType===t.id ? 'rgba(123,47,255,.15)' : 'var(--gl)',
                    color: activeType===t.id ? 'var(--purple)' : 'var(--text3)',
                    fontSize:'11px', fontWeight:700, whiteSpace:'nowrap',
                  }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Search + Sort row */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <input className="srch-inp" style={{ flex:1, minWidth:'160px' }}
              placeholder="🔍 Search services..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="sel" style={{ minWidth:'150px', flexShrink:0 }}
              value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          {/* Results count */}
          <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'12px' }}>
            Showing {filteredNonFeatured.length} of {totalCount.toLocaleString()} services
            {(activePlatform || activeType !== 'all' || search) &&
              <button onClick={() => { setActivePlatform(''); setActiveType('all'); setSearch(''); setActiveCategory('All'); }}
                style={{ marginLeft:'8px', background:'none', border:'none', color:'var(--neon)', cursor:'pointer', fontSize:'11px' }}>
                ✕ Clear filters
              </button>
            }
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading services...</div>
          ) : filteredNonFeatured.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">No services found</div>
              <div className="empty-sb">Try a different search or filter</div>
            </div>
          ) : (
            <>
              <div className="mkt-grid">
                {filteredNonFeatured.map(s => <ServiceCard key={s.id} s={s} />)}
              </div>

              {/* Load More button */}
              {hasMore && (
                <div style={{ textAlign:'center', marginTop:'20px' }}>
                  <button className="btn bgh bmd" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? '⏳ Loading...' : `Load More (${totalCount - offsetRef.current} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── ORDER MODAL ─── */}
      {selected && (
        <div className="mlay" onClick={() => !ordering && setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
              <span style={{ fontSize:'28px' }}>{ic(selected.platform)}</span>
              <div>
                <div style={{ fontWeight:800, fontSize:'15px', color:'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize:'10px', color:cl(selected.platform), textTransform:'uppercase', letterSpacing:'1px' }}>
                  {selected.platform}
                </div>
              </div>
              <button onClick={() => !ordering && setSelected(null)}
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
                {selected.description && (
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'12px', padding:'8px 10px', background:'var(--gl)', borderRadius:'7px', border:'1px solid var(--br)', lineHeight:1.6 }}>
                    {selected.description}
                  </div>
                )}
                <div className="fi">
                  <label className="fl">Your Link / Username</label>
                  <input className="inp" value={link}
                    onChange={e => setLink(e.target.value)}
                    placeholder="https://..." disabled={ordering} />
                </div>
                <div className="fi">
                  <label className="fl">Quantity ({(selected.min_qty||0).toLocaleString()} – {(selected.max_qty||0).toLocaleString()})</label>
                  <input className="inp" type="number" value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty} max={selected.max_qty} step="1" disabled={ordering} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', padding:'10px 13px', borderRadius:'8px', background:'rgba(0,0,0,.3)', border:'1px solid var(--br)' }}>
                  <span style={{ fontSize:'11px', color:'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily:'var(--fm)', fontSize:'18px', fontWeight:700, color:'var(--gold)' }}>
                    {format(parseFloat(displayCost))}
                  </span>
                </div>
                {orderError && (
                  <div style={{ background:'rgba(255,50,80,.08)', border:'1px solid rgba(255,50,80,.2)', borderRadius:'7px', padding:'10px', color:'#ff6b6b', fontSize:'12px', marginBottom:'12px' }}>
                    {orderError}
                  </div>
                )}
                <button className="btn bp blg bw" onClick={placeOrder} disabled={ordering}
                  style={{ opacity:ordering?0.6:1, cursor:ordering?'not-allowed':'pointer' }}>
                  {ordering ? '⏳ Processing...' : `⚡ Place Order — ${format(parseFloat(displayCost))}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

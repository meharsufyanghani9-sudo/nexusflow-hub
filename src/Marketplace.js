import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const PLATFORMS = [
  { id: 'everything', label: 'Everything', ic: '🌐' },
  { id: 'instagram',  label: 'Instagram',  ic: '📸' },
  { id: 'facebook',   label: 'Facebook',   ic: '👍' },
  { id: 'youtube',    label: 'YouTube',    ic: '▶️' },
  { id: 'twitter',    label: 'Twitter',    ic: '🐦' },
  { id: 'spotify',    label: 'Spotify',    ic: '🎵' },
  { id: 'tiktok',     label: 'TikTok',     ic: '🎵' },
  { id: 'linkedin',   label: 'LinkedIn',   ic: '💼' },
  { id: 'google',     label: 'Google',     ic: '🔍' },
  { id: 'whatsapp',   label: 'WhatsApp',   ic: '💬' },
  { id: 'telegram',   label: 'Telegram',   ic: '✈️' },
  { id: 'website',    label: 'Website',    ic: '🌐' },
  { id: 'discord',    label: 'Discord',    ic: '🎮' },
  { id: 'snapchat',   label: 'Snapchat',   ic: '👻' },
  { id: 'threads',    label: 'Threads',    ic: '🧵' },
  { id: 'twitch',     label: 'Twitch',     ic: '💜' },
  { id: 'capcut',     label: 'CapCut',     ic: '🎬' },
  { id: 'custom',     label: 'Other',      ic: '⚙️' },
];

const SERVICE_TYPES = ['All', 'Followers', 'Likes', 'Views', 'Comments', 'Shares', 'Subscribers', 'Saves', 'Members', 'Reactions', 'Traffic'];
const FILTER_TYPES = ['All', 'Guaranteed', 'Non-Drop', 'Budget', 'With Refill', 'No Refill', 'Fast Delivery', 'Lifetime'];

const SORT_OPTIONS = [
  { id: 'featured', label: '⭐ Featured First' },
  { id: 'low_high', label: '💰 Low → High' },
  { id: 'high_low', label: '💰 High → Low' },
  { id: 'newest',   label: '🆕 Newest First' },
];

const platformColors = {
  instagram:'#E1306C', tiktok:'#00d4ff', youtube:'#FF0000',
  twitter:'#1DA1F2', facebook:'#1877F2', telegram:'#0088cc',
  snapchat:'#FFFC00', linkedin:'#0077B5', discord:'#5865F2',
  spotify:'#1DB954', twitch:'#9146FF', website:'#00d4ff',
  threads:'#000000', google:'#4285F4', whatsapp:'#25D366',
  capcut:'#000000', custom:'#7b2fff',
};

const PAGE_SIZE = 20;

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();
  const [allServices, setAllServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [platform, setPlatform]       = useState('everything');
  const [serviceType, setServiceType] = useState('All');
  const [filterType, setFilterType]   = useState('All');
  const [search, setSearch]           = useState('');
  const [sort, setSort]               = useState('featured');
  const [showLive, setShowLive]       = useState(false);
  const [page, setPage]               = useState(1);

  // Order modal
  const [selected, setSelected]   = useState(null);
  const [link, setLink]           = useState('');
  const [qty, setQty]             = useState('');
  const [ordering, setOrdering]   = useState(false);
  const [ordered, setOrdered]     = useState(false);
  const [orderError, setOrderError] = useState('');

  const searchTimer = useRef(null);

  useEffect(() => { loadCount(); loadServices(); }, []);

  const loadCount = async () => {
    const { count } = await supabase
      .from('services').select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    if (count) setTotalCount(count);
  };

  const loadServices = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('services').select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setAllServices(data);
    setLoading(false);
  }, []);

  const ic  = (p) => (PLATFORMS.find(x => x.id === p) || { ic: '⚙️' }).ic;
  const cl  = (p) => platformColors[p] || '#7b2fff';

  const featuredServices = allServices.filter(s => s.is_featured);

  // Apply all filters to non-featured (Browse All) services
  const applyFilters = (services) => {
    let arr = services.filter(s => !s.is_featured);

    if (platform !== 'everything') {
      arr = arr.filter(s => s.platform === platform);
    }
    if (serviceType !== 'All') {
      const kw = serviceType.toLowerCase();
      arr = arr.filter(s => (s.name || '').toLowerCase().includes(kw) || (s.description || '').toLowerCase().includes(kw));
    }
    if (filterType !== 'All') {
      const kw = filterType.toLowerCase().replace('-', '');
      arr = arr.filter(s => (s.name || '').toLowerCase().replace('-','').includes(kw) || (s.description || '').toLowerCase().replace('-','').includes(kw));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
    }

    // Sort
    if (sort === 'low_high')  arr.sort((a,b) => parseFloat(a.price_per_1k) - parseFloat(b.price_per_1k));
    if (sort === 'high_low')  arr.sort((a,b) => parseFloat(b.price_per_1k) - parseFloat(a.price_per_1k));
    if (sort === 'newest')    arr.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    if (sort === 'featured')  arr.sort((a,b) => (b.is_featured ? 1:0) - (a.is_featured ? 1:0));

    return arr;
  };

  const filteredServices = applyFilters(allServices);
  const pagedServices = filteredServices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filteredServices.length / PAGE_SIZE);

  const resetFilters = () => {
    setPlatform('everything'); setServiceType('All');
    setFilterType('All'); setSearch(''); setSort('featured'); setPage(1);
  };

  const cost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  const placeOrder = async () => {
    setOrderError('');
    if (!link) { setOrderError('Enter your link'); return; }
    const q = parseInt(qty);
    if (!q || q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be ${selected.min_qty}–${selected.max_qty}`);
      return;
    }
    const totalCost = parseFloat(cost);
    if (totalCost > user.balance) { setOrderError('Insufficient balance'); return; }

    setOrdering(true);
    const orderRef = 'NF-' + Date.now();

    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef, user_id: user.id,
      service_id: selected.id, service_name: selected.name,
      platform: selected.platform, link, quantity: q,
      cost: totalCost, status: 'pending', progress: 0,
    });
    if (orderErr) { setOrderError('Order failed: ' + orderErr.message); setOrdering(false); return; }

    await supabase.from('users').update({ balance: user.balance - totalCost }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -totalCost,
      description: `Order: ${selected.name}`, ref_id: orderRef,
    });

    // Send to provider API automatically
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

  const ServiceCard = ({ s }) => (
    <div className={`mkt-card${s.is_featured ? ' mkt-featured' : ''}`}
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
      {/* ── TAB TOGGLE ── */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'18px' }}>
        <button
          onClick={() => setShowLive(false)}
          style={{
            flex:1, padding:'10px', borderRadius:'10px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700, letterSpacing:'1px',
            background: !showLive ? 'linear-gradient(135deg,var(--gold2),var(--gold))' : 'var(--gl)',
            color: !showLive ? '#000' : 'var(--text3)',
            border: !showLive ? 'none' : '1px solid var(--br)',
          }}>
          ⭐ FEATURED
        </button>
        <button
          onClick={() => setShowLive(true)}
          style={{
            flex:1, padding:'10px', borderRadius:'10px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700, letterSpacing:'1px',
            background: showLive ? 'var(--neon)' : 'var(--gl)',
            color: showLive ? '#000' : 'var(--text3)',
            border: showLive ? 'none' : '1px solid var(--br)',
          }}>
          🛒 LIVE SERVICES ({totalCount.toLocaleString()})
        </button>
      </div>

      {/* ── FEATURED VIEW ── */}
      {!showLive && (
        <>
          <div className="st">⭐ Featured Services
            <span style={{ fontSize:'9px', color:'var(--text3)', fontWeight:400, letterSpacing:'1px', marginLeft:'8px' }}>
              — Handpicked by admin
            </span>
          </div>
          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading...</div>
          ) : featuredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">⭐</span>
              <div className="empty-tx">No featured services yet</div>
              <div className="empty-sb">Admin will add featured services soon</div>
            </div>
          ) : (
            <div className="mkt-grid">
              {featuredServices.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}

          {/* All Services section below featured */}
          {!loading && allServices.filter(s => !s.is_featured).length > 0 && (
            <div style={{ marginTop:'24px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
                <div className="st" style={{ margin:0 }}>🛒 All Services</div>
                <span style={{ fontSize:'9px', color:'var(--text3)' }}>{allServices.filter(s=>!s.is_featured).length} available</span>
                <button className="btn bgh bsm" style={{ marginLeft:'auto' }} onClick={() => setShowLive(true)}>
                  ▼ Browse All
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── LIVE SERVICES VIEW ── */}
      {showLive && (
        <>
          {/* Platform Icons Grid */}
          <div style={{ marginBottom:'16px' }}>
            <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', marginBottom:'10px', fontFamily:'var(--fu)' }}>SELECT PLATFORM</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
              {PLATFORMS.map(p => (
                <div key={p.id}
                  onClick={() => { setPlatform(p.id); setPage(1); }}
                  style={{
                    padding:'10px 6px', borderRadius:'10px', textAlign:'center', cursor:'pointer',
                    border:`1px solid ${platform===p.id ? 'var(--neon)' : 'var(--br)'}`,
                    background: platform===p.id ? 'rgba(0,212,255,.1)' : 'var(--gl)',
                    transition:'all .2s'
                  }}>
                  <div style={{ fontSize:'20px', marginBottom:'3px' }}>{p.ic}</div>
                  <div style={{ fontSize:'9px', color: platform===p.id ? 'var(--neon)' : 'var(--text3)', fontWeight:700, letterSpacing:'0.5px' }}>{p.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Service Type Pills */}
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', marginBottom:'8px', fontFamily:'var(--fu)' }}>SELECT SERVICE</div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'nowrap', overflowX:'auto', paddingBottom:'4px' }}>
              {SERVICE_TYPES.map(t => (
                <button key={t}
                  onClick={() => { setServiceType(t); setPage(1); }}
                  style={{
                    padding:'6px 14px', borderRadius:'20px', cursor:'pointer', whiteSpace:'nowrap',
                    fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700, letterSpacing:'0.5px',
                    background: serviceType===t ? 'var(--neon)' : 'var(--gl)',
                    color: serviceType===t ? '#000' : 'var(--text3)',
                    border: serviceType===t ? 'none' : '1px solid var(--br)',
                    flexShrink:0,
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Type Pills */}
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', marginBottom:'8px', fontFamily:'var(--fu)' }}>FILTER BY TYPE</div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              {FILTER_TYPES.map(t => (
                <button key={t}
                  onClick={() => { setFilterType(t); setPage(1); }}
                  style={{
                    padding:'6px 12px', borderRadius:'20px', cursor:'pointer', whiteSpace:'nowrap',
                    fontFamily:'var(--fu)', fontSize:'10px', fontWeight:700,
                    background: filterType===t ? 'var(--purple)' : 'var(--gl)',
                    color: filterType===t ? '#fff' : 'var(--text3)',
                    border: filterType===t ? 'none' : '1px solid var(--br)',
                  }}>
                  {t === 'Guaranteed' ? '✅ Guaranteed' :
                   t === 'Non-Drop' ? '💎 Non-Drop' :
                   t === 'Budget' ? '💰 Budget' :
                   t === 'With Refill' ? '🔄 With Refill' :
                   t === 'No Refill' ? '🚫 No Refill' :
                   t === 'Fast Delivery' ? '⚡ Fast Delivery' :
                   t === 'Lifetime' ? '♾ Lifetime' : `✦ ${t}`}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <input className="srch-inp" style={{ width:'100%', marginBottom:'10px', boxSizing:'border-box' }}
            placeholder="🔍 Search services..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }} />

          {/* Sort Dropdown */}
          <select className="sel" style={{ width:'100%', marginBottom:'16px' }}
            value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
            {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          {/* Result count */}
          <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'12px' }}>
            Showing {filteredServices.length.toLocaleString()} of {totalCount.toLocaleString()} services
            {(platform !== 'everything' || serviceType !== 'All' || filterType !== 'All' || search) && (
              <button onClick={resetFilters} style={{
                marginLeft:'10px', fontSize:'10px', color:'var(--neon)',
                background:'none', border:'none', cursor:'pointer', textDecoration:'underline'
              }}>Clear filters</button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading services...</div>
          ) : filteredServices.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">No services found</div>
              <div className="empty-sb">Try a different search or filter</div>
            </div>
          ) : (
            <>
              <div className="mkt-grid">
                {pagedServices.map(s => <ServiceCard key={s.id} s={s} />)}
              </div>
              {totalPages > 1 && (
                <div style={{ display:'flex', justifyContent:'center', gap:'6px', marginTop:'16px', flexWrap:'wrap' }}>
                  <button className="btn bgh bsm" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Prev</button>
                  <span style={{ padding:'6px 12px', fontSize:'12px', color:'var(--text2)' }}>Page {page}/{totalPages}</span>
                  <button className="btn bgh bsm" onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Next →</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── ORDER MODAL ── */}
      {selected && (
        <div className="mlay" onClick={() => setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
              <span style={{ fontSize:'28px' }}>{ic(selected.platform)}</span>
              <div>
                <div style={{ fontWeight:800, fontSize:'15px', color:'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize:'10px', color:cl(selected.platform), textTransform:'uppercase', letterSpacing:'1px' }}>{selected.platform}</div>
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
                {selected.description && (
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'14px', padding:'10px', background:'var(--gl)', borderRadius:'7px', lineHeight:1.6 }}>
                    {selected.description}
                  </div>
                )}
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

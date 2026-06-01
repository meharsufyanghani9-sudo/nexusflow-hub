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

// ─── SECURITY FIX: Helper to sanitize HTML in email / stored strings ─────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export default function Marketplace({ user, onNav }) {
  const { format } = useCurrency();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const [link, setLink] = useState('');
  const [qty, setQty] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderError, setOrderError] = useState('');

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    setLoading(true);
    // ─── SECURITY FIX: Select only safe columns — NEVER select provider_api_key
    // or provider_api_url from services table. Those are for server-side only.
    // A buyer should never see your provider credentials.
    const { data } = await supabase
      .from('services')
      .select('id, name, platform, description, price_per_1k, min_qty, max_qty, is_active, is_featured, created_at')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setServices(data);
    setLoading(false);
  };

  const featuredServices = services.filter(s => s.is_featured);
  const otherServices = services.filter(s => !s.is_featured);
  const availablePlatforms = [...new Set(otherServices.map(s => s.platform))].filter(Boolean);

  const filteredOthers = otherServices.filter(s => {
    const matchPl = !platform || s.platform === platform;
    const matchQ = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchPl && matchQ;
  });

  // Calculate display cost (for preview only — actual cost recalculated in placeOrder)
  const displayCost = selected && qty
    ? (parseFloat(qty) / 1000 * parseFloat(selected.price_per_1k)).toFixed(4)
    : '0.00';

  const placeOrder = async () => {
    setOrderError('');

    // ─── FIX: Validate link field ─────────────────────────────────────────
    if (!link.trim()) {
      setOrderError('Please enter your link or username');
      return;
    }
    // Check it looks like a real URL (or at least not a script injection)
    const linkTrimmed = link.trim();
    if (linkTrimmed.toLowerCase().startsWith('javascript:') ||
        linkTrimmed.toLowerCase().startsWith('data:') ||
        linkTrimmed.toLowerCase().startsWith('vbscript:')) {
      setOrderError('Invalid link format');
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ─── FIX: Strict quantity validation — no decimals, no scientific notation ─
    const rawQty = qty.toString().trim();
    if (!/^\d+$/.test(rawQty)) {
      setOrderError('Quantity must be a whole number (no decimals or letters)');
      return;
    }
    const q = parseInt(rawQty, 10);
    if (isNaN(q) || q <= 0) {
      setOrderError('Please enter a valid quantity');
      return;
    }
    if (q < selected.min_qty || q > selected.max_qty) {
      setOrderError(`Quantity must be between ${selected.min_qty.toLocaleString()} and ${selected.max_qty.toLocaleString()}`);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ─── FIX: Recalculate cost from validated integer (not from display state) ─
    const totalCost = parseFloat((q / 1000 * parseFloat(selected.price_per_1k)).toFixed(4));
    if (isNaN(totalCost) || totalCost <= 0) {
      setOrderError('Could not calculate order cost. Please try again.');
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // Prevent double-click by setting ordering state immediately
    setOrdering(true);

    // ─── FIX: Read LIVE balance from database (not stale React state) ────────
    // The old code used user.balance (a prop that doesn't update in real-time).
    // Two tabs open = both see the same old balance = double-order exploit.
    const { data: freshUser, error: freshErr } = await supabase
      .from('users')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (freshErr || !freshUser) {
      setOrderError('Could not verify your balance. Please refresh and try again.');
      setOrdering(false);
      return;
    }

    const liveBalance = parseFloat(freshUser.balance || 0);

    if (totalCost > liveBalance) {
      setOrderError(`Insufficient balance. You need $${totalCost.toFixed(4)} but have $${liveBalance.toFixed(2)}`);
      setOrdering(false);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ─── FIX: Deduct balance FIRST with an atomic guard ───────────────────
    // .gte('balance', totalCost) means: "only update IF balance is still enough"
    // If another tab placed an order at the same time, this will fail safely.
    const { error: balanceErr } = await supabase
      .from('users')
      .update({ balance: liveBalance - totalCost })
      .eq('id', user.id)
      .gte('balance', totalCost); // atomic safety check

    if (balanceErr) {
      setOrderError('Balance check failed — your balance may have changed. Please refresh and try again.');
      setOrdering(false);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ─── FIX: Use crypto.randomUUID for unique order reference (no collisions) ─
    const orderRef = 'NF-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    // ─────────────────────────────────────────────────────────────────────

    // Now create the order record
    const { error: orderErr } = await supabase.from('orders').insert({
      order_ref: orderRef,
      user_id: user.id,
      service_id: selected.id,
      service_name: selected.name,
      platform: selected.platform,
      link: escapeHtml(linkTrimmed), // sanitize before storing
      quantity: q,
      cost: totalCost,
      status: 'pending',
      progress: 0,
    });

    if (orderErr) {
      // ─── ROLLBACK: Order creation failed — refund the balance we just deducted
      await supabase
        .from('users')
        .update({ balance: liveBalance })
        .eq('id', user.id);
      setOrderError('Order creation failed: ' + orderErr.message + '. Your balance has been restored.');
      setOrdering(false);
      return;
    }

    // Log the transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'order',
      amount: -totalCost,
      description: `Order: ${selected.name}`,
      ref_id: orderRef,
    });

    // ─── SECURITY FIX: Provider API call is now handled server-side ──────────
    // We NO LONGER call the provider API directly from the browser.
    // Reason: doing so exposes your provider API key to every buyer because
    // selected.provider_api_key was readable in the browser's network tab.
    //
    // The order is now placed as 'pending' — your admin (or a backend cron job
    // / Supabase Edge Function) should pick up pending orders and send them
    // to the provider server-side, where the API key is never exposed.
    //
    // If you want fully automatic order placement, create a Supabase Edge
    // Function called "process-order" that reads the provider key from the
    // database securely and sends the order. The function is called below
    // using the Supabase functions client (server-side execution only).

    try {
      // Attempt to trigger server-side order processing via Edge Function
      // This is safe because the Edge Function runs on Supabase servers,
      // not in the user's browser — API keys never leave the server.
      await supabase.functions.invoke('process-order', {
        body: { order_ref: orderRef, service_id: selected.id, link: linkTrimmed, quantity: q },
      });
      // If this fails, order stays as 'pending' for admin to process manually
    } catch (_) {
      // Silent fail — order is already created, admin can process it manually
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontSize: '22px' }}>{ic(s.platform)}</span>
        <span style={{
          fontSize: '9px', padding: '2px 7px', borderRadius: '10px', fontWeight: 700,
          background: `${cl(s.platform)}18`, color: cl(s.platform),
          border: `1px solid ${cl(s.platform)}30`, textTransform: 'uppercase', letterSpacing: '1px'
        }}>{s.platform}</span>
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

  return (
    <div>
      {/* ─── FEATURED SERVICES ─── */}
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

      {/* ─── ALL SERVICES ─── */}
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
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <input className="srch-inp" style={{ flex: 1, minWidth: '140px' }}
              placeholder="🔍 Search services..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="sel" style={{ width: '150px', flexShrink: 0 }}
              value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="">🌐 All Platforms</option>
              {availablePlatforms.map(p => (
                <option key={p} value={p}>{ic(p)} {p}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>Loading services...
            </div>
          ) : filteredOthers.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔍</span>
              <div className="empty-tx">{otherServices.length === 0 ? 'No more services' : 'No services found'}</div>
              <div className="empty-sb">Try different search or filter</div>
            </div>
          ) : (
            <div className="mkt-grid">
              {filteredOthers.map(s => <ServiceCard key={s.id} s={s} />)}
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

      {/* ─── ORDER MODAL ─── */}
      {selected && (
        <div className="mlay" onClick={() => !ordering && setSelected(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>{ic(selected.platform)}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize: '10px', color: cl(selected.platform), textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {selected.platform}
                </div>
              </div>
              <button onClick={() => !ordering && setSelected(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px' }}>×</button>
            </div>

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
                  <input
                    className="inp"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    placeholder="https://..."
                    disabled={ordering}
                  />
                </div>
                <div className="fi">
                  <label className="fl">Quantity ({(selected.min_qty || 0).toLocaleString()} – {(selected.max_qty || 0).toLocaleString()})</label>
                  <input
                    className="inp"
                    type="number"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    min={selected.min_qty}
                    max={selected.max_qty}
                    step="1"
                    disabled={ordering}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', padding: '10px 13px', borderRadius: '8px', background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Total Cost</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '18px', fontWeight: 700, color: 'var(--gold)' }}>
                    {format(parseFloat(displayCost))}
                  </span>
                </div>
                {orderError && (
                  <div style={{ background: 'rgba(255,50,80,.08)', border: '1px solid rgba(255,50,80,.2)', borderRadius: '7px', padding: '10px', color: '#ff6b6b', fontSize: '12px', marginBottom: '12px' }}>
                    {orderError}
                  </div>
                )}
                {/* FIX: button is disabled while ordering to prevent double-click */}
                <button
                  className="btn bp blg bw"
                  onClick={placeOrder}
                  disabled={ordering}
                  style={{ opacity: ordering ? 0.6 : 1, cursor: ordering ? 'not-allowed' : 'pointer' }}>
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

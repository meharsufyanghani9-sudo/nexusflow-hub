import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const statusList = ['all','pending','in_progress','completed','cancelled'];

function CountdownTimer({ targetTime, label }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired]   = useState(false);
  useEffect(() => {
    const tick = () => {
      const diff = new Date(targetTime) - new Date();
      if (diff <= 0) { setExpired(true); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime]);
  if (expired) return null;
  return (
    <span style={{ fontSize:'10px', color:'var(--gold)', fontFamily:'var(--fm)', marginLeft:'6px' }}>
      ⏱ {label}: {timeLeft}
    </span>
  );
}

export default function Orders({ user }) {
  const [filter,    setFilter]    = useState('all');
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actingOn,  setActingOn]  = useState(null);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  };

  const filtered = orders.filter(o => filter === 'all' || o.status === filter);

  const badgeClass = s => {
    if (s === 'completed')  return 'b-completed';
    if (s === 'in_progress') return 'b-processing';
    if (s === 'pending')    return 'b-pending';
    return 'b-rejected';
  };

  const canCancel = order => {
    if (order.status !== 'pending') return false;
    return (new Date() - new Date(order.created_at)) < 15 * 60 * 1000;
  };

  const canRefill = order => {
    if (order.status !== 'in_progress' && order.status !== 'completed') return false;
    return (new Date() - new Date(order.created_at)) < 24 * 60 * 60 * 1000;
  };

  const showMsg = (text) => {
    setActionMsg(text);
    setTimeout(() => setActionMsg(''), 4000);
  };

  // ── Cancel Order (with IDOR protection + double-cancel prevention) ──────────
  const cancelOrder = async (order) => {
    if (actingOn) return;
    if (!window.confirm('Cancel this order? Your balance will be refunded.')) return;
    setActingOn(order.id);

    // Atomic update: only succeeds if order is still PENDING and belongs to this user
    const { data: cancelled, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !cancelled) {
      showMsg('❌ Could not cancel — order may have already started.');
      setActingOn(null);
      return;
    }

    // Refund
    const { data: profile } = await supabase
      .from('users').select('balance').eq('id', user.id).single();
    if (profile) {
      const refundAmt = parseFloat(cancelled.cost || 0);
      await supabase.from('users')
        .update({ balance: parseFloat(profile.balance) + refundAmt })
        .eq('id', user.id);
      await supabase.from('transactions').insert({
        user_id: user.id, type: 'refund', amount: refundAmt,
        description: `Refund: Order ${cancelled.order_ref || order.id}`,
        ref_id: cancelled.order_ref || order.id,
      });
    }

    showMsg('✅ Order cancelled. Your balance has been refunded!');
    setActingOn(null);
    loadOrders();
  };

  // ── Refill ──────────────────────────────────────────────────────────────────
  const refillOrder = async (order) => {
    if (actingOn) return;
    if (!window.confirm('Request a refill for this order?')) return;
    setActingOn(order.id);
    await supabase.from('orders')
      .update({ refill_requested: true })
      .eq('id', order.id)
      .eq('user_id', user.id);
    showMsg('✅ Refill requested! Admin will process it shortly.');
    setActingOn(null);
    loadOrders();
  };

  // ── Reorder (place a new order on same service from Orders tab) ─────────────
  const reorder = async (order) => {
    if (actingOn) return;
    if (!window.confirm(`Place new order for "${order.service_name}"?`)) return;
    setActingOn(order.id);

    const { data: freshUser } = await supabase
      .from('users').select('balance').eq('id', user.id).single();
    if (!freshUser) { showMsg('❌ Could not verify balance.'); setActingOn(null); return; }

    const cost = parseFloat(order.cost || 0);
    if (cost > parseFloat(freshUser.balance || 0)) {
      showMsg('❌ Insufficient balance for reorder.');
      setActingOn(null);
      return;
    }

    const orderRef = 'NF-' + Date.now();
    await supabase.from('users')
      .update({ balance: parseFloat(freshUser.balance) - cost })
      .eq('id', user.id).gte('balance', cost);

    await supabase.from('orders').insert({
      order_ref: orderRef,
      user_id: user.id,
      service_id: order.service_id,
      service_name: order.service_name,
      platform: order.platform,
      link: order.link,
      quantity: order.quantity,
      cost,
      status: 'pending',
      progress: 0,
    });

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'order', amount: -cost,
      description: `Reorder: ${order.service_name}`, ref_id: orderRef,
    });

    showMsg('✅ Reorder placed successfully!');
    setActingOn(null);
    loadOrders();
  };

  const stats = {
    total:     orders.length,
    completed: orders.filter(o => o.status === 'completed').length,
    progress:  orders.filter(o => o.status === 'in_progress').length,
    pending:   orders.filter(o => o.status === 'pending').length,
  };

  return (
    <div>
      {actionMsg && (
        <div style={{
          background: actionMsg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border:`1px solid ${actionMsg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius:'8px', padding:'12px', textAlign:'center',
          color: actionMsg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
          fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>{actionMsg}</div>
      )}

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:'6px', marginBottom:'14px', flexWrap:'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding:'6px 12px', borderRadius:'20px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'1px', transition:'.15s',
            background: filter===s ? 'var(--neon)' : 'var(--gl)',
            color: filter===s ? '#000' : 'var(--text3)',
            border: filter===s ? 'none' : '1px solid var(--br)',
          }}>{s.replace('_',' ')}</button>
        ))}
      </div>

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📦', lb:'Total',       vl:stats.total,     cl:'cn' },
          { ic:'✅', lb:'Completed',   vl:stats.completed, cl:'cg' },
          { ic:'⚡', lb:'In Progress', vl:stats.progress,  cl:'cn' },
          { ic:'⏳', lb:'Pending',     vl:stats.pending,   cl:'cw' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Orders table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading orders...</div>
      ) : (
        <div className="tblw">
          <table>
            <thead>
              <tr>
                <th>#ID</th>
                <th>Service</th>
                <th>Qty</th>
                <th>Start</th>
                <th>Remains</th>
                <th>Cost</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign:'center', padding:'32px', color:'var(--text3)' }}>
                    No orders found
                  </td>
                </tr>
              ) : filtered.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily:'var(--fm)', color:'var(--neon)', fontSize:'11px' }}>
                    {o.order_ref || o.id?.slice(0,8)}
                    {o.vendor_order_id && (
                      <div style={{ fontSize:'9px', color:'var(--text3)' }}>
                        Vendor: {o.vendor_order_id}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight:600, maxWidth:'110px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {o.service_name}
                  </td>
                  <td style={{ fontFamily:'var(--fm)' }}>{(o.quantity||0).toLocaleString()}</td>
                  {/* START count */}
                  <td style={{ fontFamily:'var(--fm)', color:'var(--text2)', fontSize:'11px' }}>
                    {o.start_count != null ? o.start_count.toLocaleString() : '–'}
                  </td>
                  {/* REMAINS count */}
                  <td style={{ fontFamily:'var(--fm)', color: o.remains > 0 ? 'var(--neon)' : 'var(--green)', fontSize:'11px' }}>
                    {o.remains != null ? o.remains.toLocaleString() : '–'}
                  </td>
                  <td style={{ color:'var(--gold)', fontFamily:'var(--fm)' }}>
                    ${parseFloat(o.cost||0).toFixed(2)}
                  </td>
                  <td>
                    <span className={`bdg ${badgeClass(o.status)}`}>
                      {o.status?.replace('_',' ')}
                    </span>
                    {canCancel(o) && (
                      <CountdownTimer
                        targetTime={new Date(new Date(o.created_at).getTime() + 15*60*1000)}
                        label="Cancel in"
                      />
                    )}
                    {o.provider_note && (
                      <div style={{ fontSize:'9px', color:'var(--warn)', marginTop:'2px' }}>
                        ⚠️ {o.provider_note.slice(0,40)}
                      </div>
                    )}
                  </td>
                  <td style={{ color:'var(--text3)', fontSize:'10px' }}>
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                      {/* CANCEL — visible while pending + within 15 min */}
                      {canCancel(o) && (
                        <button onClick={() => cancelOrder(o)} disabled={actingOn === o.id}
                          style={{
                            padding:'4px 8px', borderRadius:'6px',
                            border:'1px solid rgba(255,50,50,.3)',
                            background: actingOn===o.id ? 'rgba(100,100,100,.1)' : 'rgba(255,50,50,.1)',
                            color: actingOn===o.id ? 'var(--text3)' : '#ff6b6b',
                            cursor: actingOn===o.id ? 'not-allowed' : 'pointer',
                            fontSize:'10px', whiteSpace:'nowrap'
                          }}>
                          {actingOn===o.id ? '⏳' : 'Cancel'}
                        </button>
                      )}
                      {/* REFILL — visible for in_progress / completed within 24h, has guarantee */}
                      {canRefill(o) && !o.refill_requested && (
                        <button onClick={() => refillOrder(o)} disabled={actingOn === o.id}
                          style={{
                            padding:'4px 8px', borderRadius:'6px',
                            border:'1px solid rgba(0,255,136,.3)',
                            background: actingOn===o.id ? 'rgba(100,100,100,.1)' : 'rgba(0,255,136,.1)',
                            color: actingOn===o.id ? 'var(--text3)' : 'var(--green)',
                            cursor: actingOn===o.id ? 'not-allowed' : 'pointer',
                            fontSize:'10px', whiteSpace:'nowrap'
                          }}>
                          {actingOn===o.id ? '⏳' : '🔄 Refill'}
                        </button>
                      )}
                      {o.refill_requested && (
                        <span style={{ fontSize:'9px', color:'var(--gold)', padding:'4px' }}>
                          ⏳ Refill pending
                        </span>
                      )}
                      {/* REORDER — visible on completed orders */}
                      {o.status === 'completed' && (
                        <button onClick={() => reorder(o)} disabled={actingOn === o.id}
                          style={{
                            padding:'4px 8px', borderRadius:'6px',
                            border:'1px solid rgba(123,47,255,.3)',
                            background: actingOn===o.id ? 'rgba(100,100,100,.1)' : 'rgba(123,47,255,.1)',
                            color: actingOn===o.id ? 'var(--text3)' : 'var(--purple)',
                            cursor: actingOn===o.id ? 'not-allowed' : 'pointer',
                            fontSize:'10px', whiteSpace:'nowrap'
                          }}>
                          {actingOn===o.id ? '⏳' : '↩ Reorder'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

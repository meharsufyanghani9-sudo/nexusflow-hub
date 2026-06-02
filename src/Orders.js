import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const statusList = ['all','pending','in_progress','completed','cancelled'];

function CountdownTimer({ targetTime, label }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(targetTime) - new Date();
      if (diff <= 0) { setExpired(true); setTimeLeft('Expired'); return; }
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
  const [filter, setFilter]     = useState('all');
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => { loadOrders(); }, []);

  // Auto-refresh every 30s when active orders exist
  useEffect(() => {
    const id = setInterval(() => {
      const hasActive = orders.some(o => o.status === 'pending' || o.status === 'in_progress');
      if (hasActive) loadOrders();
    }, 30000);
    return () => clearInterval(id);
  }, [orders]);

  const loadOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  };

  const filtered = orders.filter(o => filter === 'all' || o.status === filter);

  const badgeClass = (s) => {
    if (s === 'completed') return 'b-completed';
    if (s === 'in_progress') return 'b-processing';
    if (s === 'pending') return 'b-pending';
    return 'b-rejected';
  };

  const canCancel = (order) => {
    if (order.status !== 'pending') return false;
    const diff = new Date() - new Date(order.created_at);
    return diff < 15 * 60 * 1000;
  };

  const canRefill = (order) => {
    if (order.status !== 'completed') return false;
    if (order.refill_requested) return false;
    // Allow refill if service has refill flag OR service name contains refill keywords
    const name = (order.service_name || '').toLowerCase();
    const hasRefillByName = name.includes('sr-lt') || name.includes('lifetime') || 
                            name.includes('guaranteed') || name.includes('refill');
    if (!order.has_refill && !hasRefillByName) return false;
    return true;
  };

  const reOrder = async (order) => {
    // Navigate to marketplace with pre-filled service
    if (window.confirm(`Reorder "${order.service_name}"?`)) {
      // Store reorder info and redirect to marketplace
      sessionStorage.setItem('reorder', JSON.stringify({
        service_id: order.service_id,
        service_name: order.service_name,
        link: order.link,
        quantity: order.quantity,
      }));
      window.location.hash = 'marketplace';
      window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'marketplace' } }));
    }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm('Cancel this order? Your balance will be refunded.')) return;
    const { data: profile } = await supabase.from('users').select('balance').eq('id', user.id).single();
    const newBalance = parseFloat(profile.balance) + parseFloat(order.cost || 0);
    await supabase.from('users').update({ balance: newBalance }).eq('id', user.id);
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    setActionMsg('✅ Order cancelled. Your balance has been refunded!');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const refillOrder = async (order) => {
    if (!window.confirm('Request a refill for this order?')) return;
    await supabase.from('orders').update({ refill_requested: true }).eq('id', order.id);
    setActionMsg('✅ Refill requested! Admin will process it shortly.');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const stats = {
    total: orders.length,
    completed: orders.filter(o => o.status === 'completed').length,
    progress: orders.filter(o => o.status === 'in_progress').length,
    pending: orders.filter(o => o.status === 'pending').length,
    spent: orders.reduce((a, b) => a + parseFloat(b.cost || 0), 0),
  };

  return (
    <div>
      {actionMsg && (
        <div style={{
          background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)',
          borderRadius:'8px', padding:'12px', textAlign:'center', color:'var(--green)',
          fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>{actionMsg}</div>
      )}

      {/* Filter Tabs */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding:'6px 14px', borderRadius:'20px', cursor:'pointer',
              fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
              textTransform:'uppercase', letterSpacing:'1px', transition:'.15s',
              background: filter === s ? 'var(--neon)' : 'var(--gl)',
              color: filter === s ? '#000' : 'var(--text3)',
              border: filter === s ? 'none' : '1px solid var(--br)',
            }}>
            {s.replace('_',' ')}
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📦', lb:'Total',       vl: stats.total,                          cl:'cn' },
          { ic:'✅', lb:'Completed',   vl: stats.completed,                       cl:'cg' },
          { ic:'⚡', lb:'In Progress', vl: stats.progress,                        cl:'cn' },
          { ic:'⏳', lb:'Pending',     vl: stats.pending,                         cl:'cw' },
          { ic:'💰', lb:'Total Spent', vl: `$${stats.spent.toFixed(2)}`,           cl:'cgo' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Orders Table */}
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
                <th>Cost</th>
                <th>Start</th>
                <th>Remains</th>
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
                  <td style={{ fontFamily:'var(--fm)', color:'var(--neon)', fontSize:'11px', whiteSpace:'nowrap' }}>
                    {o.order_ref || o.id?.slice(0,8)}
                    {o.vendor_order_id && (
                      <div style={{ fontSize:'9px', color:'var(--text3)', marginTop:'2px' }}>
                        Vendor: {o.vendor_order_id}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight:600, maxWidth:'120px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'12px' }}>
                    {o.service_name}
                  </td>
                  <td style={{ fontFamily:'var(--fm)', fontSize:'11px' }}>
                    {o.quantity?.toLocaleString()}
                  </td>
                  <td style={{ color:'var(--gold)', fontFamily:'var(--fm)', fontSize:'11px' }}>
                    ${parseFloat(o.cost||0).toFixed(2)}
                  </td>
                  {/* START COUNT */}
                  <td style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--text2)', textAlign:'center' }}>
                    {o.start_count != null ? o.start_count.toLocaleString() : '—'}
                  </td>
                  {/* REMAINS */}
                  <td style={{ fontFamily:'var(--fm)', fontSize:'11px', textAlign:'center',
                    color: o.remains === 0 ? 'var(--green)' : 'var(--text2)' }}>
                    {o.remains != null ? o.remains.toLocaleString() : '—'}
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
                  </td>
                  <td style={{ color:'var(--text3)', fontSize:'10px', whiteSpace:'nowrap' }}>
                    <div>{new Date(o.created_at).toLocaleDateString()}</div>
                    <div style={{ color:'var(--text3)', fontSize:'9px' }}>{new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).toUpperCase()}</div>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                      {canCancel(o) && (
                        <button onClick={() => cancelOrder(o)}
                          style={{
                            padding:'4px 8px', borderRadius:'6px',
                            border:'1px solid rgba(255,50,50,.3)',
                            background:'rgba(255,50,50,.1)', color:'#ff6b6b',
                            cursor:'pointer', fontSize:'10px', whiteSpace:'nowrap'
                          }}>
                          Cancel
                        </button>
                      )}
                      {canRefill(o) && !o.refill_requested && (
                        <button onClick={() => refillOrder(o)}
                          style={{
                            padding:'4px 8px', borderRadius:'6px',
                            border:'1px solid rgba(0,255,136,.3)',
                            background:'rgba(0,255,136,.1)', color:'var(--green)',
                            cursor:'pointer', fontSize:'10px', whiteSpace:'nowrap'
                          }}>
                          🔁 Refill
                        </button>
                      )}
                      {o.refill_requested && (
                        <span style={{ fontSize:'9px', color:'var(--gold)' }}>⏳ Refill</span>
                      )}
                      {(o.status === 'completed' || o.status === 'cancelled') && (
                        <button onClick={() => reOrder(o)}
                          style={{
                            padding:'4px 8px', borderRadius:'6px',
                            border:'1px solid rgba(0,150,255,.3)',
                            background:'rgba(0,150,255,.1)', color:'#4da6ff',
                            cursor:'pointer', fontSize:'10px', whiteSpace:'nowrap'
                          }}>
                          🔄 Reorder
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

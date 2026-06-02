import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const statusList = ['all','pending','in_progress','completed','cancelled'];

function CountdownTimer({ targetTime }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

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
    <div style={{ fontSize:'10px', color:'var(--gold)', marginTop:'2px' }}>
      ⏱ Cancel in: {timeLeft}
    </div>
  );
}

export default function Orders({ user, onNav }) {
  const [filter, setFilter]     = useState('all');
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => { loadOrders(); }, []);

  // ── Live realtime updates ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        () => loadOrders())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);

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

  const badgeClass = (s) => {
    if (s === 'completed')  return 'b-completed';
    if (s === 'in_progress') return 'b-processing';
    if (s === 'pending')    return 'b-pending';
    return 'b-rejected';
  };

  // Cancel allowed within 15 min while pending
  const canCancel = (o) => {
    if (o.status !== 'pending') return false;
    return new Date() - new Date(o.created_at) < 15 * 60 * 1000;
  };

  // Reorder always available on completed orders
  const canReorder = (o) => o.status === 'completed';

  // Refill available if service has refill guarantee and order is in_progress within 24h
  const canRefill = (o) => {
    if (o.status !== 'in_progress' || o.refill_requested) return false;
    return new Date() - new Date(o.created_at) < 24 * 60 * 60 * 1000;
  };

  const cancelOrder = async (o) => {
    if (!window.confirm('Cancel this order? Your balance will be refunded.')) return;
    const { data: profile } = await supabase.from('users').select('balance').eq('id', user.id).single();
    const newBal = parseFloat(profile.balance) + parseFloat(o.cost || 0);
    await supabase.from('users').update({ balance: newBal }).eq('id', user.id);
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', o.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'refund', amount: parseFloat(o.cost || 0),
      description: `Refund: Order ${o.order_ref}`, ref_id: o.order_ref,
    });
    showMsg('✅ Order cancelled and balance refunded!');
    loadOrders();
  };

  const refillOrder = async (o) => {
    if (!window.confirm('Request a refill for this order?')) return;
    await supabase.from('orders').update({ refill_requested: true }).eq('id', o.id);
    showMsg('✅ Refill requested! Admin will process shortly.');
    loadOrders();
  };

  const reorder = async (o) => {
    if (!window.confirm(`Place new order for "${o.service_name}"?`)) return;
    if (onNav) onNav('marketplace');
  };

  const showMsg = (txt) => {
    setActionMsg(txt);
    setTimeout(() => setActionMsg(''), 4000);
  };

  const stats = {
    total: orders.length,
    completed: orders.filter(o => o.status === 'completed').length,
    progress: orders.filter(o => o.status === 'in_progress').length,
    pending: orders.filter(o => o.status === 'pending').length,
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

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📦', lb:'Total',      vl:stats.total,     cl:'cn' },
          { ic:'✅', lb:'Completed',  vl:stats.completed, cl:'cg' },
          { ic:'⚡', lb:'In Progress',vl:stats.progress,  cl:'cn' },
          { ic:'⏳', lb:'Pending',    vl:stats.pending,   cl:'cw' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display:'flex', gap:'6px', marginBottom:'16px', flexWrap:'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding:'6px 14px', borderRadius:'20px', cursor:'pointer',
              fontFamily:'var(--fu)', fontSize:'10px', fontWeight:700,
              textTransform:'uppercase', letterSpacing:'1px',
              background: filter===s ? 'var(--neon)' : 'var(--gl)',
              color: filter===s ? '#000' : 'var(--text3)',
              border: filter===s ? 'none' : '1px solid var(--br)',
            }}>
            {s.replace('_',' ')} ({s==='all' ? orders.length : orders.filter(o=>o.status===s).length})
          </button>
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
                  <td colSpan="5" style={{ textAlign:'center', padding:'32px', color:'var(--text3)' }}>
                    No orders found
                  </td>
                </tr>
              ) : filtered.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily:'var(--fm)', color:'var(--text2)', fontSize:'12px' }}>
                    {o.status === 'completed' ? '0' : (o.remains !== undefined && o.remains !== null) ? o.remains : '—'}
                    {o.vendor_order_id && (
                      <div style={{ fontSize:'9px', color:'var(--text3)', marginTop:'2px' }}>
                        ⚡ Synced: {o.status === 'completed' ? 'Completed' : 'In Progress'} |<br/>Remains: {o.remains || 0}
                      </div>
                    )}
                    {o.provider_note && (
                      <div style={{ fontSize:'9px', color:'var(--warn)', marginTop:'2px' }}>
                        ⚠️ {o.provider_note}
                      </div>
                    )}
                  </td>
                  <td style={{ color:'var(--gold)', fontFamily:'var(--fm)', fontWeight:700 }}>
                    ${parseFloat(o.cost||0).toFixed(2)}
                  </td>
                  <td>
                    <span className={`bdg ${badgeClass(o.status)}`}>
                      {o.status?.replace('_',' ')}
                    </span>
                    {canCancel(o) && (
                      <CountdownTimer targetTime={new Date(new Date(o.created_at).getTime() + 15*60*1000)} />
                    )}
                  </td>
                  <td style={{ color:'var(--text3)', fontSize:'10px', whiteSpace:'nowrap' }}>
                    {new Date(o.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                      {canCancel(o) && (
                        <button onClick={() => cancelOrder(o)}
                          style={{
                            padding:'5px 10px', borderRadius:'8px', whiteSpace:'nowrap',
                            border:'1px solid rgba(255,50,50,.4)',
                            background:'rgba(255,50,50,.1)', color:'#ff6b6b',
                            cursor:'pointer', fontSize:'11px', fontWeight:700
                          }}>
                          Cancel
                        </button>
                      )}
                      {canRefill(o) && (
                        <button onClick={() => refillOrder(o)}
                          style={{
                            padding:'5px 10px', borderRadius:'8px', whiteSpace:'nowrap',
                            border:'1px solid rgba(0,212,255,.4)',
                            background:'rgba(0,212,255,.1)', color:'var(--neon)',
                            cursor:'pointer', fontSize:'11px', fontWeight:700
                          }}>
                          ↩ Refill
                        </button>
                      )}
                      {o.refill_requested && o.status === 'in_progress' && (
                        <span style={{ fontSize:'10px', color:'var(--gold)', padding:'5px 0' }}>⏳ Refill pending</span>
                      )}
                      {canReorder(o) && (
                        <button onClick={() => reorder(o)}
                          style={{
                            padding:'5px 10px', borderRadius:'8px', whiteSpace:'nowrap',
                            border:'1px solid rgba(123,47,255,.4)',
                            background:'rgba(123,47,255,.1)', color:'var(--purple)',
                            cursor:'pointer', fontSize:'11px', fontWeight:700
                          }}>
                          ↩ Reorder
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

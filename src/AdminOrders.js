import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const statusList = ['all','pending','in_progress','completed','cancelled'];
const PER_PAGE   = 30;

export default function AdminOrders() {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [msg,      setMsg]      = useState('');
  const [updating, setUpdating] = useState(null);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);

  const loadOrders = useCallback(async (pageNum = 1) => {
    setLoading(true);
    // Server-side pagination — never loads all orders at once
    const from = (pageNum - 1) * PER_PAGE;
    const to   = from + PER_PAGE - 1;
    const { data, count } = await supabase
      .from('orders')
      .select('*, users(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (data)   setOrders(data);
    if (count !== null) setTotal(count);
    setLoading(false);
  }, []);

  useEffect(() => { loadOrders(1); }, [loadOrders]);

  const updateStatus = async (orderId, newStatus) => {
    setUpdating(orderId);
    const { error } = await supabase
      .from('orders').update({ status: newStatus }).eq('id', orderId);
    if (!error) {
      setMsg(`✅ Order updated to "${newStatus}"`);
      loadOrders(page);
    } else {
      setMsg('❌ Update failed: ' + error.message);
    }
    setUpdating(null);
    setTimeout(() => setMsg(''), 3000);
  };

  const refundOrder = async (order) => {
    if (!window.confirm(`Refund PKR ${parseFloat(order.cost||0).toLocaleString()} and cancel order?`)) return;
    setUpdating(order.id);
    const { data: profile } = await supabase
      .from('users').select('balance').eq('id', order.user_id).single();
    if (profile) {
      const newBal = parseFloat(profile.balance||0) + parseFloat(order.cost||0);
      await supabase.from('users').update({ balance: newBal }).eq('id', order.user_id);
      await supabase.from('transactions').insert({
        user_id: order.user_id, type: 'refund',
        amount: parseFloat(order.cost||0),
        description: `Refund: Order ${order.order_ref || order.id}`,
        ref_id: order.order_ref,
      });
    }
    await supabase.from('orders').update({ status:'cancelled' }).eq('id', order.id);
    setMsg('✅ Order refunded and cancelled.');
    loadOrders(page);
    setUpdating(null);
    setTimeout(() => setMsg(''), 4000);
  };

  // Local filter on the current page
  const filtered = orders.filter(o => {
    const matchStatus = filter==='all' || o.status===filter;
    const matchSearch = !search ||
      (o.order_ref    || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.service_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.link         || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.users?.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.users?.full_name || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalPages = Math.ceil(total / PER_PAGE);

  const stats = {
    total,
    pending:    orders.filter(o => o.status==='pending').length,
    inProgress: orders.filter(o => o.status==='in_progress').length,
    completed:  orders.filter(o => o.status==='completed').length,
    revenue:    orders.reduce((a,b) => a + parseFloat(b.cost||0), 0),
  };

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border:`1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius:'8px', padding:'12px', textAlign:'center',
          color: msg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
          fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>{msg}</div>
      )}

      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📦', lb:'Total Orders',  vl: total,                      cl:'cn'  },
          { ic:'⏳', lb:'Pending',       vl: stats.pending,               cl:'cw'  },
          { ic:'⚡', lb:'In Progress',   vl: stats.inProgress,            cl:'cn'  },
          { ic:'✅', lb:'Completed',     vl: stats.completed,             cl:'cg'  },
          { ic:'💰', lb:'Revenue',       vl:`$${stats.revenue.toFixed(2)}`,cl:'cgo' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
        <input className="srch-inp" style={{ flex:1, minWidth:'160px' }}
          placeholder="🔍 Search by order ID, service, user, link..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn bgh bsm" onClick={() => loadOrders(page)}>🔄 Refresh</button>
      </div>

      <div style={{ display:'flex', gap:'6px', marginBottom:'14px', flexWrap:'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }} style={{
            padding:'5px 12px', borderRadius:'20px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'10px', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'1px',
            background: filter===s ? 'var(--neon)' : 'var(--gl)',
            color: filter===s ? '#000' : 'var(--text3)',
            border: filter===s ? 'none' : '1px solid var(--br)',
          }}>
            {s.replace('_',' ')}
          </button>
        ))}
      </div>

      <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'8px' }}>
        Showing page {page} of {totalPages} · {total.toLocaleString()} total orders
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading orders...</div>
      ) : (
        <>
          <div className="tblw">
            <table>
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>User</th>
                  <th>Service</th>
                  <th>Link</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  <th>Start</th>
                  <th>Remains</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign:'center', padding:'32px', color:'var(--text3)' }}>
                      No orders found
                    </td>
                  </tr>
                ) : filtered.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily:'var(--fm)', color:'var(--neon)', fontSize:'11px', whiteSpace:'nowrap' }}>
                      {o.order_ref || o.id}
                      {o.vendor_order_id && (
                        <div style={{ fontSize:'9px', color:'var(--text3)' }}>V: {o.vendor_order_id}</div>
                      )}
                    </td>
                    <td style={{ fontSize:'11px', maxWidth:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <div style={{ color:'var(--text)', fontWeight:600 }}>{o.users?.full_name || '—'}</div>
                      <div style={{ color:'var(--text3)', fontSize:'9px' }}>{(o.users?.email||'').slice(0,18)}</div>
                    </td>
                    <td style={{ fontWeight:600, maxWidth:'110px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'12px' }}>
                      {o.service_name}
                    </td>
                    <td style={{ maxWidth:'80px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {o.link ? (
                        <a href={/^https?:\/\//.test(o.link) ? o.link : '#'}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color:'var(--neon)', fontSize:'10px', textDecoration:'none' }}>
                          🔗 View
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ fontFamily:'var(--fm)', fontSize:'11px' }}>{(o.quantity||0).toLocaleString()}</td>
                    <td style={{ color:'var(--gold)', fontFamily:'var(--fm)', fontWeight:700, fontSize:'12px' }}>
                      ${parseFloat(o.cost||0).toFixed(2)}
                    </td>
                    {/* START count */}
                    <td style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--text2)' }}>
                      {o.start_count != null ? o.start_count.toLocaleString() : '–'}
                    </td>
                    {/* REMAINS count */}
                    <td style={{ fontFamily:'var(--fm)', fontSize:'11px', color: o.remains > 0 ? 'var(--neon)' : 'var(--green)' }}>
                      {o.remains != null ? o.remains.toLocaleString() : '–'}
                    </td>
                    <td>
                      <select value={o.status} disabled={updating===o.id}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        style={{
                          background:'var(--bg2)', border:'1px solid var(--br)',
                          borderRadius:'6px', color:'var(--text)', padding:'4px 6px',
                          fontSize:'11px', cursor:'pointer', minWidth:'100px'
                        }}>
                        <option value="pending">⏳ Pending</option>
                        <option value="in_progress">⚡ In Progress</option>
                        <option value="completed">✅ Completed</option>
                        <option value="cancelled">❌ Cancelled</option>
                      </select>
                      {o.provider_note && (
                        <div style={{ fontSize:'9px', color:'var(--warn)', marginTop:'2px', maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          ⚠️ {o.provider_note}
                        </div>
                      )}
                    </td>
                    <td style={{ color:'var(--text3)', fontSize:'10px', whiteSpace:'nowrap' }}>
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {o.status !== 'cancelled' && o.status !== 'completed' && (
                          <button onClick={() => refundOrder(o)} disabled={updating===o.id}
                            style={{
                              padding:'4px 8px', borderRadius:'6px', cursor:'pointer',
                              border:'1px solid rgba(255,50,80,.3)', background:'rgba(255,50,80,.1)',
                              color:'#ff6b6b', fontSize:'10px', whiteSpace:'nowrap'
                            }}>
                            💸 Refund
                          </button>
                        )}
                        {o.refill_requested && (
                          <span style={{ fontSize:'9px', color:'var(--gold)', whiteSpace:'nowrap', padding:'4px' }}>
                            🔁 Refill req.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', gap:'6px', marginTop:'16px', flexWrap:'wrap', alignItems:'center' }}>
              <button className="btn bgh bsm"
                onClick={() => { const p = Math.max(1,page-1); setPage(p); loadOrders(p); }}
                disabled={page===1}>← Prev</button>
              <span style={{ padding:'6px 12px', fontSize:'12px', color:'var(--text2)' }}>
                Page {page} / {totalPages} ({total} orders)
              </span>
              <button className="btn bgh bsm"
                onClick={() => { const p = Math.min(totalPages,page+1); setPage(p); loadOrders(p); }}
                disabled={page===totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

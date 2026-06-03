import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

// Valid status transitions — cancelled and completed are terminal states
const STATUS_TRANSITIONS = {
  pending:     ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
};

const statusList = ['all', 'pending', 'in_progress', 'completed', 'cancelled'];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [updating, setUpdating] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 30;
  const channelRef = useRef(null);
  const debounceRef = useRef(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*, users(full_name, email)')
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();

    // FIX #13: payload-based incremental updates instead of full reload on every event
    const ch = supabase
      .channel('admin-orders-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setOrders(prev =>
              prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
          // Debounced full reload as fallback (max once per 15 seconds)
          clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(loadOrders, 15000);
        }
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      clearTimeout(debounceRef.current);
    };
  }, [loadOrders]);

  const updateStatus = async (order, newStatus) => {
    // FIX #18: enforce valid state machine transitions
    const allowed = STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      setMsg(`❌ Cannot change status from "${order.status}" to "${newStatus}"`);
      setTimeout(() => setMsg(''), 4000);
      return;
    }

    setUpdating(order.id);
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', order.id);

    if (!error) {
      setMsg(`✅ Updated to "${newStatus}"`);
      setTimeout(() => setMsg(''), 3000);
    } else {
      setMsg('❌ ' + error.message);
    }
    setUpdating(null);
    loadOrders();
  };

  const refundOrder = async (order) => {
    if (!window.confirm(`Refund $${parseFloat(order.cost || 0).toFixed(2)} and cancel?`)) return;
    setUpdating(order.id);

    // FIX #15: re-fetch order status from DB before refunding
    const { data: freshOrder } = await supabase
      .from('orders')
      .select('status, cost')
      .eq('id', order.id)
      .single();

    if (!freshOrder || freshOrder.status === 'cancelled') {
      setMsg('⚠️ Order is already cancelled or refunded.');
      setUpdating(null);
      return;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('balance')
      .eq('id', order.user_id)
      .single();

    if (profile) {
      const refundAmount = parseFloat(freshOrder.cost || 0);
      const newBal = parseFloat(profile.balance || 0) + refundAmount;
      await supabase.from('users').update({ balance: newBal }).eq('id', order.user_id);
      await supabase.from('transactions').insert({
        user_id: order.user_id,
        type: 'refund',
        amount: refundAmount,
        description: `Admin refund: ${order.order_ref || order.id}`,
        ref_id: order.order_ref,
      });
    }

    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    setMsg('✅ Refunded and cancelled.');
    setTimeout(() => setMsg(''), 4000);
    setUpdating(null);
    loadOrders();
  };

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter;
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (o.order_ref || '').toLowerCase().includes(s) ||
      (o.service_name || '').toLowerCase().includes(s) ||
      (o.link || '').toLowerCase().includes(s) ||
      (o.users?.email || '').toLowerCase().includes(s) ||
      (o.users?.full_name || '').toLowerCase().includes(s);
    return matchStatus && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = {
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending').length,
    inProgress: orders.filter(o => o.status === 'in_progress').length,
    completed:  orders.filter(o => o.status === 'completed').length,
    revenue:    orders.reduce((a, b) => a + parseFloat(b.cost || 0), 0),
  };

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: msg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
          fontWeight: 700, marginBottom: '16px', fontSize: '13px'
        }}>{msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontSize: '11px', color: 'var(--text3)' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
        Live — updates automatically
      </div>

      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '📦', lb: 'Total',       vl: stats.total,                     cl: 'cn'  },
          { ic: '⏳', lb: 'Pending',     vl: stats.pending,                   cl: 'cw'  },
          { ic: '⚡', lb: 'In Progress', vl: stats.inProgress,                cl: 'cn'  },
          { ic: '✅', lb: 'Completed',   vl: stats.completed,                 cl: 'cg'  },
          { ic: '💰', lb: 'Revenue',     vl: `$${stats.revenue.toFixed(2)}`,  cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input className="srch-inp" style={{ flex: 1, minWidth: '160px' }}
          placeholder="🔍 Search by order ID, service, user, link..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn bgh bsm" onClick={loadOrders}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }}
            style={{
              padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
              fontFamily: 'var(--fu)', fontSize: '10px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px',
              background: filter === s ? 'var(--neon)' : 'var(--gl)',
              color: filter === s ? '#000' : 'var(--text3)',
              border: filter === s ? 'none' : '1px solid var(--br)',
            }}>
            {s.replace('_', ' ')} ({s === 'all' ? orders.length : orders.filter(o => o.status === s).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading orders...</div>
      ) : (
        <>
          <div className="tblw">
            <table>
              <thead>
                <tr>
                  <th>Order Ref</th><th>User</th><th>Service</th>
                  <th>Link</th><th>Qty</th><th>Cost</th>
                  <th>Status</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                      No orders found
                    </td>
                  </tr>
                ) : paginated.map(o => {
                  // FIX #18: only show allowed next statuses for this order
                  const allowedNext = STATUS_TRANSITIONS[o.status] || [];
                  return (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {o.order_ref || o.id}
                        {o.vendor_order_id && (
                          <div style={{ fontSize: '9px', color: 'var(--text3)' }}>P: {o.vendor_order_id}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div style={{ color: 'var(--text)', fontWeight: 600 }}>{o.users?.full_name || '—'}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{(o.users?.email || '').slice(0, 18)}</div>
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {o.service_name}
                      </td>
                      <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={o.link} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--neon)', fontSize: '10px', textDecoration: 'none' }}>
                          {o.link ? '🔗 View' : '—'}
                        </a>
                      </td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '11px' }}>
                        {(o.quantity || 0).toLocaleString()}
                      </td>
                      <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700, fontSize: '12px' }}>
                        ${parseFloat(o.cost || 0).toFixed(2)}
                      </td>
                      <td>
                        {/* FIX #18: only render valid next-state options */}
                        {allowedNext.length > 0 ? (
                          <select
                            value={o.status}
                            disabled={updating === o.id}
                            onChange={e => updateStatus(o, e.target.value)}
                            style={{
                              background: 'var(--bg2)', border: '1px solid var(--br)',
                              borderRadius: '6px', color: 'var(--text)', padding: '4px 6px',
                              fontSize: '11px', cursor: 'pointer', minWidth: '100px'
                            }}>
                            <option value={o.status} disabled>
                              {o.status.replace('_', ' ')}
                            </option>
                            {allowedNext.map(s => (
                              <option key={s} value={s}>{s.replace('_', ' ')}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{
                            fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
                            background: o.status === 'completed' ? 'rgba(0,255,136,.1)' : 'rgba(255,50,80,.1)',
                            color: o.status === 'completed' ? 'var(--green)' : '#ff6b6b',
                          }}>
                            {o.status === 'completed' ? '✅ Completed' : '❌ Cancelled'}
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text3)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {o.status !== 'cancelled' && o.status !== 'completed' && (
                            <button onClick={() => refundOrder(o)} disabled={updating === o.id}
                              style={{
                                padding: '4px 8px', borderRadius: '6px', cursor: 'pointer',
                                border: '1px solid rgba(255,50,80,.3)', background: 'rgba(255,50,80,.1)',
                                color: '#ff6b6b', fontSize: '10px', whiteSpace: 'nowrap'
                              }}>
                              💸 Refund
                            </button>
                          )}
                          {o.refill_requested && (
                            <span style={{ fontSize: '9px', color: 'var(--gold)', padding: '4px' }}>🔁 Refill</span>
                          )}
                          {o.provider_note && (
                            <span title={o.provider_note}
                              style={{ fontSize: '9px', color: 'var(--danger)', padding: '4px', cursor: 'help' }}>⚠️</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button className="btn bgh bsm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text2)' }}>Page {page} / {totalPages}</span>
              <button className="btn bgh bsm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

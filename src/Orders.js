import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

const statusList = ['all', 'pending', 'in_progress', 'completed', 'cancelled'];

export default function Orders({ user }) {
  const { format } = useCurrency();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [actionMsg, setActionMsg] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const canCancel = (order) => {
    if (order.status !== 'pending') return false;
    return true;
  };

  const canRefill = (order) => {
    if (order.status !== 'completed') return false;
    if (order.refill_requested) return false;
    const name = (order.service_name || '').toLowerCase();
    const hasRefillByName =
      name.includes('refill') || name.includes('guaranteed');
    if (!order.has_refill && !hasRefillByName) return false;
    return true;
  };

  // FIX #5A + #5B: re-fetch status before cancel, and insert transaction log
  const cancelOrder = async (order) => {
    if (!window.confirm('Cancel this order? Your balance will be refunded.')) return;

    // Re-fetch order from DB to prevent double-cancel race condition
    const { data: freshOrder } = await supabase
      .from('orders')
      .select('status, cost')
      .eq('id', order.id)
      .eq('user_id', user.id)
      .single();

    if (!freshOrder || freshOrder.status !== 'pending') {
      setActionMsg('❌ Order cannot be cancelled. Status may have changed.');
      setTimeout(() => setActionMsg(''), 4000);
      return;
    }

    // Fetch current DB balance (not stale state)
    const { data: profile } = await supabase
      .from('users')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (!profile) {
      setActionMsg('❌ Could not fetch balance. Please refresh and try again.');
      setTimeout(() => setActionMsg(''), 4000);
      return;
    }

    const refundAmount = parseFloat(freshOrder.cost || 0);
    const newBalance = parseFloat(profile.balance || 0) + refundAmount;

    // Update balance
    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id);

    // Update order status
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id);

    // FIX #5B: insert the missing transaction record
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'refund',
      amount: refundAmount,
      description: `Cancellation refund: ${order.order_ref || order.id}`,
      ref_id: order.order_ref || order.id,
    });

    setActionMsg('✅ Order cancelled. Your balance has been refunded!');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const refillOrder = async (order) => {
    if (!window.confirm('Request a refill for this order?')) return;
    await supabase
      .from('orders')
      .update({ refill_requested: true })
      .eq('id', order.id);
    setActionMsg('✅ Refill requested! Admin will process it shortly.');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const filtered = orders.filter(o =>
    filter === 'all' || o.status === filter
  );

  const stats = {
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    progress:  orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
  };

  const badgeClass = (s) => {
    if (s === 'completed')   return 'b-completed';
    if (s === 'in_progress') return 'b-processing';
    if (s === 'pending')     return 'b-pending';
    return 'b-rejected';
  };

  return (
    <div>
      {actionMsg && (
        <div style={{
          background: actionMsg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border: `1px solid ${actionMsg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: actionMsg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
          fontWeight: 700, marginBottom: '16px', fontSize: '13px'
        }}>{actionMsg}</div>
      )}

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '📦', lb: 'Total',       vl: stats.total,     cl: 'cn' },
          { ic: '⏳', lb: 'Pending',     vl: stats.pending,   cl: 'cw' },
          { ic: '⚡', lb: 'In Progress', vl: stats.progress,  cl: 'cn' },
          { ic: '✅', lb: 'Completed',   vl: stats.completed, cl: 'cg' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => setFilter(s)}
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
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>Loading orders...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📦</span>
          <div className="empty-tx">No orders found</div>
          <div className="empty-sb">
            {orders.length === 0 ? 'You have no orders yet' : 'No orders match this filter'}
          </div>
        </div>
      ) : (
        <div className="tblw">
          <table>
            <thead>
              <tr>
                <th>#ID</th><th>Service</th><th>Link</th>
                <th>Qty</th><th>Cost</th><th>Status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {o.order_ref || o.id?.slice(0, 8)}
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {o.service_name}
                  </td>
                  <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.link ? (
                      <a href={o.link} target="_blank" rel="noreferrer"
                        style={{ color: 'var(--neon)', fontSize: '10px', textDecoration: 'none' }}>
                        🔗 View
                      </a>
                    ) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--fm)', fontSize: '11px' }}>
                    {(o.quantity || 0).toLocaleString()}
                  </td>
                  <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700, fontSize: '12px' }}>
                    {format(parseFloat(o.cost || 0))}
                  </td>
                  <td>
                    <span className={`bdg ${badgeClass(o.status)}`}>
                      {o.status?.replace('_', ' ')}
                    </span>
                    {o.provider_note && (
                      <span title={o.provider_note}
                        style={{ fontSize: '9px', color: 'var(--warn)', marginLeft: '4px', cursor: 'help' }}>⚠️</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text3)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                    <div>{new Date(o.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: '9px' }}>
                      {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {canCancel(o) && (
                        <button onClick={() => cancelOrder(o)}
                          style={{
                            padding: '4px 8px', borderRadius: '6px',
                            border: '1px solid rgba(255,50,50,.3)',
                            background: 'rgba(255,50,50,.1)', color: '#ff6b6b',
                            cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap'
                          }}>
                          Cancel
                        </button>
                      )}
                      {canRefill(o) && !o.refill_requested && (
                        <button onClick={() => refillOrder(o)}
                          style={{
                            padding: '4px 8px', borderRadius: '6px',
                            border: '1px solid rgba(0,255,136,.3)',
                            background: 'rgba(0,255,136,.1)', color: 'var(--green)',
                            cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap'
                          }}>
                          🔁 Refill
                        </button>
                      )}
                      {o.refill_requested && (
                        <span style={{ fontSize: '9px', color: 'var(--gold)', padding: '4px' }}>
                          🔁 Refill Requested
                        </span>
                      )}
                      {(o.status === 'completed' || o.status === 'cancelled') && (
                        <span style={{ fontSize: '9px', color: 'var(--text3)', padding: '4px' }}>
                          {o.status === 'completed' ? '✅ Done' : '❌ Cancelled'}
                        </span>
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

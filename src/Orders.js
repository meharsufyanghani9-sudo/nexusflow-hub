import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const PROXY = 'https://ctbfovtqjwrxbepccthw.supabase.co/functions/v1/proxy';

const statusList = ['all', 'pending', 'in_progress', 'completed', 'cancelled'];

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
    <span style={{ fontSize: '10px', color: 'var(--gold)', fontFamily: 'var(--fm)', marginLeft: '6px' }}>
      ⏱ {label}: {timeLeft}
    </span>
  );
}

export default function Orders({ user }) {
  const [filter, setFilter] = useState('all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [retrying, setRetrying] = useState(null);

  useEffect(() => { loadOrders(); }, []);

  // Auto-refresh every 30 seconds to catch status updates
  useEffect(() => {
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    if (error) console.error('Load orders error:', error.message);
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
    const created = new Date(order.created_at);
    const diff = new Date() - created;
    return diff < 15 * 60 * 1000; // 15 minutes window
  };

  const canRefill = (order) => {
    // Only allow refill for completed or in_progress orders that have a vendor_order_id
    if (order.status !== 'in_progress' && order.status !== 'completed') return false;
    if (!order.vendor_order_id) return false;
    return true;
  };

  const cancelOrder = async (order) => {
    if (!window.confirm('Cancel this order? Your balance will be refunded.')) return;

    // Don't allow cancel if already placed with vendor (has vendor_order_id)
    if (order.vendor_order_id) {
      setActionMsg('❌ This order is already being processed by provider and cannot be cancelled.');
      setTimeout(() => setActionMsg(''), 4000);
      return;
    }

    // Get fresh balance
    const { data: profile } = await supabase.from('users').select('balance').eq('id', user.id).single();
    if (!profile) { setActionMsg('❌ Could not fetch your balance. Try again.'); return; }

    const newBalance = parseFloat(profile.balance) + parseFloat(order.cost || 0);
    await supabase.from('users').update({ balance: newBalance }).eq('id', user.id);
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'refund',
      amount: parseFloat(order.cost || 0),
      description: `Refund: ${order.service_name || 'Order'} cancelled`,
      ref_id: order.order_ref,
    });

    setActionMsg('✅ Order cancelled. Your balance has been refunded!');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const refillOrder = async (order) => {
    if (!window.confirm('Request a refill for this order?')) return;
    // Use update with only existing safe columns
    const updateData = { refill_requested: true };
    const { error } = await supabase.from('orders').update(updateData).eq('id', order.id);
    if (error) {
      setActionMsg('❌ Refill request failed: ' + error.message);
    } else {
      setActionMsg('✅ Refill requested! Admin will process it shortly.');
    }
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  // ─── Retry auto-placement for stuck pending orders ───────────────────────
  const retryAutoPlace = async (order) => {
    if (retrying) return;
    setRetrying(order.id);

    // Fetch the service to get provider config
    const { data: service } = await supabase
      .from('services')
      .select('provider_api_url, provider_api_key, provider_service_id')
      .eq('id', order.service_id)
      .single();

    if (!service || !service.provider_api_url || !service.provider_api_key || !service.provider_service_id) {
      setActionMsg('❌ This service has no provider configured. Contact admin.');
      setRetrying(null);
      setTimeout(() => setActionMsg(''), 4000);
      return;
    }

    try {
      const res = await fetch(PROXY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X',
        },
        body: JSON.stringify({
          url: service.provider_api_url,
          key: service.provider_api_key,
          action: 'add',
          service: service.provider_service_id,
          link: order.link,
          quantity: order.quantity,
        }),
      });
      const providerData = await res.json();
      if (providerData && providerData.order) {
        await supabase.from('orders').update({
          vendor_order_id: String(providerData.order),
          status: 'in_progress',
          provider_note: null,
        }).eq('id', order.id);
        setActionMsg('✅ Order successfully sent to provider!');
      } else {
        const errMsg = providerData?.error || 'Unknown provider response';
        await supabase.from('orders').update({
          provider_note: `Retry failed: ${errMsg}`,
        }).eq('id', order.id);
        setActionMsg('❌ Provider error: ' + errMsg);
      }
    } catch (e) {
      setActionMsg('❌ Connection error: ' + e.message);
    }

    setRetrying(null);
    loadOrders();
    setTimeout(() => setActionMsg(''), 5000);
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
          background: actionMsg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border: `1px solid ${actionMsg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: actionMsg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
          fontWeight: 700, marginBottom: '16px', fontSize: '13px'
        }}>
          {actionMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {statusList.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
              fontFamily: 'var(--fu)', fontSize: '11px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px', transition: '.15s',
              background: filter === s ? 'var(--neon)' : 'var(--gl)',
              color: filter === s ? '#000' : 'var(--text3)',
              border: filter === s ? 'none' : '1px solid var(--br)',
            }}>
            {s.replace('_', ' ')}
          </button>
        ))}
        <button onClick={loadOrders}
          style={{
            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
            fontFamily: 'var(--fu)', fontSize: '11px', fontWeight: 700,
            background: 'var(--gl)', color: 'var(--text3)', border: '1px solid var(--br)',
          }}>🔄</button>
      </div>

      {/* Stats Row */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '📦', lb: 'Total', vl: stats.total, cl: 'cn' },
          { ic: '✅', lb: 'Completed', vl: stats.completed, cl: 'cg' },
          { ic: '⚡', lb: 'In Progress', vl: stats.progress, cl: 'cn' },
          { ic: '⏳', lb: 'Pending', vl: stats.pending, cl: 'cw' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading orders...</div>
      ) : (
        <div className="tblw">
          <table>
            <thead>
              <tr>
                <th>#ID</th>
                <th>Service</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                    No orders found
                  </td>
                </tr>
              ) : filtered.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>
                    {o.order_ref || o.id?.slice(0, 8)}
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.service_name}
                  </td>
                  <td style={{ fontFamily: 'var(--fm)' }}>{o.quantity?.toLocaleString()}</td>
                  <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                    ${parseFloat(o.cost || 0).toFixed(2)}
                  </td>
                  <td>
                    <span className={`bdg ${badgeClass(o.status)}`}>
                      {o.status?.replace('_', ' ')}
                    </span>
                    {canCancel(o) && (
                      <CountdownTimer
                        targetTime={new Date(new Date(o.created_at).getTime() + 15 * 60 * 1000)}
                        label="Cancel in"
                      />
                    )}
                    {o.vendor_order_id && (
                      <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                        Vendor: {o.vendor_order_id}
                      </div>
                    )}
                    {/* Show provider error note if placement failed */}
                    {o.provider_note && o.status === 'pending' && (
                      <div style={{ fontSize: '9px', color: '#ff9800', marginTop: '2px' }}>
                        ⚠️ Auto-placement failed
                      </div>
                    )}
                  </td>
                  <td style={{ color: 'var(--text3)', fontSize: '10px' }}>
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {canCancel(o) && !o.vendor_order_id && (
                        <button onClick={() => cancelOrder(o)}
                          style={{
                            padding: '4px 10px', borderRadius: '6px',
                            border: '1px solid rgba(255,50,50,.3)',
                            background: 'rgba(255,50,50,.1)', color: '#ff6b6b',
                            cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap'
                          }}>
                          Cancel
                        </button>
                      )}
                      {/* Retry button for stuck pending orders with provider error */}
                      {o.status === 'pending' && o.provider_note && (
                        <button
                          onClick={() => retryAutoPlace(o)}
                          disabled={retrying === o.id}
                          style={{
                            padding: '4px 10px', borderRadius: '6px',
                            border: '1px solid rgba(255,184,0,.3)',
                            background: 'rgba(255,184,0,.1)', color: 'var(--gold)',
                            cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap'
                          }}>
                          {retrying === o.id ? '⏳' : '🔄 Retry'}
                        </button>
                      )}
                      {canRefill(o) && !o.refill_requested && (
                        <button onClick={() => refillOrder(o)}
                          style={{
                            padding: '4px 10px', borderRadius: '6px',
                            border: '1px solid rgba(0,255,136,.3)',
                            background: 'rgba(0,255,136,.1)', color: 'var(--green)',
                            cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap'
                          }}>
                          Refill
                        </button>
                      )}
                      {o.refill_requested && (
                        <span style={{ fontSize: '10px', color: 'var(--gold)' }}>⏳ Refill pending</span>
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

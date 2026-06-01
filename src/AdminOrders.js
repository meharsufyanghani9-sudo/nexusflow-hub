import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const statusList = ['all', 'pending', 'in_progress', 'completed', 'cancelled'];
const PER_PAGE = 30;

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [updating, setUpdating] = useState(null);
  // ── FIX: Server-side pagination state ────────────────────────────────────
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  // Stats are tracked separately so they always show total counts, not just this page
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0, revenue: 0 });

  // ── FIX: loadOrders now uses server-side .range() pagination ─────────────
  // OLD CODE loaded ALL orders at once — at 50,000 orders this crashes the browser.
  // NEW CODE loads only 30 rows at a time from the database.
  const loadOrders = useCallback(async (pageNum = 1, statusFilter = 'all', searchTerm = '') => {
    setLoading(true);
    const from = (pageNum - 1) * PER_PAGE;
    const to = from + PER_PAGE - 1;

    let query = supabase
      .from('orders')
      .select('*, users(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (searchTerm.trim()) {
      // Search across ref, service name, and link
      query = query.or(
        `order_ref.ilike.%${searchTerm}%,service_name.ilike.%${searchTerm}%,link.ilike.%${searchTerm}%`
      );
    }

    const { data, count } = await query;
    if (data) setOrders(data);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, []);

  // Load summary stats separately (these are lightweight aggregate counts)
  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('status, cost');
    if (data) {
      setStats({
        total:      data.length,
        pending:    data.filter(o => o.status === 'pending').length,
        inProgress: data.filter(o => o.status === 'in_progress').length,
        completed:  data.filter(o => o.status === 'completed').length,
        revenue:    data.reduce((a, b) => a + parseFloat(b.cost || 0), 0),
      });
    }
  }, []);

  useEffect(() => {
    loadOrders(1, 'all', '');
    loadStats();
  }, [loadOrders, loadStats]);

  // When filter or search changes, reset to page 1 and reload
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(1);
    loadOrders(1, newFilter, search);
  };

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
    loadOrders(1, filter, val);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadOrders(newPage, filter, search);
  };

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  const updateStatus = async (orderId, newStatus) => {
    if (updating) return;
    setUpdating(orderId);
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);
    if (!error) {
      setMsg(`✅ Order updated to "${newStatus}"`);
      loadOrders(page, filter, search);
      loadStats();
      setTimeout(() => setMsg(''), 3000);
    } else {
      setMsg('❌ Update failed: ' + error.message);
    }
    setUpdating(null);
  };

  const refundOrder = async (order) => {
    if (updating) return;
    if (!window.confirm(`Refund $${parseFloat(order.cost || 0).toFixed(2)} and cancel order?`)) return;
    setUpdating(order.id);

    const { data: profile } = await supabase
      .from('users').select('balance').eq('id', order.user_id).single();

    if (profile) {
      const newBal = parseFloat(profile.balance || 0) + parseFloat(order.cost || 0);
      await supabase.from('users').update({ balance: newBal }).eq('id', order.user_id);
      await supabase.from('transactions').insert({
        user_id: order.user_id,
        type: 'refund',
        amount: parseFloat(order.cost || 0),
        description: `Admin refund: Order ${order.order_ref || order.id}`,
        ref_id: order.order_ref || order.id,
      });
    }
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    setMsg('✅ Order refunded and cancelled.');
    loadOrders(page, filter, search);
    loadStats();
    setTimeout(() => setMsg(''), 4000);
    setUpdating(null);
  };

  // ── FIX: Safe link renderer — blocks javascript: / data: XSS in the link column
  const safeLink = (rawLink) => {
    if (!rawLink) return null;
    try {
      const parsed = new URL(rawLink.startsWith('http') ? rawLink : 'https://' + rawLink);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.href;
    } catch {
      return null;
    }
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

      {/* Stats — always show totals across ALL orders, not just this page */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '📦', lb: 'Total Orders', vl: stats.total,                      cl: 'cn'  },
          { ic: '⏳', lb: 'Pending',      vl: stats.pending,                     cl: 'cw'  },
          { ic: '⚡', lb: 'In Progress',  vl: stats.inProgress,                  cl: 'cn'  },
          { ic: '✅', lb: 'Completed',    vl: stats.completed,                    cl: 'cg'  },
          { ic: '💰', lb: 'Revenue',      vl: `$${stats.revenue.toFixed(2)}`,     cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input
          className="srch-inp"
          style={{ flex: 1, minWidth: '160px' }}
          placeholder="🔍 Search by order ID, service, or link..."
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
        />
        <button
          className="btn bgh bsm"
          onClick={() => { loadOrders(page, filter, search); loadStats(); }}>
          🔄 Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {statusList.map(s => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            style={{
              padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
              fontFamily: 'var(--fu)', fontSize: '10px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px', transition: '.15s',
              background: filter === s ? 'var(--neon)' : 'var(--gl)',
              color: filter === s ? '#000' : 'var(--text3)',
              border: filter === s ? 'none' : '1px solid var(--br)',
            }}>
            {s.replace('_', ' ')}
            {s === 'all' ? ` (${stats.total})` : ` (${stats[s === 'in_progress' ? 'inProgress' : s] ?? ''})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading orders...</div>
      ) : (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' }}>
            Showing {orders.length} of {totalCount} orders
            {filter !== 'all' ? ` with status "${filter}"` : ''}
            {search ? ` matching "${search}"` : ''}
          </div>

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
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                      No orders found
                    </td>
                  </tr>
                ) : orders.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {o.order_ref || o.id}
                      {o.vendor_order_id && (
                        <div style={{ fontSize: '9px', color: 'var(--text3)' }}>P: {o.vendor_order_id}</div>
                      )}
                      {o.needs_manual_processing && (
                        <div style={{ fontSize: '9px', color: 'var(--danger)', fontWeight: 700 }}>⚠️ Manual</div>
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
                      {/* ── FIX: Only render link if it passes the safe URL check (blocks XSS) */}
                      {safeLink(o.link) ? (
                        <a
                          href={safeLink(o.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--neon)', fontSize: '10px', textDecoration: 'none' }}>
                          🔗 View
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: '10px' }}>
                          {o.link ? '⚠️ Invalid' : '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--fm)', fontSize: '11px' }}>
                      {(o.quantity || 0).toLocaleString()}
                    </td>
                    <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700, fontSize: '12px' }}>
                      ${parseFloat(o.cost || 0).toFixed(2)}
                    </td>
                    <td>
                      <select
                        value={o.status}
                        disabled={updating === o.id}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        style={{
                          background: 'var(--bg2)', border: '1px solid var(--br)',
                          borderRadius: '6px', color: 'var(--text)', padding: '4px 6px',
                          fontSize: '11px', cursor: updating === o.id ? 'not-allowed' : 'pointer',
                          minWidth: '100px', opacity: updating === o.id ? 0.5 : 1,
                        }}>
                        <option value="pending">⏳ Pending</option>
                        <option value="in_progress">⚡ In Progress</option>
                        <option value="completed">✅ Completed</option>
                        <option value="cancelled">❌ Cancelled</option>
                      </select>
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {o.status !== 'cancelled' && o.status !== 'completed' && (
                          <button
                            onClick={() => refundOrder(o)}
                            disabled={updating === o.id}
                            style={{
                              padding: '4px 8px', borderRadius: '6px',
                              cursor: updating === o.id ? 'not-allowed' : 'pointer',
                              border: '1px solid rgba(255,50,80,.3)',
                              background: updating === o.id ? 'rgba(100,100,100,.15)' : 'rgba(255,50,80,.1)',
                              color: updating === o.id ? 'var(--text3)' : '#ff6b6b',
                              fontSize: '10px', whiteSpace: 'nowrap',
                              opacity: updating === o.id ? 0.5 : 1,
                            }}>
                            {updating === o.id ? '⏳' : '💸 Refund'}
                          </button>
                        )}
                        {o.refill_requested && (
                          <span style={{ fontSize: '9px', color: 'var(--gold)', whiteSpace: 'nowrap', padding: '4px' }}>
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

          {/* ── FIX: Pagination controls ── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="btn bgh bsm"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}>
                ← Prev
              </button>
              <span style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text2)' }}>
                Page {page} / {totalPages} &nbsp;·&nbsp; {totalCount} total orders
              </span>
              <button
                className="btn bgh bsm"
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

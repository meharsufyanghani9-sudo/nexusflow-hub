import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';
// REFACTOR Phase-24: badgeClass centralised in utils.js — removed local duplicate
import { badgeClass } from './utils';

const statusList = ['all', 'pending', 'in_progress', 'completed', 'cancelled'];

// ─── How many rows to show per page ──────────────────────────────────────────
const PAGE_SIZE = 20;

// ─── Shimmer skeleton — reused for stats cards and table rows ─────────────────
const shimmerStyle = {
  background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: '6px',
};

// ─── Skeleton stat card (shown while data loads) ──────────────────────────────
function StatSkeleton() {
  return (
    <div className="sc" style={{ gap: '8px' }}>
      <div style={{ ...shimmerStyle, width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto' }} />
      <div style={{ ...shimmerStyle, width: '60%', height: '10px', margin: '0 auto' }} />
      <div style={{ ...shimmerStyle, width: '40%', height: '18px', margin: '0 auto' }} />
    </div>
  );
}

// ─── Skeleton table row (shown while data loads) ──────────────────────────────
function RowSkeleton({ index }) {
  return (
    <tr style={{ opacity: 1 - index * 0.1, animation: 'none' }}>
      {[70, 110, 50, 45, 55, 70, 65, 80].map((w, i) => (
        <td key={i}>
          <div style={{ ...shimmerStyle, width: `${w}%`, height: '12px' }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Single order row — fades in when it mounts ───────────────────────────────
// Uses an IntersectionObserver so rows only animate when they enter the viewport.
function OrderRow({ o, index, format, canCancel, canRefill, onCancel, onRefill, badgeClass }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <tr
      ref={ref}
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'translateY(0)' : 'translateY(12px)',
        transition: `opacity 0.3s ease ${Math.min(index, 8) * 40}ms, transform 0.3s ease ${Math.min(index, 8) * 40}ms`,
      }}
    >
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
            <button onClick={() => onCancel(o)}
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
            <button onClick={() => onRefill(o)}
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
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Orders({ user }) {
  const { format } = useCurrency();
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all');
  const [actionMsg, setActionMsg] = useState('');

  // ── Pagination: how many filtered rows are currently shown ────────────────
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset pagination whenever the filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter]);

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

  const canCancel = (order) => order.status === 'pending';

  const canRefill = (order) => {
    if (order.status !== 'completed') return false;
    if (order.refill_requested) return false;
    const name = (order.service_name || '').toLowerCase();
    const hasRefillByName = name.includes('refill') || name.includes('guaranteed');
    if (!order.has_refill && !hasRefillByName) return false;
    return true;
  };

  // FIX #5A + #5B: re-fetch status before cancel, and insert transaction log
  const cancelOrder = async (order) => {
    if (!window.confirm('Cancel this order? Your balance will be refunded.')) return;

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
    const newBalance   = parseFloat(profile.balance || 0) + refundAmount;

    await supabase.from('users').update({ balance: newBalance }).eq('id', user.id);
    // FIX Phase-9: include .eq('user_id', user.id) so a user cannot cancel
    // another user's order if they know the order UUID (defence-in-depth on
    // top of Supabase RLS — both guards should be present).
    await supabase.from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)
      .eq('user_id', user.id);
    await supabase.from('transactions').insert({
      user_id:     user.id,
      type:        'refund',
      amount:      refundAmount,
      description: `Cancellation refund: ${order.order_ref || order.id}`,
      ref_id:      order.order_ref || order.id,
    });

    setActionMsg('✅ Order cancelled. Your balance has been refunded!');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const refillOrder = async (order) => {
    if (!window.confirm('Request a refill for this order?')) return;
    // FIX Phase-9: include .eq('user_id', user.id) so only the order owner
    // can request a refill — ownership enforced at query level.
    await supabase.from('orders')
      .update({ refill_requested: true })
      .eq('id', order.id)
      .eq('user_id', user.id);
    setActionMsg('✅ Refill requested! Admin will process it shortly.');
    loadOrders();
    setTimeout(() => setActionMsg(''), 4000);
  };

  const filtered = orders.filter(o => filter === 'all' || o.status === filter);

  // Only the rows currently "paged in" get rendered
  const visibleRows = filtered.slice(0, visibleCount);
  const hasMore     = visibleCount < filtered.length;

  const stats = {
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    progress:  orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
  };

  // badgeClass imported from ./utils (REFACTOR Phase-24)

  const statCards = [
    { ic: '📦', lb: 'Total',       vl: stats.total,     cl: 'cn' },
    { ic: '⏳', lb: 'Pending',     vl: stats.pending,   cl: 'cw' },
    { ic: '⚡', lb: 'In Progress', vl: stats.progress,  cl: 'cn' },
    { ic: '✅', lb: 'Completed',   vl: stats.completed, cl: 'cg' },
  ];

  return (
    <>
      {/*
        Inject keyframes into the document once.
        shimmer = loading skeleton animation
        fadeInRow = row entrance animation (triggered per-row via IntersectionObserver)
      */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>

      <div>
        {/* ── Action message ── */}
        {actionMsg && (
          <div style={{
            background:   actionMsg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
            border:       `1px solid ${actionMsg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
            borderRadius: '8px', padding: '12px', textAlign: 'center',
            color:        actionMsg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
            fontWeight:   700, marginBottom: '16px', fontSize: '13px',
          }}>{actionMsg}</div>
        )}

        {/* ── Stats row ──────────────────────────────────────────────────────
            Shows shimmer skeletons while loading, real numbers once loaded.
            Nothing is rendered twice — the skeleton swaps out for real content.
        ── */}
        <div className="cgrid" style={{ marginBottom: '16px' }}>
          {loading
            ? statCards.map((_, i) => <StatSkeleton key={i} />)
            : statCards.map((s, i) => (
                <div key={i} className="sc"
                  style={{
                    opacity: 0,
                    animation: `fadeIn 0.4s ease ${i * 80}ms forwards`,
                  }}>
                  <span className="sc-ic">{s.ic}</span>
                  <div className="sc-lb">{s.lb}</div>
                  <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
                </div>
              ))
          }
        </div>

        {/* ── Filter tabs ────────────────────────────────────────────────────
            Disabled and dimmed while loading so users can't click before data arrives.
        ── */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {statusList.map(s => (
            <button key={s}
              disabled={loading}
              onClick={() => setFilter(s)}
              style={{
                padding:       '5px 12px',
                borderRadius:  '20px',
                cursor:        loading ? 'not-allowed' : 'pointer',
                fontFamily:    'var(--fu)',
                fontSize:      '10px',
                fontWeight:    700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                background:    filter === s ? 'var(--neon)' : 'var(--gl)',
                color:         filter === s ? '#000' : 'var(--text3)',
                border:        filter === s ? 'none' : '1px solid var(--br)',
                opacity:       loading ? 0.4 : 1,
                transition:    'opacity 0.2s',
              }}>
              {s.replace('_', ' ')} ({s === 'all' ? orders.length : orders.filter(o => o.status === s).length})
            </button>
          ))}
        </div>

        {/* ── Table area ─────────────────────────────────────────────────────
            While loading: show 6 shimmer skeleton rows.
            After load:    show only the first PAGE_SIZE (20) rows.
                           "Load more" button appends the next PAGE_SIZE.
                           Each row fades in via IntersectionObserver (OrderRow).
        ── */}
        {loading ? (
          <div className="tblw">
            <table>
              <thead>
                <tr>
                  <th>#ID</th><th>Service</th><th>Link</th>
                  <th>Qty</th><th>Cost</th><th>Status</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <RowSkeleton key={i} index={i} />
                ))}
              </tbody>
            </table>
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
          <>
            {/* Row count label */}
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
              Showing {Math.min(visibleCount, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} orders
            </div>

            <div className="tblw">
              <table>
                <thead>
                  <tr>
                    <th>#ID</th><th>Service</th><th>Link</th>
                    <th>Qty</th><th>Cost</th><th>Status</th><th>Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((o, i) => (
                    <OrderRow
                      key={o.id}
                      o={o}
                      index={i}
                      format={format}
                      canCancel={canCancel}
                      canRefill={canRefill}
                      onCancel={cancelOrder}
                      onRefill={refillOrder}
                      badgeClass={badgeClass}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Load more button ──────────────────────────────────────────
                Only rendered when there are more rows not yet shown.
                Clicking it reveals the next PAGE_SIZE rows.
            ── */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button
                  className="btn bgh bmd"
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}>
                  Load more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}

            {/* All loaded indicator */}
            {!hasMore && filtered.length > PAGE_SIZE && (
              <div style={{ textAlign: 'center', padding: '14px', color: 'var(--text3)', fontSize: '11px' }}>
                ✅ All {filtered.length.toLocaleString()} orders shown
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

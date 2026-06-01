import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const PER_PAGE = 50;

export default function Transactions({ user }) {
  const [txns, setTxns] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  // ── FIX: Server-side pagination ───────────────────────────────────────────
  // The old code loaded ALL transactions at once with no limit.
  // A user with 10,000 orders would have 10,000 transaction rows.
  // Loading them all at once is slow and will eventually crash the browser tab.
  // We now load 50 at a time using .range() — server paginates the data.
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadTxns = useCallback(async (pageNum = 1, typeFilter = 'all') => {
    setLoading(true);
    const from = (pageNum - 1) * PER_PAGE;
    const to   = from + PER_PAGE - 1;

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (typeFilter !== 'all') {
      query = query.eq('type', typeFilter);
    }

    const { data, count } = await query;
    if (data) setTxns(data);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadTxns(1, 'all'); }, [loadTxns]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(1);
    loadTxns(1, newFilter);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadTxns(newPage, filter);
  };

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  const typeColor = (type) => {
    if (type === 'deposit')    return 'var(--green)';
    if (type === 'order')      return 'var(--danger)';
    if (type === 'refund')     return 'var(--neon)';
    if (type === 'referral')   return 'var(--purple)';
    return 'var(--text2)';
  };

  const typeIcon = (type) => {
    if (type === 'deposit')    return '💳';
    if (type === 'order')      return '📦';
    if (type === 'refund')     return '↩️';
    if (type === 'referral')   return '🎁';
    if (type === 'task')       return '⚡';
    if (type === 'withdrawal') return '💸';
    return '💸';
  };

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['all', 'deposit', 'order', 'refund', 'referral', 'task', 'withdrawal'].map(f => (
          <button key={f} onClick={() => handleFilterChange(f)} style={{
            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
            fontFamily: 'var(--fu)', fontSize: '11px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '1px',
            background: filter === f ? 'var(--neon)' : 'var(--gl)',
            color: filter === f ? '#000' : 'var(--text3)',
            border: filter === f ? 'none' : '1px solid var(--br)',
          }}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading...</div>
      ) : txns.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📊</span>
          <div className="empty-tx">No transactions yet</div>
          <div className="empty-sb">Your transaction history will appear here</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '12px' }}>
            Showing {txns.length} of {totalCount} transactions
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {txns.map(t => (
              <div key={t.id} className="card" style={{
                padding: '14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '9px',
                    background: 'var(--gl2)', border: '1px solid var(--br)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', flexShrink: 0
                  }}>
                    {typeIcon(t.type)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>
                      {t.description || t.type}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                    {t.ref_id && (
                      <div style={{ fontSize: '10px', fontFamily: 'var(--fm)', color: 'var(--text3)' }}>
                        {t.ref_id}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--fm)', fontSize: '15px', fontWeight: 700,
                  color: parseFloat(t.amount) > 0 ? 'var(--green)' : 'var(--danger)',
                  flexShrink: 0
                }}>
                  {parseFloat(t.amount) > 0 ? '+' : ''}${Math.abs(parseFloat(t.amount)).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* ── FIX: Pagination controls ── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="btn bgh bsm"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1 || loading}>
                ← Prev
              </button>
              <span style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text2)' }}>
                Page {page} / {totalPages}
              </span>
              <button
                className="btn bgh bsm"
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages || loading}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

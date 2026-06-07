import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
// REFACTOR Phase-23: typeIcon centralised in utils.js — removed local duplicate
import { typeIcon } from './utils';

const PAGE_SIZE = 50;

export default function Transactions({ user }) {
  const [txns, setTxns] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  // FIX Phase-21: pagination state — was loading ALL rows with no limit
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Reset and reload from scratch whenever filter changes
  useEffect(() => {
    setTxns([]);
    setOffset(0);
    setHasMore(false);
    loadTxns(0, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const buildQuery = (from, to) => {
    let q = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (filter !== 'all') q = q.eq('type', filter);
    return q;
  };

  const loadTxns = async (from = 0, replace = false) => {
    replace ? setLoading(true) : setLoadingMore(true);
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (data) {
      setTxns(prev => replace ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setOffset(from + data.length);
    }
    replace ? setLoading(false) : setLoadingMore(false);
  };

  const loadMore = () => loadTxns(offset, false);

  const typeColor = (type) => {
    if (type === 'deposit') return 'var(--green)';
    if (type === 'order') return 'var(--danger)';
    if (type === 'refund') return 'var(--neon)';
    if (type === 'referral') return 'var(--purple)';
    return 'var(--text2)';
  };
  // typeIcon imported from ./utils (REFACTOR Phase-23)

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['all', 'deposit', 'order', 'refund', 'referral', 'task', 'withdrawal'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {txns.map(t => (
            <div key={t.id} className="card" style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: 'var(--gl2)', border: '1px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                  {typeIcon(t.type)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{t.description || t.type}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{new Date(t.created_at).toLocaleString()}</div>
                  {t.ref_id && <div style={{ fontSize: '10px', fontFamily: 'var(--fm)', color: 'var(--text3)' }}>{t.ref_id}</div>}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: '15px', fontWeight: 700, color: parseFloat(t.amount) > 0 ? 'var(--green)' : 'var(--danger)', flexShrink: 0 }}>
                {parseFloat(t.amount) > 0 ? '+' : ''}${Math.abs(parseFloat(t.amount)).toFixed(2)}
              </div>
            </div>
          ))}

          {/* FIX Phase-21: Load More pagination — was loading all rows at once */}
          {hasMore && (
            <button
              className="btn bgh blg bw"
              onClick={loadMore}
              disabled={loadingMore}
              style={{ marginTop: '8px' }}
            >
              {loadingMore ? '⏳ Loading...' : `Load more`}
            </button>
          )}
          {!hasMore && txns.length >= PAGE_SIZE && (
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', padding: '12px 0' }}>
              All transactions loaded
            </div>
          )}
        </div>
      )}
    </div>
  );
}

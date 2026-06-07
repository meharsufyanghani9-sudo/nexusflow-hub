import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';
// REFACTOR Phase-24: badgeClass centralised in utils.js — removed local duplicate
import { badgeClass } from './utils';

export default function BuyerDashboard({ user, onNav }) {
  const { format } = useCurrency();
  const [recentOrders,     setRecentOrders]     = useState([]);
  const [balance,          setBalance]          = useState(parseFloat(user.balance) || 0);
  const [loading,          setLoading]          = useState(true);
  const [announcement,     setAnnouncement]     = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(true);

  // FIX #14: stats come from server-side RPC, not a full table download
  const [stats, setStats] = useState({
    total: 0, completed: 0, in_progress: 0, pending: 0, spent: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);

    // FIX #14: run stats RPC + recent orders + profile + settings in parallel
    const [
      { data: profile },
      { data: orderStats },
      { data: recentOrd },
      { data: settingsData },
    ] = await Promise.all([
      supabase.from('users').select('balance').eq('id', user.id).single(),

      // FIX #14: DB-side aggregation — returns counts and sum, not raw rows
      supabase.rpc('get_order_stats', { p_user_id: user.id }),

      // Only fetch 5 rows for the recent orders table display
      supabase.from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),

      supabase.from('settings').select('*'),
    ]);

    if (profile) setBalance(parseFloat(profile.balance) || 0);
    if (recentOrd) setRecentOrders(recentOrd);

    // FIX #14: stats come directly from the RPC result — no JS-side counting
    if (orderStats) {
      setStats({
        total:       parseInt(orderStats.total      || 0, 10),
        completed:   parseInt(orderStats.completed  || 0, 10),
        in_progress: parseInt(orderStats.in_progress|| 0, 10),
        pending:     parseInt(orderStats.pending    || 0, 10),
        spent:       parseFloat(orderStats.spent    || 0),
      });
    }

    if (settingsData) {
      const s = {};
      settingsData.forEach(row => { s[row.key] = row.value; });
      if (s.announcement_active === 'true' && s.announcement) {
        setAnnouncement(s.announcement);
      }
    }

    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // badgeClass imported from ./utils (REFACTOR Phase-24)

  return (
    <div>
      {/* Announcement Banner */}
      {announcement && showAnnouncement && (
        <div style={{
          background: 'linear-gradient(90deg,rgba(0,212,255,.12),rgba(123,47,255,.12))',
          border: '1px solid rgba(0,212,255,.25)', borderRadius: '10px',
          padding: '12px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '18px' }}>📢</span>
          <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>{announcement}</span>
          <button
            onClick={() => setShowAnnouncement(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '18px' }}
          >×</button>
        </div>
      )}

      {/* Balance Hero */}
      <div className="bhr mb20">
        <div className="bh-lbl">Available Balance</div>
        <div className="bh-amt"><span>$</span>{balance.toFixed(2)}</div>
        <div style={{ fontSize: '12px', color: 'var(--neon)', marginBottom: '14px', fontFamily: 'var(--fm)' }}>
          ≈ {format(balance)}
        </div>
        <div className="bh-ft">
          <div style={{ fontFamily: 'var(--fd)', fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,.35)' }}>
            NEXUSFLOW BUYER
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn bp bsm" onClick={() => onNav('deposit')}>+ Add Funds</button>
            <button className="btn bgh bsm" onClick={() => onNav('marketplace')}>Browse</button>
          </div>
        </div>
      </div>

      {/* Stats — FIX #14: accurate counts from RPC, not JS-side array reduce */}
      <div className="cgrid">
        {[
          { ic: '📦', lb: 'Total Orders', vl: stats.total,        cl: 'cn'  },
          { ic: '✅', lb: 'Completed',    vl: stats.completed,    cl: 'cg'  },
          { ic: '⚡', lb: 'In Progress',  vl: stats.in_progress,  cl: 'cn'  },
          { ic: '💰', lb: 'Total Spent',  vl: format(stats.spent), cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="st">Quick Actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { ic: '🛒', lb: 'Buy Services', sub: 'Instagram, TikTok...', fn: 'marketplace'   },
          { ic: '💳', lb: 'Add Funds',    sub: 'Easypaisa, Jazz, Crypto', fn: 'deposit'    },
          { ic: '📦', lb: 'My Orders',    sub: 'Track all orders',       fn: 'orders'      },
          { ic: '🎁', lb: 'Referral',     sub: 'Invite & earn',          fn: 'referral'    },
          { ic: '⚡', lb: 'Earn Tasks',   sub: 'Complete & earn',        fn: 'tasks'       },
          { ic: '💬', lb: 'Support',      sub: 'Get help from admin',    fn: 'buyersupport'},
        ].map((a, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: '14px', cursor: 'pointer', transition: 'all .2s' }}
            onClick={() => onNav(a.fn)}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--br2)'}
            onMouseOut={e  => e.currentTarget.style.borderColor = ''}
          >
            <div style={{ fontSize: '22px', marginBottom: '8px' }}>{a.ic}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>{a.lb}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{a.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent Orders — 5 rows only, for quick overview */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div className="st" style={{ margin: 0 }}>Recent Orders</div>
        {stats.total > 5 && (
          <button
            onClick={() => onNav('orders')}
            style={{ background: 'none', border: 'none', color: 'var(--neon)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--fu)', fontWeight: 700 }}
          >
            View All {stats.total} →
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>Loading...</div>
      ) : (
        <div className="tblw">
          <table>
            <thead>
              <tr><th>#ID</th><th>Service</th><th>Qty</th><th>Cost</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                    No orders yet —{' '}
                    <span
                      style={{ color: 'var(--neon)', cursor: 'pointer' }}
                      onClick={() => onNav('marketplace')}
                    >
                      browse marketplace →
                    </span>
                  </td>
                </tr>
              ) : recentOrders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>
                    {o.order_ref || o.id?.slice(0, 8)}
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.service_name}
                  </td>
                  <td style={{ fontFamily: 'var(--fm)' }}>
                    {(o.quantity || 0).toLocaleString()}
                  </td>
                  <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                    {format(parseFloat(o.cost || 0))}
                  </td>
                  <td>
                    <span className={`bdg ${badgeClass(o.status)}`}>
                      {o.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text3)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                    <div>{new Date(o.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: '9px' }}>
                      {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
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

import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import LiveStats from './LiveStats';

export default function AdminDashboard({ user, onNav }) {
  const [stats, setStats] = useState({
    totalUsers: 0, totalOrders: 0, revenue: 0,
    pendingDeposits: 0, resellers: 0, openDisputes: 0,
    withdrawals: 0, liveServices: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [announcement,   setAnnouncement]   = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);

    const [
      { count: totalUsers      },
      { count: totalOrders     },
      { count: pendingDeposits },
      { count: resellers       },
      { count: openDisputes    },
      { count: liveServices    },
      // FIX #27: replaced select('cost') full-column download with server-side SUM
      { data: revenueData      },
      { data: depositsData     },
      { data: settingsData     },
    ] = await Promise.all([
      supabase.from('users')
        .select('*', { count: 'exact', head: true }),
      supabase.from('orders')
        .select('*', { count: 'exact', head: true }),
      supabase.from('deposits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'reseller'),
      supabase.from('disputes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open'),
      supabase.from('services')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      // FIX #27: read pre-computed revenue from public_stats table
      // (populated by the SQL migration — no full table scan)
      supabase.from('public_stats')
        .select('key, value')
        .eq('key', 'total_revenue'),
      supabase.from('deposits')
        .select('amount, status, user_id, user_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('settings').select('*'),
    ]);

    // Pull revenue from the pre-computed row; default to 0 if table not yet set up
    const revenueRow = (revenueData || []).find(r => r.key === 'total_revenue');
    const revenue    = revenueRow ? parseFloat(revenueRow.value || 0) : 0;

    setStats({
      totalUsers:      totalUsers      || 0,
      totalOrders:     totalOrders     || 0,
      revenue,
      pendingDeposits: pendingDeposits || 0,
      resellers:       resellers       || 0,
      openDisputes:    openDisputes    || 0,
      withdrawals:     0,
      liveServices:    liveServices    || 0,
    });

    setRecentActivity(depositsData || []);

    if (settingsData) {
      const s = {};
      settingsData.forEach(row => { s[row.key] = row.value; });
      if (s.announcement_active === 'true' && s.announcement) {
        setAnnouncement(s.announcement);
      }
    }

    setLoading(false);
  };

  const statCards = [
    { ic: '👥', lb: 'Total Users',      vl: stats.totalUsers,                    cl: 'cn',  pg: 'users'        },
    { ic: '📦', lb: 'Total Orders',     vl: stats.totalOrders,                   cl: 'cgo', pg: 'adminorders'  },
    { ic: '💰', lb: 'Revenue',          vl: `$${stats.revenue.toFixed(2)}`,      cl: 'cg',  pg: 'deposits'     },
    { ic: '⏳', lb: 'Pending Deposits', vl: stats.pendingDeposits,               cl: 'cw',  pg: 'deposits'     },
    { ic: '🏪', lb: 'Resellers',        vl: stats.resellers,                     cl: 'cp',  pg: 'resellers'    },
    { ic: '⚖️', lb: 'Open Disputes',    vl: stats.openDisputes,                  cl: 'cd',  pg: 'disputes'     },
    { ic: '💸', lb: 'Withdrawals',      vl: stats.withdrawals,                   cl: 'cw',  pg: 'withdrawals'  },
    { ic: '🛍',  lb: 'Live Services',    vl: stats.liveServices,                  cl: 'cn',  pg: 'adminservices'},
  ];

  const quickActions = [
    { ic: '✅', lb: 'Approve Deposits', sub: 'Review pending payments',   pg: 'deposits',      cl: 'cg'  },
    { ic: '👥', lb: 'Manage Users',     sub: 'Edit balances & roles',     pg: 'users',         cl: 'cn'  },
    { ic: '📦', lb: 'All Orders',       sub: 'View & update orders',      pg: 'adminorders',   cl: 'cn'  },
    { ic: '🛍',  lb: 'Manage Services', sub: 'Add & control services',    pg: 'adminservices', cl: 'cp'  },
    { ic: '🔌', lb: 'Import from API',  sub: 'JAP, SMMRaja, etc.',        pg: 'api',           cl: 'cp'  },
    { ic: '⚖️', lb: 'Handle Disputes',  sub: 'Resolve buyer issues',      pg: 'disputes',      cl: 'cd'  },
    { ic: '📨', lb: 'Mass Email',       sub: 'Email all users',           pg: 'massemail',     cl: 'cgo' },
    { ic: '⚙️', lb: 'Site Settings',    sub: 'Payment & config',          pg: 'settings',      cl: 'cw'  },
  ];

  return (
    <div>
      <LiveStats />

      {announcement && (
        <div style={{
          background: 'linear-gradient(90deg,rgba(0,212,255,.12),rgba(123,47,255,.12))',
          border: '1px solid rgba(0,212,255,.25)', borderRadius: '10px',
          padding: '12px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '18px' }}>📢</span>
          <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>{announcement}</span>
          <button
            onClick={() => setAnnouncement('')}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '18px' }}
          >×</button>
        </div>
      )}

      <div className="bhr mb20" style={{
        background: 'linear-gradient(135deg,rgba(123,47,255,.2),rgba(0,20,60,.35),rgba(40,0,80,.2))',
      }}>
        <div className="bh-lbl">Admin Panel</div>
        <div className="bh-amt" style={{ fontSize: 'clamp(20px,4vw,32px)' }}>
          Welcome, {user.name} 👑
        </div>
        <div className="bh-ft">
          <div style={{
            fontFamily: 'var(--fd)', fontSize: '10px',
            letterSpacing: '2px', color: 'rgba(255,255,255,.4)',
          }}>
            NEXUSFLOW ADMIN
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn bpu bsm" onClick={() => onNav('deposits')}>Review Deposits</button>
            <button className="btn bgh bsm" onClick={() => onNav('users')}>Users</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>
          Loading stats...
        </div>
      ) : (
        <div className="cgrid">
          {statCards.map((s, i) => (
            <div key={i} className="sc" style={{ cursor: 'pointer' }} onClick={() => onNav(s.pg)}>
              <span className="sc-ic">{s.ic}</span>
              <div className="sc-lb">{s.lb}</div>
              <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
            </div>
          ))}
        </div>
      )}

      <div className="st">Quick Actions</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
        gap: '10px',
        marginBottom: '20px',
      }}>
        {quickActions.map((a, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: '16px', cursor: 'pointer', transition: 'all .2s' }}
            onClick={() => onNav(a.pg)}
            onMouseOver={e  => e.currentTarget.style.borderColor = 'var(--br2)'}
            onMouseOut={e   => e.currentTarget.style.borderColor = ''}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{a.ic}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>{a.lb}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{a.sub}</div>
          </div>
        ))}
      </div>

      <div className="st">Recent Deposit Activity</div>
      <div className="tblw">
        <table>
          <thead>
            <tr>
              <th>User</th><th>Amount</th><th>Status</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentActivity.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                  No activity yet
                </td>
              </tr>
            ) : recentActivity.map((d, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--neon)' }}>
                  {d.user_name || (d.user_id?.slice(0, 8) + '...')}
                </td>
                <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                  ${parseFloat(d.amount || 0).toFixed(2)}
                </td>
                <td>
                  <span className={`bdg ${
                    d.status === 'approved' ? 'b-completed'
                    : d.status === 'pending' ? 'b-pending'
                    : 'b-rejected'
                  }`}>
                    {d.status}
                  </span>
                </td>
                <td style={{ color: 'var(--text3)', fontSize: '10px' }}>
                  {new Date(d.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

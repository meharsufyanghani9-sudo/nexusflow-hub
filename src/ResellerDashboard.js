import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
// REFACTOR Phase-24: badgeClass centralised in utils.js — removed local duplicate
import { badgeClass } from './utils';

export default function ResellerDashboard({ user, onNav }) {
  const [balance, setBalance] = useState(user.balance || 0);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [stats, setStats] = useState({
    liveServices: 0,
    totalOrders: 0,
    totalEarned: 0,
    inEscrow: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);

    const [
      { data: profile },
      { count: liveServices },
      { data: ordersData },
      { data: settingsData },
    ] = await Promise.all([
      supabase.from('users').select('balance').eq('id', user.id).single(),
      // FIXED: was 'reseller_id', but services use 'vendor_id'
      supabase.from('services')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', user.id)
        .eq('is_active', true),
      supabase.from('orders')
        .select('*')
        .eq('reseller_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('settings').select('*'),
    ]);

    if (profile) setBalance(parseFloat(profile.balance) || 0);

    if (ordersData) {
      setRecentOrders(ordersData);
      const totalEarned = ordersData
        .filter(o => o.status === 'completed')
        .reduce((a, b) => a + parseFloat(b.reseller_payout || 0), 0);
      const inEscrow = ordersData
        .filter(o => o.status === 'in_progress' || o.status === 'pending')
        .reduce((a, b) => a + parseFloat(b.reseller_payout || 0), 0);

      setStats({
        liveServices: liveServices || 0,
        totalOrders: ordersData.length,
        totalEarned,
        inEscrow,
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
  };

  // badgeClass imported from ./utils (REFACTOR Phase-24)

  return (
    <div>
      {/* Announcement Banner */}
      {announcement && showAnnouncement && (
        <div style={{
          background: 'linear-gradient(90deg,rgba(0,212,255,.12),rgba(123,47,255,.12))',
          border: '1px solid rgba(0,212,255,.25)', borderRadius: '10px',
          padding: '12px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '18px' }}>📢</span>
          <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>{announcement}</span>
          <button
            onClick={() => setShowAnnouncement(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '18px' }}>
            ×
          </button>
        </div>
      )}

      {/* Balance Hero */}
      <div className="bhr mb20">
        <div className="bh-lbl">Reseller Balance</div>
        <div className="bh-amt"><span>$</span>{balance.toFixed(2)}</div>
        <div className="bh-ft">
          <div style={{ fontFamily: 'var(--fd)', fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,.35)' }}>
            NEXUSFLOW RESELLER
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn bp bsm" onClick={() => onNav('deposit')}>+ Add Funds</button>
            <button className="btn bgh bsm" onClick={() => onNav('services')}>My Services</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="cgrid">
        {[
          { ic: '🛍', lb: 'Live Services', vl: stats.liveServices, cl: 'cn' },
          { ic: '📦', lb: 'Total Orders', vl: stats.totalOrders, cl: 'cgo' },
          { ic: '✅', lb: 'Total Earned', vl: `$${stats.totalEarned.toFixed(2)}`, cl: 'cg' },
          { ic: '🔒', lb: 'In Escrow', vl: `$${stats.inEscrow.toFixed(2)}`, cl: 'cw' },
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
          { ic: '🛍', lb: 'My Services', sub: 'Manage your listings', fn: 'services' },
          { ic: '💵', lb: 'Earnings', sub: 'Withdraw your earnings', fn: 'earnings' },
          { ic: '💳', lb: 'Add Funds', sub: 'Top up balance', fn: 'deposit' },
          { ic: '📊', lb: 'Transactions', sub: 'Full history', fn: 'transactions' },
          { ic: '🔌', lb: 'API Access', sub: 'Integrate with API', fn: 'panelapi' },
          { ic: '👤', lb: 'Profile', sub: 'Account settings', fn: 'profile' },
        ].map((a, i) => (
          <div key={i} className="card" style={{ padding: '14px', cursor: 'pointer', transition: 'all .2s' }}
            onClick={() => onNav(a.fn)}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--br2)'}
            onMouseOut={e => e.currentTarget.style.borderColor = ''}>
            <div style={{ fontSize: '22px', marginBottom: '8px' }}>{a.ic}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>{a.lb}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{a.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="st">Recent Orders</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>Loading...</div>
      ) : (
        <div className="tblw">
          <table>
            <thead>
              <tr><th>#ID</th><th>Service</th><th>Qty</th><th>Payout</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                    No orders yet — <span style={{ color: 'var(--neon)', cursor: 'pointer' }} onClick={() => onNav('services')}>add services →</span>
                  </td>
                </tr>
              ) : recentOrders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>{o.order_ref || o.id?.slice(0, 8)}</td>
                  <td style={{ fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.service_name}</td>
                  <td style={{ fontFamily: 'var(--fm)' }}>{o.quantity?.toLocaleString()}</td>
                  <td style={{ color: 'var(--gold)', fontFamily: 'var(--fm)' }}>${parseFloat(o.reseller_payout || 0).toFixed(2)}</td>
                  <td><span className={`bdg ${badgeClass(o.status)}`}>{o.status?.replace('_', ' ')}</span></td>
                  <td style={{ color: 'var(--text3)', fontSize: '10px' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

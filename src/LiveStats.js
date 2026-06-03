import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

function CountUp({ target, duration = 2000, prefix = '', suffix = '', decimals = 0 }) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    startRef.current = null;
    const step = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);

  const display = decimals > 0
    ? current.toFixed(decimals)
    : Math.floor(current).toLocaleString();

  return <span>{prefix}{display}{suffix}</span>;
}

export default function LiveStats() {
  const [stats, setStats] = useState({
    users: 0, orders: 0, resellers: 0,
    services: 0, completed: 0, revenue: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    // FIX #27: use pre-computed public_stats table — no full table scans,
    // no revenue data leaked to public visitors, minimal data transfer.
    // Count queries use head:true so NO row data is sent over the wire.
    const [
      { count: users     },
      { count: orders    },
      { count: resellers },
      { count: services  },
      { count: completed },
      { data: pubStats   },
    ] = await Promise.all([
      supabase.from('users')
        .select('*', { count: 'exact', head: true }),
      supabase.from('orders')
        .select('*', { count: 'exact', head: true }),
      supabase.from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'reseller'),
      supabase.from('services')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase.from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      // FIX #27: read pre-computed revenue from public_stats — not raw order rows
      supabase.from('public_stats')
        .select('key, value')
        .eq('key', 'total_revenue'),
    ]);

    // Pull revenue from the pre-computed row; default to 0 if table not yet set up
    const revenueRow = (pubStats || []).find(r => r.key === 'total_revenue');
    const revenue    = revenueRow ? parseFloat(revenueRow.value || 0) : 0;

    setStats({
      users:     users     || 0,
      orders:    orders    || 0,
      resellers: resellers || 0,
      services:  services  || 0,
      completed: completed || 0,
      revenue,
    });
    setLoaded(true);
  };

  const items = [
    { ic: '👥', lb: 'Total Users',    vl: stats.users,     cl: 'cn',  suf: '+', dec: 0 },
    { ic: '📦', lb: 'Total Orders',   vl: stats.orders,    cl: 'cgo', suf: '+', dec: 0 },
    { ic: '🏪', lb: 'Resellers',      vl: stats.resellers, cl: 'cp',  suf: '+', dec: 0 },
    { ic: '🛍',  lb: 'Live Services',  vl: stats.services,  cl: 'cg',  suf: '',  dec: 0 },
    { ic: '✅', lb: 'Completed',      vl: stats.completed, cl: 'cg',  suf: '+', dec: 0 },
    { ic: '💰', lb: 'Revenue Served', vl: stats.revenue,   cl: 'cgo', pre: '$', suf: '', dec: 2 },
  ];

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="st">📊 Live Platform Stats</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))',
        gap: '10px',
      }}>
        {items.map((s, i) => (
          <div key={i} className="sc" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: '10px', right: '10px',
              width: '7px', height: '7px', borderRadius: '50%',
              background: 'var(--green)', boxShadow: '0 0 8px var(--green)',
              animation: 'pulse 2s infinite',
            }} />
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize: 'clamp(16px,2.5vw,26px)' }}>
              {loaded
                ? <CountUp target={s.vl} prefix={s.pre || ''} suffix={s.suf} decimals={s.dec} />
                : '—'
              }
            </div>
          </div>
        ))}
      </div>
      <div style={{
        textAlign: 'right', fontSize: '9px', color: 'var(--text3)',
        marginTop: '6px', letterSpacing: '2px',
      }}>
        🔴 LIVE · Refreshes every 30 seconds
      </div>
    </div>
  );
}

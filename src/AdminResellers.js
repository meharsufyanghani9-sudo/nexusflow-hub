import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import AdminCreateReseller from './AdminCreateReseller';

export default function AdminResellers({ user }) {
  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [services, setServices] = useState([]);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const loadResellers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, balance, is_active, referral_code, created_at')
      .eq('role', 'reseller')
      .order('created_at', { ascending: false });

    // FIX #28: removed console.error — show error in UI instead
    if (error) {
      setLoadError('❌ Failed to load resellers. Please refresh.');
      setLoading(false);
      return;
    }
    if (data) setResellers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadResellers();

    const channel = supabase
      .channel('admin-resellers-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new.role === 'reseller') {
            setResellers(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.role === 'reseller') {
              setResellers(prev => {
                const exists = prev.some(r => r.id === payload.new.id);
                if (exists) {
                  return prev.map(r => r.id === payload.new.id ? payload.new : r);
                } else {
                  return [payload.new, ...prev];
                }
              });
            } else {
              setResellers(prev => prev.filter(r => r.id !== payload.new.id));
            }
          } else if (payload.eventType === 'DELETE') {
            setResellers(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadResellers]);

  const openReseller = async (r) => {
    setSelected(r);
    setMsg('');
    const { data } = await supabase.from('services').select('*').eq('vendor_id', r.id);
    if (data) setServices(data);
  };

  const toggleService = async (svc) => {
    await supabase.from('services').update({ is_active: !svc.is_active }).eq('id', svc.id);
    const { data } = await supabase.from('services').select('*').eq('vendor_id', selected.id);
    if (data) setServices(data);
  };

  const deleteService = async (id) => {
    if (!window.confirm('Delete this service?')) return;
    await supabase.from('services').delete().eq('id', id);
    const { data } = await supabase.from('services').select('*').eq('vendor_id', selected.id);
    if (data) setServices(data);
  };

  const demoteToBuyer = async () => {
    if (!window.confirm(`Demote ${selected.full_name} to Buyer? They will lose reseller access.`)) return;
    setActing(true);
    await supabase.from('users').update({ role: 'buyer' }).eq('id', selected.id);
    setActing(false);
    setSelected(null);
    loadResellers();
    alert('✅ Demoted to buyer');
  };

  const promoteToAdmin = async () => {
    if (!window.confirm(`Promote ${selected.full_name} to Admin? They will have full access.`)) return;
    setActing(true);
    await supabase.from('users').update({ role: 'admin' }).eq('id', selected.id);
    setActing(false);
    setSelected(null);
    loadResellers();
    alert('✅ Promoted to Admin');
  };

  const adjustBalance = async (amount) => {
    setActing(true);
    const { data: u } = await supabase
      .from('users')
      .select('balance')
      .eq('id', selected.id)
      .single();
    if (u) {
      const newBal = parseFloat(u.balance || 0) + amount;
      await supabase.from('users').update({ balance: newBal }).eq('id', selected.id);
      await supabase.from('transactions').insert({
        user_id:     selected.id,
        type:        'deposit',
        amount:      amount,
        description: `Admin adjustment: +$${amount}`,
        ref_id:      'ADJ-' + Date.now(),
      });
      setSelected(p => ({ ...p, balance: newBal }));
    }
    setActing(false);
    setMsg(`✅ Added $${amount}!`);
    loadResellers();
    setTimeout(() => setMsg(''), 3000);
  };

  const toggleSuspend = async (r) => {
    const newStatus = !r.is_active;
    await supabase.from('users').update({ is_active: newStatus }).eq('id', r.id);
    setMsg(newStatus ? '✅ Reseller activated!' : '✅ Reseller suspended!');
    loadResellers();
    if (selected?.id === r.id) setSelected(p => ({ ...p, is_active: newStatus }));
    setTimeout(() => setMsg(''), 3000);
  };

  const filtered = resellers.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q)
    );
  });

  // FIX Phase-19: component-level admin role guard — defence-in-depth on top
  // of App.js routing. Prevents any admin page from rendering its content if
  // the user object is missing or has a non-admin role (e.g. manipulated via
  // React DevTools). Must come after all hook declarations (Rules of Hooks).
  if (!user || user.role !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--danger)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>⛔</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 800, letterSpacing: '2px' }}>
          ACCESS DENIED
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
          Admin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div>
      {showCreate && (
        <AdminCreateReseller
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadResellers();
          }}
        />
      )}

      {/* FIX #28: load error shown in UI, not console */}
      {loadError && (
        <div style={{
          background: 'rgba(255,51,85,.08)', border: '1px solid rgba(255,51,85,.2)',
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: 'var(--danger)', fontWeight: 700, marginBottom: '16px', fontSize: '13px',
        }}>
          {loadError}
          <button onClick={loadResellers} style={{
            marginLeft: '12px', background: 'none', border: '1px solid var(--danger)',
            borderRadius: '6px', padding: '3px 10px', color: 'var(--danger)',
            cursor: 'pointer', fontSize: '11px',
          }}>🔄 Retry</button>
        </div>
      )}

      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '🏪', lb: 'Total Resellers', vl: resellers.length,                                                              cl: 'cgo' },
          { ic: '✅', lb: 'Active',           vl: resellers.filter(r => r.is_active !== false).length,                          cl: 'cg'  },
          { ic: '⏸',  lb: 'Suspended',        vl: resellers.filter(r => r.is_active === false).length,                          cl: 'cd'  },
          { ic: '💰', lb: 'Total Balance',    vl: '$' + resellers.reduce((a, b) => a + parseFloat(b.balance || 0), 0).toFixed(2), cl: 'cn'  },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize: 'clamp(14px,2vw,22px)' }}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: 'var(--green)', display: 'inline-block',
          boxShadow: '0 0 6px var(--green)', animation: 'pulse 2s infinite',
        }} />
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Live — updates when resellers are added or changed</span>
        <button
          onClick={loadResellers}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--br)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: 'var(--text3)', cursor: 'pointer' }}
        >🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input
          className="srch-inp"
          style={{ flex: 1 }}
          placeholder="🔍 Search resellers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn bgd bmd" onClick={() => setShowCreate(true)}>
          ➕ Create Reseller
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          Loading resellers...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🏪</span>
          <div className="empty-tx">{search ? 'No resellers match your search' : 'No resellers yet'}</div>
          <div className="empty-sb">
            {search ? 'Try a different name or email' : 'Create your first reseller account below'}
          </div>
          {!search && (
            <button className="btn bgd bmd" style={{ marginTop: '14px' }} onClick={() => setShowCreate(true)}>
              ➕ Create First Reseller
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(r => (
            <div
              key={r.id}
              className="card"
              style={{ padding: '14px', borderColor: r.is_active === false ? 'rgba(255,51,85,.2)' : 'var(--br)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,var(--gold),var(--warn))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '16px', color: '#000',
                  }}>
                    {r.full_name?.[0]?.toUpperCase() || 'R'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                      {r.full_name}
                      {r.is_active === false && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--danger)', padding: '1px 6px', background: 'rgba(255,51,85,.12)', borderRadius: '8px', border: '1px solid rgba(255,51,85,.3)' }}>
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '5px' }}>{r.email}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="bdg b-reseller">Reseller</span>
                      <span className="bdg b-completed">💰 ${parseFloat(r.balance || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <button className="btn bgd bsm" onClick={() => openReseller(r)}>Manage →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage Modal */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div className="mttl">Manage Reseller</div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '8px', background: 'var(--gl)', border: '1px solid var(--br)', marginBottom: '14px' }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: 'linear-gradient(135deg,var(--gold),var(--warn))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '15px', color: '#000', flexShrink: 0,
              }}>
                {selected.full_name?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{selected.full_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{selected.email}</div>
              </div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: '16px', color: 'var(--gold)', fontWeight: 700 }}>
                ${parseFloat(selected.balance || 0).toFixed(2)}
              </div>
            </div>

            {msg && (
              <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '10px', padding: '8px', borderRadius: '6px', background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.2)', color: 'var(--green)' }}>
                {msg}
              </div>
            )}

            <div className="st" style={{ fontSize: '9px' }}>Quick Balance Adjust</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px', marginBottom: '16px' }}>
              {[5, 10, 25, 50].map(amt => (
                <button key={amt} className="btn bs bsm" onClick={() => adjustBalance(amt)} disabled={acting}>
                  +${amt}
                </button>
              ))}
            </div>

            <div className="st" style={{ fontSize: '9px' }}>Their Services ({services.length})</div>
            {services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text3)', fontSize: '12px', marginBottom: '14px' }}>
                No services yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px', maxHeight: '180px', overflowY: 'auto' }}>
                {services.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '7px', background: 'var(--gl)', border: '1px solid var(--br)' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>${s.price_per_1k}/1k · {s.platform}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button className="btn bgh" style={{ padding: '4px 8px', fontSize: '9px' }} onClick={() => toggleService(s)}>
                        {s.is_active ? '⏸' : '▶'}
                      </button>
                      <button className="btn bd" style={{ padding: '4px 8px', fontSize: '9px' }} onClick={() => deleteService(s.id)}>
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <button className="btn bd bmd" onClick={() => toggleSuspend(selected)} disabled={acting}>
                {selected.is_active === false ? '✅ Unsuspend' : '⏸ Suspend'}
              </button>
              <button className="btn bgh bmd" onClick={demoteToBuyer} disabled={acting}>
                ⬇️ Buyer
              </button>
              <button className="btn bp bmd" onClick={promoteToAdmin} disabled={acting}>
                ⬆️ Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

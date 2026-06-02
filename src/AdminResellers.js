import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import AdminCreateReseller from './AdminCreateReseller';

export default function AdminResellers() {
  const [resellers, setResellers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState(null);
  const [services, setServices]   = useState([]);
  const [acting, setActing]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const loadResellers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, role, balance, is_active, referral_code, created_at')
      .eq('role', 'reseller')
      .order('created_at', { ascending: false });
    if (data) setResellers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadResellers();
    const ch = supabase.channel('admin-resellers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadResellers())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadResellers]);

  const openReseller = async (r) => {
    setSelected(r);
    const { data } = await supabase.from('services')
      .select('*').eq('user_id', r.id).order('created_at', { ascending: false });
    setServices(data || []);
  };

  const adjustBalance = async (amt) => {
    setActing(true);
    const newBal = parseFloat(selected.balance || 0) + amt;
    await supabase.from('users').update({ balance: newBal }).eq('id', selected.id);
    await supabase.from('transactions').insert({
      user_id: selected.id, type: 'adjustment', amount: amt,
      description: `Admin balance adjustment: +$${amt}`,
    });
    setSelected(prev => ({ ...prev, balance: newBal }));
    setMsg(`✅ Added $${amt} to balance.`);
    setActing(false);
    loadResellers();
    setTimeout(() => setMsg(''), 3000);
  };

  const toggleService = async (s) => {
    await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    const { data } = await supabase.from('services').select('*').eq('user_id', selected.id).order('created_at', { ascending: false });
    setServices(data || []);
  };

  const deleteService = async (id) => {
    if (!window.confirm('Delete this service?')) return;
    await supabase.from('services').delete().eq('id', id);
    const { data } = await supabase.from('services').select('*').eq('user_id', selected.id).order('created_at', { ascending: false });
    setServices(data || []);
  };

  const toggleSuspend = async (r) => {
    setActing(true);
    await supabase.from('users').update({ is_active: r.is_active === false ? true : false }).eq('id', r.id);
    setSelected(prev => ({ ...prev, is_active: prev.is_active === false ? true : false }));
    setMsg(r.is_active === false ? '✅ Reseller unsuspended.' : '⏸ Reseller suspended.');
    loadResellers();
    setActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const demoteToBuyer = async () => {
    if (!window.confirm('Demote this reseller to buyer?')) return;
    setActing(true);
    await supabase.from('users').update({ role: 'buyer' }).eq('id', selected.id);
    setSelected(null);
    loadResellers();
    setActing(false);
  };

  const promoteToAdmin = async () => {
    if (!window.confirm('Promote this reseller to admin?')) return;
    setActing(true);
    await supabase.from('users').update({ role: 'admin' }).eq('id', selected.id);
    setSelected(null);
    loadResellers();
    setActing(false);
  };

  const filtered = resellers.filter(r =>
    !search || (r.full_name||'').toLowerCase().includes(search.toLowerCase())
      || (r.email||'').toLowerCase().includes(search.toLowerCase())
  );

  if (showCreate) return <AdminCreateReseller onBack={() => { setShowCreate(false); loadResellers(); }} />;

  return (
    <div>
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '👥', lb: 'Total', vl: resellers.length, cl: 'cn' },
          { ic: '✅', lb: 'Active', vl: resellers.filter(r => r.is_active !== false).length, cl: 'cg' },
          { ic: '⏸', lb: 'Suspended', vl: resellers.filter(r => r.is_active === false).length, cl: 'cd' },
          { ic: '💰', lb: 'Total Balance', vl: `$${resellers.reduce((a,b) => a + parseFloat(b.balance||0), 0).toFixed(2)}`, cl: 'cgo' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input className="srch-inp" style={{ flex: 1, minWidth: '160px' }}
          placeholder="🔍 Search resellers..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn bp bmd" onClick={() => setShowCreate(true)}>+ Create Reseller</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">👥</span>
          <div className="empty-tx">No resellers yet</div>
          <div className="empty-sb">Create one to get started</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(r => (
            <div key={r.id} className="card" style={{ padding: '14px', borderColor: r.is_active === false ? 'rgba(255,51,85,.2)' : 'var(--br)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--warn))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px', color: '#000', flexShrink: 0 }}>
                    {r.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                      {r.full_name}
                      {r.is_active === false && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--danger)', padding: '1px 6px', background: 'rgba(255,51,85,.12)', borderRadius: '8px', border: '1px solid rgba(255,51,85,.3)' }}>SUSPENDED</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.email}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                      Joined {new Date(r.created_at).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: '18px', color: 'var(--gold)', fontWeight: 700 }}>
                    Balance: ${parseFloat(r.balance || 0).toFixed(2)}
                  </div>
                  <button className="btn bgd bsm" onClick={() => openReseller(r)}>Manage →</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage Modal */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox" style={{ maxWidth: '480px', width: 'calc(100% - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="mttl">Manage Reseller</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '10px', background: 'var(--gl)', border: '1px solid var(--br)', marginBottom: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--warn))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '18px', color: '#000', flexShrink: 0 }}>
                {selected.full_name?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{selected.full_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.email}</div>
              </div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: '18px', color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>
                ${parseFloat(selected.balance || 0).toFixed(2)}
              </div>
            </div>

            {msg && (
              <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '12px', padding: '8px', borderRadius: '6px', background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.2)', color: 'var(--green)' }}>
                {msg}
              </div>
            )}

            <div className="st" style={{ fontSize: '9px' }}>Add Balance</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px', marginBottom: '8px' }}>
              {[5, 10, 25, 50].map(amt => (
                <button key={amt} className="btn bs bsm" onClick={() => adjustBalance(amt)} disabled={acting}>+${amt}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px', marginBottom: '16px' }}>
              {[100, 250, 500, 1000].map(amt => (
                <button key={amt} className="btn bs bsm" onClick={() => adjustBalance(amt)} disabled={acting}>+${amt}</button>
              ))}
            </div>

            <div className="st" style={{ fontSize: '9px' }}>Their Services ({services.length})</div>
            {services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text3)', fontSize: '12px', marginBottom: '14px' }}>No services yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px', maxHeight: '200px', overflowY: 'auto' }}>
                {services.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '7px', background: 'var(--gl)', border: '1px solid var(--br)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>${s.price_per_1k}/1k · {s.platform}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexShrink: 0, marginLeft: '8px' }}>
                      <button className="btn bgh" style={{ padding: '4px 8px', fontSize: '9px' }} onClick={() => toggleService(s)}>
                        {s.is_active ? '⏸' : '▶'}
                      </button>
                      <button className="btn bd" style={{ padding: '4px 8px', fontSize: '9px' }} onClick={() => deleteService(s.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <button className="btn bd bmd" onClick={() => toggleSuspend(selected)} disabled={acting}>
                {selected.is_active === false ? '✅ Unsuspend' : '⏸ Suspend'}
              </button>
              <button className="btn bgh bmd" onClick={demoteToBuyer} disabled={acting}>⬇️ Buyer</button>
              <button className="btn bp bmd" onClick={promoteToAdmin} disabled={acting}>⬆️ Admin</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

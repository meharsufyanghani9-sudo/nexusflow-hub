import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import AdminCreateReseller from './AdminCreateReseller';

export default function AdminResellers() {
  const [resellers,  setResellers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(null);
  const [services,   setServices]   = useState([]);
  const [acting,     setActing]     = useState(false);
  const [msg,        setMsg]        = useState('');
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
    const channel = supabase
      .channel('admin-resellers-live')
      .on('postgres_changes', { event:'*', schema:'public', table:'users' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new.role === 'reseller') {
          setResellers(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new.role === 'reseller') {
            setResellers(prev => {
              const exists = prev.some(r => r.id === payload.new.id);
              return exists
                ? prev.map(r => r.id === payload.new.id ? payload.new : r)
                : [payload.new, ...prev];
            });
          } else {
            setResellers(prev => prev.filter(r => r.id !== payload.new.id));
          }
        } else if (payload.eventType === 'DELETE') {
          setResellers(prev => prev.filter(r => r.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadResellers]);

  const openReseller = async (r) => {
    setSelected(r); setMsg('');
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
    if (!window.confirm(`Demote ${selected.full_name} to Buyer?`)) return;
    setActing(true);
    await supabase.from('users').update({ role:'buyer' }).eq('id', selected.id);
    setActing(false); setSelected(null); loadResellers();
  };

  const promoteToAdmin = async () => {
    if (!window.confirm(`Promote ${selected.full_name} to Admin? They get full access.`)) return;
    setActing(true);
    await supabase.from('users').update({ role:'admin' }).eq('id', selected.id);
    setActing(false); setSelected(null); loadResellers();
  };

  const adjustBalance = async (amount) => {
    setActing(true);
    const { data: u } = await supabase.from('users').select('balance').eq('id', selected.id).single();
    if (u) {
      const newBal = parseFloat(u.balance || 0) + amount;
      await supabase.from('users').update({ balance: newBal }).eq('id', selected.id);
      await supabase.from('transactions').insert({
        user_id: selected.id, type:'deposit', amount,
        description:`Admin adjustment: +$${amount}`, ref_id:'ADJ-'+Date.now(),
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
    setMsg(newStatus ? '✅ Activated!' : '✅ Suspended!');
    loadResellers();
    if (selected?.id === r.id) setSelected(p => ({ ...p, is_active: newStatus }));
    setTimeout(() => setMsg(''), 3000);
  };

  const filtered = resellers.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.full_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q);
  });

  return (
    <div>
      {showCreate && (
        <AdminCreateReseller
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadResellers(); }}
        />
      )}

      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'🏪', lb:'Total',       vl: resellers.length,                                                  cl:'cgo' },
          { ic:'✅', lb:'Active',      vl: resellers.filter(r => r.is_active !== false).length,               cl:'cg'  },
          { ic:'⏸',  lb:'Suspended',   vl: resellers.filter(r => r.is_active === false).length,               cl:'cd'  },
          { ic:'💰', lb:'Total Bal',   vl:`$${resellers.reduce((a,b)=>a+parseFloat(b.balance||0),0).toFixed(2)}`, cl:'cn' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize:'clamp(14px,2vw,22px)' }}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'12px' }}>
        <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--green)', display:'inline-block', boxShadow:'0 0 6px var(--green)' }} />
        <span style={{ fontSize:'11px', color:'var(--text3)' }}>Live updates</span>
        <button onClick={loadResellers} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--br)', borderRadius:'6px', padding:'3px 10px', fontSize:'11px', color:'var(--text3)', cursor:'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap' }}>
        <input className="srch-inp" style={{ flex:1 }}
          placeholder="🔍 Search resellers..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn bgd bmd" onClick={() => setShowCreate(true)}>➕ Create Reseller</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Loading resellers...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🏪</span>
          <div className="empty-tx">{search ? 'No resellers match' : 'No resellers yet'}</div>
          {!search && (
            <button className="btn bgd bmd" style={{ marginTop:'14px' }} onClick={() => setShowCreate(true)}>
              ➕ Create First Reseller
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {filtered.map(r => (
            <div key={r.id} className="card" style={{
              padding:'14px',
              borderColor: r.is_active===false ? 'rgba(255,51,85,.2)' : 'var(--br)'
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{ width:'42px', height:'42px', borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,var(--gold),var(--warn))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'16px', color:'#000' }}>
                    {r.full_name?.[0]?.toUpperCase() || 'R'}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'2px' }}>
                      {r.full_name}
                      {r.is_active === false && (
                        <span style={{ marginLeft:'6px', fontSize:'10px', color:'var(--danger)', padding:'1px 6px', background:'rgba(255,51,85,.12)', borderRadius:'8px', border:'1px solid rgba(255,51,85,.3)' }}>
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'5px' }}>{r.email}</div>
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                      <span className="bdg b-reseller">Reseller</span>
                      <span className="bdg b-completed">💰 ${parseFloat(r.balance||0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <button className="btn bgd bsm" onClick={() => openReseller(r)}>Manage →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage Modal — fixed padding so buttons are not cramped */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox" style={{ maxWidth:'420px', width:'calc(100% - 24px)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <div className="mttl">Manage Reseller</div>
              <button onClick={() => setSelected(null)}
                style={{ background:'none', border:'none', color:'var(--text3)', fontSize:'18px', cursor:'pointer' }}>✕</button>
            </div>

            {/* Reseller info bar */}
            <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', borderRadius:'10px', background:'var(--gl)', border:'1px solid var(--br)', marginBottom:'16px' }}>
              <div style={{ width:'42px', height:'42px', borderRadius:'50%', background:'linear-gradient(135deg,var(--gold),var(--warn))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'17px', color:'#000', flexShrink:0 }}>
                {selected.full_name?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'14px' }}>{selected.full_name}</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selected.email}</div>
              </div>
              <div style={{ fontFamily:'var(--fm)', fontSize:'18px', color:'var(--gold)', fontWeight:700, flexShrink:0 }}>
                ${parseFloat(selected.balance||0).toFixed(2)}
              </div>
            </div>

            {msg && (
              <div style={{ fontSize:'12px', textAlign:'center', marginBottom:'12px', padding:'8px', borderRadius:'6px', background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)', color:'var(--green)' }}>
                {msg}
              </div>
            )}

            {/* Balance buttons — properly spaced */}
            <div className="st" style={{ fontSize:'9px', marginBottom:'8px' }}>Add Balance</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'8px' }}>
              {[5, 10, 25, 50].map(amt => (
                <button key={amt} className="btn bs bsm" onClick={() => adjustBalance(amt)} disabled={acting}>
                  +${amt}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'16px' }}>
              {[100, 250, 500, 1000].map(amt => (
                <button key={amt} className="btn bgd bsm" onClick={() => adjustBalance(amt)} disabled={acting}>
                  +${amt}
                </button>
              ))}
            </div>

            {/* Their services */}
            <div className="st" style={{ fontSize:'9px', marginBottom:'8px' }}>
              Their Services ({services.length})
            </div>
            {services.length === 0 ? (
              <div style={{ textAlign:'center', padding:'14px', color:'var(--text3)', fontSize:'12px', marginBottom:'14px' }}>
                No services yet
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginBottom:'14px', maxHeight:'180px', overflowY:'auto' }}>
                {services.map(s => (
                  <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderRadius:'7px', background:'var(--gl)', border:'1px solid var(--br)' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize:'10px', color:'var(--text3)' }}>${s.price_per_1k}/1k · {s.platform}</div>
                    </div>
                    <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                      <button className="btn bgh" style={{ padding:'4px 8px', fontSize:'9px' }} onClick={() => toggleService(s)}>
                        {s.is_active ? '⏸' : '▶'}
                      </button>
                      <button className="btn bd" style={{ padding:'4px 8px', fontSize:'9px' }} onClick={() => deleteService(s.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Role / Suspend actions */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
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

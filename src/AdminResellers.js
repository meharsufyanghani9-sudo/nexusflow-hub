import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import AdminCreateReseller from './AdminCreateReseller';

export default function AdminResellers() {
  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [services, setServices] = useState([]);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  // FIX: Added error state to replace removed console.error
  const [loadError, setLoadError] = useState('');

  const loadResellers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, balance, is_active, referral_code, created_at')
      .eq('role', 'reseller')
      .order('created_at', { ascending: false });

    if (error) {
      // FIX: Removed console.error that leaked DB internals — show user-facing error instead
      setLoadError('Failed to load resellers. Please try refreshing the page.');
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
              setResellers(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
            } else {
              // Role changed away from reseller — remove from list
              setResellers(prev => prev.filter(r => r.id !== payload.new.id));
            }
          } else if (payload.eventType === 'DELETE') {
            setResellers(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadResellers]);

  const loadServices = async () => {
    const { data } = await supabase
      .from('services')
      .select('id, name, platform, price_per_1k, is_active')
      .order('created_at', { ascending: false });
    if (data) setServices(data);
  };

  const openReseller = async (r) => {
    setSelected(r);
    setMsg('');
    await loadServices();
  };

  const toggleSuspend = async (r) => {
    if (acting) return;
    setActing(true);
    const newStatus = !r.is_active;
    const { error } = await supabase
      .from('users')
      .update({ is_active: newStatus })
      .eq('id', r.id);
    if (!error) {
      setMsg(newStatus ? '✅ Reseller activated!' : '✅ Reseller suspended!');
      loadResellers();
    } else {
      setMsg('❌ Failed to update status.');
    }
    setActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const addBalance = async (r, amount) => {
    if (acting) return;
    setActing(true);
    const { data: freshUser } = await supabase
      .from('users')
      .select('balance')
      .eq('id', r.id)
      .single();

    if (!freshUser) {
      setMsg('❌ Could not fetch user balance.');
      setActing(false);
      return;
    }

    const newBal = parseFloat(freshUser.balance || 0) + parseFloat(amount);
    await supabase.from('users').update({ balance: newBal }).eq('id', r.id);
    await supabase.from('transactions').insert({
      user_id: r.id,
      type: 'deposit',
      amount: parseFloat(amount),
      description: `Admin added $${amount} to reseller`,
      ref_id: 'ADJ-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    });
    setMsg(`✅ Added $${amount} to ${r.full_name}!`);
    setActing(false);
    loadResellers();
    setTimeout(() => setMsg(''), 3000);
  };

  const filtered = resellers.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.referral_code?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Error banner */}
      {loadError && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(255,51,85,.08)', border: '1px solid rgba(255,51,85,.2)', fontSize: '12px', color: 'var(--danger)' }}>
          ❌ {loadError}
          <button onClick={loadResellers} style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'var(--neon)', cursor: 'pointer', fontSize: '12px' }}>Retry</button>
        </div>
      )}

      {msg && (
        <div style={{ background: msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)', border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}`, borderRadius: '8px', padding: '12px', textAlign: 'center', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--danger)', fontWeight: 700, marginBottom: '16px', fontSize: '13px' }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="srch-inp" style={{ flex: 1, minWidth: '200px' }}
          placeholder="🔍 Search resellers..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn bp bsm" onClick={() => setShowCreate(true)}>+ Create Reseller</button>
        <button className="btn bgh bsm" onClick={loadResellers}>🔄 Refresh</button>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '12px' }}>
        {filtered.length} reseller{filtered.length !== 1 ? 's' : ''} found
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading resellers...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🏪</span>
          <div className="empty-tx">No resellers found</div>
          <div className="empty-sb">Create a reseller account using the button above</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(r => (
            <div key={r.id} className="card" style={{ padding: '14px', opacity: r.is_active === false ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold2),var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px', color: '#000', flexShrink: 0 }}>
                    {r.full_name?.[0]?.toUpperCase() || 'R'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                      {r.full_name}
                      {r.is_active === false && (
                        <span style={{ fontSize: '10px', color: 'var(--danger)', marginLeft: '8px', padding: '1px 6px', background: 'rgba(255,51,85,.12)', borderRadius: '8px', border: '1px solid rgba(255,51,85,.3)' }}>
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>{r.email}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="bdg b-reseller">reseller</span>
                      <span className="bdg b-completed">💰 ${parseFloat(r.balance || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className="btn bgh bsm" onClick={() => openReseller(r)}>Manage →</button>
                  <button
                    onClick={() => toggleSuspend(r)}
                    disabled={acting}
                    style={{ padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, border: 'none', background: r.is_active === false ? 'rgba(0,255,136,.15)' : 'rgba(255,51,85,.12)', color: r.is_active === false ? 'var(--green)' : 'var(--danger)' }}>
                    {r.is_active === false ? '✅ Activate' : '🚫 Suspend'}
                  </button>
                </div>
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
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{selected.full_name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '16px' }}>{selected.email}</div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: '20px', color: 'var(--green)', fontWeight: 700, marginBottom: '16px' }}>
              Balance: ${parseFloat(selected.balance || 0).toFixed(2)}
            </div>
            <div className="st" style={{ marginBottom: '8px' }}>Add Balance</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px', marginBottom: '16px' }}>
              {[5, 10, 25, 50, 100, 250, 500, 1000].map(amt => (
                <button key={amt} className="btn bs bsm" onClick={() => addBalance(selected, amt)} disabled={acting}>+${amt}</button>
              ))}
            </div>
            {msg && (
              <div style={{ fontSize: '12px', textAlign: 'center', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--danger)', marginBottom: '10px' }}>{msg}</div>
            )}
          </div>
        </div>
      )}

      {/* Create Reseller Modal */}
      {showCreate && (
        <AdminCreateReseller
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadResellers(); }}
        />
      )}
    </div>
  );
}

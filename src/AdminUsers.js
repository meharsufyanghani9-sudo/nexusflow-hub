import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editBal, setEditBal] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [pwChanging, setPwChanging] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('edit');
  const [filterRole, setFilterRole] = useState('all');
  const [usernameStatus, setUsernameStatus] = useState('');
  // FIX: server-side pagination state
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PER_PAGE = 50;

  const loadUsers = useCallback(async (pageNum = 1) => {
    setLoading(true);
    const from = (pageNum - 1) * PER_PAGE;
    const to = from + PER_PAGE - 1;

    // FIX: Use server-side pagination with .range() so we never load ALL users
    // at once. At 10,000 users, loading all of them would crash the browser.
    const { data, error, count } = await supabase
      .from('users')
      .select('id, full_name, email, role, balance, is_active, referral_code, username, created_at, referred_by', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      // FIX: Removed console.error that leaked DB internals — show user-facing message instead
      setMsg('❌ Failed to load users. Please try refreshing.');
    }
    if (data) setUsers(data);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers(1);

    const channel = supabase
      .channel('admin-users-live-v3')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setUsers(prev => [payload.new, ...prev]);
            setTotalCount(prev => prev + 1);
          } else if (payload.eventType === 'UPDATE') {
            setUsers(prev => prev.map(u => u.id === payload.new.id ? payload.new : u));
            setSelected(prev => prev && prev.id === payload.new.id ? payload.new : prev);
          } else if (payload.eventType === 'DELETE') {
            setUsers(prev => prev.filter(u => u.id !== payload.old.id));
            setSelected(prev => prev && prev.id === payload.old.id ? null : prev);
            setTotalCount(prev => prev - 1);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadUsers]);

  const openEdit = (u) => {
    setSelected(u);
    setEditBal((u.balance || 0).toString());
    setEditRole(u.role);
    setEditName(u.full_name);
    setEditUsername(u.username || '');
    setMsg('');
    setTab('edit');
    setUsernameStatus('');
  };

  const handleUsernameChange = (val) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setEditUsername(clean);
    if (!clean || clean.length < 3) { setUsernameStatus(''); return; }
    if (clean === selected?.username) { setUsernameStatus('same'); return; }
    setUsernameStatus('checking');
    setTimeout(async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('username', clean)
        .single();
      setUsernameStatus(data ? 'taken' : 'available');
    }, 500);
  };

  const saveUser = async () => {
    if (usernameStatus === 'taken') { setMsg('❌ That username is already taken'); return; }
    if (usernameStatus === 'checking') { setMsg('⏳ Wait, checking username...'); return; }
    if (editUsername && editUsername.length < 3) { setMsg('❌ Username must be at least 3 characters'); return; }

    // Validate balance
    const newBalance = parseFloat(editBal);
    if (isNaN(newBalance) || newBalance < 0) { setMsg('❌ Invalid balance amount'); return; }
    if (newBalance > 1000000) { setMsg('❌ Balance cannot exceed $1,000,000'); return; }

    setSaving(true); setMsg('');
    const { error } = await supabase.from('users').update({
      balance: newBalance,
      role: editRole,
      full_name: editName,
      username: editUsername.toLowerCase() || null,
    }).eq('id', selected.id);
    setSaving(false);
    if (error) { setMsg('❌ Error: ' + error.message); return; }
    setMsg('✅ User updated!');
    loadUsers(page);
    setTimeout(() => setMsg(''), 3000);
  };

  const addBalance = async (amount) => {
    setSaving(true);
    const currentBal = parseFloat(editBal) || 0;
    const newBal = parseFloat((currentBal + amount).toFixed(2));
    await supabase.from('users').update({ balance: newBal }).eq('id', selected.id);
    await supabase.from('transactions').insert({
      user_id: selected.id,
      type: 'deposit',
      amount: amount,
      description: `Admin added $${amount}`,
      ref_id: 'ADJ-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    });
    setEditBal(newBal.toString());
    setSaving(false);
    setMsg(`✅ Added $${amount}!`);
    loadUsers(page);
    setTimeout(() => setMsg(''), 3000);
  };

  const toggleSuspend = async (u) => {
    const newStatus = !u.is_active;
    await supabase.from('users').update({ is_active: newStatus }).eq('id', u.id);
    setMsg(newStatus ? '✅ User activated!' : '✅ User suspended!');
    loadUsers(page);
    setTimeout(() => setMsg(''), 3000);
  };

  const sendPasswordReset = async () => {
    setPwChanging(true); setMsg('');
    const { error } = await supabase.auth.resetPasswordForEmail(selected.email, {
      redirectTo: window.location.origin
    });
    setPwChanging(false);
    if (error) { setMsg('❌ Failed: ' + error.message); return; }
    setMsg('✅ Password reset email sent to ' + selected.email);
    setTimeout(() => setMsg(''), 6000);
  };

  const filtered = users.filter(u => {
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    if (!matchesRole) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.referral_code?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  const UsernameIndicator = () => {
    if (usernameStatus === 'checking') return <span style={{ fontSize: '11px', color: 'var(--text3)' }}>⏳ Checking...</span>;
    if (usernameStatus === 'available') return <span style={{ fontSize: '11px', color: 'var(--green)' }}>✅ Available</span>;
    if (usernameStatus === 'taken') return <span style={{ fontSize: '11px', color: 'var(--danger)' }}>❌ Taken</span>;
    if (usernameStatus === 'same') return <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Current</span>;
    return null;
  };

  return (
    <div>
      {/* Stats Cards */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '👥', lb: 'Total Users',  vl: totalCount,                                          cl: 'cn',  role: 'all' },
          { ic: '🛒', lb: 'Buyers',       vl: users.filter(u => u.role === 'buyer').length,        cl: 'cn',  role: 'buyer' },
          { ic: '🏪', lb: 'Resellers',    vl: users.filter(u => u.role === 'reseller').length,     cl: 'cgo', role: 'reseller' },
          { ic: '👑', lb: 'Admins',       vl: users.filter(u => u.role === 'admin').length,        cl: 'cp',  role: 'admin' },
        ].map((s, i) => (
          <div key={i} className="sc" style={{ cursor: 'pointer', outline: filterRole === s.role ? '2px solid var(--neon)' : 'none' }}
            onClick={() => setFilterRole(filterRole === s.role ? 'all' : s.role)}>
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', boxShadow: '0 0 6px var(--green)', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Live — updates automatically</span>
        {filterRole !== 'all' && (
          <span style={{ fontSize: '11px', color: 'var(--neon)', marginLeft: '6px' }}>
            Showing: {filterRole}s only
            <button onClick={() => setFilterRole('all')} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', marginLeft: '4px', fontSize: '11px' }}>✕ clear</button>
          </span>
        )}
        <button onClick={() => loadUsers(page)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--br)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: 'var(--text3)', cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <input className="srch-inp" style={{ width: '100%' }}
          placeholder="🔍 Search by name, email, @username, referral code, user ID..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
          Showing {filtered.length} users on this page · {totalCount} total
        </div>
      </div>

      {/* FIX: Error message state (replaces removed console.error) */}
      {msg && !selected && (
        <div style={{ padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--danger)', background: msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)', border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}` }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          Loading users...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🔍</span>
          <div className="empty-tx">No users match your search</div>
          <div className="empty-sb">Try a different name, email or @username</div>
          <button className="btn bgh bsm" style={{ marginTop: '12px' }} onClick={() => { setSearch(''); setFilterRole('all'); }}>Clear Filters</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(u => (
              <div key={u.id} className="card" style={{ padding: '14px', opacity: u.is_active === false ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--neon2),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px', color: '#fff' }}>
                      {u.full_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                        {u.full_name}
                        {u.is_active === false && (
                          <span style={{ fontSize: '10px', color: 'var(--danger)', marginLeft: '8px', padding: '1px 6px', background: 'rgba(255,51,85,.12)', borderRadius: '8px', border: '1px solid rgba(255,51,85,.3)' }}>
                            SUSPENDED
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>{u.email}</div>
                      {u.username && (
                        <div style={{ fontSize: '11px', color: 'var(--neon)', marginBottom: '4px', fontFamily: 'var(--fm)' }}>@{u.username}</div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span className={`bdg b-${u.role}`}>{u.role}</span>
                        <span className="bdg b-completed">💰 ${parseFloat(u.balance || 0).toFixed(2)}</span>
                        {u.referral_code && (
                          <span style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--fm)', padding: '2px 6px', background: 'var(--gl)', border: '1px solid var(--br)', borderRadius: '10px' }}>
                            {u.referral_code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button className="btn bgh bsm" onClick={() => openEdit(u)}>Edit →</button>
                </div>
              </div>
            ))}
          </div>

          {/* FIX: Server-side pagination controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn bgh bsm" onClick={() => { setPage(p => { const np = Math.max(1, p-1); loadUsers(np); return np; })} } disabled={page === 1}>← Prev</button>
              <span style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text2)' }}>Page {page} / {totalPages} ({totalCount} users)</span>
              <button className="btn bgh bsm" onClick={() => { setPage(p => { const np = Math.min(totalPages, p+1); loadUsers(np); return np; })} } disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div className="mttl">Edit User</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '8px', background: 'var(--gl)', border: '1px solid var(--br)', marginBottom: '14px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--neon2),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px', color: '#fff', flexShrink: 0 }}>
                {selected.full_name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{selected.full_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{selected.email}</div>
                {selected.username && (
                  <div style={{ fontSize: '11px', color: 'var(--neon)', fontFamily: 'var(--fm)' }}>@{selected.username}</div>
                )}
              </div>
              <button
                onClick={() => toggleSuspend(selected)}
                style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, border: 'none', background: selected.is_active === false ? 'rgba(0,255,136,.15)' : 'rgba(255,51,85,.12)', color: selected.is_active === false ? 'var(--green)' : 'var(--danger)' }}>
                {selected.is_active === false ? '✅ Activate' : '🚫 Suspend'}
              </button>
            </div>

            <div className="atbs" style={{ marginBottom: '16px' }}>
              <button className={`atb ${tab === 'edit' ? 'on' : ''}`} onClick={() => { setTab('edit'); setMsg(''); }}>Edit</button>
              <button className={`atb ${tab === 'balance' ? 'on' : ''}`} onClick={() => { setTab('balance'); setMsg(''); }}>Balance</button>
              <button className={`atb ${tab === 'password' ? 'on' : ''}`} onClick={() => { setTab('password'); setMsg(''); }}>Password</button>
            </div>

            {tab === 'edit' && (
              <div>
                <div className="fi">
                  <label className="fl">Full Name</label>
                  <input className="inp" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="fi">
                  <label className="fl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Username</span>
                    <UsernameIndicator />
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '14px', pointerEvents: 'none' }}>@</span>
                    <input className="inp" type="text" placeholder="username" value={editUsername} onChange={e => handleUsernameChange(e.target.value)} style={{ paddingLeft: '26px' }} autoCapitalize="none" autoCorrect="off" />
                  </div>
                </div>
                <div className="fi">
                  <label className="fl">Role</label>
                  <select className="sel" value={editRole} onChange={e => setEditRole(e.target.value)}>
                    <option value="buyer">🛒 Buyer</option>
                    <option value="reseller">🏪 Reseller</option>
                    <option value="admin">👑 Admin</option>
                  </select>
                </div>
                <div className="fi">
                  <label className="fl">Balance ($)</label>
                  <input className="inp" type="number" value={editBal} onChange={e => setEditBal(e.target.value)} min="0" max="1000000" />
                </div>
                {msg && <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '10px', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--danger)' }}>{msg}</div>}
                <button className="btn bp blg bw" onClick={saveUser} disabled={saving || usernameStatus === 'taken' || usernameStatus === 'checking'}>
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span><span>→</span>
                </button>
              </div>
            )}

            {tab === 'balance' && (
              <div>
                <div style={{ textAlign: 'center', padding: '16px', borderRadius: '8px', background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.15)', marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '2px' }}>Current Balance</div>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: '26px', fontWeight: 700, color: 'var(--green)' }}>${parseFloat(editBal || 0).toFixed(2)}</div>
                </div>
                <div className="fi">
                  <label className="fl">Set Exact Balance ($)</label>
                  <input className="inp" type="number" value={editBal} onChange={e => setEditBal(e.target.value)} min="0" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px', marginBottom: '10px' }}>
                  {[1, 5, 10, 25].map(amt => (
                    <button key={amt} className="btn bs bsm" onClick={() => addBalance(amt)} disabled={saving}>+${amt}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '7px', marginBottom: '14px' }}>
                  {[50, 100, 500].map(amt => (
                    <button key={amt} className="btn bgd bsm" onClick={() => addBalance(amt)} disabled={saving}>+${amt}</button>
                  ))}
                </div>
                {msg && <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '10px', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--danger)' }}>{msg}</div>}
                <button className="btn bp blg bw" onClick={saveUser} disabled={saving}>
                  <span>{saving ? 'Saving...' : 'Update Balance'}</span><span>→</span>
                </button>
              </div>
            )}

            {tab === 'password' && (
              <div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,212,255,.06)', border: '1px solid var(--br)', marginBottom: '14px', fontSize: '11px', color: 'var(--text2)', lineHeight: 1.8 }}>
                  <strong style={{ color: 'var(--neon)' }}>How this works:</strong><br />
                  1. Tap Send Reset Email below<br />
                  2. User gets email with reset link<br />
                  3. User taps link and sets new password<br />
                  4. Secure — no password visible to anyone
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.2)', marginBottom: '14px', fontSize: '11px', color: 'var(--text2)' }}>
                  📧 Reset email will go to:<br />
                  <strong style={{ color: 'var(--gold)', fontFamily: 'var(--fm)' }}>{selected.email}</strong>
                </div>
                {msg && (
                  <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '12px', padding: '10px', borderRadius: '7px', background: msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)', border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}`, color: msg.startsWith('✅') ? 'var(--green)' : 'var(--danger)', lineHeight: 1.6 }}>
                    {msg}
                  </div>
                )}
                <button className="btn bp blg bw" onClick={sendPasswordReset} disabled={pwChanging}>
                  <span>{pwChanging ? 'Sending...' : '📧 Send Password Reset Email'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

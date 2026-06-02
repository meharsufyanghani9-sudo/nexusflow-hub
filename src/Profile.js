import React, { useState } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

export default function Profile({ user, onLogout }) {
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwOk, setPwOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const { format, currency } = useCurrency();

  const changePassword = async () => {
    setPwMsg(''); setPwOk(false);
    if (!curPw || !newPw || !confPw) { setPwMsg('Fill all fields'); return; }
    if (newPw.length < 8) { setPwMsg('New password min 8 characters'); return; }
    if (newPw !== confPw) { setPwMsg('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: curPw,
      });
      if (signInErr) { setPwMsg('Current password is incorrect'); setLoading(false); return; }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) { setPwMsg('Update failed: ' + updateErr.message); setLoading(false); return; }
      await supabase.auth.signOut();
      await supabase.auth.signInWithPassword({ email: user.email, password: newPw });
      setPwOk(true);
      setPwMsg('✅ Password changed successfully!');
      setCurPw(''); setNewPw(''); setConfPw('');
    } catch (e) {
      setPwMsg('Something went wrong: ' + e.message);
    }
    setLoading(false);
    setTimeout(() => { setPwMsg(''); setPwOk(false); }, 4000);
  };

  // Balance shown in current selected currency
  const balanceDisplay = format(user.balance);

  return (
    <div style={{ maxWidth: '500px' }}>
      <div className="bhr mb20" style={{ textAlign: 'center' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 14px',
          background: 'linear-gradient(135deg,var(--neon2),var(--purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', fontWeight: 900, fontFamily: 'var(--fd)', color: '#fff',
          boxShadow: '0 0 24px rgba(0,212,255,.3)'
        }}>
          {user.name[0].toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>{user.name}</div>
        {user.username && (
          <div style={{ fontSize: '13px', color: 'var(--neon)', fontFamily: 'var(--fm)', marginBottom: '6px' }}>
            @{user.username}
          </div>
        )}
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{user.email}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <span className={`bdg b-${user.role}`}>{user.role}</span>
          {/* Balance shown in user's selected currency */}
          <span className="bdg b-completed">Balance: {balanceDisplay}</span>
        </div>
      </div>

      <div className="st">Account Info</div>
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        {[
          { lb: 'Full Name',      val: user.name },
          { lb: 'Username',       val: user.username ? '@' + user.username : '—' },
          { lb: 'Email Address',  val: user.email },
          { lb: 'Account Type',   val: user.role.toUpperCase() },
          { lb: 'Wallet Balance', val: balanceDisplay },
          { lb: 'Currency',       val: `${currency.symbol} ${currency.code} — ${currency.name}` },
        ].map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--br)' : 'none'
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{r.lb}</span>
            <span style={{
              fontSize: '13px', fontWeight: 600,
              color: r.lb === 'Wallet Balance' ? 'var(--green)' : r.lb === 'Username' ? 'var(--neon)' : r.lb === 'Currency' ? 'var(--gold)' : 'var(--text)',
              fontFamily: r.lb === 'Username' ? 'var(--fm)' : 'inherit'
            }}>{r.val}</span>
          </div>
        ))}
      </div>

      <div className="st">Change Password</div>
      <div className="card" style={{ padding: '18px', marginBottom: '16px' }}>
        <div className="fi">
          <label className="fl">Current Password</label>
          <input className="inp" type="password" placeholder="Enter current password"
            value={curPw} onChange={e => setCurPw(e.target.value)} />
        </div>
        <div className="fi">
          <label className="fl">New Password</label>
          <input className="inp" type="password" placeholder="Min 8 characters"
            value={newPw} onChange={e => setNewPw(e.target.value)} />
        </div>
        <div className="fi">
          <label className="fl">Confirm New Password</label>
          <input className="inp" type="password" placeholder="Repeat new password"
            value={confPw} onChange={e => setConfPw(e.target.value)} />
        </div>
        {newPw && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '5px' }}>PASSWORD STRENGTH</div>
            <div className="pgw">
              <div className="pgb" style={{
                width: newPw.length < 6 ? '25%' : newPw.length < 8 ? '50%' : newPw.length < 12 ? '75%' : '100%',
                background: newPw.length < 6 ? 'var(--danger)' : newPw.length < 8 ? 'var(--warn)' : newPw.length < 12 ? 'var(--neon)' : 'var(--green)',
              }} />
            </div>
            <div style={{ fontSize: '10px', marginTop: '4px', color: newPw.length < 6 ? 'var(--danger)' : newPw.length < 8 ? 'var(--warn)' : newPw.length < 12 ? 'var(--neon)' : 'var(--green)' }}>
              {newPw.length < 6 ? 'Too weak' : newPw.length < 8 ? 'Weak' : newPw.length < 12 ? 'Good' : 'Strong ✓'}
            </div>
          </div>
        )}
        {pwMsg && (
          <div style={{
            fontSize: '12px', textAlign: 'center', marginBottom: '12px', padding: '10px', borderRadius: '7px',
            background: pwOk ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)',
            border: `1px solid ${pwOk ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}`,
            color: pwOk ? 'var(--green)' : 'var(--danger)'
          }}>
            {pwMsg}
          </div>
        )}
        <button className="btn bp blg bw" onClick={changePassword} disabled={loading}>
          <span>{loading ? 'Updating...' : 'Update Password'}</span><span>→</span>
        </button>
      </div>

      <div className="st" style={{ color: 'var(--danger)' }}>Account</div>
      <div className="card" style={{ padding: '16px', borderColor: 'rgba(255,51,85,.2)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
          Logging out will end your current session.
        </div>
        <button className="btn bd bmd bw" onClick={onLogout}>⏻ Logout from NexusFlow</button>
      </div>
    </div>
  );
}

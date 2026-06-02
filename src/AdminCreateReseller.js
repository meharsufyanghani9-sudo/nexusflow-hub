import React, { useState } from 'react';
import { supabase } from './supabase';

export default function AdminCreateReseller({ onClose, onCreated }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    balance: '0',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const create = async () => {
    setError(''); setSuccess('');
    if (!form.full_name || !form.email || !form.password) {
      setError('Fill all required fields'); return;
    }
    if (form.password.length < 8) {
      setError('Password min 8 characters'); return;
    }
    setCreating(true);

    try {
      // ─── STEP 1: Save admin session BEFORE doing anything ───────────────
      const { data: sessionData } = await supabase.auth.getSession();
      const adminAccessToken = sessionData?.session?.access_token;
      const adminRefreshToken = sessionData?.session?.refresh_token;
      const adminUserId = sessionData?.session?.user?.id;

      if (!adminAccessToken || !adminUserId) {
        setError('Admin session expired. Please refresh the page and try again.');
        setCreating(false);
        return;
      }

      // ─── STEP 2: Create the new auth account ────────────────────────────
      // Note: signUp() in Supabase client-side does NOT log out the current user
      // if auto-confirm is enabled. But we save the session anyway to be safe.
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } }
      });

      if (signUpErr) {
        setError(signUpErr.message);
        setCreating(false);
        return;
      }

      if (!data?.user) {
        setError('Account creation failed. This email may already be registered.');
        setCreating(false);
        return;
      }

      const newUserId = data.user.id;
      const newUserEmail = data.user.email;

      // ─── STEP 3: Restore admin session immediately ───────────────────────
      // This is critical — signUp may have switched the session to the new user
      await supabase.auth.setSession({
        access_token: adminAccessToken,
        refresh_token: adminRefreshToken,
      });

      // ─── STEP 4: Wait for Supabase trigger to create the profile row ────
      // The trigger in Supabase creates a row in public.users when a new
      // auth user is created. We wait up to 5 seconds for it.
      let profileExists = false;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 600));
        const { data: checkRow } = await supabase
          .from('users').select('id').eq('id', newUserId).single();
        if (checkRow) { profileExists = true; break; }
      }

      // ─── STEP 5: Generate a referral code for the new reseller ──────────
      const refCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      if (profileExists) {
        // ✅ FIX: The old code used .update().select() and checked `count`,
        // but Supabase returns data rows not a count from .update().select().
        // Now we do a simple update with all the correct fields.
        const { error: updateErr } = await supabase
          .from('users')
          .update({
            role: 'reseller',           // ✅ This is what was missing — role was not being set!
            full_name: form.full_name,
            balance: parseFloat(form.balance) || 0,
            referral_code: refCode,
            is_active: true,
          })
          .eq('id', newUserId);

        if (updateErr) {
          setError('Profile found but update failed: ' + updateErr.message +
            '\n\nFix: Go to Users tab, find ' + form.email + ' and change role to Reseller manually.');
          setCreating(false);
          return;
        }
      } else {
        // ✅ FIX: If the trigger didn't create the row in time, we insert it manually.
        const { error: insertErr } = await supabase.from('users').upsert({
          id: newUserId,
          full_name: form.full_name,
          email: newUserEmail,
          role: 'reseller',             // ✅ Always set to 'reseller' here too
          balance: parseFloat(form.balance) || 0,
          is_active: true,
          referral_code: refCode,
        });

        if (insertErr) {
          setError('Account created in Auth but profile setup failed: ' + insertErr.message +
            '\n\nFix: Go to Users tab, find ' + form.email + ' and change role to Reseller manually.');
          setCreating(false);
          return;
        }
      }

      // ─── STEP 6: Add starting balance transaction if balance > 0 ────────
      if (parseFloat(form.balance) > 0) {
        await supabase.from('transactions').insert({
          user_id: newUserId,
          type: 'deposit',
          amount: parseFloat(form.balance),
          description: 'Starting balance by admin',
          ref_id: 'ADM-' + Date.now(),
        });
      }

      // ─── STEP 7: Final check — verify the role was actually saved ────────
      const { data: finalCheck } = await supabase
        .from('users').select('role').eq('id', newUserId).single();

      if (finalCheck && finalCheck.role !== 'reseller') {
        // One more attempt to force the role
        await supabase.from('users').update({ role: 'reseller' }).eq('id', newUserId);
      }

      setSuccess(
        `✅ Reseller account created successfully!\n\nEmail: ${form.email}\nPassword: ${form.password}\nStarting Balance: $${parseFloat(form.balance || 0).toFixed(2)}\n\nShare these login details with the reseller.`
      );
      setForm({ full_name: '', email: '', password: '', balance: '0' });
      if (onCreated) onCreated();

    } catch (e) {
      setError('Unexpected error: ' + e.message);
    }

    setCreating(false);
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
    let pw = '';
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    set('password', pw);
  };

  return (
    <div className="mlay" onClick={e => e.target.classList.contains('mlay') && onClose()}>
      <div className="mbox">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div className="mttl">➕ Create Reseller Account</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '10px 12px', borderRadius: '7px', background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.2)', fontSize: '11px', color: 'var(--warn)', marginBottom: '14px', lineHeight: 1.7 }}>
          ⚠️ Admin creates this account. Share the email and password with the reseller directly. They login at your site URL.
        </div>

        {success && (
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.2)', color: 'var(--green)', fontSize: '12px', marginBottom: '14px', lineHeight: 1.8, whiteSpace: 'pre-line', wordBreak: 'break-all' }}>
            {success}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px', borderRadius: '7px', background: 'rgba(255,51,85,.08)', border: '1px solid rgba(255,51,85,.2)', color: 'var(--danger)', fontSize: '12px', marginBottom: '14px', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div className="fi">
          <label className="fl">Full Name *</label>
          <input className="inp" placeholder="Reseller's full name"
            value={form.full_name} onChange={e => set('full_name', e.target.value)} />
        </div>

        <div className="fi">
          <label className="fl">Email Address *</label>
          <input className="inp" type="email" placeholder="reseller@email.com"
            value={form.email} onChange={e => set('email', e.target.value)} />
        </div>

        <div className="fi">
          <label className="fl">Password *</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="inp" placeholder="Min 8 characters"
              value={form.password} onChange={e => set('password', e.target.value)}
              style={{ flex: 1 }} />
            <button className="btn bgh bsm" onClick={generatePassword} style={{ flexShrink: 0 }}>
              🎲 Generate
            </button>
          </div>
        </div>

        <div className="fi">
          <label className="fl">Starting Balance ($)</label>
          <input className="inp" type="number" placeholder="0" min="0"
            value={form.balance} onChange={e => set('balance', e.target.value)} />
        </div>

        <button className="btn bgd blg bw" onClick={create} disabled={creating}>
          <span>{creating ? 'Creating Account... Please wait...' : '✦ Create Reseller Account'}</span>
        </button>

        {creating && (
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '10px', lineHeight: 1.7 }}>
            ⏳ Setting up account and assigning reseller role...<br />
            Please do not close this window.
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminDeposits() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState(''); // 'ok' or 'err'

  useEffect(() => { loadDeposits(); }, []);

  const loadDeposits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deposits')
      .select('*, users(full_name, email, referred_by)')
      .order('created_at', { ascending: false });
    if (error) {
      showMsg('❌ Failed to load deposits.', 'err');
    } else {
      setDeposits(data || []);
    }
    setLoading(false);
  };

  const showMsg = (text, type = 'ok') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  const approve = async (dep) => {
    // Prevent double-click
    if (acting) return;

    // ── FIX: Re-validate the deposit amount on the admin side ─────────────
    const amount = parseFloat(dep.amount);
    if (!amount || amount <= 0 || amount > 100000) {
      showMsg('❌ Invalid deposit amount — cannot approve.', 'err');
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    setActing(true);

    // ── FIX: Atomic lock — set status to 'processing' first ──────────────
    // This is a single atomic write. If another admin clicks Approve at the
    // same time, one of them will fail here because .eq('status','pending')
    // will not match once it's already been changed to 'processing'.
    // This completely prevents double-approval and double referral bonuses.
    const { data: lockResult, error: lockErr } = await supabase
      .from('deposits')
      .update({ status: 'processing' })
      .eq('id', dep.id)
      .eq('status', 'pending')  // only succeeds if STILL pending
      .select()
      .single();

    if (lockErr || !lockResult) {
      showMsg('❌ This deposit is already being processed or was already approved.', 'err');
      setActing(false);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    // 1. Get user's current balance
    const { data: u, error: uErr } = await supabase
      .from('users')
      .select('balance, referred_by')
      .eq('id', dep.user_id)
      .single();

    if (uErr || !u) {
      // Rollback the lock if user not found
      await supabase.from('deposits').update({ status: 'pending' }).eq('id', dep.id);
      showMsg('❌ Could not find user. Deposit reverted to pending.', 'err');
      setActing(false);
      return;
    }

    const newBalance = parseFloat(u.balance || 0) + amount;

    // 2. Credit user balance
    const { error: balErr } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', dep.user_id);

    if (balErr) {
      // Rollback the lock
      await supabase.from('deposits').update({ status: 'pending' }).eq('id', dep.id);
      showMsg('❌ Failed to credit balance. Deposit reverted to pending.', 'err');
      setActing(false);
      return;
    }

    // 3. Create deposit transaction record
    await supabase.from('transactions').insert({
      user_id: dep.user_id,
      type: 'deposit',
      amount: amount,
      description: `Deposit approved via ${dep.method}`,
      ref_id: dep.deposit_ref || 'DEP-' + dep.id,
    });

    // 4. Mark deposit as approved
    await supabase.from('deposits')
      .update({ status: 'approved' })
      .eq('id', dep.id);

    // ── FIX: Referral bonus — check for first deposit BEFORE we changed status
    // We already locked the row in step above, so no race condition here.
    const referredByCode = u.referred_by || dep.users?.referred_by;

    if (referredByCode && !dep.referral_bonus_paid) {
      // Check previous approved deposits (excluding current one, which is now approved)
      const { data: prevDeposits } = await supabase
        .from('deposits')
        .select('id')
        .eq('user_id', dep.user_id)
        .eq('status', 'approved')
        .neq('id', dep.id);

      const isFirstDeposit = !prevDeposits || prevDeposits.length === 0;

      if (isFirstDeposit) {
        const { data: settingsRows } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['referral_inviter_percent', 'referral_joiner_percent']);

        let inviterPercent = 10;
        let joinerPercent = 5;
        if (settingsRows) {
          settingsRows.forEach(row => {
            if (row.key === 'referral_inviter_percent') inviterPercent = parseFloat(row.value) || 10;
            if (row.key === 'referral_joiner_percent') joinerPercent = parseFloat(row.value) || 5;
          });
        }

        const inviterBonus = (amount * inviterPercent) / 100;
        const joinerBonus = (amount * joinerPercent) / 100;

        const { data: inviter } = await supabase
          .from('users')
          .select('id, balance')
          .eq('referral_code', referredByCode)
          .single();

        if (inviter) {
          const inviterNewBalance = parseFloat(inviter.balance || 0) + inviterBonus;
          await supabase.from('users')
            .update({ balance: inviterNewBalance })
            .eq('id', inviter.id);

          await supabase.from('transactions').insert({
            user_id: inviter.id,
            type: 'referral',
            amount: inviterBonus,
            description: `Referral bonus: ${inviterPercent}% of $${amount.toFixed(2)} deposit`,
            ref_id: 'REF-INV-' + dep.id,
          });

          if (joinerBonus > 0) {
            const joinerNewBalance = newBalance + joinerBonus;
            await supabase.from('users')
              .update({ balance: joinerNewBalance })
              .eq('id', dep.user_id);

            await supabase.from('transactions').insert({
              user_id: dep.user_id,
              type: 'referral',
              amount: joinerBonus,
              description: `Referral welcome bonus: ${joinerPercent}% of your first deposit`,
              ref_id: 'REF-JOIN-' + dep.id,
            });
          }

          // Mark so referral bonus is never paid twice
          await supabase.from('deposits')
            .update({ referral_bonus_paid: true })
            .eq('id', dep.id);
        }
      }
    }

    setActing(false);
    setSelected(null);
    loadDeposits();
    showMsg(`✅ Approved! $${amount.toFixed(2)} credited to ${dep.user_name || 'user'}.`, 'ok');
  };

  const reject = async (dep) => {
    if (acting) return;
    if (!rejectNote.trim()) {
      showMsg('❌ Enter a rejection reason before rejecting.', 'err');
      return;
    }
    setActing(true);
    await supabase.from('deposits').update({
      status: 'rejected',
      reject_reason: rejectNote.trim(),
    }).eq('id', dep.id)
      .eq('status', 'pending'); // only reject if still pending

    setActing(false);
    setSelected(null);
    setRejectNote('');
    loadDeposits();
    showMsg('✅ Deposit rejected. User will see the rejection reason.', 'ok');
  };

  const filtered = deposits.filter(d => filter === 'all' || d.status === filter);
  const pending = deposits.filter(d => d.status === 'pending').length;
  const approved = deposits.filter(d => d.status === 'approved').length;
  const rejected = deposits.filter(d => d.status === 'rejected').length;
  const totalApprovedValue = deposits
    .filter(d => d.status === 'approved')
    .reduce((a, b) => a + parseFloat(b.amount || 0), 0);

  return (
    <div>
      {msg && (
        <div style={{
          background: msgType === 'ok' ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)',
          border: `1px solid ${msgType === 'ok' ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: msgType === 'ok' ? 'var(--green)' : 'var(--danger)',
          fontWeight: 700, marginBottom: '16px', fontSize: '13px'
        }}>
          {msg}
        </div>
      )}

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '⏳', lb: 'Pending', vl: pending, cl: 'cw' },
          { ic: '✅', lb: 'Approved', vl: approved, cl: 'cg' },
          { ic: '❌', lb: 'Rejected', vl: rejected, cl: 'cd' },
          { ic: '💰', lb: 'Total Approved', vl: `$${totalApprovedValue.toFixed(2)}`, cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize: 'clamp(14px,2vw,20px)' }}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
            fontFamily: 'var(--fu)', fontSize: '11px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '1px', transition: '.15s',
            background: filter === s ? 'var(--neon)' : 'var(--gl)',
            color: filter === s ? '#000' : 'var(--text3)',
            border: filter === s ? 'none' : '1px solid var(--br)',
          }}>
            {s} {s === 'pending' && pending > 0 ? `(${pending})` : ''}
          </button>
        ))}
      </div>

      {/* Deposits List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          Loading deposits...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📭</span>
          <div className="empty-tx">No {filter === 'all' ? '' : filter} deposits found</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(d => (
            <div key={d.id} className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--neon)' }}>
                      {d.deposit_ref || d.id?.toString().slice(0, 8)}
                    </span>
                    <span className={`bdg ${d.status === 'approved' ? 'b-completed' : d.status === 'pending' ? 'b-pending' : d.status === 'processing' ? 'b-processing' : 'b-rejected'}`}>
                      {d.status}
                    </span>
                    {d.referral_bonus_paid && (
                      <span style={{ fontSize: '10px', color: 'var(--gold)', background: 'rgba(255,215,0,.1)', padding: '2px 6px', borderRadius: '10px', border: '1px solid rgba(255,215,0,.2)' }}>
                        🎁 Ref bonus paid
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '3px' }}>
                    {d.users?.full_name || d.user_name || 'Unknown User'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
                    {d.users?.email || d.user_email}
                  </div>
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <span><span style={{ color: 'var(--text3)' }}>Method: </span><span style={{ color: 'var(--text)' }}>{d.method}</span></span>
                    <span><span style={{ color: 'var(--text3)' }}>Txn: </span><span style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>{d.txn_id}</span></span>
                    <span><span style={{ color: 'var(--text3)' }}>Date: </span><span style={{ color: 'var(--text2)' }}>{new Date(d.created_at).toLocaleString()}</span></span>
                  </div>
                  {d.reject_reason && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--danger)' }}>
                      ❌ Reject reason: {d.reject_reason}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: '22px', fontWeight: 700, color: 'var(--gold)', marginBottom: '8px' }}>
                    ${parseFloat(d.amount || 0).toFixed(2)}
                  </div>
                  {d.status === 'pending' && (
                    <button className="btn bp bsm" onClick={() => { setSelected(d); setRejectNote(''); }}>
                      Review →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && !acting && setSelected(null)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="mttl">Review Deposit</div>
              <button onClick={() => !acting && setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="card" style={{ padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text3)' }}>User: </span><span style={{ fontWeight: 700 }}>{selected.users?.full_name || selected.user_name}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Email: </span><span>{selected.users?.email || selected.user_email}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Method: </span><span>{selected.method}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Txn ID: </span><span style={{ fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--neon)' }}>{selected.txn_id}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Date: </span><span>{new Date(selected.created_at).toLocaleString()}</span></div>
                <div><span style={{ color: 'var(--text3)' }}>Ref: </span><span style={{ fontFamily: 'var(--fm)', fontSize: '10px' }}>{selected.deposit_ref}</span></div>
              </div>

              {(selected.users?.referred_by) && !selected.referral_bonus_paid && (
                <div style={{
                  marginTop: '10px', padding: '8px 12px', borderRadius: '7px',
                  background: 'rgba(255,215,0,.07)', border: '1px solid rgba(255,215,0,.2)',
                  fontSize: '11px', color: 'var(--gold)'
                }}>
                  🎁 This user was referred! Approving will automatically pay referral bonuses to both the inviter and this user.
                </div>
              )}

              <div style={{ marginTop: '12px', padding: '10px', borderRadius: '7px', background: 'rgba(255,215,0,.07)', border: '1px solid rgba(255,215,0,.2)', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>Amount to Credit</div>
                <div style={{ fontFamily: 'var(--fm)', fontSize: '24px', color: 'var(--gold)', fontWeight: 700 }}>
                  ${parseFloat(selected.amount || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {selected.screenshot_url ? (
              <div style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--br)', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', padding: '6px', letterSpacing: '1px' }}>PAYMENT SCREENSHOT</div>
                <img
                  src={selected.screenshot_url}
                  alt="Payment proof"
                  style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                />
              </div>
            ) : (
              <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(0,0,0,.3)', border: '1px dashed var(--br2)', textAlign: 'center', marginBottom: '16px', fontSize: '13px', color: 'var(--text2)' }}>
                📸 No screenshot uploaded
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <button
                className="btn bs blg"
                onClick={() => approve(selected)}
                disabled={acting}
                style={{ opacity: acting ? 0.6 : 1, cursor: acting ? 'not-allowed' : 'pointer' }}>
                {acting ? '⏳ Processing...' : '✅ Approve & Credit'}
              </button>
              <button
                className="btn bd blg"
                onClick={() => reject(selected)}
                disabled={acting}
                style={{ opacity: acting ? 0.6 : 1, cursor: acting ? 'not-allowed' : 'pointer' }}>
                {acting ? '⏳...' : '❌ Reject'}
              </button>
            </div>

            <div className="fi">
              <label className="fl">Rejection Reason (required before rejecting)</label>
              <input
                className="inp"
                placeholder="e.g. Screenshot unclear / wrong transaction ID"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                disabled={acting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ─── CURRENCY HELPER ────────────────────────────────────────────────────────
// BUG FIX: The original code was showing deposit amounts with a "$" symbol
// even for PKR deposits. Admin was seeing "10 USD" when user deposited "10 PKR".
// This helper now correctly shows the original deposit currency to admin.
function depositDisplay(dep) {
  const method = (dep.method || '').toLowerCase();
  const amt = parseFloat(dep.amount || 0);
  if (method.includes('binance') || method.includes('usdt')) {
    return { label: `$${amt.toFixed(2)} USDT`, color: '#F0B90B', isFiat: false };
  }
  // Easypaisa, JazzCash → PKR (original currency user paid in)
  return { label: `₨${amt.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} PKR`, color: '#4CAF50', isFiat: true };
}

export default function AdminDeposits() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  // PKR rate cache to avoid fetching repeatedly
  const [pkrRate, setPkrRate] = useState(null);

  useEffect(() => {
    loadDeposits();
    loadPkrRate();
  }, []);

  const loadPkrRate = async () => {
    const { data } = await supabase
      .from('currencies').select('rate').eq('code', 'PKR').single();
    if (data) setPkrRate(parseFloat(data.rate) || 278);
  };

  const loadDeposits = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deposits')
      .select('*, users(full_name, email, referred_by)')
      .order('created_at', { ascending: false });
    if (error) {
      showMsg('❌ Failed to load: ' + error.message, 'err');
    } else {
      setDeposits(data || []);
    }
    setLoading(false);
  }, []);

  const showMsg = (text, type = 'ok') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 6000);
  };

  // ─── APPROVE ────────────────────────────────────────────────────────────────
  // BUG FIX: The original code had the PKR→USD conversion logic but the UI
  // summary card was still showing "$10" for a "₨10 PKR" deposit.
  // We also now re-fetch PKR rate at approval time for accuracy.
  const approve = async (dep) => {
    setActing(true);

    const { data: u, error: uErr } = await supabase
      .from('users').select('balance, referred_by').eq('id', dep.user_id).single();

    if (uErr || !u) {
      showMsg('❌ Could not find user.', 'err');
      setActing(false); return;
    }

    const method = (dep.method || '').toLowerCase();
    const isBinance = method.includes('binance') || method.includes('usdt');
    const rawAmount = parseFloat(dep.amount || 0);

    let usdAmount;
    if (isBinance) {
      usdAmount = rawAmount; // USDT = USD 1:1
    } else {
      // PKR → USD conversion
      // Fetch fresh rate at approval time
      const { data: pkrRow } = await supabase
        .from('currencies').select('rate').eq('code', 'PKR').single();
      const rate = parseFloat(pkrRow?.rate || pkrRate || 278);
      usdAmount = rawAmount / rate;
    }

    const usdAmountRounded = parseFloat(usdAmount.toFixed(4));
    const currentBalance = parseFloat(u.balance || 0);
    const newBalance = parseFloat((currentBalance + usdAmountRounded).toFixed(4));

    // Credit user balance in USD
    const { error: balErr } = await supabase
      .from('users').update({ balance: newBalance }).eq('id', dep.user_id);

    if (balErr) {
      showMsg('❌ Failed to credit: ' + balErr.message, 'err');
      setActing(false); return;
    }

    // Transaction record — store USD amount; description notes original currency
    const { label } = depositDisplay(dep);
    await supabase.from('transactions').insert({
      user_id: dep.user_id,
      type: 'deposit',
      amount: usdAmountRounded,
      description: `Deposit approved: ${dep.method} (${label}) → $${usdAmountRounded.toFixed(4)} USD`,
      ref_id: dep.deposit_ref || 'DEP-' + dep.id,
    });

    // Mark deposit approved
    await supabase.from('deposits').update({ status: 'approved' }).eq('id', dep.id);

    // ── REFERRAL BONUS — only on first approved deposit ──────────────────────
    const referredByCode = u.referred_by || dep.users?.referred_by;
    if (referredByCode && !dep.referral_bonus_paid) {
      const { data: prevDeposits } = await supabase
        .from('deposits').select('id')
        .eq('user_id', dep.user_id).eq('status', 'approved').neq('id', dep.id);

      const isFirst = !prevDeposits || prevDeposits.length === 0;

      if (isFirst) {
        const { data: settingsRows } = await supabase
          .from('settings').select('key, value')
          .in('key', ['referral_inviter_percent', 'referral_joiner_percent']);

        let invPct = 10, joinPct = 5;
        if (settingsRows) {
          settingsRows.forEach(r => {
            if (r.key === 'referral_inviter_percent') invPct = parseFloat(r.value) || 10;
            if (r.key === 'referral_joiner_percent') joinPct = parseFloat(r.value) || 5;
          });
        }

        const invBonus = parseFloat(((usdAmountRounded * invPct) / 100).toFixed(4));
        const joinBonus = parseFloat(((usdAmountRounded * joinPct) / 100).toFixed(4));

        const { data: inviter } = await supabase
          .from('users').select('id, balance')
          .eq('referral_code', referredByCode).single();

        if (inviter) {
          const inviterNewBal = parseFloat((parseFloat(inviter.balance || 0) + invBonus).toFixed(4));
          await supabase.from('users')
            .update({ balance: inviterNewBal }).eq('id', inviter.id);
          await supabase.from('transactions').insert({
            user_id: inviter.id, type: 'referral', amount: invBonus,
            description: `Referral bonus ${invPct}% of $${usdAmountRounded.toFixed(2)} deposit`,
            ref_id: 'REF-INV-' + dep.id,
          });

          if (joinBonus > 0) {
            const joinerNewBal = parseFloat((newBalance + joinBonus).toFixed(4));
            await supabase.from('users')
              .update({ balance: joinerNewBal }).eq('id', dep.user_id);
            await supabase.from('transactions').insert({
              user_id: dep.user_id, type: 'referral', amount: joinBonus,
              description: `Referral welcome bonus ${joinPct}% of first deposit`,
              ref_id: 'REF-JOIN-' + dep.id,
            });
          }
          await supabase.from('deposits').update({ referral_bonus_paid: true }).eq('id', dep.id);
        }
      }
    }

    setActing(false);
    setSelected(null);
    loadDeposits();
    showMsg(`✅ Approved! ${label} → $${usdAmountRounded.toFixed(4)} USD credited to ${dep.user_name || 'user'}.`, 'ok');
  };

  const reject = async (dep) => {
    if (!rejectNote.trim()) {
      showMsg('❌ Enter a rejection reason first.', 'err'); return;
    }
    setActing(true);
    await supabase.from('deposits').update({
      status: 'rejected', reject_reason: rejectNote.trim(),
    }).eq('id', dep.id);
    setActing(false); setSelected(null); setRejectNote('');
    loadDeposits();
    showMsg('Deposit rejected. User notified.', 'ok');
  };

  const filtered = deposits.filter(d => filter === 'all' || d.status === filter);
  const pending  = deposits.filter(d => d.status === 'pending').length;
  const approved = deposits.filter(d => d.status === 'approved').length;
  const rejected = deposits.filter(d => d.status === 'rejected').length;

  // BUG FIX: Total approved was shown as "$X" implying USD, but deposits are
  // stored in PKR. Now we group by currency and show both.
  const pkrApproved = deposits
    .filter(d => d.status === 'approved' && !d.method?.toLowerCase().includes('binance'))
    .reduce((a, b) => a + parseFloat(b.amount || 0), 0);
  const usdtApproved = deposits
    .filter(d => d.status === 'approved' && d.method?.toLowerCase().includes('binance'))
    .reduce((a, b) => a + parseFloat(b.amount || 0), 0);

  const totalLabel = [
    pkrApproved > 0 ? `₨${pkrApproved.toLocaleString('en-PK')}` : null,
    usdtApproved > 0 ? `$${usdtApproved.toFixed(2)}` : null,
  ].filter(Boolean).join(' + ') || '₨0';

  return (
    <div>
      {msg && (
        <div style={{
          background: msgType === 'ok' ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)',
          border: `1px solid ${msgType === 'ok' ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: msgType === 'ok' ? 'var(--green)' : 'var(--danger)',
          fontWeight: 700, marginBottom: '16px', fontSize: '13px'
        }}>{msg}</div>
      )}

      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '⏳', lb: 'Pending',        vl: pending,     cl: 'cw' },
          { ic: '✅', lb: 'Approved',       vl: approved,    cl: 'cg' },
          { ic: '❌', lb: 'Rejected',       vl: rejected,    cl: 'cd' },
          { ic: '💰', lb: 'Total Approved', vl: totalLabel,  cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize: 'clamp(11px,1.8vw,17px)' }}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
            fontFamily: 'var(--fu)', fontSize: '11px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '1px',
            background: filter === s ? 'var(--neon)' : 'var(--gl)',
            color: filter === s ? '#000' : 'var(--text3)',
            border: filter === s ? 'none' : '1px solid var(--br)',
          }}>
            {s} {s === 'pending' && pending > 0 ? `(${pending})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📭</span>
          <div className="empty-tx">No {filter === 'all' ? '' : filter} deposits</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(d => {
            const { label, color } = depositDisplay(d);
            // Calculate approximate USD value for admin context
            const rawAmt = parseFloat(d.amount || 0);
            const isBinance = (d.method || '').toLowerCase().includes('binance');
            const approxUsd = isBinance ? rawAmt : rawAmt / (pkrRate || 278);

            return (
              <div key={d.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--neon)' }}>
                        {d.deposit_ref || d.id?.toString().slice(0, 8)}
                      </span>
                      <span className={`bdg ${d.status === 'approved' ? 'b-completed' : d.status === 'pending' ? 'b-pending' : 'b-rejected'}`}>
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
                      <span><span style={{ color: 'var(--text3)' }}>Method: </span>{d.method}</span>
                      <span><span style={{ color: 'var(--text3)' }}>Txn: </span><span style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>{d.txn_id}</span></span>
                      <span><span style={{ color: 'var(--text3)' }}>Date: </span>{new Date(d.created_at).toLocaleString()}</span>
                    </div>
                    {d.reject_reason && (
                      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--danger)' }}>
                        ❌ {d.reject_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {/* FIXED: show PKR or USDT — the actual currency the user paid in */}
                    <div style={{ fontFamily: 'var(--fm)', fontSize: '20px', fontWeight: 700, color, marginBottom: '2px' }}>
                      {label}
                    </div>
                    {/* Show approx USD so admin knows how much to credit */}
                    {!isBinance && (
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
                        ≈ ${approxUsd.toFixed(2)} USD
                      </div>
                    )}
                    {d.status === 'pending' && (
                      <button className="btn bp bsm" onClick={() => { setSelected(d); setRejectNote(''); }}>
                        Review →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {selected && (() => {
        const { label, color } = depositDisplay(selected);
        const rawAmt = parseFloat(selected.amount || 0);
        const isBinance = (selected.method || '').toLowerCase().includes('binance');
        const approxUsd = isBinance ? rawAmt : rawAmt / (pkrRate || 278);
        return (
          <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
            <div className="mbox">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div className="mttl">Review Deposit</div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
              </div>

              <div className="card" style={{ padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  <div><span style={{ color: 'var(--text3)' }}>User: </span><b>{selected.users?.full_name || selected.user_name}</b></div>
                  <div><span style={{ color: 'var(--text3)' }}>Email: </span>{selected.users?.email || selected.user_email}</div>
                  <div><span style={{ color: 'var(--text3)' }}>Method: </span>{selected.method}</div>
                  <div><span style={{ color: 'var(--text3)' }}>Txn ID: </span><span style={{ fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--neon)' }}>{selected.txn_id}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Date: </span>{new Date(selected.created_at).toLocaleString()}</div>
                  <div><span style={{ color: 'var(--text3)' }}>Ref: </span><span style={{ fontFamily: 'var(--fm)', fontSize: '10px' }}>{selected.deposit_ref}</span></div>
                </div>

                {selected.users?.referred_by && !selected.referral_bonus_paid && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '7px', background: 'rgba(255,215,0,.07)', border: '1px solid rgba(255,215,0,.2)', fontSize: '11px', color: 'var(--gold)' }}>
                    🎁 Referred user — referral bonuses will be paid on approval.
                  </div>
                )}

                {/* FIXED: clearly shows user paid in PKR / USDT, and what USD will be credited */}
                <div style={{ marginTop: '12px', padding: '10px', borderRadius: '7px', background: `${color}10`, border: `1px solid ${color}30`, textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>User Paid (Original Currency)</div>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: '26px', color, fontWeight: 700 }}>{label}</div>
                  {!isBinance && (
                    <div style={{ marginTop: '6px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(0,212,255,.08)', border: '1px solid rgba(0,212,255,.15)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>Will credit to user balance (USD)</div>
                      <div style={{ fontFamily: 'var(--fm)', fontSize: '16px', color: 'var(--neon)', fontWeight: 700 }}>
                        ${approxUsd.toFixed(4)} USD
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                        Rate: 1 USD = ₨{(pkrRate || 278).toLocaleString()} PKR
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selected.screenshot_url ? (
                <div style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--br)', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', padding: '6px', letterSpacing: '1px' }}>PAYMENT SCREENSHOT</div>
                  <img src={selected.screenshot_url} alt="proof" style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </div>
              ) : (
                <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(0,0,0,.3)', border: '1px dashed var(--br2)', textAlign: 'center', marginBottom: '16px', fontSize: '13px', color: 'var(--text2)' }}>
                  📸 No screenshot uploaded
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <button className="btn bs blg" onClick={() => approve(selected)} disabled={acting}>
                  {acting ? '⏳ Processing...' : '✅ Approve & Credit'}
                </button>
                <button className="btn bd blg" onClick={() => reject(selected)} disabled={acting}>
                  {acting ? '...' : '❌ Reject'}
                </button>
              </div>

              <div className="fi">
                <label className="fl">Rejection Reason (required to reject)</label>
                <input className="inp" placeholder="e.g. Wrong transaction ID" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

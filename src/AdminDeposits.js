import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminDeposits() {
  const [deposits,    setDeposits]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('pending');
  const [selected,    setSelected]    = useState(null);
  const [rejectNote,  setRejectNote]  = useState('');
  const [acting,      setActing]      = useState(false);
  const [msg,         setMsg]         = useState('');
  const [msgType,     setMsgType]     = useState('ok');

  useEffect(() => { loadDeposits(); }, []);

  const loadDeposits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deposits')
      .select('*, users(full_name, email, referred_by)')
      .order('created_at', { ascending: false });
    if (error) showMsg('❌ Failed to load deposits: ' + error.message, 'err');
    else setDeposits(data || []);
    setLoading(false);
  };

  const showMsg = (text, type = 'ok') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  const approve = async (dep) => {
    if (acting) return;
    // ── Validate amount server-side ──────────────────────────────────────────
    const amount = parseFloat(dep.amount);
    if (!amount || amount <= 0 || amount > 10000000) {
      showMsg('❌ Invalid deposit amount.', 'err'); return;
    }
    setActing(true);

    // ── Atomic lock: only proceeds if still pending ──────────────────────────
    const { data: lockResult, error: lockErr } = await supabase
      .from('deposits')
      .update({ status: 'processing' })
      .eq('id', dep.id)
      .eq('status', 'pending')
      .select().single();

    if (lockErr || !lockResult) {
      showMsg('❌ Already being processed or approved.', 'err');
      setActing(false); return;
    }

    // Get user current balance
    const { data: u, error: uErr } = await supabase
      .from('users').select('balance, referred_by').eq('id', dep.user_id).single();

    if (uErr || !u) {
      await supabase.from('deposits').update({ status: 'pending' }).eq('id', dep.id);
      showMsg('❌ User not found. Reverted.', 'err');
      setActing(false); return;
    }

    const newBalance = parseFloat(u.balance || 0) + amount;

    // Credit balance
    const { error: balErr } = await supabase.from('users')
      .update({ balance: newBalance }).eq('id', dep.user_id);

    if (balErr) {
      await supabase.from('deposits').update({ status: 'pending' }).eq('id', dep.id);
      showMsg('❌ Balance update failed. Reverted.', 'err');
      setActing(false); return;
    }

    // Log transaction
    await supabase.from('transactions').insert({
      user_id: dep.user_id, type: 'deposit', amount,
      description: `Deposit approved via ${dep.method}`,
      ref_id: dep.deposit_ref || 'DEP-' + dep.id,
    });

    // Mark approved
    await supabase.from('deposits').update({ status: 'approved' }).eq('id', dep.id);

    // ── Referral bonus (first deposit only) ──────────────────────────────────
    const referredByCode = u.referred_by || dep.users?.referred_by;
    if (referredByCode && !dep.referral_bonus_paid) {
      const { data: prevDeposits } = await supabase
        .from('deposits').select('id')
        .eq('user_id', dep.user_id).eq('status', 'approved').neq('id', dep.id);

      if (!prevDeposits || prevDeposits.length === 0) {
        const { data: settingsRows } = await supabase
          .from('settings').select('key, value')
          .in('key', ['referral_inviter_percent', 'referral_joiner_percent']);

        let inviterPct = 10, joinerPct = 5;
        if (settingsRows) settingsRows.forEach(r => {
          if (r.key === 'referral_inviter_percent') inviterPct = parseFloat(r.value) || 10;
          if (r.key === 'referral_joiner_percent')  joinerPct  = parseFloat(r.value) || 5;
        });

        const { data: inviter } = await supabase
          .from('users').select('id, balance').eq('referral_code', referredByCode).single();

        if (inviter) {
          const inviterBonus = (amount * inviterPct) / 100;
          const joinerBonus  = (amount * joinerPct)  / 100;

          await supabase.from('users')
            .update({ balance: parseFloat(inviter.balance || 0) + inviterBonus })
            .eq('id', inviter.id);
          await supabase.from('transactions').insert({
            user_id: inviter.id, type: 'referral', amount: inviterBonus,
            description: `Referral bonus: ${inviterPct}% of $${amount.toFixed(2)}`,
            ref_id: 'REF-INV-' + dep.id,
          });

          if (joinerBonus > 0) {
            await supabase.from('users')
              .update({ balance: newBalance + joinerBonus })
              .eq('id', dep.user_id);
            await supabase.from('transactions').insert({
              user_id: dep.user_id, type: 'referral', amount: joinerBonus,
              description: `Referral welcome bonus: ${joinerPct}% of first deposit`,
              ref_id: 'REF-JOIN-' + dep.id,
            });
          }

          await supabase.from('deposits')
            .update({ referral_bonus_paid: true }).eq('id', dep.id);
        }
      }
    }

    setActing(false);
    setSelected(null);
    loadDeposits();
    showMsg(`✅ Approved! PKR ${amount.toLocaleString()} credited to ${dep.user_name || 'user'}.`, 'ok');
  };

  const reject = async (dep) => {
    if (acting) return;
    if (!rejectNote.trim()) { showMsg('❌ Enter rejection reason first.', 'err'); return; }
    setActing(true);
    await supabase.from('deposits')
      .update({ status: 'rejected', reject_reason: rejectNote.trim() })
      .eq('id', dep.id).eq('status', 'pending');
    setActing(false);
    setSelected(null);
    setRejectNote('');
    loadDeposits();
    showMsg('✅ Deposit rejected.', 'ok');
  };

  const filtered = deposits.filter(d => filter === 'all' || d.status === filter);
  const pending  = deposits.filter(d => d.status === 'pending').length;
  const approved = deposits.filter(d => d.status === 'approved').length;
  const rejected = deposits.filter(d => d.status === 'rejected').length;
  const totalApproved = deposits.filter(d => d.status === 'approved')
    .reduce((a, b) => a + parseFloat(b.amount || 0), 0);

  return (
    <div>
      {msg && (
        <div style={{
          background: msgType==='ok' ? 'rgba(0,255,136,.08)' : 'rgba(255,51,85,.08)',
          border:`1px solid ${msgType==='ok' ? 'rgba(0,255,136,.2)' : 'rgba(255,51,85,.2)'}`,
          borderRadius:'8px', padding:'12px', textAlign:'center',
          color: msgType==='ok' ? 'var(--green)' : 'var(--danger)',
          fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>{msg}</div>
      )}

      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'⏳', lb:'Pending',       vl:pending,                               cl:'cw'  },
          { ic:'✅', lb:'Approved',      vl:approved,                              cl:'cg'  },
          { ic:'❌', lb:'Rejected',      vl:rejected,                              cl:'cd'  },
          { ic:'💰', lb:'Total Approved', vl:`PKR ${totalApproved.toLocaleString()}`, cl:'cgo' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize:'clamp(12px,2vw,18px)' }}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
        {['all','pending','approved','rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding:'6px 14px', borderRadius:'20px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'1px',
            background: filter===s ? 'var(--neon)' : 'var(--gl)',
            color: filter===s ? '#000' : 'var(--text3)',
            border: filter===s ? 'none' : '1px solid var(--br)',
          }}>
            {s} {s==='pending' && pending>0 ? `(${pending})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading deposits...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📭</span>
          <div className="empty-tx">No {filter === 'all' ? '' : filter} deposits found</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {filtered.map(d => (
            <div key={d.id} className="card" style={{ padding:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'10px' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--neon)' }}>
                      {d.deposit_ref || d.id?.toString().slice(0,8)}
                    </span>
                    <span className={`bdg ${d.status==='approved'?'b-completed':d.status==='pending'?'b-pending':d.status==='processing'?'b-processing':'b-rejected'}`}>
                      {d.status}
                    </span>
                    {d.referral_bonus_paid && (
                      <span style={{ fontSize:'10px', color:'var(--gold)', background:'rgba(255,215,0,.1)', padding:'2px 6px', borderRadius:'10px', border:'1px solid rgba(255,215,0,.2)' }}>
                        🎁 Ref bonus paid
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'3px' }}>
                    {d.users?.full_name || d.user_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'8px' }}>
                    {d.users?.email || d.user_email}
                  </div>
                  <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', fontSize:'12px' }}>
                    <span><span style={{ color:'var(--text3)' }}>Method: </span>{d.method}</span>
                    <span><span style={{ color:'var(--text3)' }}>Txn: </span>
                      <span style={{ fontFamily:'var(--fm)', color:'var(--neon)', fontSize:'11px' }}>{d.txn_id}</span>
                    </span>
                    <span><span style={{ color:'var(--text3)' }}>Date: </span>
                      {new Date(d.created_at).toLocaleString()}
                    </span>
                  </div>
                  {d.reject_reason && (
                    <div style={{ marginTop:'8px', fontSize:'11px', color:'var(--danger)' }}>
                      ❌ {d.reject_reason}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  {/* Always show PKR */}
                  <div style={{ fontFamily:'var(--fm)', fontSize:'22px', fontWeight:700, color:'var(--gold)', marginBottom:'8px' }}>
                    PKR {parseFloat(d.amount||0).toLocaleString()}
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
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
              <div className="mttl">Review Deposit</div>
              <button onClick={() => !acting && setSelected(null)}
                style={{ background:'none', border:'none', color:'var(--text3)', fontSize:'18px', cursor:'pointer' }}>✕</button>
            </div>

            <div className="card" style={{ padding:'14px', marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px' }}>
                <div><span style={{ color:'var(--text3)' }}>User: </span><span style={{ fontWeight:700 }}>{selected.users?.full_name || selected.user_name}</span></div>
                <div><span style={{ color:'var(--text3)' }}>Email: </span>{selected.users?.email || selected.user_email}</div>
                <div><span style={{ color:'var(--text3)' }}>Method: </span>{selected.method}</div>
                <div><span style={{ color:'var(--text3)' }}>Txn ID: </span><span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--neon)' }}>{selected.txn_id}</span></div>
                <div><span style={{ color:'var(--text3)' }}>Date: </span>{new Date(selected.created_at).toLocaleString()}</div>
                <div><span style={{ color:'var(--text3)' }}>Ref: </span><span style={{ fontFamily:'var(--fm)', fontSize:'10px' }}>{selected.deposit_ref}</span></div>
              </div>

              {(selected.users?.referred_by) && !selected.referral_bonus_paid && (
                <div style={{ marginTop:'10px', padding:'8px 12px', borderRadius:'7px', background:'rgba(255,215,0,.07)', border:'1px solid rgba(255,215,0,.2)', fontSize:'11px', color:'var(--gold)' }}>
                  🎁 Referred user — referral bonuses will be paid automatically on approval.
                </div>
              )}

              <div style={{ marginTop:'12px', padding:'10px', borderRadius:'7px', background:'rgba(255,215,0,.07)', border:'1px solid rgba(255,215,0,.2)', textAlign:'center' }}>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'3px' }}>Amount to Credit</div>
                {/* Show PKR always */}
                <div style={{ fontFamily:'var(--fm)', fontSize:'26px', color:'var(--gold)', fontWeight:700 }}>
                  PKR {parseFloat(selected.amount||0).toLocaleString()}
                </div>
              </div>
            </div>

            {selected.screenshot_url ? (
              <div style={{ marginBottom:'16px', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--br)', textAlign:'center' }}>
                <div style={{ fontSize:'10px', color:'var(--text3)', padding:'6px', letterSpacing:'1px' }}>PAYMENT SCREENSHOT</div>
                <img src={selected.screenshot_url} alt="Payment proof"
                  style={{ maxWidth:'100%', maxHeight:'280px', objectFit:'contain', display:'block', margin:'0 auto' }} />
              </div>
            ) : (
              <div style={{ padding:'16px', borderRadius:'8px', background:'rgba(0,0,0,.3)', border:'1px dashed var(--br2)', textAlign:'center', marginBottom:'16px', fontSize:'13px', color:'var(--text2)' }}>
                📸 No screenshot uploaded
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
              <button className="btn bs blg" onClick={() => approve(selected)} disabled={acting}
                style={{ opacity:acting?0.6:1 }}>
                {acting ? '⏳ Processing...' : '✅ Approve & Credit'}
              </button>
              <button className="btn bd blg" onClick={() => reject(selected)} disabled={acting}
                style={{ opacity:acting?0.6:1 }}>
                {acting ? '⏳...' : '❌ Reject'}
              </button>
            </div>

            <div className="fi">
              <label className="fl">Rejection Reason (required before rejecting)</label>
              <input className="inp"
                placeholder="e.g. Screenshot unclear / wrong transaction ID"
                value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                disabled={acting} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

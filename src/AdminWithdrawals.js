import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { loadWithdrawals(); }, []);

  const loadWithdrawals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, users(full_name, email, role)')
      .eq('type', 'withdrawal')
      .order('created_at', { ascending: false });
    if (data) setWithdrawals(data);
    setLoading(false);
  };

  const filtered = withdrawals.filter(w => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !w.processed;
    if (filter === 'processed') return w.processed;
    return true;
  });

  const markProcessed = async (w) => {
    setActing(true);
    await supabase.from('transactions')
      .update({ processed: true, process_note: note })
      .eq('id', w.id);
    setActing(false);
    setSelected(null);
    setNote('');
    loadWithdrawals();
    alert('✅ Withdrawal marked as processed!');
  };

  const refundWithdrawal = async (w) => {
    setActing(true);
    const { data: u } = await supabase
      .from('users').select('balance').eq('id', w.user_id).single();
    if (u) {
      const refundAmt = Math.abs(parseFloat(w.amount));
      await supabase.from('users')
        .update({ balance: parseFloat(u.balance) + refundAmt })
        .eq('id', w.user_id);
      await supabase.from('transactions').insert({
        user_id: w.user_id,
        type: 'refund',
        amount: refundAmt,
        description: 'Withdrawal refunded by admin',
        ref_id: 'REF-' + Date.now(),
      });
      await supabase.from('transactions')
        .update({ processed: true, process_note: 'Refunded' })
        .eq('id', w.id);
    }
    setActing(false);
    setSelected(null);
    loadWithdrawals();
    alert('✅ Withdrawal refunded to user balance!');
  };

  const totalPending = withdrawals.filter(w => !w.processed)
    .reduce((a, b) => a + Math.abs(parseFloat(b.amount)), 0);

  return (
    <div>
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'⏳', lb:'Pending', vl:withdrawals.filter(w=>!w.processed).length, cl:'cw' },
          { ic:'✅', lb:'Processed', vl:withdrawals.filter(w=>w.processed).length, cl:'cg' },
          { ic:'💸', lb:'Total Requests', vl:withdrawals.length, cl:'cn' },
          { ic:'💰', lb:'Pending Amount', vl:`$${totalPending.toFixed(2)}`, cl:'cd' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`} style={{ fontSize:'clamp(14px,2vw,22px)' }}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
        {['all','pending','processed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'6px 14px', borderRadius:'20px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'1px',
            background: filter===f ? 'var(--neon)' : 'var(--gl)',
            color: filter===f ? '#000' : 'var(--text3)',
            border: filter===f ? 'none' : '1px solid var(--br)',
          }}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">💸</span>
          <div className="empty-tx">No withdrawals found</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {filtered.map(w => (
            <div key={w.id} className="card" style={{ padding:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'10px' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                    <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--neon)' }}>{w.ref_id}</span>
                    <span className={`bdg ${w.processed ? 'b-completed' : 'b-pending'}`}>
                      {w.processed ? 'Processed' : 'Pending'}
                    </span>
                  </div>
                  <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'2px' }}>
                    {w.users?.full_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'6px' }}>
                    {w.users?.email}
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--text2)', lineHeight:1.6 }}>
                    {w.description}
                  </div>
                  <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px' }}>
                    {new Date(w.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--fm)', fontSize:'22px', fontWeight:700, color:'var(--danger)', marginBottom:'8px' }}>
                    ${Math.abs(parseFloat(w.amount)).toFixed(2)}
                  </div>
                  {!w.processed && (
                    <button className="btn bp bsm" onClick={() => setSelected(w)}>
                      Review →
                    </button>
                  )}
                </div>
              </div>
              {w.process_note && (
                <div style={{ marginTop:'8px', fontSize:'11px', color:'var(--text3)', padding:'6px 10px', borderRadius:'5px', background:'var(--gl)', border:'1px solid var(--br)' }}>
                  Note: {w.process_note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
              <div className="mttl">Review Withdrawal</div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:'18px', cursor:'pointer' }}>✕</button>
            </div>
            <div className="card" style={{ padding:'14px', marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px' }}>
                <div><span style={{ color:'var(--text3)' }}>User: </span><span style={{ fontWeight:700 }}>{selected.users?.full_name}</span></div>
                <div><span style={{ color:'var(--text3)' }}>Email: </span>{selected.users?.email}</div>
                <div><span style={{ color:'var(--text3)' }}>Ref: </span><span style={{ fontFamily:'var(--fm)', color:'var(--neon)', fontSize:'10px' }}>{selected.ref_id}</span></div>
                <div><span style={{ color:'var(--text3)' }}>Date: </span>{new Date(selected.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ marginTop:'10px', padding:'10px', borderRadius:'7px', background:'rgba(255,51,85,.07)', border:'1px solid rgba(255,51,85,.2)', textAlign:'center' }}>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'3px' }}>Withdrawal Amount</div>
                <div style={{ fontFamily:'var(--fm)', fontSize:'24px', color:'var(--danger)', fontWeight:700 }}>
                  ${Math.abs(parseFloat(selected.amount)).toFixed(2)}
                </div>
              </div>
              <div style={{ marginTop:'10px', fontSize:'11px', color:'var(--text2)', lineHeight:1.6, padding:'8px', background:'var(--gl)', borderRadius:'6px' }}>
                {selected.description}
              </div>
            </div>
            <div className="fi">
              <label className="fl">Process Note (optional)</label>
              <input className="inp" placeholder="e.g. Sent via Easypaisa at 3:00 PM"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <button className="btn bs blg" onClick={() => markProcessed(selected)} disabled={acting}>
                ✅ Mark Processed
              </button>
              <button className="btn bd blg" onClick={() => refundWithdrawal(selected)} disabled={acting}>
                ↩️ Refund User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

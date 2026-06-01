import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function ResellerEarnings({ user }) {
  const [balance, setBalance] = useState(user.balance || 0);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wAmount, setWAmount] = useState('');
  const [wMethod, setWMethod] = useState('easypaisa');
  const [wAccount, setWAccount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: profile } = await supabase.from('users').select('balance').eq('id', user.id).single();
    if (profile) setBalance(parseFloat(profile.balance));
    const { data } = await supabase.from('transactions').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setTxns(data);
    setLoading(false);
  };

  const submitWithdraw = async () => {
    if (!wAmount || parseFloat(wAmount) <= 0) { alert('Enter valid amount'); return; }
    if (parseFloat(wAmount) > balance) { alert('Insufficient balance'); return; }
    if (!wAccount) { alert('Enter account number'); return; }
    setSubmitting(true);
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'withdrawal',
      amount: -parseFloat(wAmount),
      description: `Withdrawal request: ${wMethod} - ${wAccount}`,
      ref_id: 'WD-' + Date.now(),
    });
    await supabase.from('users').update({ balance: balance - parseFloat(wAmount) }).eq('id', user.id);
    setSubmitting(false);
    setDone(true);
    setShowWithdraw(false);
    setWAmount(''); setWAccount('');
    loadData();
  };

  const earned = txns.filter(t => t.type === 'order' && parseFloat(t.amount) > 0)
    .reduce((a, b) => a + parseFloat(b.amount), 0);
  const withdrawn = txns.filter(t => t.type === 'withdrawal')
    .reduce((a, b) => a + Math.abs(parseFloat(b.amount)), 0);

  const typeIcon = (type) => {
    if (type === 'deposit') return '💳';
    if (type === 'order') return '📦';
    if (type === 'refund') return '↩️';
    if (type === 'referral') return '🎁';
    if (type === 'task') return '⚡';
    if (type === 'withdrawal') return '💸';
    return '💸';
  };

  return (
    <div>
      {done && (
        <div style={{ background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.2)', borderRadius: '8px', padding: '12px', textAlign: 'center', color: 'var(--green)', fontWeight: 700, marginBottom: '16px' }}>
          ✅ Withdrawal request submitted! Admin will process within 24 hours.
        </div>
      )}

      <div className="bhr mb20" style={{ background: 'linear-gradient(135deg,rgba(255,215,0,.12),rgba(0,20,60,.35))' }}>
        <div className="bh-lbl">Reseller Balance</div>
        <div className="bh-amt"><span>$</span>{balance.toFixed(2)}</div>
        <div className="bh-ft">
          <div style={{ fontFamily: 'var(--fd)', fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,.4)' }}>AVAILABLE TO WITHDRAW</div>
          <button className="btn bgd bsm" onClick={() => setShowWithdraw(true)} disabled={balance <= 0}>Withdraw Funds</button>
        </div>
      </div>

      <div className="cgrid" style={{ marginBottom: '20px' }}>
        {[
          { ic: '💰', lb: 'Current Balance', vl: `$${balance.toFixed(2)}`, cl: 'cg' },
          { ic: '💵', lb: 'Total Earned', vl: `$${earned.toFixed(2)}`, cl: 'cgo' },
          { ic: '💸', lb: 'Total Withdrawn', vl: `$${withdrawn.toFixed(2)}`, cl: 'cn' },
          { ic: '📊', lb: 'Transactions', vl: txns.length, cl: 'cp' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div className="st">Transaction History</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>Loading...</div>
      ) : txns.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📊</span>
          <div className="empty-tx">No transactions yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {txns.map(t => (
            <div key={t.id} className="card" style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: 'var(--gl2)', border: '1px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                  {typeIcon(t.type)}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{t.description || t.type}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{new Date(t.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: '15px', fontWeight: 700, color: parseFloat(t.amount) > 0 ? 'var(--green)' : 'var(--danger)', flexShrink: 0 }}>
                {parseFloat(t.amount) > 0 ? '+' : ''}${Math.abs(parseFloat(t.amount)).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setShowWithdraw(false)}>
          <div className="mbox" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="mttl">💸 Withdraw Funds</div>
              <button onClick={() => setShowWithdraw(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.15)', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px' }}>Available Balance</div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: '24px', fontWeight: 700, color: 'var(--green)' }}>${balance.toFixed(2)}</div>
            </div>
            <div className="fi">
              <label className="fl">Payment Method</label>
              <select className="sel" value={wMethod} onChange={e => setWMethod(e.target.value)}>
                <option value="easypaisa">📱 Easypaisa</option>
                <option value="jazzcash">💳 JazzCash</option>
                <option value="binance">🟡 Binance USDT</option>
                <option value="bank">🏦 Bank Transfer</option>
              </select>
            </div>
            <div className="fi">
              <label className="fl">Account Number / Address</label>
              <input className="inp" placeholder="0300-1234567 or wallet address" value={wAccount} onChange={e => setWAccount(e.target.value)} />
            </div>
            <div className="fi">
              <label className="fl">Amount ($)</label>
              <input className="inp" type="number" placeholder="Enter amount" value={wAmount} onChange={e => setWAmount(e.target.value)} />
            </div>
            <button className="btn bp blg bw" onClick={submitWithdraw} disabled={submitting}>
              <span>{submitting ? 'Submitting...' : 'Submit Withdrawal Request'}</span><span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

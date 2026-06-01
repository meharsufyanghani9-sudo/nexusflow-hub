import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function Referral({ user }) {
  const [stats, setStats] = useState({ total:0, converted:0, earned:0 });
  const [referrals, setReferrals] = useState([]);
  const [settings, setSettings] = useState({ inviter_percent:10, joiner_percent:5 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const refCode = user.referral_code || '';
  const refLink = `${window.location.origin}?ref=${refCode}`;

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);

    // Load referral settings
    const { data: s } = await supabase.from('settings')
      .select('*')
      .in('key', ['referral_inviter_percent','referral_joiner_percent']);
    if (s) {
      const sv = {};
      s.forEach(r => { sv[r.key] = r.value; });
      setSettings({
        inviter_percent: parseFloat(sv.referral_inviter_percent || 10),
        joiner_percent: parseFloat(sv.referral_joiner_percent || 5),
      });
    }

    // Load referred users
    const { data: refs } = await supabase.from('users')
      .select('full_name, created_at, balance')
      .eq('referred_by', refCode);

    // Load referral earnings
    const { data: txns } = await supabase.from('transactions')
      .select('amount').eq('user_id', user.id).eq('type', 'referral');

    const earned = txns ? txns.reduce((a,b) => a + parseFloat(b.amount), 0) : 0;

    if (refs) {
      setReferrals(refs);
      setStats({
        total: refs.length,
        converted: refs.filter(r => parseFloat(r.balance) > 0).length,
        earned: earned,
      });
    }
    setLoading(false);
  };

  const copy = (txt) => {
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareWhatsApp = () => {
    const text = `Join NexusFlow HUB and get a bonus on your first deposit!\nUse my referral code: *${refCode}*\nSignup: ${refLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const steps = [
    { ic:'📤', n:'Step 1', tx:'Share your referral code or link with friends' },
    { ic:'👤', n:'Step 2', tx:`Friend signs up using your code` },
    { ic:'💳', n:'Step 3', tx:`Friend makes their first deposit` },
    { ic:'🎁', n:'Reward!', tx:`You get ${settings.inviter_percent}% of their deposit. They get ${settings.joiner_percent}% bonus!` },
  ];

  return (
    <div>
      <div className="bhr mb20" style={{ background:'linear-gradient(135deg,rgba(123,47,255,.2),rgba(0,20,60,.35))' }}>
        <div style={{ fontFamily:'var(--fd)', fontSize:'10px', letterSpacing:'3px', color:'var(--purple)', marginBottom:'6px', textTransform:'uppercase' }}>
          🎁 Refer & Earn
        </div>
        <div style={{ fontFamily:'var(--fd)', fontSize:'clamp(16px,3vw,22px)', fontWeight:900, marginBottom:'8px' }}>
          Invite Friends, Earn Rewards
        </div>

        {/* Reward info */}
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'14px' }}>
          <div style={{ padding:'8px 14px', borderRadius:'8px', background:'rgba(0,255,136,.1)', border:'1px solid rgba(0,255,136,.2)', fontSize:'12px' }}>
            <span style={{ color:'var(--text3)' }}>You earn: </span>
            <span style={{ color:'var(--green)', fontWeight:700, fontFamily:'var(--fm)' }}>{settings.inviter_percent}%</span>
            <span style={{ color:'var(--text3)', fontSize:'10px' }}> of their deposit</span>
          </div>
          <div style={{ padding:'8px 14px', borderRadius:'8px', background:'rgba(123,47,255,.1)', border:'1px solid rgba(123,47,255,.2)', fontSize:'12px' }}>
            <span style={{ color:'var(--text3)' }}>They get: </span>
            <span style={{ color:'var(--purp2)', fontWeight:700, fontFamily:'var(--fm)' }}>{settings.joiner_percent}%</span>
            <span style={{ color:'var(--text3)', fontSize:'10px' }}> bonus on first deposit</span>
          </div>
        </div>

        {/* Code Box */}
        <div onClick={() => copy(refCode)} style={{
          background:'rgba(0,0,0,.35)', border:'1px solid var(--br2)', borderRadius:'10px',
          padding:'14px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'12px'
        }}>
          <div>
            <div style={{ fontSize:'9px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'2px', marginBottom:'4px' }}>Your Referral Code</div>
            <div style={{ fontFamily:'var(--fm)', fontSize:'22px', fontWeight:700, color:'var(--neon)', letterSpacing:'3px' }}>
              {refCode || 'Loading...'}
            </div>
          </div>
          <div style={{ fontSize:'12px', color: copied ? 'var(--green)' : 'var(--text2)', fontWeight:700 }}>
            {copied ? '✅ Copied!' : '📋 Tap to Copy'}
          </div>
        </div>

        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <button className="btn bpu bsm" onClick={() => copy(refLink)}>🔗 Copy Link</button>
          <button className="btn bs bsm" onClick={shareWhatsApp}>💬 Share WhatsApp</button>
        </div>
      </div>

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom:'20px' }}>
        {[
          { ic:'👥', lb:'Total Referred', vl:stats.total, cl:'cn' },
          { ic:'✅', lb:'Converted', vl:stats.converted, cl:'cg' },
          { ic:'💰', lb:'Total Earned', vl:`$${stats.earned.toFixed(2)}`, cl:'cgo' },
          { ic:'📊', lb:'Pending', vl:stats.total - stats.converted, cl:'cw' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="st">How It Works</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'10px', marginBottom:'20px' }}>
        {steps.map((s,i) => (
          <div key={i} className="card" style={{ padding:'14px', textAlign:'center' }}>
            <div style={{ fontSize:'24px', marginBottom:'6px' }}>{s.ic}</div>
            <div style={{ fontFamily:'var(--fd)', fontSize:'9px', color:'var(--purple)', letterSpacing:'1px', marginBottom:'4px' }}>{s.n}</div>
            <div style={{ fontSize:'11px', color:'var(--text2)', lineHeight:1.5 }}>{s.tx}</div>
          </div>
        ))}
      </div>

      {/* Referrals list */}
      <div className="st">My Referrals</div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'30px', color:'var(--text3)' }}>Loading...</div>
      ) : referrals.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">👥</span>
          <div className="empty-tx">No referrals yet</div>
          <div className="empty-sb">Share your code to start earning</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {referrals.map((r,i) => (
            <div key={i} className="card" style={{ padding:'12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'linear-gradient(135deg,var(--purple),var(--neon2))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'13px', color:'#fff' }}>
                  {r.full_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:600 }}>{r.full_name}</div>
                  <div style={{ fontSize:'10px', color:'var(--text3)' }}>{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <span className={`bdg ${parseFloat(r.balance) > 0 ? 'b-completed' : 'b-pending'}`}>
                {parseFloat(r.balance) > 0 ? '✅ Active' : '⏳ Pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

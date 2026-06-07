import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminReferral({ user }) {
  const [inviterPercent, setInviterPercent] = useState('10');
  const [joinerPercent, setJoinerPercent] = useState('5');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [referrals, setReferrals] = useState([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const { data: s } = await supabase.from('settings').select('*')
      .in('key', ['referral_inviter_percent','referral_joiner_percent','referral_enabled']);
    if (s) {
      s.forEach(r => {
        if (r.key === 'referral_inviter_percent') setInviterPercent(r.value);
        if (r.key === 'referral_joiner_percent') setJoinerPercent(r.value);
        if (r.key === 'referral_enabled') setEnabled(r.value === 'true');
      });
    }

    const { data: refs } = await supabase.from('transactions')
      .select('*, users(full_name, email)')
      .eq('type', 'referral')
      .order('created_at', { ascending:false })
      .limit(20);
    if (refs) setReferrals(refs);
    setLoading(false);
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    const updates = [
      { key:'referral_inviter_percent', value: inviterPercent },
      { key:'referral_joiner_percent', value: joinerPercent },
      { key:'referral_enabled', value: String(enabled) },
    ];
    for (const u of updates) {
      await supabase.from('settings').upsert(u, { onConflict:'key' });
    }
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const totalPaid = referrals.reduce((a,b) => a + parseFloat(b.amount || 0), 0);

  // FIX Phase-19: component-level admin role guard — defence-in-depth on top
  // of App.js routing. Prevents any admin page from rendering its content if
  // the user object is missing or has a non-admin role (e.g. manipulated via
  // React DevTools). Must come after all hook declarations (Rules of Hooks).
  if (!user || user.role !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--danger)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>⛔</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 800, letterSpacing: '2px' }}>
          ACCESS DENIED
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
          Admin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div>
      {saved && (
        <div style={{ background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)', borderRadius:'8px', padding:'12px', textAlign:'center', color:'var(--green)', fontWeight:700, marginBottom:'16px' }}>
          ✅ Referral settings updated! Live instantly for all users.
        </div>
      )}

      <div className="cgrid" style={{ marginBottom:'20px' }}>
        {[
          { ic:'🎁', lb:'Total Referrals', vl:referrals.length, cl:'cp' },
          { ic:'💰', lb:'Total Paid Out', vl:`$${totalPaid.toFixed(2)}`, cl:'cgo' },
          { ic:'📊', lb:'Inviter %', vl:`${inviterPercent}%`, cl:'cn' },
          { ic:'🎯', lb:'Joiner %', vl:`${joinerPercent}%`, cl:'cg' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div className="st">Referral Settings</div>
      <div className="card" style={{ padding:'20px', marginBottom:'16px' }}>
        {/* Enable/Disable */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px', borderRadius:'8px', background:'var(--gl)', border:'1px solid var(--br)', marginBottom:'16px' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'2px' }}>Referral System</div>
            <div style={{ fontSize:'11px', color:'var(--text3)' }}>Enable or disable referrals for all users</div>
          </div>
          <div onClick={() => setEnabled(!enabled)} style={{
            width:'44px', height:'24px', borderRadius:'12px', cursor:'pointer', position:'relative', transition:'.3s',
            background: enabled ? 'var(--green)' : 'var(--text3)',
            boxShadow: enabled ? '0 0 10px rgba(0,255,136,.3)' : 'none',
          }}>
            <div style={{
              width:'18px', height:'18px', borderRadius:'50%', background:'#fff',
              position:'absolute', top:'3px', transition:'.3s',
              left: enabled ? '23px' : '3px',
              boxShadow:'0 2px 4px rgba(0,0,0,.3)',
            }} />
          </div>
        </div>

        <div className="fr">
          <div className="fi" style={{ marginBottom:0 }}>
            <label className="fl">Inviter Reward %</label>
            <input className="inp" type="number" min="0" max="50" placeholder="10"
              value={inviterPercent} onChange={e => setInviterPercent(e.target.value)} />
            <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px' }}>
              % of referral's first deposit goes to inviter
            </div>
          </div>
          <div className="fi" style={{ marginBottom:0 }}>
            <label className="fl">Joiner Bonus %</label>
            <input className="inp" type="number" min="0" max="50" placeholder="5"
              value={joinerPercent} onChange={e => setJoinerPercent(e.target.value)} />
            <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px' }}>
              % bonus added to new user's first deposit
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div style={{ marginTop:'16px', padding:'14px', borderRadius:'8px', background:'rgba(0,0,0,.25)', border:'1px solid var(--br)' }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px' }}>Live Example Preview</div>
          <div style={{ fontSize:'12px', color:'var(--text2)', lineHeight:2 }}>
            Friend deposits <span style={{ color:'var(--neon)', fontFamily:'var(--fm)', fontWeight:700 }}>$100</span><br/>
            → Inviter earns: <span style={{ color:'var(--green)', fontFamily:'var(--fm)', fontWeight:700 }}>${(100 * parseFloat(inviterPercent||0) / 100).toFixed(2)}</span> ({inviterPercent}%)<br/>
            → Friend gets bonus: <span style={{ color:'var(--purple)', fontFamily:'var(--fm)', fontWeight:700 }}>${(100 * parseFloat(joinerPercent||0) / 100).toFixed(2)}</span> ({joinerPercent}%)
          </div>
        </div>
      </div>

      <button className="btn bp blg bw" onClick={save} disabled={saving} style={{ marginBottom:'20px' }}>
        <span>{saving ? 'Saving...' : '💾 Save Referral Settings'}</span><span>→</span>
      </button>

      <div className="st">Recent Referral Payouts</div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'30px', color:'var(--text3)' }}>Loading...</div>
      ) : referrals.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🎁</span>
          <div className="empty-tx">No referral payouts yet</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {referrals.map((r,i) => (
            <div key={i} className="card" style={{ padding:'12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'13px', marginBottom:'2px' }}>{r.users?.full_name || 'Unknown'}</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'2px' }}>{r.description}</div>
                <div style={{ fontSize:'10px', color:'var(--text3)' }}>{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div style={{ fontFamily:'var(--fm)', fontSize:'15px', fontWeight:700, color:'var(--green)' }}>
                +${parseFloat(r.amount).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

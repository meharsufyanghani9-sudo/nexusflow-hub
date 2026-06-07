import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useCurrency } from './CurrencyContext';

export default function AdminCurrencies({ user }) {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { loadCurrencies } = useCurrency();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('currencies').select('*').order('code');
    if (data) setCurrencies(data);
    setLoading(false);
  };

  const updateRate = (code, val) => {
    setCurrencies(prev => prev.map(c => c.code === code ? { ...c, rate: val } : c));
  };

  const toggleActive = (code) => {
    setCurrencies(prev => prev.map(c => c.code === code ? { ...c, is_active: !c.is_active } : c));
  };

  const saveAll = async () => {
    setSaving(true); setSaved(false);
    for (const c of currencies) {
      await supabase.from('currencies')
        .update({ rate: parseFloat(c.rate) || 1, is_active: c.is_active })
        .eq('code', c.code);
    }
    await loadCurrencies();
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

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
          ✅ Currency rates saved! All users see new rates instantly.
        </div>
      )}

      <div style={{ padding:'12px 14px', borderRadius:'8px', background:'rgba(0,212,255,.06)', border:'1px solid var(--br)', fontSize:'11px', color:'var(--text2)', marginBottom:'16px', lineHeight:1.8 }}>
        💡 <strong style={{ color:'var(--neon)' }}>Only you (admin) can set exchange rates.</strong><br/>
        Users see prices converted to their chosen currency using YOUR rates. USD rate is always 1.
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'20px' }}>
          {currencies.map(c => (
            <div key={c.code} className="card" style={{ padding:'14px', opacity: c.is_active ? 1 : 0.5 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{
                    width:'44px', height:'44px', borderRadius:'10px',
                    background:'var(--gl2)', border:'1px solid var(--br2)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:'var(--fm)', fontSize:'20px', fontWeight:700,
                    color: c.is_active ? 'var(--neon)' : 'var(--text3)', flexShrink:0
                  }}>
                    {c.symbol}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'2px' }}>{c.code}</div>
                    <div style={{ fontSize:'11px', color:'var(--text3)' }}>{c.name}</div>
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                  {c.code === 'USD' ? (
                    <div style={{ fontSize:'11px', color:'var(--text3)', fontFamily:'var(--fm)' }}>
                      Base currency · Always 1.00
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ fontSize:'10px', color:'var(--text3)' }}>1 USD =</span>
                      <input
                        type="number" step="0.01" min="0.001"
                        value={c.rate}
                        onChange={e => updateRate(c.code, e.target.value)}
                        style={{
                          width:'90px', padding:'7px 10px',
                          background:'rgba(0,0,0,.4)', border:'1px solid var(--br2)',
                          borderRadius:'6px', color:'var(--gold)',
                          fontFamily:'var(--fm)', fontSize:'13px', fontWeight:700,
                          outline:'none', textAlign:'center'
                        }}
                      />
                      <span style={{ fontSize:'10px', color:'var(--text3)' }}>{c.code}</span>
                    </div>
                  )}

                  {/* Toggle switch */}
                  <div onClick={() => c.code !== 'USD' && toggleActive(c.code)} style={{
                    width:'42px', height:'23px', borderRadius:'12px',
                    cursor: c.code === 'USD' ? 'not-allowed' : 'pointer',
                    position:'relative', transition:'.3s',
                    background: c.is_active ? 'var(--green)' : 'var(--text4)',
                    boxShadow: c.is_active ? '0 0 8px rgba(0,255,136,.3)' : 'none',
                    opacity: c.code === 'USD' ? 0.5 : 1,
                  }}>
                    <div style={{
                      width:'17px', height:'17px', borderRadius:'50%', background:'#fff',
                      position:'absolute', top:'3px', transition:'.3s',
                      left: c.is_active ? '22px' : '3px',
                      boxShadow:'0 2px 4px rgba(0,0,0,.3)',
                    }} />
                  </div>
                </div>
              </div>

              {/* Preview */}
              {c.code !== 'USD' && c.is_active && (
                <div style={{ marginTop:'10px', fontSize:'11px', color:'var(--text3)', padding:'7px 10px', borderRadius:'6px', background:'rgba(0,0,0,.2)' }}>
                  Example: $10 USD = {c.symbol}{(10 * parseFloat(c.rate||1)).toLocaleString(undefined, { maximumFractionDigits:2 })} {c.code}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button className="btn bp blg bw" onClick={saveAll} disabled={saving}>
        <span>{saving ? 'Saving...' : '💾 Save All Currency Rates'}</span><span>→</span>
      </button>
    </div>
  );
}

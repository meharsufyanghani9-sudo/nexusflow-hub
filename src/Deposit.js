import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// ── Deposit is ALWAYS in PKR (Easypaisa/JazzCash) or USDT (Binance) ─────────
// This component never uses the currency switcher — PKR is hardcoded here.

export default function Deposit({ user }) {
  const [settings,        setSettings]        = useState({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [method,          setMethod]          = useState('easypaisa');
  const [amount,          setAmount]          = useState('');
  const [txn,             setTxn]             = useState('');
  const [file,            setFile]            = useState(null);
  const [preview,         setPreview]         = useState(null);
  const [submitted,       setSubmitted]       = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState('');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoadingSettings(true);
    const { data } = await supabase.from('settings').select('*');
    if (data) {
      const s = {};
      data.forEach(r => { s[r.key] = r.value; });
      setSettings(s);
    }
    setLoadingSettings(false);
  };

  const getMethods = () => [
    {
      id:'easypaisa', name:'Easypaisa', ic:'📱', color:'#4CAF50',
      number: settings.easypaisa_number || 'Not configured',
      account: settings.easypaisa_name  || 'NexusFlow',
      min:`PKR ${settings.min_deposit || 500}`, time:'5-15 min'
    },
    {
      id:'jazzcash', name:'JazzCash', ic:'💳', color:'#E91E63',
      number: settings.jazzcash_number || 'Not configured',
      account: settings.jazzcash_name  || 'NexusFlow',
      min:`PKR ${settings.min_deposit || 500}`, time:'5-10 min'
    },
    {
      id:'binance', name:'Binance USDT', ic:'🟡', color:'#F0B90B',
      number: `UID: ${settings.binance_uid || 'Not configured'}`,
      account: settings.binance_network || 'TRC-20 / BEP-20',
      min:'USDT $5', time:'1-10 min'
    },
  ];

  const methods     = getMethods();
  const selected    = methods.find(m => m.id === method);
  const isBinance   = method === 'binance';
  const minDeposit  = parseInt(settings.min_deposit || 500);

  const handleFile = (e) => {
    if (submitting) return;
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('File too large. Max 5MB.'); return; }
    if (!f.type.startsWith('image/')) { setError('Only image files allowed.'); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(f);
    setError('');
  };

  const copy = (txt) => {
    navigator.clipboard.writeText(txt.replace('UID: ', ''))
      .then(() => alert('Copied!'));
  };

  const submit = async () => {
    if (submitting) return;
    setError('');
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) { setError('Enter a valid amount'); return; }
    if (numAmount > 10000000) { setError('Amount too large. Contact admin.'); return; }
    if (!isBinance && numAmount < minDeposit) {
      setError(`Minimum deposit is PKR ${minDeposit.toLocaleString()}`); return;
    }
    if (!txn || txn.trim().length < 3) { setError('Enter transaction ID'); return; }
    if (!file) { setError('Upload payment screenshot'); return; }

    setSubmitting(true);
    try {
      let screenshotUrl = null;
      const uniqueId = Date.now() + '_' + Math.random().toString(36).slice(2,8);
      const ext      = file.name.split('.').pop().toLowerCase().replace(/[^a-z]/g,'');
      const fileName = `deposits/${user.id}_${uniqueId}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('screenshots').upload(fileName, file);
      if (!uploadErr && uploadData) {
        const { data: urlData } = supabase.storage.from('screenshots').getPublicUrl(fileName);
        screenshotUrl = urlData.publicUrl;
      }

      const depRef = 'DEP-' + Date.now();
      const { error: depErr } = await supabase.from('deposits').insert({
        deposit_ref:    depRef,
        user_id:        user.id,
        user_name:      user.name,
        user_email:     user.email,
        method:         selected.name,
        amount:         numAmount,
        txn_id:         txn.trim(),
        screenshot_url: screenshotUrl,
        status:         'pending',
      });
      if (depErr) { setError('Failed: ' + depErr.message); setSubmitting(false); return; }
      setSubmitted(true);
    } catch (e) {
      setError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  if (loadingSettings) return (
    <div style={{ textAlign:'center', padding:'60px', color:'var(--text3)' }}>
      Loading payment details...
    </div>
  );

  if (submitted) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'50vh', gap:'16px', textAlign:'center' }}>
      <div style={{ fontSize:'56px' }}>✅</div>
      <div style={{ fontFamily:'var(--fd)', fontSize:'16px', color:'var(--green)', letterSpacing:'2px' }}>Submitted!</div>
      <div style={{ fontSize:'12px', color:'var(--text2)', maxWidth:'280px', lineHeight:1.7 }}>
        Your deposit has been submitted. Admin will review and credit your balance within 5–15 minutes.
      </div>
      {settings.whatsapp && (
        <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g,'')}`}
          target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
          <button className="btn bs bmd">💬 WhatsApp Admin</button>
        </a>
      )}
      <div className="card" style={{ padding:'12px 20px' }}>
        <div style={{ fontSize:'10px', color:'var(--text3)', marginBottom:'4px' }}>Your Balance</div>
        <div style={{ fontFamily:'var(--fm)', fontSize:'20px', color:'var(--green)', fontWeight:700 }}>
          ${parseFloat(user.balance || 0).toFixed(2)}
        </div>
      </div>
      <button className="btn bgh bmd" onClick={() => {
        setSubmitted(false); setAmount(''); setTxn(''); setFile(null); setPreview(null);
      }}>
        Submit Another
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth:'560px' }}>
      {/* PKR notice */}
      <div style={{
        padding:'10px 14px', borderRadius:'8px', marginBottom:'16px',
        background:'rgba(0,212,255,.06)', border:'1px solid rgba(0,212,255,.15)',
        fontSize:'11px', color:'var(--text2)', lineHeight:1.7,
        display:'flex', alignItems:'center', gap:'8px'
      }}>
        <span style={{ fontSize:'18px' }}>🇵🇰</span>
        <span>
          Deposits via <strong style={{ color:'var(--neon)' }}>Easypaisa / JazzCash</strong> in <strong style={{ color:'var(--neon)' }}>PKR</strong>.
          Binance deposits in <strong style={{ color:'#F0B90B' }}>USDT</strong>.
        </span>
      </div>

      <p style={{ fontSize:'12.5px', color:'var(--text2)', marginBottom:'18px', lineHeight:1.7 }}>
        Send payment and upload screenshot. Balance credited after admin review.
      </p>

      <div className="st">Choose Payment Method</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'20px' }}>
        {methods.map(m => (
          <div key={m.id} onClick={() => setMethod(m.id)} style={{
            padding:'14px 10px', borderRadius:'10px', textAlign:'center', cursor:'pointer',
            border:`1px solid ${method===m.id ? m.color : 'var(--br)'}`,
            background: method===m.id ? `${m.color}12` : 'var(--gl)', transition:'all .2s'
          }}>
            <div style={{ fontSize:'24px', marginBottom:'5px' }}>{m.ic}</div>
            <div style={{ fontSize:'11px', fontWeight:700, color: method===m.id ? m.color : 'var(--text2)' }}>{m.name}</div>
          </div>
        ))}
      </div>

      {/* Selected method details */}
      <div className="card" style={{ padding:'18px', marginBottom:'20px', borderColor:`${selected.color}30` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'10px' }}>
          <div>
            <div style={{ fontFamily:'var(--fd)', fontSize:'14px', fontWeight:800, color:selected.color, letterSpacing:'2px', marginBottom:'6px' }}>
              {selected.name}
            </div>
            <div style={{ fontFamily:'var(--fm)', fontSize:'18px', color:selected.color, marginBottom:'3px', letterSpacing:'1px' }}>
              {selected.number}
            </div>
            <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'2px', marginBottom:'10px' }}>{selected.account}</div>
            <div style={{ display:'flex', gap:'14px', fontSize:'11px', flexWrap:'wrap' }}>
              <span><span style={{ color:'var(--text3)' }}>Min: </span><span style={{ fontFamily:'var(--fm)' }}>{selected.min}</span></span>
              <span><span style={{ color:'var(--text3)' }}>Time: </span><span style={{ color:'var(--neon)' }}>⚡ {selected.time}</span></span>
            </div>
          </div>
          <button className="btn bsm"
            style={{ background:`${selected.color}20`, border:`1px solid ${selected.color}40`, color:selected.color }}
            onClick={() => copy(selected.number)}>📋 Copy</button>
        </div>
        <div style={{ marginTop:'14px', padding:'10px 12px', borderRadius:'7px', background:'rgba(255,184,0,.07)', border:'1px solid rgba(255,184,0,.18)', fontSize:'11px', color:'var(--warn)', lineHeight:1.7 }}>
          ⚠️ Send to exact number above. Wrong number = lost money. Screenshot is mandatory.
        </div>
      </div>

      <div className="st">Upload Payment Proof</div>
      <div className="card" style={{ padding:'20px' }}>
        <div className="fr" style={{ marginBottom:'13px' }}>
          <div className="fi" style={{ marginBottom:0 }}>
            <label className="fl">Method</label>
            <select className="sel" value={method} onChange={e => setMethod(e.target.value)} disabled={submitting}>
              {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="fi" style={{ marginBottom:0 }}>
            <label className="fl">{isBinance ? 'Amount (USDT)' : 'Amount (PKR) 🇵🇰'}</label>
            <input className="inp" type="number"
              placeholder={isBinance ? '5' : minDeposit.toString()}
              value={amount} onChange={e => setAmount(e.target.value)}
              min={isBinance ? '1' : minDeposit} max="10000000"
              disabled={submitting} />
            {!isBinance && (
              <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px' }}>
                Min: PKR {minDeposit.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <div className="fi">
          <label className="fl">Transaction ID / Reference Number</label>
          <input className="inp" placeholder="EP2025XXXXXX or JC-XXXXXX"
            value={txn} onChange={e => setTxn(e.target.value)} disabled={submitting} />
        </div>

        <div className="fi">
          <label className="fl">Upload Screenshot</label>
          <div onClick={() => !submitting && document.getElementById('depFile').click()} style={{
            border:'2px dashed var(--br2)', borderRadius:'8px', padding:'24px',
            textAlign:'center', cursor: submitting ? 'not-allowed' : 'pointer',
            background:'rgba(0,0,0,.2)', opacity: submitting ? 0.6 : 1
          }}>
            <input type="file" id="depFile" accept="image/*"
              style={{ display:'none' }} onChange={handleFile} disabled={submitting} />
            {preview ? (
              <img src={preview} alt="proof" style={{ maxWidth:'100%', maxHeight:'160px', borderRadius:'6px', objectFit:'contain' }} />
            ) : (
              <>
                <div style={{ fontSize:'28px', marginBottom:'6px' }}>📸</div>
                <div style={{ fontSize:'12px', color:'var(--text2)' }}>Tap to upload screenshot</div>
                <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'3px' }}>JPG, PNG — max 5MB</div>
              </>
            )}
          </div>
        </div>

        {error && (
          <div style={{ color:'var(--danger)', fontSize:'12px', marginBottom:'12px', textAlign:'center', padding:'8px', borderRadius:'6px', background:'rgba(255,51,85,.08)', border:'1px solid rgba(255,51,85,.2)' }}>
            {error}
          </div>
        )}

        <button className="btn bgd blg bw" onClick={submit} disabled={submitting}
          style={{ opacity:submitting?0.6:1, cursor:submitting?'not-allowed':'pointer' }}>
          <span>{submitting ? 'Submitting... please wait' : 'Submit for Review'}</span>
          <span>✦</span>
        </button>

        {settings.whatsapp && (
          <div style={{ marginTop:'12px', textAlign:'center', fontSize:'11px', color:'var(--text3)' }}>
            Need help?{' '}
            <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g,'')}`}
              target="_blank" rel="noreferrer"
              style={{ color:'var(--green)', textDecoration:'none', fontWeight:700 }}>
              WhatsApp Support →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

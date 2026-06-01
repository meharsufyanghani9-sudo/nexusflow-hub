import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function PanelApi({ user }) {
  const [myKeys, setMyKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genKey, setGenKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadMyKeys(); }, []);

  const loadMyKeys = async () => {
    setLoading(true);
    const { data } = await supabase.from('api_keys')
      .select('*').eq('label', user.email)
      .order('created_at', { ascending:false });
    if (data) setMyKeys(data);
    setLoading(false);
  };

  const generateAndSave = async () => {
    setSaving(true);
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const key = 'nfk_' + Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
    const { error } = await supabase.from('api_keys').insert({
      label: user.email,
      api_key: key,
      is_active: true,
    });
    if (!error) { setGenKey(key); loadMyKeys(); }
    setSaving(false);
  };

  const endpoint = window.location.origin;

  const codeExamples = [
    {
      title: 'Get Services',
      code: `curl "${endpoint}/api/v2" \\
  -d "key=YOUR_API_KEY" \\
  -d "action=services"`
    },
    {
      title: 'Add Order',
      code: `curl "${endpoint}/api/v2" \\
  -d "key=YOUR_API_KEY" \\
  -d "action=add" \\
  -d "service=1" \\
  -d "link=https://instagram.com/user" \\
  -d "quantity=1000"`
    },
    {
      title: 'Check Order Status',
      code: `curl "${endpoint}/api/v2" \\
  -d "key=YOUR_API_KEY" \\
  -d "action=status" \\
  -d "order=12345"`
    },
    {
      title: 'Check Balance',
      code: `curl "${endpoint}/api/v2" \\
  -d "key=YOUR_API_KEY" \\
  -d "action=balance"`
    },
  ];

  return (
    <div style={{ maxWidth:'700px' }}>
      <div style={{ padding:'14px 16px', borderRadius:'10px', background:'linear-gradient(135deg,rgba(0,60,120,.25),rgba(40,0,80,.15))', border:'1px solid rgba(0,212,255,.2)', marginBottom:'20px' }}>
        <div style={{ fontFamily:'var(--fd)', fontSize:'14px', fontWeight:800, color:'var(--neon)', letterSpacing:'2px', marginBottom:'6px' }}>
          📡 API Access
        </div>
        <div style={{ fontSize:'12px', color:'var(--text2)', lineHeight:1.7 }}>
          Use our API to integrate NexusFlow services into your own panel or website. Standard SMM panel API format compatible with most platforms.
        </div>
      </div>

      {/* API Endpoint */}
      <div className="st">API Endpoint</div>
      <div className="card" style={{ padding:'14px', marginBottom:'16px' }}>
        <div style={{ fontFamily:'var(--fm)', fontSize:'13px', color:'var(--gold)', wordBreak:'break-all', marginBottom:'6px' }}>
          {endpoint}/api/v2
        </div>
        <div style={{ fontSize:'11px', color:'var(--text3)' }}>POST requests · JSON responses · Standard SMM panel format</div>
      </div>

      {/* Your API Keys */}
      <div className="st">Your API Keys</div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'20px', color:'var(--text3)' }}>Loading...</div>
      ) : (
        <>
          {myKeys.length === 0 ? (
            <div className="card" style={{ padding:'20px', textAlign:'center', marginBottom:'14px' }}>
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>🔑</div>
              <div style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'14px' }}>No API keys yet. Generate one to get started.</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'14px' }}>
              {myKeys.map(k => (
                <div key={k.id} className="card" style={{ padding:'14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'10px', flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--green)', wordBreak:'break-all', marginBottom:'4px' }}>
                        {k.api_key}
                      </div>
                      <div style={{ fontSize:'10px', color:'var(--text3)' }}>
                        Created: {new Date(k.created_at).toLocaleDateString()} ·
                        <span className={`bdg ${k.is_active ? 'b-completed' : 'b-rejected'}`} style={{ marginLeft:'6px' }}>
                          {k.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                    <button className="btn bgh bsm" onClick={() => navigator.clipboard.writeText(k.api_key).then(() => alert('Copied!'))}>
                      📋 Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {genKey && (
            <div style={{ padding:'12px 14px', borderRadius:'8px', background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.25)', marginBottom:'14px' }}>
              <div style={{ fontSize:'10px', color:'var(--green)', marginBottom:'4px', fontWeight:700 }}>✅ New key generated — save it now!</div>
              <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--green)', wordBreak:'break-all', cursor:'pointer' }}
                onClick={() => navigator.clipboard.writeText(genKey).then(() => alert('Copied!'))}>
                {genKey}
              </div>
            </div>
          )}

          <button className="btn bp bmd" onClick={generateAndSave} disabled={saving}>
            <span>{saving ? 'Generating...' : '🎲 Generate New API Key'}</span>
          </button>
        </>
      )}

      {/* Code Examples */}
      <div className="st" style={{ marginTop:'24px' }}>Code Examples</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        {codeExamples.map((ex, i) => (
          <div key={i} className="card" style={{ padding:'14px' }}>
            <div style={{ fontSize:'12px', fontWeight:700, color:'var(--neon)', marginBottom:'8px' }}>{ex.title}</div>
            <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--text2)', background:'rgba(0,0,0,.4)', padding:'10px 12px', borderRadius:'6px', whiteSpace:'pre-wrap', wordBreak:'break-all', lineHeight:1.8, cursor:'pointer' }}
              onClick={() => navigator.clipboard.writeText(ex.code).then(() => alert('Copied!'))}>
              {ex.code}
              <div style={{ fontSize:'9px', color:'var(--text3)', marginTop:'6px' }}>📋 Tap to copy</div>
            </div>
          </div>
        ))}
      </div>

      {/* Supported Actions Table */}
      <div className="st" style={{ marginTop:'24px' }}>Supported Actions</div>
      <div className="tblw">
        <table>
          <thead>
            <tr><th>Action</th><th>Parameters</th><th>Returns</th></tr>
          </thead>
          <tbody>
            {[
              { action:'services', params:'key', returns:'List of all services' },
              { action:'add', params:'key, service, link, quantity', returns:'Order ID' },
              { action:'status', params:'key, order', returns:'Order status & progress' },
              { action:'balance', params:'key', returns:'Your account balance' },
              { action:'orders', params:'key', returns:'All your orders' },
            ].map((r,i) => (
              <tr key={i}>
                <td style={{ fontFamily:'var(--fm)', color:'var(--neon)', fontSize:'11px' }}>{r.action}</td>
                <td style={{ fontSize:'11px', color:'var(--text3)', fontFamily:'var(--fm)' }}>{r.params}</td>
                <td style={{ fontSize:'11px', color:'var(--text2)' }}>{r.returns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

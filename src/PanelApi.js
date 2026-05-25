import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function PanelApi({ user }) {
  const [myKeys, setMyKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genKey, setGenKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => { loadMyKeys(); }, []);

  // ── FIX: Use user.id as lookup (not user.email) so keys always load correctly
  const loadMyKeys = async () => {
    setLoading(true);
    const { data } = await supabase.from('api_keys')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    // Fallback: also try by label (email) for old records
    if (data && data.length > 0) {
      setMyKeys(data);
    } else {
      const { data: byLabel } = await supabase.from('api_keys')
        .select('*')
        .eq('label', user.email)
        .order('created_at', { ascending: false });
      setMyKeys(byLabel || []);
    }
    setLoading(false);
  };

  const generateAndSave = async () => {
    setSaving(true);
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const key = 'nfk_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('api_keys').insert({
      label: user.email,
      user_id: user.id,
      api_key: key,
      is_active: true,
    });
    if (!error) { setGenKey(key); loadMyKeys(); }
    setSaving(false);
  };

  const revokeKey = async (id) => {
    if (!window.confirm('Revoke this API key? It will stop working immediately.')) return;
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id);
    loadMyKeys();
  };

  const copyText = (txt, id) => {
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    });
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
    <div style={{ maxWidth: '640px' }}>
      <div style={{
        fontFamily: 'var(--fd)', fontSize: '10px', letterSpacing: '3px',
        color: 'var(--neon)', marginBottom: '4px', textTransform: 'uppercase'
      }}>
        📡 API Access
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px', lineHeight: 1.7 }}>
        Connect your own applications to NexusFlow HUB using our API. Generate a key below and use it in your requests.
      </div>

      {/* API Keys */}
      <div className="st">🔑 Your API Keys</div>
      <div className="card" style={{ padding: '18px', marginBottom: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>Loading keys...</div>
        ) : myKeys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🔑</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>
              No API keys yet. Generate one to get started.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {myKeys.map(k => (
              <div key={k.id} style={{
                padding: '12px', borderRadius: '8px',
                background: 'var(--gl)', border: `1px solid ${k.is_active ? 'rgba(0,255,136,.2)' : 'var(--br)'}`,
                display: 'flex', flexDirection: 'column', gap: '6px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '11px', color: k.is_active ? 'var(--green)' : 'var(--text3)', wordBreak: 'break-all', flex: 1 }}>
                    {k.api_key}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => copyText(k.api_key, k.id)}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                        background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.2)',
                        color: 'var(--neon)', fontSize: '11px', fontWeight: 700,
                      }}>
                      {copied === k.id ? '✅' : '📋'}
                    </button>
                    {k.is_active && (
                      <button
                        onClick={() => revokeKey(k.id)}
                        style={{
                          padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                          background: 'rgba(255,51,85,.1)', border: '1px solid rgba(255,51,85,.2)',
                          color: 'var(--danger)', fontSize: '11px', fontWeight: 700,
                        }}>
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: 'var(--text3)' }}>
                  <span className={`bdg ${k.is_active ? 'b-completed' : 'b-rejected'}`}>
                    {k.is_active ? 'Active' : 'Revoked'}
                  </span>
                  <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {genKey && (
          <div style={{
            padding: '12px', borderRadius: '8px', marginBottom: '14px',
            background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.25)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 700, marginBottom: '6px' }}>
              ✅ New key generated! Copy it now — it won't be shown again highlighted.
            </div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: '12px', wordBreak: 'break-all', color: 'var(--green)' }}>
              {genKey}
            </div>
          </div>
        )}

        <button className="btn bp blg bw" onClick={generateAndSave} disabled={saving}>
          <span>{saving ? 'Generating...' : '⚡ Generate New API Key'}</span>
          <span>→</span>
        </button>
        <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.6 }}>
          ⚠️ Keep your API key secret. Do not share it publicly. You can revoke and regenerate at any time.
        </div>
      </div>

      {/* API Endpoint */}
      <div className="st">🌐 API Endpoint</div>
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <code style={{ fontFamily: 'var(--fm)', fontSize: '12px', color: 'var(--neon)', wordBreak: 'break-all' }}>
            {endpoint}/api/v2
          </code>
          <button
            onClick={() => copyText(`${endpoint}/api/v2`, 'endpoint')}
            style={{
              padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
              background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.2)',
              color: 'var(--neon)', fontSize: '11px', fontWeight: 700, flexShrink: 0,
            }}>
            {copied === 'endpoint' ? '✅ Copied' : '📋 Copy'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
          All requests use POST method. Send parameters as form data (application/x-www-form-urlencoded).
        </div>
      </div>

      {/* Code Examples */}
      <div className="st">📖 Code Examples</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {codeExamples.map((ex, i) => (
          <div key={i} className="card" style={{ padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--neon)' }}>{ex.title}</div>
              <button
                onClick={() => copyText(ex.code, 'ex' + i)}
                style={{
                  padding: '3px 8px', borderRadius: '5px', cursor: 'pointer',
                  background: 'var(--gl2)', border: '1px solid var(--br)',
                  color: 'var(--text3)', fontSize: '10px',
                }}>
                {copied === 'ex' + i ? '✅' : '📋 Copy'}
              </button>
            </div>
            <pre style={{
              fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--text2)',
              background: 'rgba(0,0,0,.3)', padding: '10px', borderRadius: '6px',
              margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {ex.code}
            </pre>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{
        marginTop: '20px', padding: '12px 14px', borderRadius: '8px',
        background: 'rgba(123,47,255,.08)', border: '1px solid rgba(123,47,255,.2)',
        fontSize: '11px', color: 'var(--text2)', lineHeight: 1.7
      }}>
        💡 Our API is compatible with the standard SMM panel API format. If you use software that supports SMM APIs (like SMMBuddy, AutoLikes, etc.), you can plug in our endpoint and your key directly.
      </div>
    </div>
  );
}

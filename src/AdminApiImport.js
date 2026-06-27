import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const providers = [
  { id:'jap',            name:'JustAnotherPanel', url:'https://justanotherpanel.com/api/v2',  ic:'🔌' },
  { id:'smmraja',        name:'SMMRaja',           url:'https://smmraja.com/api/v2',           ic:'👑' },
  { id:'peakerr',        name:'Peakerr',           url:'https://peakerr.com/api/v2',           ic:'⚡' },
  { id:'officialclicks', name:'OfficialClicks',    url:'https://officialclicks.com/api/v2',    ic:'👆' },
  { id:'smmstone',       name:'SMMStone',          url:'https://smmstone.com/api/v2',          ic:'💎' },
  { id:'crescitaly',     name:'Crescitaly',        url:'https://crescitaly.com/api/v2',        ic:'🌙' },
  { id:'custom',         name:'Custom Provider',   url:'',                                     ic:'⚙️' },
];

const mapPlatform = (cat = '') => {
  const c = cat.toLowerCase();
  if (c.includes('instagram')) return 'instagram';
  if (c.includes('tiktok')) return 'tiktok';
  if (c.includes('youtube')) return 'youtube';
  if (c.includes('twitter') || c.includes(' x ')) return 'twitter';
  if (c.includes('facebook')) return 'facebook';
  if (c.includes('telegram')) return 'telegram';
  if (c.includes('snapchat')) return 'snapchat';
  if (c.includes('linkedin')) return 'linkedin';
  return 'custom';
};

// FIX Phase-5: Use the local Vercel serverless function instead of the
// hardcoded Supabase Edge Function URL. Benefits:
//   1. All SSRF protection, domain allowlist, and rate limiting in
//      api/proxy.js apply automatically — no separate Edge Function needed.
//   2. No project-specific URL that breaks on migration or rename.
//   3. No Authorization header required — the Vercel function is internal.
const PROXY = '/api/proxy';

export default function AdminApiImport({ user }) {
  const [tab, setTab] = useState('import');
  const [provider, setProvider] = useState('jap');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState(providers[0].url);
  const [fetchedServices, setFetchedServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { done, total }
  const [selected, setSelected] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('info');

  // Markup settings
  const [markupPercent, setMarkupPercent] = useState(0);

  // Our API tab
  const [apiKeys, setApiKeys] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [genKey, setGenKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => { loadMarkup(); }, []);
  useEffect(() => {
    if (tab === 'ourapi') loadApiKeys();
  }, [tab]);

  const loadMarkup = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', 'api_markup_percent').single();
    if (data?.value) setMarkupPercent(parseFloat(data.value) || 0);
  };

  // Apply markup to a price
  const applyMarkup = (price) => {
    const p = parseFloat(price) || 0;
    return markupPercent > 0 ? p * (1 + markupPercent / 100) : p;
  };

  const loadApiKeys = async () => {
    const { data } = await supabase
      .from('api_keys').select('*')
      .order('created_at', { ascending: false });
    if (data) setApiKeys(data);
  };

  const fetchServices = async () => {
    if (!apiKey) { alert('Enter your API key'); return; }
    if (!apiUrl) { alert('Enter API URL'); return; }
    setLoading(true);
    setFetchedServices([]);
    setSelected([]);
    setMsg('');

    try {
      // Use our local Vercel proxy to bypass CORS (FIX Phase-5: no Auth header needed)
      const res = await fetch(PROXY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: apiUrl,
          key: apiKey,
          action: 'services',
        }),
      });

      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setFetchedServices(data);
        setMsg(`✅ Successfully fetched ${data.length} real services from provider!`);
        setMsgType('success');
      } else if (data.error) {
        setMsg(`❌ Provider error: ${data.error}`);
        setMsgType('error');
        setFetchedServices([]);
      } else {
        setMsg('⚠️ No services returned. Check your API key and URL.');
        setMsgType('warn');
      }
    } catch (e) {
      setMsg(`❌ Connection failed: ${e.message}`);
      setMsgType('error');
    }

    setLoading(false);
  };

  const visibleServices = fetchedServices.filter(s =>
    !searchFilter ||
    (s.name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  const toggleSelect = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const importSelected = async () => {
    if (selected.length === 0) { alert('Select at least one service'); return; }
    setImporting(true);
    setImportProgress({ done: 0, total: rows.length });

    const toImport = fetchedServices.filter(s => selected.includes(s.service));

    // Build rows — same structure as Provider Sync
    const rows = toImport.map(s => ({
      name:                s.name,
      platform:            mapPlatform(s.category || ''),
      description:         `${s.category || 'SMM Service'} · Min: ${s.min} · Max: ${s.max}`,
      price_per_1k:        applyMarkup(s.rate),
      min_qty:             Math.min(parseInt(s.min) || 10,  2147483647),
      max_qty:             Math.min(parseInt(s.max) || 100000, 2147483647),
      delivery_time:       s.average_time || '1-6 hrs',
      is_active:           true,
      vendor_service_id:   String(s.service),
      provider_service_id: String(s.service),
      provider_api_url:    apiUrl,
      provider_api_key:    apiKey,
      provider_id:         provider,
      provider_note:       null,
    }));

    // Bulk upsert in chunks of 500
    // onConflict on provider_service_id + provider_api_url means:
    //   - if service already exists → UPDATE it (no duplicate)
    //   - if service is new → INSERT it
    const CHUNK = 500;
    let imported = 0;
    let updated  = 0;
    let errors   = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('services')
        .upsert(chunk, {
          onConflict:        'provider_service_id,provider_api_url',
          ignoreDuplicates:  false,   // false = UPDATE on conflict
        })
        .select('id');

      if (error) {
        // Fallback: if upsert fails (e.g. no unique constraint yet), try insert
        for (const row of chunk) {
          const { error: insErr } = await supabase.from('services').insert(row);
          if (!insErr) imported++;
          else errors++;
          setImportProgress({ done: imported, total: rows.length });
        }
      } else {
        imported += chunk.length;
        setImportProgress({ done: imported, total: rows.length });
      }
    }

    setImporting(false);
    setImportProgress(null);
    setSelected([]);

    const total = imported + updated;
    if (total > 0) {
      setMsg(`✅ Done — ${imported} services imported/updated. No duplicates created.${errors > 0 ? ` (${errors} failed)` : ''}`);
      setMsgType('success');
    } else {
      setMsg(`❌ Import failed. Check console for details.`);
      setMsgType('error');
    }
    setTimeout(() => setMsg(''), 6000);
  };

  const generateKey = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const key = 'nfk_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    setGenKey(key);
  };

  const saveApiKey = async () => {
    if (!newLabel || !genKey) { alert('Generate a key and enter a label'); return; }
    setSavingKey(true);
    // FIX Phase-5: store user_id so keys can be attributed to their owner.
    // PanelApi.js queries by user_id — without this, admin keys are orphaned
    // and never visible to anyone via the panel API key page.
    await supabase.from('api_keys').insert({
      user_id:  user?.id || null,
      label:    newLabel,
      api_key:  genKey,
      is_active: true,
    });
    setSavingKey(false);
    setNewLabel(''); setGenKey('');
    loadApiKeys();
  };

  const toggleApiKey = async (k) => {
    await supabase.from('api_keys')
      .update({ is_active: !k.is_active }).eq('id', k.id);
    loadApiKeys();
  };

  const deleteApiKey = async (id) => {
    if (!window.confirm('Delete this API key?')) return;
    await supabase.from('api_keys').delete().eq('id', id);
    loadApiKeys();
  };

  const sel = providers.find(p => p.id === provider);

  const msgStyle = {
    success: { bg: 'rgba(0,255,136,.08)', border: 'rgba(0,255,136,.25)', color: 'var(--green)' },
    error: { bg: 'rgba(255,51,85,.08)', border: 'rgba(255,51,85,.25)', color: 'var(--danger)' },
    warn: { bg: 'rgba(255,184,0,.08)', border: 'rgba(255,184,0,.25)', color: 'var(--warn)' },
    info: { bg: 'rgba(0,212,255,.08)', border: 'rgba(0,212,255,.25)', color: 'var(--neon)' },
  }[msgType] || {};

  return (
    <div>
      <div className="atbs" style={{ marginBottom: '16px' }}>
        <button className={`atb ${tab === 'import' ? 'on' : ''}`} onClick={() => setTab('import')}>
          Import Services
        </button>
        <button className={`atb ${tab === 'ourapi' ? 'on' : ''}`} onClick={() => setTab('ourapi')}>
          Our Panel API
        </button>
      </div>

      {/* ── IMPORT TAB ── */}
      {tab === 'import' && (
        <>
          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', marginBottom: '14px',
              fontSize: '11px', lineHeight: 1.7,
              background: msgStyle.bg, border: `1px solid ${msgStyle.border}`,
              color: msgStyle.color
            }}>
              {msg}
            </div>
          )}

          <div className="st">Select Provider</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: '8px', marginBottom: '16px' }}>
            {providers.map(p => (
              <div key={p.id} onClick={() => {
                setProvider(p.id);
                setApiUrl(p.url);
                setFetchedServices([]);
                setSelected([]);
                setMsg('');
              }} style={{
                padding: '12px 8px', borderRadius: '10px', textAlign: 'center', cursor: 'pointer',
                border: `1px solid ${provider === p.id ? 'var(--neon)' : 'var(--br)'}`,
                background: provider === p.id ? 'var(--gl2)' : 'var(--gl)', transition: 'all .2s'
              }}>
                <div style={{ fontSize: '20px', marginBottom: '5px' }}>{p.ic}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: provider === p.id ? 'var(--neon)' : 'var(--text2)' }}>
                  {p.name}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
            <div className="fi">
              <label className="fl">API URL</label>
              <input className="inp" value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="https://provider.com/api/v2" />
            </div>
            <div className="fi" style={{ marginBottom: '12px' }}>
              <label className="fl">Your API Key</label>
              <input className="inp" type="password" value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste your API key from provider dashboard" />
            </div>
            <button className="btn bp bmd bw" onClick={fetchServices} disabled={loading}>
              <span>{loading ? '⏳ Fetching Real Services...' : `🔌 Fetch from ${sel?.name}`}</span>
            </button>
            <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--text3)', lineHeight: 1.6 }}>
              💡 Uses secure server-side proxy to bypass browser restrictions. Real services from your provider will load.
            </div>
          </div>

          {fetchedServices.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div className="st" style={{ marginBottom: 0 }}>
                  {fetchedServices.length} Real Services
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button className="btn bgh bsm" onClick={() =>
                    setSelected(selected.length === visibleServices.length ? [] : visibleServices.map(s => s.service))
                  }>
                    {selected.length === visibleServices.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button className="btn bs bsm" onClick={importSelected}
                    disabled={importing || selected.length === 0}>
                    {importing && importProgress ? `⏳ ${importProgress.done}/${importProgress.total} done` : importing ? 'Importing...' : `Import (${selected.length})`}
                  </button>
                </div>
              </div>

              <input className="srch-inp" style={{ width: '100%', marginBottom: '10px' }}
                placeholder="Filter by name or category..."
                value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '450px', overflowY: 'auto' }}>
                {visibleServices.map(s => (
                  <div key={s.service} onClick={() => toggleSelect(s.service)}
                    className="card" style={{
                      padding: '10px 13px', cursor: 'pointer',
                      borderColor: selected.includes(s.service) ? 'var(--neon)' : 'var(--br)',
                      background: selected.includes(s.service) ? 'var(--gl2)' : 'var(--gl)',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                          border: `2px solid ${selected.includes(s.service) ? 'var(--neon)' : 'var(--br2)'}`,
                          background: selected.includes(s.service) ? 'var(--neon)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {selected.includes(s.service) && (
                            <span style={{ fontSize: '11px', color: '#000', fontWeight: 900 }}>✓</span>
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            {s.category} · ID: {s.service}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--fm)', color: 'var(--gold)', fontWeight: 700, fontSize: '12px' }}>
                          ${parseFloat(s.rate).toFixed(3)}/1k
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text3)' }}>
                          {s.min}–{s.max}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── OUR API TAB ── */}
      {tab === 'ourapi' && (
        <>
          <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(0,212,255,.06)', border: '1px solid var(--br)', fontSize: '11px', color: 'var(--text2)', marginBottom: '16px', lineHeight: 1.9 }}>
            <strong style={{ color: 'var(--neon)' }}>📡 Your Panel's API</strong><br />
            Other SMM panels can import YOUR services using these credentials.<br />
            Share the API key + endpoint with partner panels.
            <br /><br />
            <strong>API Endpoint:</strong>
            <div style={{ fontFamily: 'var(--fm)', color: 'var(--gold)', fontSize: '10px', marginTop: '4px', wordBreak: 'break-all', padding: '6px 8px', background: 'rgba(0,0,0,.3)', borderRadius: '5px', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/v2`).then(() => alert('Copied!'))}>
              {window.location.origin}/api/v2 · 📋 tap to copy
            </div>
          </div>

          <div className="card" style={{ padding: '18px', marginBottom: '16px' }}>
            <div className="st" style={{ fontSize: '9px' }}>Generate New API Key</div>
            <div className="fi">
              <label className="fl">Label (who is this for?)</label>
              <input className="inp" placeholder="e.g. Panel123, Agency ABC"
                value={newLabel} onChange={e => setNewLabel(e.target.value)} />
            </div>
            {genKey && (
              <div onClick={() => navigator.clipboard.writeText(genKey).then(() => alert('Copied!'))}
                style={{ padding: '10px 13px', borderRadius: '7px', background: 'rgba(0,0,0,.45)', border: '1px solid var(--br2)', fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--green)', marginBottom: '12px', wordBreak: 'break-all', cursor: 'pointer', lineHeight: 1.6 }}>
                {genKey}
                <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '4px' }}>📋 Tap to copy · save this now!</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button className="btn bgh bmd" onClick={generateKey}>🎲 Generate Key</button>
              <button className="btn bp bmd" onClick={saveApiKey}
                disabled={savingKey || !genKey || !newLabel}>
                {savingKey ? 'Saving...' : '💾 Save Key'}
              </button>
            </div>
          </div>

          <div className="st">Saved API Keys</div>
          {apiKeys.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">🔑</span>
              <div className="empty-tx">No API keys yet</div>
              <div className="empty-sb">Generate keys for partner panels</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {apiKeys.map(k => (
                <div key={k.id} className="card" style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{k.label}</div>
                      <div style={{ fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--text3)', wordBreak: 'break-all', marginBottom: '4px' }}>
                        {k.api_key.slice(0, 30)}...
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        {new Date(k.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                      <button className="btn bgh bsm"
                        onClick={() => navigator.clipboard.writeText(k.api_key).then(() => alert('Copied!'))}>
                        📋
                      </button>
                      <button className="btn bgh bsm" onClick={() => toggleApiKey(k)}>
                        {k.is_active ? '⏸' : '▶'}
                      </button>
                      <button className="btn bd bsm" onClick={() => deleteApiKey(k.id)}>🗑</button>
                      <span className={`bdg ${k.is_active ? 'b-completed' : 'b-rejected'}`}>
                        {k.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

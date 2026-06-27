// AdminProviderSync.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

const PROXY = '/api/proxy';

// ── Map provider category string → our platform field ────────────────────────
const mapPlatform = (cat = '') => {
  const c = cat.toLowerCase();
  if (c.includes('instagram')) return 'instagram';
  if (c.includes('tiktok'))    return 'tiktok';
  if (c.includes('youtube'))   return 'youtube';
  if (c.includes('twitter') || c.includes(' x ')) return 'twitter';
  if (c.includes('facebook'))  return 'facebook';
  if (c.includes('telegram'))  return 'telegram';
  if (c.includes('snapchat'))  return 'snapchat';
  if (c.includes('linkedin'))  return 'linkedin';
  if (c.includes('spotify'))   return 'spotify';
  if (c.includes('discord'))   return 'discord';
  if (c.includes('twitch'))    return 'twitch';
  return 'custom';
};

// ── Default empty provider config ─────────────────────────────────────────────
const emptyProvider = () => ({ name: '', url: '', key: '', markup: 0, enabled: true });

// ── Settings key helpers ───────────────────────────────────────────────────────
const PROVIDERS_KEY   = 'sync_providers';          // JSON array of provider configs
const INTERVAL_KEY    = 'sync_interval_hours';     // number
const LAST_SYNC_KEY   = 'sync_last_run';           // ISO timestamp
const LAST_RESULT_KEY = 'sync_last_result';        // JSON summary

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminProviderSync({ user }) {
  const [providers,   setProviders]   = useState([emptyProvider()]);
  const [intervalHrs, setIntervalHrs] = useState(6);
  const [lastSync,    setLastSync]    = useState(null);
  const [lastResult,  setLastResult]  = useState(null);
  const [syncing,     setSyncing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [log,         setLog]         = useState([]);
  const [msg,         setMsg]         = useState('');
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState('config');
  const [markupPct,   setMarkupPct]   = useState(0);
  const [progress,    setProgress]    = useState(null);

  const timerRef = useRef(null);

  const addLog = useCallback((text, type = 'info') => {
    setLog(prev => [{ text, type, ts: Date.now() }, ...prev].slice(0, 300));
  }, []);

  const flash = useCallback((text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 5000);
  }, []);

  // ── Load config from settings table ────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('key, value');
    if (data) {
      const map = {};
      data.forEach(r => { map[r.key] = r.value; });

      if (map[PROVIDERS_KEY]) {
        try {
          const parsed = JSON.parse(map[PROVIDERS_KEY]);
          if (Array.isArray(parsed) && parsed.length > 0) setProviders(parsed);
        } catch {}
      }
      if (map[INTERVAL_KEY])    setIntervalHrs(parseInt(map[INTERVAL_KEY], 10) || 6);
      if (map[LAST_SYNC_KEY])   setLastSync(map[LAST_SYNC_KEY]);
      if (map[LAST_RESULT_KEY]) {
        try { setLastResult(JSON.parse(map[LAST_RESULT_KEY])); } catch {}
      }
      if (map['api_markup_percent']) setMarkupPct(parseFloat(map['api_markup_percent']) || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Save config ─────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSaving(true);
    const upserts = [
      { key: PROVIDERS_KEY,  value: JSON.stringify(providers)     },
      { key: INTERVAL_KEY,   value: String(intervalHrs)           },
    ];
    for (const u of upserts) {
      await supabase.from('settings').upsert(u, { onConflict: 'key' });
    }
    setSaving(false);
    flash('✅ Sync configuration saved!');
    restartTimer();
  };

  // ── Core sync function ──────────────────────────────────────────────────────
  const UPSERT_CHUNK = 500;
  const chunkArr = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const syncAllProviders = useCallback(async (isManual = false) => {
    if (syncing) return;
    setSyncing(true);
    if (isManual) setTab('log');

    const enabledProviders = providers.filter(p => p.enabled && p.url && p.key);
    if (enabledProviders.length === 0) {
      addLog('⚠️ No enabled providers configured. Add provider credentials first.', 'warn');
      setSyncing(false);
      return;
    }

    addLog(`🚀 Starting fast sync for ${enabledProviders.length} provider(s)...`, 'info');
    setProgress({ done: 0, total: 0, phase: 'Loading your services...', provider: '' });

    const { data: ourServices } = await supabase
      .from('services')
      .select('id, provider_service_id, provider_api_url, name, price_per_1k, min_qty, max_qty, is_active');

    const ourMap = {};
    (ourServices || []).forEach(s => {
      if (s.provider_api_url && s.provider_service_id) {
        ourMap[`${s.provider_api_url}::${s.provider_service_id}`] = s;
      }
    });

    let totalAdded = 0, totalUpdated = 0, totalDeactivated = 0, totalErrors = 0;

    for (const prov of enabledProviders) {
      addLog(`🔌 Fetching services from ${prov.name || prov.url}...`, 'info');

      let providerServices = [];
      try {
        const res = await fetch(PROXY, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: prov.url, key: prov.key, action: 'services' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data)) throw new Error('Response is not an array');
        providerServices = data;
        addLog(`  ✅ Fetched ${data.length} services — comparing...`, 'success');
        setProgress({ done: 0, total: data.length, phase: 'Comparing services...', provider: prov.name || prov.url });
      } catch (e) {
        addLog(`  ❌ ${prov.name || prov.url}: fetch failed — ${e.message}`, 'error');
        totalErrors++;
        continue;
      }

      const markup = parseFloat(prov.markup) > 0 ? parseFloat(prov.markup) : markupPct;
      const applyMarkup = (price) => {
        const p = parseFloat(price) || 0;
        return markup > 0 ? p * (1 + markup / 100) : p;
      };

      const activeProviderIds = new Set(providerServices.map(s => String(s.service)));
      const toInsert = [];
      const toUpdate = [];

      let compared = 0;
      for (const s of providerServices) {
        compared++;
        if (compared % 100 === 0 || compared === providerServices.length) {
          setProgress({ done: compared, total: providerServices.length, phase: 'Comparing services...', provider: prov.name || prov.url });
        }
        const sid      = String(s.service);
        const key      = `${prov.url}::${sid}`;
        const existing = ourMap[key];
        const newPrice = applyMarkup(s.rate);
        const newMin   = Math.min(parseInt(s.min, 10) || 10,  2147483647);
        const newMax   = Math.min(parseInt(s.max, 10) || 100000, 2147483647);

        if (!existing) {
          toInsert.push({
            name:                s.name,
            platform:            mapPlatform(s.category || ''),
            description:         `${s.category || 'SMM Service'} · Min: ${s.min} · Max: ${s.max}`,
            price_per_1k:        newPrice,
            min_qty:             newMin,
            max_qty:             newMax,
            delivery_time:       s.average_time || '1-6 hrs',
            is_active:           true,
            provider_service_id: sid,
            provider_api_url:    prov.url,
            provider_api_key:    prov.key,
            provider_id:         prov.name || 'custom',
            vendor_service_id:   sid,
            provider_note:       null,
          });
        } else {
          const priceChanged = Math.abs(existing.price_per_1k - newPrice) > 0.0001;
          const minChanged   = existing.min_qty !== newMin;
          const maxChanged   = existing.max_qty !== newMax;
          const nameChanged  = existing.name !== s.name;
          const wasInactive  = existing.is_active === false;
          if (priceChanged || minChanged || maxChanged || wasInactive || nameChanged) {
            toUpdate.push({
              id:               existing.id,
              name:             s.name,          // required — NOT NULL
              price_per_1k:     newPrice,
              min_qty:          newMin,
              max_qty:          newMax,
              is_active:        true,
              provider_note:    null,
              provider_api_key: prov.key,
            });
          }
        }
      }

      if (toInsert.length > 0) {
        // Count how many of "toInsert" actually exist already (duplicates in DB)
        const genuinelyNew = toInsert.filter(r => {
          const key = `${r.provider_api_url}::${r.provider_service_id}`;
          return !ourMap[key];
        }).length;
        const alreadyExist = toInsert.length - genuinelyNew;

        addLog(`  ➕ Upserting ${toInsert.length} services (${genuinelyNew} new, ${alreadyExist} updating duplicates)...`, 'info');
        let inserted = 0;
        for (const chunk of chunkArr(toInsert, UPSERT_CHUNK)) {
          const { error } = await supabase
            .from('services')
            .upsert(chunk, {
              onConflict:       'provider_service_id,provider_api_url',
              ignoreDuplicates: false,
            });
          if (!error) { totalAdded += chunk.length; inserted += chunk.length; }
          else addLog(`  ⚠️ Insert batch error: ${error.message}`, 'warn');
          setProgress({ done: inserted, total: toInsert.length, phase: 'Inserting new services...', provider: prov.name || prov.url });
        }
      }

      if (toUpdate.length > 0) {
        addLog(`  ✏️ Updating ${toUpdate.length} changed services in bulk...`, 'info');
        let updated = 0;
        for (const chunk of chunkArr(toUpdate, UPSERT_CHUNK)) {
          const { error } = await supabase.from('services').upsert(chunk, { onConflict: 'id' });
          if (!error) { totalUpdated += chunk.length; updated += chunk.length; }
          else addLog(`  ⚠️ Update batch error: ${error.message}`, 'warn');
          setProgress({ done: updated, total: toUpdate.length, phase: 'Updating changed services...', provider: prov.name || prov.url });
        }
      }

      const toDeactivateIds = (ourServices || [])
        .filter(s => s.provider_api_url === prov.url && s.is_active && !activeProviderIds.has(s.provider_service_id))
        .map(s => s.id);

      if (toDeactivateIds.length > 0) {
        addLog(`  🚫 Deactivating ${toDeactivateIds.length} removed services...`, 'warn');
        for (const chunk of chunkArr(toDeactivateIds, UPSERT_CHUNK)) {
          await supabase.from('services')
            .update({ is_active: false, provider_note: `Removed from provider on ${new Date().toLocaleDateString()}` })
            .in('id', chunk);
        }
        totalDeactivated += toDeactivateIds.length;
      }

      if (toInsert.length === 0 && toUpdate.length === 0 && toDeactivateIds.length === 0) {
        addLog('  ✅ Everything up to date — no changes needed', 'success');
      }
    }

    const now    = new Date().toISOString();
    const result = { added: totalAdded, updated: totalUpdated, deactivated: totalDeactivated, errors: totalErrors, at: now };
    await supabase.from('settings').upsert({ key: LAST_SYNC_KEY,   value: now                    }, { onConflict: 'key' });
    await supabase.from('settings').upsert({ key: LAST_RESULT_KEY, value: JSON.stringify(result) }, { onConflict: 'key' });

    setLastSync(now);
    setLastResult(result);
    addLog(`✅ Sync complete — added: ${totalAdded}, updated: ${totalUpdated}, deactivated: ${totalDeactivated}, errors: ${totalErrors}`, 'success');
    setSyncing(false);
    setProgress(null);
    if (isManual) flash('✅ Sync complete! Check the log for details.');
  }, [providers, syncing, markupPct, addLog, flash]);

  // ── Auto-sync timer ─────────────────────────────────────────────────────────
  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const ms = intervalHrs * 60 * 60 * 1000;
    timerRef.current = setInterval(() => {
      syncAllProviders(false);
    }, ms);
  }, [intervalHrs, syncAllProviders]);

  useEffect(() => {
    if (loading) return;
    restartTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, restartTimer]);

  // ── Provider config helpers ──────────────────────────────────────────────────
  const addProvider    = () => setProviders(p => [...p, emptyProvider()]);
  const removeProvider = (i) => setProviders(p => p.filter((_, idx) => idx !== i));
  const updateProvider = (i, field, val) =>
    setProviders(p => p.map((prov, idx) => idx === i ? { ...prov, [field]: val } : prov));

  // ── Time helpers ─────────────────────────────────────────────────────────────
  const timeAgo = (iso) => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const nextSyncIn = () => {
    if (!lastSync) return 'Soon';
    const next = new Date(lastSync).getTime() + intervalHrs * 60 * 60 * 1000;
    const diff = next - Date.now();
    if (diff <= 0) return 'Overdue';
    const hrs  = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  const logColor = { info: 'var(--text2)', warn: 'var(--gold, #f59e0b)', error: '#ff6b6b', success: 'var(--green)' };

  // ── Admin guard ──────────────────────────────────────────────────────────────
  if (!user || user.role !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--danger)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>⛔</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 800, letterSpacing: '2px' }}>
          ACCESS DENIED
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading sync config...</div>
  );

  return (
    <div>
      {/* Flash */}
      {msg && (
        <div style={{
          background:   msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,200,0,.08)',
          border:       `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,200,0,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color:        msg.startsWith('✅') ? 'var(--green)' : 'var(--gold, #f59e0b)',
          fontWeight:   700, marginBottom: '16px', fontSize: '13px',
        }}>{msg}</div>
      )}

      {/* Hero banner */}
      <div style={{
        padding: '14px 16px', borderRadius: '10px', marginBottom: '18px',
        background: 'linear-gradient(135deg,rgba(0,60,120,.25),rgba(40,0,80,.15))',
        border: '1px solid rgba(0,212,255,.2)',
      }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '14px', fontWeight: 800, color: 'var(--neon)', letterSpacing: '2px', marginBottom: '6px' }}>
          🔁 Auto Provider Sync
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7 }}>
          Automatically keeps your services in sync with your providers.
          New services are added, changed prices/limits are updated, and removed services are deactivated — all without any manual work.
        </div>
      </div>

      {/* Status cards */}
      <div className="cgrid" style={{ marginBottom: '18px' }}>
        {[
          { ic: '🕐', lb: 'Last Sync',   vl: timeAgo(lastSync),                         cl: 'cn' },
          { ic: '⏭️', lb: 'Next Sync',    vl: syncing ? 'Running...' : nextSyncIn(),     cl: 'cw' },
          { ic: '➕', lb: 'Added',        vl: lastResult?.added        ?? '—',            cl: 'cg' },
          { ic: '✏️', lb: 'Updated',      vl: lastResult?.updated      ?? '—',            cl: 'cn' },
          { ic: '🚫', lb: 'Deactivated',  vl: lastResult?.deactivated  ?? '—',            cl: 'cw' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Manual sync button */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button
          className="btn bp bmd"
          onClick={() => syncAllProviders(true)}
          disabled={syncing}
          style={{ flex: 1, minWidth: '160px' }}
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync Now (Manual)'}
        </button>
        <button
          className="btn bgh bmd"
          onClick={loadConfig}
          style={{ flex: '0 0 auto' }}
        >
          🔃 Refresh
        </button>
      </div>

      {/* ── Live Progress Bar ── */}
      {syncing && progress && (
        <div style={{
          background: 'rgba(0,0,0,.35)', border: '1px solid rgba(0,212,255,.2)',
          borderRadius: '10px', padding: '14px 16px', marginBottom: '18px',
        }}>
          {/* Provider name + phase */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--neon)' }}>
              {progress.provider || 'Syncing...'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
              {progress.phase}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            background: 'rgba(255,255,255,.06)', borderRadius: '20px',
            height: '8px', overflow: 'hidden', marginBottom: '8px',
          }}>
            <div style={{
              height: '100%', borderRadius: '20px',
              background: 'linear-gradient(90deg, var(--neon), #00ff88)',
              width: progress.total > 0 ? `${Math.round((progress.done / progress.total) * 100)}%` : '100%',
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Counter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)' }}>
              {progress.total > 0
                ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} services`
                : progress.phase}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--neon)', fontWeight: 800 }}>
              {progress.total > 0
                ? `${Math.round((progress.done / progress.total) * 100)}%`
                : '...'}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="atbs" style={{ marginBottom: '18px' }}>
        <button className={`atb ${tab === 'config' ? 'on' : ''}`} onClick={() => setTab('config')}>
          ⚙️ Configuration
        </button>
        <button className={`atb ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>
          📋 Sync Log {log.length > 0 ? `(${log.length})` : ''}
        </button>
      </div>

      {/* ═══════════ TAB: CONFIG ═══════════ */}
      {tab === 'config' && (
        <div>
          {/* Sync interval */}
          <div className="st">⏱ Sync Interval</div>
          <div className="card" style={{ padding: '16px', marginBottom: '18px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.7 }}>
              How often to automatically fetch and compare services from all enabled providers.
              The sync runs while an admin has this page open. For 24/7 background sync,
              set up a Vercel/Supabase cron using the same logic.
            </div>
            <div className="fi">
              <label className="fl">Sync every N hours</label>
              <select
                className="sel"
                value={intervalHrs}
                onChange={e => setIntervalHrs(parseInt(e.target.value, 10))}
              >
                {[1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                  <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Provider configs */}
          <div className="st">🔌 Provider Connections</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.7 }}>
            Add one entry per provider panel. The URL and API key are used to call the provider's
            <code style={{ background: 'var(--gl)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>action=services</code> endpoint.
            Markup overrides the global API markup for that provider only.
          </div>

          {providers.map((prov, i) => (
            <div key={i} className="card" style={{ padding: '16px', marginBottom: '12px', borderColor: prov.enabled ? 'rgba(0,212,255,.2)' : 'var(--br)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: prov.enabled ? 'var(--neon)' : 'var(--text3)' }}>
                  Provider #{i + 1}{prov.name ? ` — ${prov.name}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={prov.enabled}
                      onChange={e => updateProvider(i, 'enabled', e.target.checked)}
                    />
                    <span style={{ color: prov.enabled ? 'var(--green)' : 'var(--text3)' }}>
                      {prov.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                  {providers.length > 1 && (
                    <button
                      className="btn bd bsm"
                      onClick={() => removeProvider(i)}
                      style={{ fontSize: '10px' }}
                    >
                      🗑 Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="fi">
                <label className="fl">Display Name</label>
                <input
                  className="inp"
                  value={prov.name}
                  onChange={e => updateProvider(i, 'name', e.target.value)}
                  placeholder="e.g. JustAnotherPanel, SMMRaja..."
                />
              </div>
              <div className="fi">
                <label className="fl">Provider API URL</label>
                <input
                  className="inp"
                  value={prov.url}
                  onChange={e => updateProvider(i, 'url', e.target.value)}
                  placeholder="https://provider.com/api/v2"
                />
              </div>
              <div className="fi">
                <label className="fl">Provider API Key</label>
                <input
                  className="inp"
                  type="password"
                  value={prov.key}
                  onChange={e => updateProvider(i, 'key', e.target.value)}
                  placeholder="Your API key from provider dashboard"
                />
              </div>
              <div className="fi" style={{ marginBottom: 0 }}>
                <label className="fl">
                  Markup % for this provider{' '}
                  <span style={{ color: 'var(--text3)', fontWeight: 400 }}>
                    (0 = use global {markupPct}% markup)
                  </span>
                </label>
                <input
                  className="inp"
                  type="number"
                  min="0"
                  step="0.5"
                  value={prov.markup}
                  onChange={e => updateProvider(i, 'markup', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button className="btn bgh bmd" onClick={addProvider} style={{ flex: '0 0 auto' }}>
              ＋ Add Another Provider
            </button>
            <button
              className="btn bp bmd"
              onClick={saveConfig}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? '⏳ Saving...' : '💾 Save Configuration'}
            </button>
          </div>

          {/* What gets synced */}
          <div className="st">📖 What Gets Synced</div>
          <div className="card" style={{ padding: '16px' }}>
            {[
              { ic: '➕', title: 'New Services',     desc: 'Any service the provider has that we don\'t → automatically inserted as active.' },
              { ic: '✏️', title: 'Price Changes',    desc: 'If the provider changes rate, our price_per_1k updates (with your markup applied).' },
              { ic: '📐', title: 'Limit Changes',    desc: 'Min/Max quantity updates flow through automatically.' },
              { ic: '🚫', title: 'Removed Services', desc: 'Services removed by the provider are deactivated (not deleted) so old orders still reference them.' },
              { ic: '✅', title: 'Re-added Services',desc: 'If a provider re-adds a service we previously deactivated, it\'s re-activated automatically.' },
              { ic: '🔑', title: 'API Key Refresh',  desc: 'The provider API key is refreshed on every sync, so key rotations are picked up automatically.' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: '10px', padding: '10px 0',
                borderBottom: i < 5 ? '1px solid var(--br)' : 'none',
              }}>
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.ic}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px' }}>{item.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: LOG ═══════════ */}
      {tab === 'log' && (
        <div>
          {log.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">📋</span>
              <div className="empty-tx">No sync log yet</div>
              <div className="empty-sb">Run a sync to see activity here</div>
              <button
                className="btn bp bmd"
                onClick={() => syncAllProviders(true)}
                disabled={syncing}
                style={{ marginTop: '14px' }}
              >
                {syncing ? '⏳ Syncing...' : '🔄 Run First Sync'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  {log.length} log entries — most recent first
                </div>
                <button className="btn bgh bsm" onClick={() => setLog([])}>Clear Log</button>
              </div>
              <div style={{
                background: 'rgba(0,0,0,.4)', borderRadius: '8px', border: '1px solid var(--br)',
                padding: '12px', maxHeight: '500px', overflowY: 'auto',
                fontFamily: 'var(--fm)', fontSize: '11px', lineHeight: 2,
              }}>
                {log.map(entry => (
                  <div key={entry.ts} style={{ color: logColor[entry.type] || 'var(--text2)' }}>
                    <span style={{ color: 'var(--text3)', marginRight: '8px', fontSize: '10px' }}>
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    {entry.text}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

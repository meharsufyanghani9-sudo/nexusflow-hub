// AdminOrderSync.js
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ── How many orders to process per sync batch ────────────────────────────────
const BATCH_SIZE = 20;

// ── How long to wait between provider API calls (ms) to avoid rate-limiting ─
const API_CALL_DELAY = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Map provider status strings → our internal status ────────────────────────
// Most SMM panel APIs return one of these strings in the "status" field.
function mapProviderStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();

  // Completed states
  if (['completed', 'complete', 'done', 'success', 'finished'].includes(s))
    return 'completed';

  // Cancelled / failed states — service removed or invalid falls here too
  if (
    ['cancelled', 'canceled', 'cancel', 'failed', 'error',
     'refunded', 'rejected', 'invalid', 'removed', 'deleted',
     'service_not_found', 'not found', 'notfound'].includes(s)
  )
    return 'cancelled';

  // In-progress states
  if (
    ['in progress', 'inprogress', 'in_progress', 'processing',
     'partial', 'active', 'running', 'started', 'pending'].includes(s)
  )
    return 'in_progress';

  // Unknown — leave unchanged
  return null;
}

// ── Errors that indicate the provider service was removed / is invalid ────────
const SERVICE_REMOVED_ERRORS = [
  'service not found',
  'invalid service',
  'service unavailable',
  'service disabled',
  'service removed',
  'incorrect service',
  'service does not exist',
  'no such service',
  'service id',       // "invalid service id"
  'service_not_found',
  'this service is not available',
  'service is not active',
];

function isServiceRemovedError(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return SERVICE_REMOVED_ERRORS.some((e) => m.includes(e));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminOrderSync({ user }) {
  const [stuckPending,   setStuckPending]   = useState([]);
  const [inProgressOrds, setInProgressOrds] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [syncing,        setSyncing]        = useState(false);
  const [retrying,       setRetrying]       = useState(false);
  const [log,            setLog]            = useState([]);
  const [tab,            setTab]            = useState('sync');  // 'sync' | 'retry' | 'manual'
  const [manualOrders,   setManualOrders]   = useState([]);
  const [manualFilter,   setManualFilter]   = useState('pending');
  const [manualStatus,   setManualStatus]   = useState('cancelled');
  const [manualRefund,   setManualRefund]   = useState(true);
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [applying,       setApplying]       = useState(false);
  const [msg,            setMsg]            = useState('');

  const addLog = useCallback((text, type = 'info') => {
    setLog((prev) => [{ text, type, ts: Date.now() }, ...prev].slice(0, 200));
  }, []);

  const flash = useCallback((text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 5000);
  }, []);

  // ── Load orders that need attention ────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setLoading(true);

    // 1. Stuck pending: pending orders that have a provider_note
    //    (first attempt failed — service may have been removed)
    const { data: stuck } = await supabase
      .from('orders')
      .select('*, services:service_id(provider_api_url, provider_api_key, provider_service_id)')
      .eq('status', 'pending')
      .not('provider_note', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    // 2. In-progress orders that have a vendor_order_id to poll
    const { data: inProg } = await supabase
      .from('orders')
      .select('*, services:service_id(provider_api_url, provider_api_key)')
      .eq('status', 'in_progress')
      .not('vendor_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    setStuckPending(stuck || []);
    setInProgressOrds(inProg || []);
    setLoading(false);
  }, []);

  const loadManualOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, users:user_id(full_name, email)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(300);
    setManualOrders(data || []);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (tab === 'manual') loadManualOrders();
  }, [tab, loadManualOrders]);

  // ── Refund helper ──────────────────────────────────────────────────────────
  const issueRefund = async (order, reason) => {
    if (!order.user_id || !order.cost) return;
    const { data: profile } = await supabase
      .from('users').select('balance').eq('id', order.user_id).single();
    if (!profile) return;
    const newBal = parseFloat(profile.balance || 0) + parseFloat(order.cost || 0);
    await supabase.from('users').update({ balance: newBal }).eq('id', order.user_id);
    await supabase.from('transactions').insert({
      user_id:     order.user_id,
      type:        'refund',
      amount:      parseFloat(order.cost || 0),
      description: `Auto-refund: ${reason} (${order.order_ref || order.id})`,
      ref_id:      order.order_ref || order.id,
    });
  };

  // ── SYNC: poll provider for in_progress orders ─────────────────────────────
  const syncInProgress = async () => {
    if (inProgressOrds.length === 0) {
      flash('ℹ️ No in-progress orders with a vendor order ID to sync.');
      return;
    }
    setSyncing(true);
    addLog(`🔄 Starting sync of ${inProgressOrds.length} in-progress order(s)...`, 'info');

    let completed = 0, cancelled = 0, unchanged = 0, errors = 0;
    const batch = inProgressOrds.slice(0, BATCH_SIZE);

    for (const order of batch) {
      const apiUrl = order.services?.provider_api_url;
      const apiKey = order.services?.provider_api_key;

      if (!apiUrl || !apiKey || !order.vendor_order_id) {
        addLog(`⚠️ ${order.order_ref || order.id}: missing provider credentials — skipped`, 'warn');
        unchanged++;
        continue;
      }

      await sleep(API_CALL_DELAY);

      try {
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:    apiUrl,
            key:    apiKey,
            action: 'status',
            order:  order.vendor_order_id,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Provider returned an error
        if (data.error) {
          const isRemoved = isServiceRemovedError(data.error);
          if (isRemoved) {
            // Service was removed — cancel and refund
            await issueRefund(order, 'Service removed by provider');
            await supabase.from('orders').update({
              status:        'cancelled',
              provider_note: `Service removed/changed by provider: ${data.error}`,
            }).eq('id', order.id);
            addLog(`❌ ${order.order_ref || order.id}: service removed → auto-cancelled + refunded`, 'error');
            cancelled++;
          } else {
            await supabase.from('orders').update({
              provider_note: `Provider: ${data.error}`,
            }).eq('id', order.id);
            addLog(`⚠️ ${order.order_ref || order.id}: provider error — ${data.error}`, 'warn');
            errors++;
          }
          continue;
        }

        // Map provider status to our status
        const providerStatus = data.status || data.charge?.status || null;
        const mapped = mapProviderStatus(providerStatus);

        if (!mapped || mapped === 'in_progress') {
          addLog(
            `🔁 ${order.order_ref || order.id}: still in progress (provider: ${providerStatus || 'no status'})`,
            'info'
          );
          unchanged++;
          continue;
        }

        // Status changed — update DB
        const updatePayload = { status: mapped };
        if (data.start_count !== undefined) updatePayload.progress = parseInt(data.start_count, 10) || 0;
        if (mapped === 'cancelled') {
          await issueRefund(order, `Provider status: ${providerStatus}`);
          updatePayload.provider_note = `Provider cancelled: ${providerStatus}`;
        }

        await supabase.from('orders').update(updatePayload).eq('id', order.id);

        if (mapped === 'completed') {
          addLog(`✅ ${order.order_ref || order.id}: marked completed`, 'success');
          completed++;
        } else {
          addLog(`❌ ${order.order_ref || order.id}: cancelled by provider (${providerStatus}) → refunded`, 'error');
          cancelled++;
        }

      } catch (e) {
        addLog(`💥 ${order.order_ref || order.id}: request failed — ${e.message}`, 'error');
        errors++;
      }
    }

    addLog(
      `✅ Sync done — completed: ${completed}, cancelled+refunded: ${cancelled}, unchanged: ${unchanged}, errors: ${errors}`,
      'success'
    );
    setSyncing(false);
    loadOrders();
  };

  // ── RETRY: re-submit stuck pending orders ──────────────────────────────────
  const retryStuckPending = async () => {
    if (stuckPending.length === 0) {
      flash('ℹ️ No stuck pending orders to retry.');
      return;
    }
    setRetrying(true);
    addLog(`🔄 Retrying ${stuckPending.length} stuck pending order(s)...`, 'info');

    let sent = 0, serviceRemoved = 0, errors = 0;
    const batch = stuckPending.slice(0, BATCH_SIZE);

    for (const order of batch) {
      const apiUrl = order.services?.provider_api_url;
      const apiKey = order.services?.provider_api_key;
      const svcId  = order.services?.provider_service_id;

      if (!apiUrl || !apiKey || !svcId) {
        addLog(`⚠️ ${order.order_ref || order.id}: no provider config on service — auto-cancel + refund`, 'warn');
        await issueRefund(order, 'Service no longer has provider config');
        await supabase.from('orders').update({
          status:        'cancelled',
          provider_note: 'Service provider configuration was removed. Auto-refunded.',
        }).eq('id', order.id);
        serviceRemoved++;
        continue;
      }

      await sleep(API_CALL_DELAY);

      try {
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:      apiUrl,
            key:      apiKey,
            action:   'add',
            service:  svcId,
            link:     order.link,
            quantity: order.quantity,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.order) {
          // Successfully placed
          await supabase.from('orders').update({
            vendor_order_id: String(data.order),
            status:          'in_progress',
            provider_note:   null,   // clear old error note
          }).eq('id', order.id);
          addLog(`✅ ${order.order_ref || order.id}: re-sent to provider → in_progress (vendor: ${data.order})`, 'success');
          sent++;

        } else if (data.error) {
          const isRemoved = isServiceRemovedError(data.error);
          if (isRemoved) {
            // Service removed/changed — cancel and refund user
            await issueRefund(order, `Service removed: ${data.error}`);
            await supabase.from('orders').update({
              status:        'cancelled',
              provider_note: `Service removed by provider: ${data.error}. You have been refunded.`,
            }).eq('id', order.id);
            addLog(`❌ ${order.order_ref || order.id}: service removed → auto-cancelled + refunded`, 'error');
            serviceRemoved++;
          } else {
            // Some other provider error — update note but keep pending
            await supabase.from('orders').update({
              provider_note: `Retry failed: ${data.error}`,
            }).eq('id', order.id);
            addLog(`⚠️ ${order.order_ref || order.id}: provider error on retry — ${data.error}`, 'warn');
            errors++;
          }

        } else {
          await supabase.from('orders').update({
            provider_note: `Retry: unexpected response`,
          }).eq('id', order.id);
          addLog(`⚠️ ${order.order_ref || order.id}: unexpected provider response`, 'warn');
          errors++;
        }

      } catch (e) {
        await supabase.from('orders').update({
          provider_note: `Retry failed: ${e.message}`,
        }).eq('id', order.id);
        addLog(`💥 ${order.order_ref || order.id}: request failed — ${e.message}`, 'error');
        errors++;
      }
    }

    addLog(
      `✅ Retry done — sent: ${sent}, service-removed (refunded): ${serviceRemoved}, errors: ${errors}`,
      'success'
    );
    setRetrying(false);
    loadOrders();
  };

  // ── MANUAL: bulk status override ───────────────────────────────────────────
  const applyManual = async () => {
    if (selectedIds.size === 0) { flash('⚠️ Select at least one order.'); return; }
    if (!window.confirm(
      `Apply "${manualStatus}" to ${selectedIds.size} order(s)?` +
      (manualRefund ? '\n\nThis will also issue refunds for each order.' : '')
    )) return;

    setApplying(true);
    let done = 0;

    for (const id of selectedIds) {
      const order = manualOrders.find((o) => o.id === id);
      if (!order) continue;

      if (manualRefund && ['cancelled'].includes(manualStatus)) {
        await issueRefund(order, `Admin manual override → ${manualStatus}`);
      }

      await supabase.from('orders').update({
        status:        manualStatus,
        provider_note: `Admin manually set to "${manualStatus}"`,
      }).eq('id', id);
      done++;
    }

    flash(`✅ Updated ${done} order(s) to "${manualStatus}".`);
    setApplying(false);
    loadManualOrders();
  };

  const filteredManual = manualOrders.filter((o) =>
    manualFilter === 'all' ? true : o.status === manualFilter
  );

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredManual.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredManual.map((o) => o.id)));
    }
  };

  // ── Admin guard (defence-in-depth) ─────────────────────────────────────────
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

  const logColor = { info: 'var(--text2)', warn: 'var(--warn, #f59e0b)', error: '#ff6b6b', success: 'var(--green)' };

  return (
    <div>
      {/* Flash message */}
      {msg && (
        <div style={{
          background:   msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,200,0,.08)',
          border:       `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,200,0,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color:        msg.startsWith('✅') ? 'var(--green)' : 'var(--warn, #f59e0b)',
          fontWeight:   700, marginBottom: '16px', fontSize: '13px',
        }}>{msg}</div>
      )}

      {/* ── Info banner ── */}
      <div style={{
        padding: '14px 16px', borderRadius: '10px', marginBottom: '18px',
        background: 'linear-gradient(135deg,rgba(0,60,120,.25),rgba(40,0,80,.15))',
        border: '1px solid rgba(0,212,255,.2)',
      }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '14px', fontWeight: 800, color: 'var(--neon)', letterSpacing: '2px', marginBottom: '6px' }}>
          🔄 Provider Order Sync
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7 }}>
          When a provider removes or changes a service, orders get stuck in "pending".
          Use this panel to sync statuses, retry failed orders, and auto-refund users
          when a service is no longer available.
        </div>
      </div>

      {/* ── Stat cards ── */}
      {!loading && (
        <div className="cgrid" style={{ marginBottom: '18px' }}>
          {[
            { ic: '⚠️', lb: 'Stuck Pending',  vl: stuckPending.length,   cl: 'cw'  },
            { ic: '⚡', lb: 'In Progress',     vl: inProgressOrds.length, cl: 'cn'  },
          ].map((s, i) => (
            <div key={i} className="sc">
              <span className="sc-ic">{s.ic}</span>
              <div className="sc-lb">{s.lb}</div>
              <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="atbs" style={{ marginBottom: '18px' }}>
        <button className={`atb ${tab === 'sync'   ? 'on' : ''}`} onClick={() => setTab('sync')}>
          🔄 Sync In-Progress
        </button>
        <button className={`atb ${tab === 'retry'  ? 'on' : ''}`} onClick={() => setTab('retry')}>
          🔁 Retry Stuck Pending {stuckPending.length > 0 ? `(${stuckPending.length})` : ''}
        </button>
        <button className={`atb ${tab === 'manual' ? 'on' : ''}`} onClick={() => setTab('manual')}>
          🛠 Manual Override
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Sync In-Progress
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'sync' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.7 }}>
            Polls the provider API for each in-progress order that has a <code>vendor_order_id</code>.
            Completed orders will be marked done. If the provider cancelled or the service was removed,
            the order is cancelled and the user is <strong style={{ color: 'var(--green)' }}>automatically refunded</strong>.
          </div>

          <button
            className="btn bp bmd"
            onClick={syncInProgress}
            disabled={syncing || loading}
            style={{ marginBottom: '14px' }}
          >
            {syncing
              ? `⏳ Syncing (up to ${BATCH_SIZE} orders)...`
              : `🔄 Sync ${Math.min(inProgressOrds.length, BATCH_SIZE)} In-Progress Orders`}
          </button>

          {inProgressOrds.length === 0 && !loading && (
            <div className="empty">
              <span className="empty-ic">✅</span>
              <div className="empty-tx">No in-progress orders pending sync</div>
            </div>
          )}

          {inProgressOrds.length > 0 && (
            <div className="tblw" style={{ marginBottom: '14px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Service</th>
                    <th>Vendor ID</th>
                    <th>Qty</th>
                    <th>Cost</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {inProgressOrds.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>
                        {o.order_ref || o.id?.slice(0, 8)}
                      </td>
                      <td style={{ fontSize: '11px', fontWeight: 600 }}>{o.service_name}</td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--text3)' }}>
                        {o.vendor_order_id || '—'}
                      </td>
                      <td style={{ fontSize: '11px' }}>{(o.quantity || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '11px' }}>
                        ${parseFloat(o.cost || 0).toFixed(2)}
                      </td>
                      <td style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Retry Stuck Pending
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'retry' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.7 }}>
            These orders are <strong>pending</strong> and have a <code>provider_note</code> — meaning
            the initial submission to the provider failed (e.g. service was removed or the API was
            temporarily down). This tool re-attempts the submission. If the provider returns a
            "service not found" type error, the order is <strong style={{ color: 'var(--green)' }}>
            auto-cancelled and the user is refunded</strong>.
          </div>

          <button
            className="btn bp bmd"
            onClick={retryStuckPending}
            disabled={retrying || loading}
            style={{ marginBottom: '14px' }}
          >
            {retrying
              ? `⏳ Retrying (up to ${BATCH_SIZE} orders)...`
              : `🔁 Retry ${Math.min(stuckPending.length, BATCH_SIZE)} Stuck Orders`}
          </button>

          {stuckPending.length === 0 && !loading && (
            <div className="empty">
              <span className="empty-ic">✅</span>
              <div className="empty-tx">No stuck pending orders</div>
            </div>
          )}

          {stuckPending.length > 0 && (
            <div className="tblw">
              <table>
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Service</th>
                    <th>Error Note</th>
                    <th>Cost</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stuckPending.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>
                        {o.order_ref || o.id?.slice(0, 8)}
                      </td>
                      <td style={{ fontSize: '11px', fontWeight: 600 }}>{o.service_name}</td>
                      <td style={{ fontSize: '10px', color: '#ff6b6b', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {o.provider_note || '—'}
                      </td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '11px' }}>
                        ${parseFloat(o.cost || 0).toFixed(2)}
                      </td>
                      <td style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Manual Override
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'manual' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.7 }}>
            Manually bulk-update order statuses. Use this when you need to force-resolve orders
            that can't be fixed automatically.
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['pending', 'in_progress', 'all'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setManualFilter(s); setSelectedIds(new Set()); }}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
                    fontFamily: 'var(--fu)', fontSize: '10px', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '1px',
                    background: manualFilter === s ? 'var(--neon)' : 'var(--gl)',
                    color:      manualFilter === s ? '#000' : 'var(--text3)',
                    border:     manualFilter === s ? 'none' : '1px solid var(--br)',
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Set selected to:</span>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value)}
                style={{
                  background: 'var(--bg2)', border: '1px solid var(--br)',
                  borderRadius: '6px', color: 'var(--text)', padding: '4px 8px', fontSize: '11px',
                }}
              >
                <option value="in_progress">⚡ In Progress</option>
                <option value="completed">✅ Completed</option>
                <option value="cancelled">❌ Cancelled</option>
              </select>
              {manualStatus === 'cancelled' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={manualRefund}
                    onChange={(e) => setManualRefund(e.target.checked)}
                  />
                  <span style={{ color: 'var(--green)' }}>Issue refunds</span>
                </label>
              )}
              <button
                className="btn bp bsm"
                onClick={applyManual}
                disabled={applying || selectedIds.size === 0}
              >
                {applying ? 'Applying...' : `Apply to ${selectedIds.size} selected`}
              </button>
            </div>
          </div>

          {/* Table */}
          {filteredManual.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">📦</span>
              <div className="empty-tx">No orders in this filter</div>
            </div>
          ) : (
            <div className="tblw">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredManual.length && filteredManual.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Order Ref</th>
                    <th>User</th>
                    <th>Service</th>
                    <th>Cost</th>
                    <th>Status</th>
                    <th>Note</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredManual.slice(0, 100).map((o) => (
                    <tr key={o.id} style={{ opacity: selectedIds.has(o.id) ? 1 : 0.75 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(o.id)}
                          onChange={() => toggleSelect(o.id)}
                        />
                      </td>
                      <td style={{ fontFamily: 'var(--fm)', color: 'var(--neon)', fontSize: '11px' }}>
                        {o.order_ref || o.id?.slice(0, 8)}
                      </td>
                      <td style={{ fontSize: '10px' }}>
                        <div style={{ fontWeight: 600 }}>{o.users?.full_name || '—'}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{o.users?.email?.slice(0, 20)}</div>
                      </td>
                      <td style={{ fontSize: '11px', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.service_name}
                      </td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '11px' }}>
                        ${parseFloat(o.cost || 0).toFixed(2)}
                      </td>
                      <td>
                        <span className={`bdg ${o.status === 'pending' ? 'b-pending' : 'b-progress'}`}>
                          {o.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '9px', color: '#ff6b6b', maxWidth: '140px', wordBreak: 'break-word' }}>
                        {o.provider_note || '—'}
                      </td>
                      <td style={{ fontSize: '10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Activity Log ── */}
      {log.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'
          }}>
            <div className="st" style={{ marginBottom: 0 }}>Activity Log</div>
            <button
              className="btn bgh bsm"
              onClick={() => setLog([])}
              style={{ fontSize: '10px' }}
            >
              Clear
            </button>
          </div>
          <div style={{
            background: 'rgba(0,0,0,.4)', borderRadius: '8px', border: '1px solid var(--br)',
            padding: '10px 12px', maxHeight: '240px', overflowY: 'auto',
            fontFamily: 'var(--fm)', fontSize: '10px', lineHeight: 1.8,
          }}>
            {log.map((entry) => (
              <div key={entry.ts} style={{ color: logColor[entry.type] || 'var(--text2)' }}>
                <span style={{ color: 'var(--text3)', marginRight: '6px' }}>
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

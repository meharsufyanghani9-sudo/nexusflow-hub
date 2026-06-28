// AdminUserDiscounts.js
// Admin can give any user a discount in two ways:
//   1. GLOBAL discount % — applied to ALL services for that user
//   2. SERVICE-SPECIFIC discounts — different % per service
//
// How the discount is applied in Marketplace.js (effectivePrice):
//   finalPrice = basePrice * (1 - discountPercent / 100)
//
// SQL to run in Supabase:
/*
create table if not exists user_discounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  service_id   uuid references services(id) on delete cascade,  -- NULL = global
  discount_pct numeric(5,2) not null check (discount_pct >= 0 and discount_pct <= 100),
  note         text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (user_id, service_id)  -- one row per user per service (service_id NULL = global)
);
create index if not exists user_discounts_user_idx    on user_discounts(user_id);
create index if not exists user_discounts_service_idx on user_discounts(service_id);
*/

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const SERVICES_PAGE = 500;

export default function AdminUserDiscounts({ user }) {
  const [users,        setUsers]        = useState([]);
  const [services,     setServices]     = useState([]);
  const [discounts,    setDiscounts]    = useState([]); // all discount rows
  const [selUser,      setSelUser]      = useState(null);
  const [userSearch,   setUserSearch]   = useState('');
  const [svcSearch,    setSvcSearch]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState('');
  const [tab,          setTab]          = useState('global'); // 'global' | 'services'

  // Draft state for the selected user
  const [globalPct,    setGlobalPct]    = useState('');
  const [globalNote,   setGlobalNote]   = useState('');
  const [svcOverrides, setSvcOverrides] = useState({}); // { serviceId: pct }

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  // ── Load users, services, discounts ────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);

    const [usersRes, discountsRes] = await Promise.all([
      supabase.from('users')
        .select('id, full_name, email, role, balance')
        .in('role', ['buyer', 'reseller'])
        .order('full_name'),
      supabase.from('user_discounts')
        .select('*')
        .order('created_at'),
    ]);

    // Load services in pages
    let allSvcs = [];
    let page = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('services')
        .select('id, name, platform, price_per_1k')
        .eq('is_active', true)
        .order('name')
        .range(page * SERVICES_PAGE, (page + 1) * SERVICES_PAGE - 1);
      if (!batch || batch.length === 0) break;
      allSvcs = allSvcs.concat(batch);
      if (batch.length < SERVICES_PAGE) break;
      page++;
    }

    setUsers(usersRes.data || []);
    setDiscounts(discountsRes.data || []);
    setServices(allSvcs);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── When user is selected, populate draft state ─────────────────────────────
  useEffect(() => {
    if (!selUser) return;
    const userDisc = discounts.filter(d => d.user_id === selUser.id);
    const global   = userDisc.find(d => d.service_id === null);
    setGlobalPct(global ? String(global.discount_pct) : '');
    setGlobalNote(global?.note || '');
    const overrides = {};
    userDisc.filter(d => d.service_id !== null).forEach(d => {
      overrides[d.service_id] = String(d.discount_pct);
    });
    setSvcOverrides(overrides);
  }, [selUser, discounts]);

  // ── Save global discount ────────────────────────────────────────────────────
  const saveGlobal = async () => {
    if (!selUser) return;
    setSaving(true);
    const pct = parseFloat(globalPct);

    // Always delete first — NULL in unique constraint doesn't work with upsert
    await supabase.from('user_discounts')
      .delete()
      .eq('user_id', selUser.id)
      .is('service_id', null);

    if (isNaN(pct) || globalPct === '' || pct === 0) {
      flash('✅ Global discount removed.');
    } else if (pct < 0 || pct > 100) {
      flash('❌ Discount must be between 0 and 100.');
      setSaving(false);
      return;
    } else {
      await supabase.from('user_discounts').insert({
        user_id:      selUser.id,
        service_id:   null,
        discount_pct: pct,
        note:         globalNote || null,
      });
      flash(`✅ Global discount of ${pct}% saved for ${selUser.full_name}.`);
    }

    await loadAll();
    setSaving(false);
  };

  // ── Save a single service override ─────────────────────────────────────────
  const saveServiceDiscount = async (serviceId, pctStr) => {
    if (!selUser) return;
    const pct = parseFloat(pctStr);

    // Always delete first, then re-insert if needed
    await supabase.from('user_discounts')
      .delete()
      .eq('user_id', selUser.id)
      .eq('service_id', serviceId);

    if (pctStr !== '' && !isNaN(pct) && pct > 0) {
      await supabase.from('user_discounts').insert({
        user_id:      selUser.id,
        service_id:   serviceId,
        discount_pct: Math.min(100, Math.max(0, pct)),
      });
    }

    await loadAll();
  };

  // ── Remove ALL discounts for user ───────────────────────────────────────────
  const removeAll = async () => {
    if (!selUser) return;
    if (!window.confirm(`Remove all discounts for ${selUser.full_name}?`)) return;
    setSaving(true);
    await supabase.from('user_discounts').delete().eq('user_id', selUser.id);
    setGlobalPct('');
    setGlobalNote('');
    setSvcOverrides({});
    flash('✅ All discounts removed.');
    await loadAll();
    setSaving(false);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getUserDiscountCount = (uid) =>
    discounts.filter(d => d.user_id === uid).length;

  const getGlobalForUser = (uid) =>
    discounts.find(d => d.user_id === uid && d.service_id === null);

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) ||
           (u.email || '').toLowerCase().includes(q);
  });

  const filteredServices = services.filter(s => {
    const q = svcSearch.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) ||
           (s.platform || '').toLowerCase().includes(q);
  });

  const usersWithDiscount = users.filter(u => getUserDiscountCount(u.id) > 0);

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--danger)' }}>
        <div style={{ fontSize: '40px' }}>⛔</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 800, letterSpacing: '2px' }}>
          ACCESS DENIED
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Flash */}
      {msg && (
        <div style={{
          background:   msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border:       `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color:        msg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
          fontWeight:   700, marginBottom: '16px', fontSize: '13px',
        }}>{msg}</div>
      )}

      {/* Info banner */}
      <div style={{
        padding: '14px 16px', borderRadius: '10px', marginBottom: '18px',
        background: 'linear-gradient(135deg,rgba(0,60,120,.25),rgba(40,0,80,.15))',
        border: '1px solid rgba(0,212,255,.2)',
      }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '14px', fontWeight: 800, color: 'var(--neon)', letterSpacing: '2px', marginBottom: '6px' }}>
          🏷️ User Discounts
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7 }}>
          Give individual users a discount on all services (global) or on specific services only.
          Service-specific discounts override the global discount for that service.
        </div>
      </div>

      {/* Stat cards */}
      <div className="cgrid" style={{ marginBottom: '18px' }}>
        {[
          { ic: '👥', lb: 'Total Users',       vl: users.length,            cl: 'cn' },
          { ic: '🏷️', lb: 'Users w/ Discount', vl: usersWithDiscount.length, cl: 'cg' },
          { ic: '📋', lb: 'Total Rules',        vl: discounts.length,         cl: 'cw' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

        {/* ── LEFT: User List ──────────────────────────────────────────── */}
        <div style={{
          width: '280px', flexShrink: 0,
          background: 'var(--gl)', borderRadius: '12px',
          border: '1px solid var(--br)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px', borderBottom: '1px solid var(--br)' }}>
            <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>Select User</div>
            <input
              className="inp"
              placeholder="🔍 Search users..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              style={{ marginBottom: 0 }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '500px' }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                Loading...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                No users found
              </div>
            ) : filteredUsers.map(u => {
              const isSelected = selUser?.id === u.id;
              const discCount  = getUserDiscountCount(u.id);
              const global     = getGlobalForUser(u.id);

              return (
                <div key={u.id}
                  onClick={() => setSelUser(u)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,.04)',
                    background: isSelected ? 'rgba(0,212,255,.08)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--neon)' : '3px solid transparent',
                    transition: 'all .15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.full_name || 'No name'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </div>
                    </div>
                    {discCount > 0 && (
                      <div style={{ flexShrink: 0, marginLeft: '6px' }}>
                        <span style={{
                          background: 'rgba(0,255,136,.12)', border: '1px solid rgba(0,255,136,.2)',
                          borderRadius: '10px', padding: '2px 7px',
                          fontSize: '9px', fontWeight: 700, color: 'var(--green)',
                        }}>
                          {global ? `${global.discount_pct}% off` : `${discCount} svc`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <span style={{
                      fontSize: '9px', padding: '1px 6px', borderRadius: '8px',
                      background: u.role === 'reseller' ? 'rgba(123,47,255,.15)' : 'rgba(0,212,255,.1)',
                      color: u.role === 'reseller' ? 'var(--purple2, #9b6dff)' : 'var(--neon)',
                    }}>
                      {u.role}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text3)' }}>
                      ${parseFloat(u.balance || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Discount Editor ────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          {!selUser ? (
            <div style={{
              background: 'var(--gl)', borderRadius: '12px', border: '1px solid var(--br)',
              padding: '60px 20px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>👈</div>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                Select a user from the left
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.7 }}>
                Choose any buyer or reseller to set their discount rules.
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--gl)', borderRadius: '12px', border: '1px solid var(--br)',
              overflow: 'hidden',
            }}>
              {/* User header */}
              <div style={{
                padding: '14px 16px',
                background: 'linear-gradient(135deg,rgba(0,212,255,.08),rgba(123,47,255,.08))',
                borderBottom: '1px solid var(--br)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px' }}>{selUser.full_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    {selUser.email} · {selUser.role} · ${parseFloat(selUser.balance || 0).toFixed(2)} balance
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {getUserDiscountCount(selUser.id) > 0 && (
                    <button onClick={removeAll} disabled={saving} style={{
                      background: 'rgba(255,51,85,.1)', border: '1px solid rgba(255,51,85,.2)',
                      borderRadius: '8px', color: '#ff3355', padding: '5px 10px',
                      fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                    }}>
                      🗑 Remove All
                    </button>
                  )}
                  <button onClick={() => setSelUser(null)} style={{
                    background: 'var(--gl2)', border: '1px solid var(--br)',
                    borderRadius: '8px', color: 'var(--text3)', padding: '5px 10px',
                    fontSize: '11px', cursor: 'pointer',
                  }}>✕</button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--br)' }}>
                {[
                  { id: 'global',   lb: '🌐 Global Discount' },
                  { id: 'services', lb: `📋 Per-Service (${Object.keys(svcOverrides).length})` },
                ].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} style={{
                    flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                    background: tab === t.id ? 'rgba(0,212,255,.06)' : 'transparent',
                    borderBottom: tab === t.id ? '2px solid var(--neon)' : '2px solid transparent',
                    color: tab === t.id ? 'var(--neon)' : 'var(--text3)',
                    fontSize: '11px', fontWeight: 700,
                  }}>{t.lb}</button>
                ))}
              </div>

              <div style={{ padding: '16px' }}>

                {/* ── GLOBAL TAB ── */}
                {tab === 'global' && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '16px' }}>
                      A global discount applies to <strong>all services</strong> for this user.
                      Set 0 to remove it. Service-specific discounts below will override this for individual services.
                    </div>

                    <div className="fi">
                      <label className="fl">Discount Percentage</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          className="inp"
                          type="number"
                          min="0" max="100" step="0.5"
                          value={globalPct}
                          onChange={e => setGlobalPct(e.target.value)}
                          placeholder="e.g. 10"
                          style={{ flex: 1 }}
                        />
                        <span style={{ color: 'var(--text3)', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>%</span>
                      </div>
                    </div>

                    <div className="fi">
                      <label className="fl">Note (optional)</label>
                      <input
                        className="inp"
                        value={globalNote}
                        onChange={e => setGlobalNote(e.target.value)}
                        placeholder="e.g. VIP customer, loyalty reward..."
                      />
                    </div>

                    {/* Preview */}
                    {globalPct && !isNaN(parseFloat(globalPct)) && parseFloat(globalPct) > 0 && (
                      <div style={{
                        background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.15)',
                        borderRadius: '8px', padding: '12px', marginBottom: '14px',
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)', marginBottom: '6px' }}>
                          Preview for {selUser.full_name}:
                        </div>
                        {[1, 5, 10, 50].map(price => (
                          <div key={price} style={{ display: 'flex', justifyContent: 'space-between',
                            fontSize: '11px', color: 'var(--text2)', marginBottom: '3px' }}>
                            <span>Service at ${price.toFixed(2)}/1K</span>
                            <span>
                              <s style={{ color: 'var(--text3)', marginRight: '6px' }}>${price.toFixed(2)}</s>
                              <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                                ${(price * (1 - parseFloat(globalPct) / 100)).toFixed(2)}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      className="btn bp bmd"
                      onClick={saveGlobal}
                      disabled={saving}
                      style={{ width: '100%' }}
                    >
                      {saving ? '⏳ Saving...' : globalPct ? `💾 Save ${globalPct}% Global Discount` : '🗑 Remove Global Discount'}
                    </button>
                  </div>
                )}

                {/* ── PER-SERVICE TAB ── */}
                {tab === 'services' && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '12px' }}>
                      Set different discounts for specific services. Leave blank to use the global discount.
                      Changes save automatically when you leave the field.
                    </div>

                    <input
                      className="inp"
                      placeholder="🔍 Filter services..."
                      value={svcSearch}
                      onChange={e => setSvcSearch(e.target.value)}
                      style={{ marginBottom: '12px' }}
                    />

                    {/* Active overrides summary */}
                    {Object.keys(svcOverrides).length > 0 && (
                      <div style={{
                        background: 'rgba(0,212,255,.04)', border: '1px solid rgba(0,212,255,.12)',
                        borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--neon)', marginBottom: '6px' }}>
                          {Object.keys(svcOverrides).length} service override(s) active:
                        </div>
                        {Object.entries(svcOverrides).slice(0, 5).map(([svcId, pct]) => {
                          const svc = services.find(s => s.id === svcId);
                          return (
                            <div key={svcId} style={{ fontSize: '10px', color: 'var(--text2)', marginBottom: '2px',
                              display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                {svc?.name || svcId}
                              </span>
                              <span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>{pct}% off</span>
                            </div>
                          );
                        })}
                        {Object.keys(svcOverrides).length > 5 && (
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            ...and {Object.keys(svcOverrides).length - 5} more
                          </div>
                        )}
                      </div>
                    )}

                    {/* Service list with inline discount inputs */}
                    <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                      {filteredServices.slice(0, 200).map(s => {
                        const currentPct = svcOverrides[s.id] ?? '';
                        const hasOverride = currentPct !== '';

                        return (
                          <div key={s.id} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 10px', borderRadius: '8px', marginBottom: '4px',
                            background: hasOverride ? 'rgba(0,255,136,.04)' : 'rgba(0,0,0,.15)',
                            border: `1px solid ${hasOverride ? 'rgba(0,255,136,.15)' : 'var(--br)'}`,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.name}
                              </div>
                              <div style={{ fontSize: '9px', color: 'var(--text3)' }}>
                                {s.platform} · ${parseFloat(s.price_per_1k || 0).toFixed(4)}/1K
                                {hasOverride && (
                                  <span style={{ color: 'var(--green)', marginLeft: '6px', fontWeight: 700 }}>
                                    → ${(parseFloat(s.price_per_1k) * (1 - parseFloat(currentPct) / 100)).toFixed(4)}/1K
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <input
                                type="number"
                                min="0" max="100" step="0.5"
                                value={currentPct}
                                onChange={e => {
                                  const val = e.target.value;
                                  setSvcOverrides(prev => {
                                    const next = { ...prev };
                                    if (val === '') delete next[s.id];
                                    else next[s.id] = val;
                                    return next;
                                  });
                                }}
                                onBlur={e => saveServiceDiscount(s.id, e.target.value)}
                                placeholder="0"
                                style={{
                                  width: '60px', background: 'var(--bg2)',
                                  border: `1px solid ${hasOverride ? 'rgba(0,255,136,.3)' : 'var(--br)'}`,
                                  borderRadius: '6px', color: 'var(--text)',
                                  padding: '4px 6px', fontSize: '11px', textAlign: 'center',
                                  outline: 'none',
                                }}
                              />
                              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>%</span>
                              {hasOverride && (
                                <button
                                  onClick={() => {
                                    setSvcOverrides(prev => {
                                      const next = { ...prev };
                                      delete next[s.id];
                                      return next;
                                    });
                                    saveServiceDiscount(s.id, '');
                                  }}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#ff6b6b', fontSize: '12px', padding: '2px',
                                  }}
                                >✕</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {filteredServices.length > 200 && (
                        <div style={{ textAlign: 'center', padding: '10px', fontSize: '11px', color: 'var(--text3)' }}>
                          Showing first 200 — use search to filter
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Users with discounts summary table */}
      {usersWithDiscount.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="st">Active Discounts Summary</div>
          <div className="tblw">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Global Discount</th>
                  <th>Service Overrides</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersWithDiscount.map(u => {
                  const global   = getGlobalForUser(u.id);
                  const svcCount = discounts.filter(d => d.user_id === u.id && d.service_id !== null).length;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700, fontSize: '12px' }}>{u.full_name}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text3)' }}>{u.email}</td>
                      <td>
                        <span className={`bdg ${u.role === 'reseller' ? 'b-reseller' : 'b-buyer'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ color: global ? 'var(--green)' : 'var(--text3)', fontWeight: global ? 700 : 400, fontSize: '12px' }}>
                        {global ? `${global.discount_pct}%` : '—'}
                        {global?.note && <span style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' }}>({global.note})</span>}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {svcCount > 0
                          ? <span style={{ color: 'var(--neon)', fontWeight: 700 }}>{svcCount} services</span>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td>
                        <button
                          onClick={() => { setSelUser(u); setTab('global'); window.scrollTo(0, 0); }}
                          className="btn bgh bsm"
                          style={{ fontSize: '10px' }}
                        >
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

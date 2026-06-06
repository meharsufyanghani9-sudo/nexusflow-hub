import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────
// Toast notification
// ─────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null;
  const bg     = type === 'error' ? 'rgba(255,50,80,.10)'           : 'rgba(0,255,136,.08)';
  const border = type === 'error' ? '1px solid rgba(255,50,80,.25)' : '1px solid rgba(0,255,136,.25)';
  const color  = type === 'error' ? '#ff6b6b'                       : 'var(--green)';
  return (
    <div style={{ background: bg, border, borderRadius: '8px', padding: '11px 14px',
      color, fontWeight: 700, fontSize: '12px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '8px' }}>
      {type === 'error' ? '❌' : '✅'} {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stage Badge
// ─────────────────────────────────────────────────────────
function StageBadge({ label, color }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
      background: `${color}18`, color, border: `1px solid ${color}30`,
      textTransform: 'uppercase' }}>{label}</span>
  );
}

// ─────────────────────────────────────────────────────────
// SERVICE PICKER MODAL
// Used for Stage 1: link services to a platform
// ─────────────────────────────────────────────────────────
function ServicePickerModal({
  title,
  allServices,
  alreadyLinked,
  onSave,
  onClose,
  customPrices,
  onSavePrices,
}) {
  const [tab,           setTab]           = useState('services');
  const [search,        setSearch]        = useState('');
  const [selected,      setSelected]      = useState(new Set(alreadyLinked));
  const [saving,        setSaving]        = useState(false);
  const [priceMode,     setPriceMode]     = useState('manual');
  const [bulkPercent,   setBulkPercent]   = useState('');
  const [bulkDirection, setBulkDirection] = useState('increase');
  const [priceEdits,    setPriceEdits]    = useState(() => {
    const m = new Map();
    for (const [k, v] of Object.entries(customPrices || {})) m.set(k, String(v));
    return m;
  });
  const [savingPrices, setSavingPrices] = useState(false);

  const filtered = allServices.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.name     || '').toLowerCase().includes(q) ||
           (s.platform || '').toLowerCase().includes(q) ||
           String(s.provider_service_id || '').includes(q);
  });

  const toggle           = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllVisible = () => setSelected(prev => { const n = new Set(prev); filtered.forEach(s => n.add(s.id)); return n; });
  const clearAllVisible  = () => setSelected(prev => { const n = new Set(prev); filtered.forEach(s => n.delete(s.id)); return n; });
  const selectAllInList  = () => setSelected(new Set(allServices.map(s => s.id)));
  const clearAll         = () => setSelected(new Set());

  const handleSave = async () => {
    setSaving(true);
    const added   = [];
    const removed = [];
    for (const id of selected)      { if (!alreadyLinked.has(id)) added.push(id); }
    for (const id of alreadyLinked) { if (!selected.has(id))      removed.push(id); }
    await onSave(added, removed);
    setSaving(false);
  };

  const setPrice = (serviceId, val) => setPriceEdits(prev => { const m = new Map(prev); m.set(serviceId, val); return m; });

  const applyBulkPercent = () => {
    const pct = parseFloat(bulkPercent);
    if (!pct || isNaN(pct)) return;
    const inFilter = allServices.filter(s => selected.has(s.id));
    setPriceEdits(prev => {
      const m = new Map(prev);
      for (const s of inFilter) {
        const base = parseFloat(customPrices?.[s.id] != null ? customPrices[s.id] : s.price_per_1k) || 0;
        const newP = bulkDirection === 'increase' ? base * (1 + pct / 100) : base * (1 - pct / 100);
        m.set(s.id, Math.max(0, newP).toFixed(6));
      }
      return m;
    });
  };

  const handleSavePrices = async () => {
    setSavingPrices(true);
    const finalMap = new Map();
    for (const [k, v] of priceEdits) {
      const num = parseFloat(v);
      if (!isNaN(num) && num > 0) finalMap.set(k, num);
    }
    await onSavePrices(finalMap);
    setSavingPrices(false);
  };

  const servicesInFilter = allServices.filter(s => selected.has(s.id));

  return (
    <div className="mlay" onClick={onClose} style={{ zIndex: 800 }}>
      <div className="mbox" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '580px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '14px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{title}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
              {selected.size} service{selected.size !== 1 ? 's' : ''} selected out of {allServices.length} available
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer',
              fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexShrink: 0 }}>
          <button className={`btn bsm ${tab === 'services' ? 'bp' : 'bgh'}`}
            onClick={() => setTab('services')} style={{ flex: 1 }}>
            📋 Select Services
          </button>
          <button className={`btn bsm ${tab === 'prices' ? 'bp' : 'bgh'}`}
            onClick={() => setTab('prices')} style={{ flex: 1 }}>
            💹 Edit Prices
          </button>
        </div>

        {tab === 'services' && (
          <>
            <div style={{ marginBottom: '8px', flexShrink: 0 }}>
              <input className="srch-inp" style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="🔍 Search by name, platform or service ID..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: '5px', marginBottom: '10px', flexShrink: 0,
            }}>
              <button className="btn bgh bsm" onClick={selectAllVisible}>✅ Visible ({filtered.length})</button>
              <button className="btn bgh bsm" onClick={clearAllVisible}>❌ Clear Visible</button>
              <button className="btn bgh bsm" onClick={selectAllInList}>✅ All ({allServices.length})</button>
              <button className="btn bgh bsm" onClick={clearAll}>🗑 Clear All</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>No services found</div>
              ) : (
                filtered.map(s => {
                  const isOn      = selected.has(s.id);
                  const hasCustom = customPrices?.[s.id] != null;
                  return (
                    <div key={s.id} onClick={() => toggle(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 12px', borderRadius: '8px', marginBottom: '4px',
                        cursor: 'pointer', transition: 'all .12s',
                        background: isOn ? 'rgba(0,212,255,.07)' : 'rgba(0,0,0,.2)',
                        border: `1px solid ${isOn ? 'rgba(0,212,255,.3)' : 'var(--br)'}`,
                      }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                        border: `2px solid ${isOn ? 'var(--neon)' : 'var(--br2)'}`,
                        background: isOn ? 'var(--neon)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', color: '#000', fontWeight: 900,
                      }}>
                        {isOn ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text3)' }}>
                          {s.platform}
                          {s.provider_service_id && (
                            <span style={{ marginLeft: '6px', color: 'var(--neon)', opacity: 0.6 }}>
                              ID: {s.provider_service_id}
                            </span>
                          )}
                          {' · '}
                          <span style={{ color: 'var(--gold)' }}>${parseFloat(s.price_per_1k).toFixed(4)}/1k</span>
                        </div>
                      </div>
                      {hasCustom && (
                        <span style={{ fontSize: '8px', color: 'var(--neon)',
                          background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.2)',
                          borderRadius: '4px', padding: '2px 5px', flexShrink: 0 }}>
                          Custom $
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <button className="btn bp blg bw" onClick={handleSave} disabled={saving} style={{ flexShrink: 0 }}>
              {saving ? '⏳ Saving...' : `💾 Save Selection (${selected.size} services)`}
            </button>
          </>
        )}

        {tab === 'prices' && (
          <>
            <div style={{ marginBottom: '12px', flexShrink: 0 }}>
              <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '7px',
                textTransform: 'uppercase', letterSpacing: '2px' }}>Price Edit Mode</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setPriceMode('manual')}
                  className={`btn bsm ${priceMode === 'manual' ? 'bp' : 'bgh'}`} style={{ flex: 1 }}>
                  ✏️ Manual (per service)
                </button>
                <button onClick={() => setPriceMode('percent')}
                  className={`btn bsm ${priceMode === 'percent' ? 'bp' : 'bgh'}`} style={{ flex: 1 }}>
                  📊 Bulk % Change
                </button>
              </div>
            </div>
            {priceMode === 'percent' && (
              <div style={{ padding: '12px 14px', borderRadius: '8px', marginBottom: '12px', flexShrink: 0,
                background: 'rgba(0,212,255,.04)', border: '1px solid rgba(0,212,255,.15)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px',
                  textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  Applies to all {servicesInFilter.length} selected services
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select className="sel" value={bulkDirection} onChange={e => setBulkDirection(e.target.value)} style={{ width: '120px' }}>
                    <option value="increase">📈 Increase</option>
                    <option value="decrease">📉 Decrease</option>
                  </select>
                  <input className="inp" type="number" placeholder="e.g. 10"
                    value={bulkPercent} onChange={e => setBulkPercent(e.target.value)} style={{ width: '90px' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>%</span>
                  <button className="btn bp bsm" onClick={applyBulkPercent}>⚡ Apply</button>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>
                  Example: 10% increase on $1.00 → $1.10 per 1k
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
              {servicesInFilter.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>
                  No services selected yet. Go to "Select Services" tab first.
                </div>
              ) : (
                servicesInFilter.map(s => {
                  const origPrice = parseFloat(s.price_per_1k).toFixed(6);
                  const editVal   = priceEdits.get(s.id) ?? '';
                  const hasCustom = customPrices?.[s.id] != null;
                  return (
                    <div key={s.id} style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                      background: 'rgba(0,0,0,.2)', border: '1px solid var(--br)' }}>
                      <div style={{ flex: 1, minWidth: 0, marginBottom: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                          Original: <span style={{ color: 'var(--gold)' }}>${origPrice}/1k</span>
                          {hasCustom && (
                            <span style={{ marginLeft: '8px', color: 'var(--neon)' }}>
                              Current custom: ${parseFloat(customPrices[s.id]).toFixed(6)}/1k
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0 }}>$ New Price</span>
                        <input className="inp" type="number" step="0.0001"
                          placeholder={origPrice} value={editVal}
                          onChange={e => setPrice(s.id, e.target.value)}
                          style={{ flex: 1, padding: '6px 10px' }} />
                        <span style={{ fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>/1k</span>
                        {editVal && <button className="btn bgh bsm" onClick={() => setPrice(s.id, '')}>↺</button>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <button className="btn bp blg bw" onClick={handleSavePrices} disabled={savingPrices} style={{ flexShrink: 0 }}>
              {savingPrices ? '⏳ Saving...' : '💾 Save Custom Prices'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// FILTER LINKER MODAL
// Used to link Stage 2 service types to a Stage 1 platform,
// or link Stage 3 filter types to a Stage 2 service type.
// allItems  = all available Stage 2 (or Stage 3) filter items
// linked    = Set of IDs currently linked to the parent
// ─────────────────────────────────────────────────────────
function FilterLinkerModal({ title, subtitle, allItems, linked, itemColor, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(linked));
  const [saving,   setSaving]   = useState(false);

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleSave = async () => {
    setSaving(true);
    const added   = [];
    const removed = [];
    for (const id of selected) { if (!linked.has(id)) added.push(id); }
    for (const id of linked)   { if (!selected.has(id)) removed.push(id); }
    await onSave(added, removed);
    setSaving(false);
  };

  return (
    <div className="mlay" onClick={onClose} style={{ zIndex: 850 }}>
      <div className="mbox" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '480px', width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{subtitle}</div>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px', flexShrink: 0 }}>×</button>
        </div>

        {/* Info box */}
        <div style={{
          padding: '8px 12px', borderRadius: '7px', marginBottom: '14px', flexShrink: 0,
          background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.15)',
          fontSize: '10px', color: 'var(--text3)', lineHeight: 1.6,
        }}>
          ✅ Checked items will appear in the marketplace when this filter is selected.<br/>
          ❌ Unchecked items will be hidden for this filter.
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px' }}>
          {allItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>
              No filters to link. Create some first using the + button.
            </div>
          ) : (
            allItems.map(item => {
              const isOn = selected.has(item.id);
              const color = item.color || itemColor || '#00d4ff';
              return (
                <div key={item.id} onClick={() => toggle(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '11px 14px', borderRadius: '9px', marginBottom: '6px',
                    cursor: 'pointer', transition: 'all .12s',
                    background: isOn ? `${color}12` : 'rgba(0,0,0,.2)',
                    border: `1.5px solid ${isOn ? color : 'var(--br)'}`,
                  }}>
                  {/* Checkbox */}
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                    border: `2px solid ${isOn ? color : 'var(--br2)'}`,
                    background: isOn ? color : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', color: '#000', fontWeight: 900,
                    transition: 'all .12s',
                  }}>
                    {isOn ? '✓' : ''}
                  </div>
                  {/* Icon + name */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                    background: `${color}18`, border: `1px solid ${color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px',
                  }}>
                    {item.icon || '⚙️'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: isOn ? 800 : 600, fontSize: '12px', color: isOn ? color : 'var(--text)' }}>
                      {item.name}
                    </div>
                    {item.slug && (
                      <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>
                        slug: {item.slug}
                      </div>
                    )}
                  </div>
                  {isOn && (
                    <span style={{
                      fontSize: '8px', fontWeight: 800, padding: '2px 7px', borderRadius: '8px',
                      background: `${color}20`, color, border: `1px solid ${color}40`,
                      textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0,
                    }}>
                      LINKED
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Quick select buttons */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexShrink: 0 }}>
          <button className="btn bgh bsm" style={{ flex: 1 }}
            onClick={() => setSelected(new Set(allItems.map(i => i.id)))}>
            ✅ Select All
          </button>
          <button className="btn bgh bsm" style={{ flex: 1 }}
            onClick={() => setSelected(new Set())}>
            🗑 Clear All
          </button>
        </div>

        <button className="btn bp blg bw" onClick={handleSave} disabled={saving} style={{ flexShrink: 0 }}>
          {saving ? '⏳ Saving...' : `💾 Save Links (${selected.size} linked)`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ADD FILTER MODAL
// ─────────────────────────────────────────────────────────
function FilterFormModal({ onSave, onClose, title }) {
  const [name,   setName]   = useState('');
  const [icon,   setIcon]   = useState('🌐');
  const [color,  setColor]  = useState('#00d4ff');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await onSave({ name: name.trim(), icon, color, slug });
    setSaving(false);
  };

  return (
    <div className="mlay" onClick={onClose} style={{ zIndex: 900 }}>
      <div className="mbox" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)', flex: 1 }}>{title}</div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px' }}>×</button>
        </div>
        <div className="fi">
          <label className="fl">Filter Name</label>
          <input className="inp" placeholder="e.g. TikTok" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="fi">
          <label className="fl">Icon (Emoji)</label>
          <input className="inp" placeholder="🎵" value={icon} onChange={e => setIcon(e.target.value)} />
        </div>
        <div className="fi">
          <label className="fl">Color (Hex)</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input className="inp" placeholder="#00d4ff" value={color}
              onChange={e => setColor(e.target.value)} style={{ flex: 1 }} />
            <input type="color"
              value={color.startsWith('#') && color.length === 7 ? color : '#00d4ff'}
              onChange={e => setColor(e.target.value)}
              style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px',
                cursor: 'pointer', background: 'none', padding: 0 }} />
          </div>
        </div>
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)',
          display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
            background: `${color}18`, border: `1.5px solid ${color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            {icon || '🌐'}
          </div>
          <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text)' }}>{name || 'Filter Name'}</div>
        </div>
        <button className="btn bp blg bw" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? '⏳ Saving...' : '💾 Save Filter'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// FILTER CARD
// ─────────────────────────────────────────────────────────
function FilterCard({ item, onDelete, onManageServices, onLinkFilters, serviceCount, linkedCount, isSpecial, isActive }) {
  const [hover, setHover] = useState(false);
  const color = item.color || '#00d4ff';

  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '4px', padding: '10px 6px', borderRadius: '12px',
        background: isActive ? `${color}22` : `${color}0d`,
        border: isActive ? `2.5px solid ${color}` : `1.5px solid ${color}30`,
        boxShadow: isActive ? `0 0 12px ${color}55` : 'none',
        transition: 'all .15s', minHeight: '80px', position: 'relative',
        userSelect: 'none',
      }}>
        <div style={{ fontSize: '22px' }}>{item.icon}</div>
        <div style={{ fontSize: '10px', fontWeight: isActive ? 900 : 700,
          color: isActive ? color : 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>
          {item.name}
        </div>

        {/* Service count badge */}
        {serviceCount != null && (
          <div style={{ fontSize: '9px', color, fontWeight: 600 }}>
            {serviceCount} svc{serviceCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Linked filter count badge */}
        {linkedCount != null && (
          <div style={{ fontSize: '8px', color: 'var(--text3)', fontWeight: 600 }}>
            {linkedCount} filter{linkedCount !== 1 ? 's' : ''} linked
          </div>
        )}

        {isActive && (
          <div style={{
            position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
            background: color, color: '#000', fontSize: '7px', fontWeight: 900,
            padding: '1px 6px', borderRadius: '6px', letterSpacing: '0.5px',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            SELECTED
          </div>
        )}

        {/* Hover actions */}
        {hover && !isSpecial && (
          <>
            {/* Delete button */}
            <button
              onClick={e => { e.stopPropagation(); onDelete(item); }}
              style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '20px', height: '20px', borderRadius: '50%',
                background: 'rgba(255,50,80,.9)', border: 'none',
                color: '#fff', fontSize: '10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, zIndex: 10, boxShadow: '0 2px 8px rgba(255,50,80,.4)',
              }}>×</button>
          </>
        )}
      </div>

      {/* Action buttons below card — always visible for non-special items */}
      {!isSpecial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
          {/* Manage services button */}
          {onManageServices && (
            <button
              onClick={() => onManageServices(item)}
              style={{
                width: '100%', padding: '4px 0', fontSize: '8px', fontWeight: 700,
                background: 'rgba(0,212,255,.08)', border: '1px solid rgba(0,212,255,.2)',
                borderRadius: '6px', color: 'var(--neon)', cursor: 'pointer',
                transition: 'all .12s',
              }}>
              📋 Services
            </button>
          )}
          {/* Link filters button */}
          {onLinkFilters && (
            <button
              onClick={() => onLinkFilters(item)}
              style={{
                width: '100%', padding: '4px 0', fontSize: '8px', fontWeight: 700,
                background: 'rgba(123,47,255,.08)', border: '1px solid rgba(123,47,255,.2)',
                borderRadius: '6px', color: '#b07eff', cursor: 'pointer',
                transition: 'all .12s',
              }}>
              🔗 Link Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────
export default function AdminManageFilters() {

  const [allServices, setAllServices] = useState([]);

  // Stage 1: Platforms
  const [platforms,          setPlatforms]          = useState([]);
  const [platformServiceMap, setPlatformServiceMap] = useState({});
  // platform_id → Set<service_type_id>  (which Stage 2 filters this platform shows)
  const [platformServiceTypeMap, setPlatformServiceTypeMap] = useState({});

  // Stage 2: Service Types
  const [serviceTypes,   setServiceTypes]   = useState([]);
  const [serviceTypeMap, setServiceTypeMap] = useState({});
  // service_type_id → Set<filter_type_id>  (which Stage 3 filters this service type shows)
  const [serviceTypeFilterTypeMap, setServiceTypeFilterTypeMap] = useState({});

  // Stage 3: Filter Types
  const [filterTypes,   setFilterTypes]   = useState([]);
  const [filterTypeMap, setFilterTypeMap] = useState({});

  // Custom prices
  const [customPrices, setCustomPrices] = useState({});

  // Active selection state (for card highlighting)
  const [activePlatformId,    setActivePlatformId]    = useState(null);
  const [activeServiceTypeId, setActiveServiceTypeId] = useState(null);
  const [activeFilterTypeId,  setActiveFilterTypeId]  = useState(null);

  // UI
  const [loading,         setLoading]         = useState(true);
  const [toast,           setToast]           = useState({ msg: '', type: 'success' });
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [searchStage1, setSearchStage1] = useState('');
  const [searchStage2, setSearchStage2] = useState('');
  const [searchStage3, setSearchStage3] = useState('');
  const [addModal,     setAddModal]     = useState(null);
  const [pickerModal,  setPickerModal]  = useState(null);
  // linkerModal: { stage, item } — for linking Stage 2 to Stage 1, or Stage 3 to Stage 2
  const [linkerModal,  setLinkerModal]  = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  };

  // ── loadAll ───────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // All services
      const BATCH = 1000;
      let allSvc = [];
      let from   = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('services').select('*').eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allSvc = [...allSvc, ...data];
        if (data.length < BATCH) break;
        from += BATCH;
      }
      setAllServices(allSvc);

      // ── Helper: fetch ALL rows from a junction table with no row-count limit ──
      // Supabase default cap is 1000 rows per request. This loops until done.
      // optional=true means the table may not exist yet (new tables added by migration)
      // — in that case we silently return [] instead of crashing the whole page.
      const fetchAll = async (table, selectCols = '*', optional = false) => {
        const JB = 100000; // batch size — larger = fewer round trips
        let rows = [];
        let f    = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from(table).select(selectCols).range(f, f + JB - 1);
          if (error) {
            // If table doesn't exist yet and it's optional, return empty silently
            if (optional) return [];
            throw error;
          }
          if (!data || data.length === 0) break;
          rows = [...rows, ...data];
          if (data.length < JB) break;
          f += JB;
        }
        return rows;
      };

      // Stage 1: platforms (small table — no pagination needed)
      const { data: plats } = await supabase
        .from('filter_platforms').select('*').order('sort_order').order('created_at');
      setPlatforms(plats || []);

      // platform → services  (can exceed 1000 rows with many services)
      const platSvc = await fetchAll('filter_platform_services');
      const pm = {};
      platSvc.forEach(r => {
        if (!pm[r.platform_id]) pm[r.platform_id] = new Set();
        pm[r.platform_id].add(r.service_id);
      });
      setPlatformServiceMap(pm);

      // platform → linked service types (Stage 1 → Stage 2 direct links)
      // optional=true: table created by SQL migration — won't crash if not run yet
      const platStLinks = await fetchAll('filter_platform_service_types', '*', true);
      const pstm = {};
      platStLinks.forEach(r => {
        if (!pstm[r.platform_id]) pstm[r.platform_id] = new Set();
        pstm[r.platform_id].add(r.service_type_id);
      });
      setPlatformServiceTypeMap(pstm);

      // Stage 2: service types (small table — no pagination needed)
      const { data: svcTypes } = await supabase
        .from('filter_service_types').select('*').order('sort_order').order('created_at');
      setServiceTypes(svcTypes || []);

      // service type → services  (can exceed 1000 rows)
      const svcTypeSvc = await fetchAll('filter_service_type_services');
      const stm = {};
      svcTypeSvc.forEach(r => {
        if (!stm[r.service_type_id]) stm[r.service_type_id] = new Set();
        stm[r.service_type_id].add(r.service_id);
      });
      setServiceTypeMap(stm);

      // service type → linked filter types (Stage 2 → Stage 3 direct links)
      // optional=true: table created by SQL migration — won't crash if not run yet
      const stFtLinks = await fetchAll('filter_service_type_filter_types', '*', true);
      const stftm = {};
      stFtLinks.forEach(r => {
        if (!stftm[r.service_type_id]) stftm[r.service_type_id] = new Set();
        stftm[r.service_type_id].add(r.filter_type_id);
      });
      setServiceTypeFilterTypeMap(stftm);

      // Stage 3: filter types (small table — no pagination needed)
      const { data: ftypes } = await supabase
        .from('filter_types').select('*').order('sort_order').order('created_at');
      setFilterTypes(ftypes || []);

      // filter type → services  (can exceed 1000 rows)
      const ftypeSvc = await fetchAll('filter_type_services');
      const ftm = {};
      ftypeSvc.forEach(r => {
        if (!ftm[r.filter_type_id]) ftm[r.filter_type_id] = new Set();
        ftm[r.filter_type_id].add(r.service_id);
      });
      setFilterTypeMap(ftm);

      // Custom prices (can exceed 1000 rows)
      const priceRows = await fetchAll('service_custom_prices');
      const cp = {};
      priceRows.forEach(r => { cp[r.service_id] = r.custom_price; });
      setCustomPrices(cp);

    } catch (e) {
      // Only show error toast for real failures, not missing optional tables
      const msg = e.message || '';
      if (msg.includes('filter_platform_service_types') || msg.includes('filter_service_type_filter_types')) {
        // These tables need to be created via SQL migration — show a helpful warning instead
        setMigrationNeeded(true);
      } else {
        showToast('Failed to load: ' + msg, 'error');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Add filter ────────────────────────────────────────
  const handleAddFilter = async ({ name, icon, color, slug }) => {
    const stage = addModal?.stage;
    try {
      if (stage === 1) {
        const { error } = await supabase.from('filter_platforms')
          .insert({ name, icon, color, slug, sort_order: platforms.length });
        if (error) throw error;
      } else if (stage === 2) {
        const { error } = await supabase.from('filter_service_types')
          .insert({ name, icon, sort_order: serviceTypes.length, slug });
        if (error) throw error;
      } else if (stage === 3) {
        const { error } = await supabase.from('filter_types')
          .insert({ name, icon, sort_order: filterTypes.length, slug });
        if (error) throw error;
      }
      setAddModal(null);
      showToast('Filter added!');
      await loadAll();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // ── Delete filter ─────────────────────────────────────
  const handleDeleteFilter = async (stage, item) => {
    if (!window.confirm(`Delete "${item.name}"? All service links for this filter will also be removed.`)) return;
    try {
      if (stage === 1) {
        await supabase.from('filter_platforms').delete().eq('id', item.id);
        if (activePlatformId === item.id) setActivePlatformId(null);
      } else if (stage === 2) {
        await supabase.from('filter_service_types').delete().eq('id', item.id);
        if (activeServiceTypeId === item.id) setActiveServiceTypeId(null);
      } else if (stage === 3) {
        await supabase.from('filter_types').delete().eq('id', item.id);
        if (activeFilterTypeId === item.id) setActiveFilterTypeId(null);
      }
      showToast('Filter deleted!');
      await loadAll();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // ── Open service picker (links services to a filter) ──
  const openPicker = (stage, item) => {
    let poolServices  = [];
    let alreadyLinked = new Set();

    if (stage === 1) {
      setActivePlatformId(item.id);
      poolServices  = allServices;
      alreadyLinked = platformServiceMap[item.id] || new Set();
    } else if (stage === 2) {
      setActiveServiceTypeId(item.id);
      if (activePlatformId && platformServiceMap[activePlatformId]) {
        const allowedIds = platformServiceMap[activePlatformId];
        poolServices = allServices.filter(s => allowedIds.has(s.id));
      } else {
        const platformLinkedIds = new Set();
        Object.values(platformServiceMap).forEach(set => set.forEach(id => platformLinkedIds.add(id)));
        poolServices = platformLinkedIds.size > 0
          ? allServices.filter(s => platformLinkedIds.has(s.id))
          : allServices;
      }
      alreadyLinked = serviceTypeMap[item.id] || new Set();
    } else if (stage === 3) {
      setActiveFilterTypeId(item.id);
      if (activeServiceTypeId && serviceTypeMap[activeServiceTypeId]) {
        const allowedIds = serviceTypeMap[activeServiceTypeId];
        poolServices = allServices.filter(s => allowedIds.has(s.id));
      } else {
        const serviceTypeLinkedIds = new Set();
        Object.values(serviceTypeMap).forEach(set => set.forEach(id => serviceTypeLinkedIds.add(id)));
        poolServices = serviceTypeLinkedIds.size > 0
          ? allServices.filter(s => serviceTypeLinkedIds.has(s.id))
          : allServices;
      }
      alreadyLinked = filterTypeMap[item.id] || new Set();
    }

    setPickerModal({ stage, item, poolServices, alreadyLinked });
  };

  // ── Open filter linker ────────────────────────────────
  // stage=1 → link Stage 2 service types to this platform
  // stage=2 → link Stage 3 filter types to this service type
  const openLinker = (stage, item) => {
    if (stage === 1) {
      setActivePlatformId(item.id);
      setLinkerModal({ stage: 1, item });
    } else if (stage === 2) {
      setActiveServiceTypeId(item.id);
      setLinkerModal({ stage: 2, item });
    }
  };

  // ── Save service associations ─────────────────────────
  const handleSaveServices = async (addedIds, removedIds) => {
    const { stage, item } = pickerModal;
    try {
      if (stage === 1) {
        if (removedIds.length > 0)
          await supabase.from('filter_platform_services').delete().eq('platform_id', item.id).in('service_id', removedIds);
        if (addedIds.length > 0)
          await supabase.from('filter_platform_services').upsert(
            addedIds.map(sid => ({ platform_id: item.id, service_id: sid })),
            { onConflict: 'platform_id,service_id' }
          );
      } else if (stage === 2) {
        if (removedIds.length > 0)
          await supabase.from('filter_service_type_services').delete().eq('service_type_id', item.id).in('service_id', removedIds);
        if (addedIds.length > 0)
          await supabase.from('filter_service_type_services').upsert(
            addedIds.map(sid => ({ service_type_id: item.id, service_id: sid })),
            { onConflict: 'service_type_id,service_id' }
          );
      } else if (stage === 3) {
        if (removedIds.length > 0)
          await supabase.from('filter_type_services').delete().eq('filter_type_id', item.id).in('service_id', removedIds);
        if (addedIds.length > 0)
          await supabase.from('filter_type_services').upsert(
            addedIds.map(sid => ({ filter_type_id: item.id, service_id: sid })),
            { onConflict: 'filter_type_id,service_id' }
          );
      }
      showToast('Services saved!');
      setPickerModal(null);
      await loadAll();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // ── Save filter links (Stage 1→2 or Stage 2→3) ───────
  const handleSaveFilterLinks = async (addedIds, removedIds) => {
    const { stage, item } = linkerModal;
    try {
      if (stage === 1) {
        // Link service types to this platform
        if (removedIds.length > 0)
          await supabase.from('filter_platform_service_types')
            .delete().eq('platform_id', item.id).in('service_type_id', removedIds);
        if (addedIds.length > 0)
          await supabase.from('filter_platform_service_types').upsert(
            addedIds.map(stid => ({ platform_id: item.id, service_type_id: stid })),
            { onConflict: 'platform_id,service_type_id' }
          );
        showToast(`Stage 2 filters linked to "${item.name}"! Marketplace will now show only these service types when user selects this platform.`);
      } else if (stage === 2) {
        // Link filter types to this service type
        if (removedIds.length > 0)
          await supabase.from('filter_service_type_filter_types')
            .delete().eq('service_type_id', item.id).in('filter_type_id', removedIds);
        if (addedIds.length > 0)
          await supabase.from('filter_service_type_filter_types').upsert(
            addedIds.map(ftid => ({ service_type_id: item.id, filter_type_id: ftid })),
            { onConflict: 'service_type_id,filter_type_id' }
          );
        showToast(`Stage 3 filters linked to "${item.name}"! Marketplace will now show only these filter types when user selects this service type.`);
      }
      setLinkerModal(null);
      await loadAll();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // ── Save custom prices ────────────────────────────────
  const handleSavePrices = async (priceMap) => {
    try {
      for (const [serviceId, price] of priceMap) {
        await supabase.from('service_custom_prices').upsert(
          { service_id: serviceId, custom_price: price, updated_at: new Date().toISOString() },
          { onConflict: 'service_id' }
        );
      }
      const { data: prices } = await supabase.from('service_custom_prices').select('*');
      const cp = {};
      (prices || []).forEach(r => { cp[r.service_id] = r.custom_price; });
      setCustomPrices(cp);
      showToast('Custom prices saved!');
    } catch (e) {
      showToast('Error saving prices: ' + e.message, 'error');
    }
  };

  // ── Filtered search results ───────────────────────────
  const filteredPlatforms    = platforms.filter(p    => !searchStage1 || p.name.toLowerCase().includes(searchStage1.toLowerCase()));
  const filteredServiceTypes = serviceTypes.filter(st => !searchStage2 || st.name.toLowerCase().includes(searchStage2.toLowerCase()));
  const filteredFilterTypes  = filterTypes.filter(ft  => !searchStage3 || ft.name.toLowerCase().includes(searchStage3.toLowerCase()));

  const activePlatform    = platforms.find(p    => p.id === activePlatformId);
  const activeServiceType = serviceTypes.find(s  => s.id === activeServiceTypeId);
  const activeFilterType  = filterTypes.find(f   => f.id === activeFilterTypeId);

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)' }}>
        <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚙️</div>
        <div style={{ fontSize: '12px', letterSpacing: '2px' }}>
          Loading filter data... ({allServices.length} services so far)
        </div>
      </div>
    );
  }

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} />

      {/* ── SQL Migration needed banner ─────────────────── */}
      {migrationNeeded && (
        <div style={{
          padding: '14px 16px', borderRadius: '10px', marginBottom: '16px',
          background: 'rgba(255,170,0,.08)', border: '1.5px solid rgba(255,170,0,.35)',
        }}>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#ffaa00', marginBottom: '8px' }}>
            ⚠️ One-time SQL setup required
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '10px' }}>
            The <strong style={{ color: '#ffaa00' }}>🔗 Link Filters</strong> feature needs 2 new tables
            in your Supabase database. Run the SQL below once in your
            <strong> Supabase → SQL Editor</strong>, then refresh this page.
          </div>
          <div style={{
            background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,170,0,.2)',
            borderRadius: '8px', padding: '12px 14px', fontFamily: 'monospace',
            fontSize: '10px', color: '#e0e0e0', lineHeight: 1.8,
            userSelect: 'all', wordBreak: 'break-all',
          }}>
            {`CREATE TABLE IF NOT EXISTS filter_platform_service_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id uuid NOT NULL REFERENCES filter_platforms(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES filter_service_types(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(platform_id, service_type_id)
);

CREATE TABLE IF NOT EXISTS filter_service_type_filter_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_type_id uuid NOT NULL REFERENCES filter_service_types(id) ON DELETE CASCADE,
  filter_type_id uuid NOT NULL REFERENCES filter_types(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_type_id, filter_type_id)
);

ALTER TABLE filter_platform_service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE filter_service_type_filter_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_fpst" ON filter_platform_service_types FOR SELECT USING (true);
CREATE POLICY "read_stft" ON filter_service_type_filter_types FOR SELECT USING (true);
CREATE POLICY "write_fpst" ON filter_platform_service_types FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "write_stft" ON filter_service_type_filter_types FOR ALL USING (auth.role() = 'authenticated');`}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '8px' }}>
            💡 Tap and hold the SQL above to select all, then copy it into Supabase SQL Editor and click Run.
          </div>
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
            background: 'linear-gradient(135deg,var(--neon2),var(--purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}>🎛️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)' }}>Manage Filters</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
              Control exactly what users see at each stage of marketplace filtering
            </div>
          </div>
        </div>

        {/* How it works explanation */}
        <div style={{
          padding: '12px 14px', borderRadius: '8px', marginTop: '8px',
          background: 'rgba(0,212,255,.04)', border: '1px solid rgba(0,212,255,.15)',
          fontSize: '11px', color: 'var(--text3)', lineHeight: 1.8,
        }}>
          <strong style={{ color: 'var(--neon)', display: 'block', marginBottom: '4px' }}>
            🔗 How Filter Linking Works:
          </strong>
          <strong style={{ color: 'var(--text)' }}>Stage 1</strong> (Platform) →
          click <span style={{ color: '#b07eff', fontWeight: 700 }}>🔗 Link Filters</span> on a platform card
          to choose which <strong style={{ color: 'var(--text)' }}>Stage 2</strong> service types appear when that platform is selected.
          <br/>
          <strong style={{ color: 'var(--text)' }}>Stage 2</strong> (Service Type) →
          click <span style={{ color: '#b07eff', fontWeight: 700 }}>🔗 Link Filters</span> on a service type card
          to choose which <strong style={{ color: 'var(--text)' }}>Stage 3</strong> filter types appear when that service type is selected.
          <br/>
          <span style={{ color: 'var(--gold)', fontWeight: 700 }}>📋 Services</span> button on any card → assign which actual services belong to that filter.
        </div>
      </div>

      {/* Active context banner */}
      {(activePlatform || activeServiceType || activeFilterType) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(0,212,255,.06)', border: '1px solid rgba(0,212,255,.2)',
          fontSize: '11px',
        }}>
          <span style={{ color: 'var(--text3)', fontWeight: 600 }}>📍 Working in:</span>
          {activePlatform && (
            <span style={{
              padding: '3px 10px', borderRadius: '10px', fontWeight: 700,
              background: `${activePlatform.color || '#00d4ff'}20`,
              border: `1px solid ${activePlatform.color || '#00d4ff'}50`,
              color: activePlatform.color || '#00d4ff',
            }}>
              {activePlatform.icon} {activePlatform.name}
            </span>
          )}
          {activePlatform && activeServiceType && <span style={{ color: 'var(--text3)' }}>→</span>}
          {activeServiceType && (
            <span style={{
              padding: '3px 10px', borderRadius: '10px', fontWeight: 700,
              background: 'rgba(123,47,255,.2)', border: '1px solid rgba(123,47,255,.4)',
              color: '#b07eff',
            }}>
              {activeServiceType.icon} {activeServiceType.name}
            </span>
          )}
          {activeServiceType && activeFilterType && <span style={{ color: 'var(--text3)' }}>→</span>}
          {activeFilterType && (
            <span style={{
              padding: '3px 10px', borderRadius: '10px', fontWeight: 700,
              background: 'rgba(255,215,0,.12)', border: '1px solid rgba(255,215,0,.3)',
              color: 'var(--gold)',
            }}>
              {activeFilterType.icon} {activeFilterType.name}
            </span>
          )}
          <button
            onClick={() => { setActivePlatformId(null); setActiveServiceTypeId(null); setActiveFilterTypeId(null); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)',
              cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}>
            Clear selection
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* STAGE 1: SELECT PLATFORM                        */}
      {/* Each card has: 📋 Services + 🔗 Link Filters    */}
      {/* Link Filters → choose which Stage 2 appear      */}
      {/* ═══════════════════════════════════════════════ */}
      <div style={{ marginBottom: '28px' }}>
        <div className="st">
          <StageBadge label="Stage 1" color="#00d4ff" />
          &nbsp; Select Platform
          <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400, marginLeft: '8px' }}>
            — use 🔗 Link Filters to control which Stage 2 options appear per platform
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input className="srch-inp" style={{ flex: 1 }}
            placeholder="🔍 Search platforms..."
            value={searchStage1} onChange={e => setSearchStage1(e.target.value)} />
          <button className="btn bp bsm"
            onClick={() => setAddModal({ stage: 1 })}
            style={{ flexShrink: 0, padding: '8px 16px', fontSize: '18px', lineHeight: 1 }}
            title="Add new platform filter">+</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
          {filteredPlatforms.map(item => (
            <FilterCard
              key={item.id}
              item={item}
              isSpecial={item.slug === 'everything'}
              isActive={item.id === activePlatformId}
              serviceCount={item.slug === 'everything' ? null : (platformServiceMap[item.id]?.size || 0)}
              linkedCount={item.slug === 'everything' ? null : (platformServiceTypeMap[item.id]?.size || 0)}
              onDelete={it => handleDeleteFilter(1, it)}
              onManageServices={item.slug === 'everything' ? null : it => openPicker(1, it)}
              onLinkFilters={item.slug === 'everything' ? null : it => openLinker(1, it)}
            />
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* STAGE 2: SELECT SERVICE TYPE                    */}
      {/* Each card has: 📋 Services + 🔗 Link Filters    */}
      {/* Link Filters → choose which Stage 3 appear      */}
      {/* ═══════════════════════════════════════════════ */}
      <div style={{ marginBottom: '28px' }}>
        <div className="st">
          <StageBadge label="Stage 2" color="#7b2fff" />
          &nbsp; Select Service
          <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400, marginLeft: '8px' }}>
            — use 🔗 Link Filters to control which Stage 3 options appear per service type
          </span>
          {activePlatform && (
            <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400, marginLeft: '8px' }}>
              · active context: {activePlatform.icon} {activePlatform.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input className="srch-inp" style={{ flex: 1 }}
            placeholder="🔍 Search service types..."
            value={searchStage2} onChange={e => setSearchStage2(e.target.value)} />
          <button className="btn bsm"
            onClick={() => setAddModal({ stage: 2 })}
            style={{ flexShrink: 0, padding: '8px 16px', fontSize: '18px', lineHeight: 1,
              background: 'var(--purple)', color: '#fff', border: 'none',
              borderRadius: '7px', cursor: 'pointer' }}
            title="Add new service type filter">+</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
          {filteredServiceTypes.map(item => (
            <FilterCard
              key={item.id}
              item={{ ...item, color: '#7b2fff' }}
              isSpecial={item.slug === 'all'}
              isActive={item.id === activeServiceTypeId}
              serviceCount={item.slug === 'all' ? null : (serviceTypeMap[item.id]?.size || 0)}
              linkedCount={item.slug === 'all' ? null : (serviceTypeFilterTypeMap[item.id]?.size || 0)}
              onDelete={it => handleDeleteFilter(2, it)}
              onManageServices={item.slug === 'all' ? null : it => openPicker(2, it)}
              onLinkFilters={item.slug === 'all' ? null : it => openLinker(2, it)}
            />
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* STAGE 3: FILTER BY TYPE                         */}
      {/* Only 📋 Services button here — Stage 3 is the  */}
      {/* last stage, nothing to link forward to          */}
      {/* ═══════════════════════════════════════════════ */}
      <div style={{ marginBottom: '28px' }}>
        <div className="st">
          <StageBadge label="Stage 3" color="#ffd700" />
          &nbsp; Filter By Type
          {activeServiceType && (
            <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400, marginLeft: '8px' }}>
              — showing services for {activeServiceType.icon} {activeServiceType.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input className="srch-inp" style={{ flex: 1 }}
            placeholder="🔍 Search filter types..."
            value={searchStage3} onChange={e => setSearchStage3(e.target.value)} />
          <button
            onClick={() => setAddModal({ stage: 3 })}
            style={{ flexShrink: 0, padding: '8px 16px', fontSize: '18px', lineHeight: 1,
              background: 'linear-gradient(135deg,#b8860b,#ffd700)', color: '#000',
              fontWeight: 800, border: 'none', borderRadius: '7px', cursor: 'pointer' }}
            title="Add new filter type">+</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
          {filteredFilterTypes.map(item => (
            <FilterCard
              key={item.id}
              item={{ ...item, color: '#ffd700' }}
              isSpecial={item.slug === 'all'}
              isActive={item.id === activeFilterTypeId}
              serviceCount={item.slug === 'all' ? null : (filterTypeMap[item.id]?.size || 0)}
              linkedCount={null}
              onDelete={it => handleDeleteFilter(3, it)}
              onManageServices={item.slug === 'all' ? null : it => openPicker(3, it)}
              onLinkFilters={null}
            />
          ))}
        </div>
      </div>

      {/* Custom prices info bar */}
      {Object.keys(customPrices).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div className="st">💹 Active Custom Prices</div>
          <div style={{ padding: '12px 14px', borderRadius: '8px',
            background: 'rgba(255,215,0,.04)', border: '1px solid rgba(255,215,0,.15)',
            fontSize: '11px', color: 'var(--text3)' }}>
            <strong style={{ color: 'var(--gold)' }}>
              {Object.keys(customPrices).length} service{Object.keys(customPrices).length !== 1 ? 's' : ''}
            </strong> have custom prices set.
            Open any filter card → 📋 Services → Prices tab to edit.
          </div>
        </div>
      )}

      {/* ADD FILTER MODAL */}
      {addModal && (
        <FilterFormModal
          title={
            addModal.stage === 1 ? '➕ Add Platform Filter'
            : addModal.stage === 2 ? '➕ Add Service Type Filter'
            : '➕ Add Filter Type'
          }
          onSave={handleAddFilter}
          onClose={() => setAddModal(null)}
        />
      )}

      {/* SERVICE PICKER MODAL */}
      {pickerModal && (
        <ServicePickerModal
          title={
            pickerModal.stage === 1
              ? `📋 Services for "${pickerModal.item.name}" Platform`
              : pickerModal.stage === 2
              ? `📋 Services for "${pickerModal.item.name}" Type`
              : `📋 Services for "${pickerModal.item.name}" Filter`
          }
          allServices={pickerModal.poolServices}
          alreadyLinked={pickerModal.alreadyLinked}
          onSave={handleSaveServices}
          onClose={() => setPickerModal(null)}
          customPrices={customPrices}
          onSavePrices={handleSavePrices}
        />
      )}

      {/* FILTER LINKER MODAL */}
      {linkerModal && linkerModal.stage === 1 && (
        <FilterLinkerModal
          title={`🔗 Link Stage 2 Filters → "${linkerModal.item.name}"`}
          subtitle={`Choose which "Select Service" options appear when user clicks "${linkerModal.item.name}" in Stage 1`}
          allItems={serviceTypes.filter(st => st.slug !== 'all')}
          linked={platformServiceTypeMap[linkerModal.item.id] || new Set()}
          itemColor="#7b2fff"
          onSave={handleSaveFilterLinks}
          onClose={() => setLinkerModal(null)}
        />
      )}

      {linkerModal && linkerModal.stage === 2 && (
        <FilterLinkerModal
          title={`🔗 Link Stage 3 Filters → "${linkerModal.item.name}"`}
          subtitle={`Choose which "Filter by Type" options appear when user clicks "${linkerModal.item.name}" in Stage 2`}
          allItems={filterTypes.filter(ft => ft.slug !== 'all')}
          linked={serviceTypeFilterTypeMap[linkerModal.item.id] || new Set()}
          itemColor="#ffd700"
          onSave={handleSaveFilterLinks}
          onClose={() => setLinkerModal(null)}
        />
      )}
    </div>
  );
}

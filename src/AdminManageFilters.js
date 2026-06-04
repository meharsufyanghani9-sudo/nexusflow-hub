import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────
// Helper: show a small status toast
// ─────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null;
  const bg = type === 'error'
    ? 'rgba(255,50,80,.10)'
    : 'rgba(0,255,136,.08)';
  const border = type === 'error'
    ? '1px solid rgba(255,50,80,.25)'
    : '1px solid rgba(0,255,136,.25)';
  const color = type === 'error' ? '#ff6b6b' : 'var(--green)';
  return (
    <div style={{
      background: bg, border, borderRadius: '8px', padding: '11px 14px',
      color, fontWeight: 700, fontSize: '12px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '8px'
    }}>
      {type === 'error' ? '❌' : '✅'} {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stage badge
// ─────────────────────────────────────────────────────────
function StageBadge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
      background: `${color}18`, color, border: `1px solid ${color}30`,
      textTransform: 'uppercase'
    }}>{label}</span>
  );
}

// ─────────────────────────────────────────────────────────
// SERVICE PICKER MODAL
// Used in all three stages when admin taps a filter item
// ─────────────────────────────────────────────────────────
function ServicePickerModal({
  title,
  allServices,         // full pool of services to show
  alreadyLinked,       // Set of service IDs already in this filter
  onSave,             // fn(addedIds, removedIds)
  onClose,
  // Price edit props
  showPriceEdit,
  customPrices,        // map: service_id -> custom_price
  onSavePrices,        // fn(Map<service_id, price>)
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set(alreadyLinked));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('services'); // 'services' | 'prices'
  const [priceEdits, setPriceEdits] = useState(() => {
    const m = new Map();
    for (const [k, v] of Object.entries(customPrices || {})) {
      m.set(k, String(v));
    }
    return m;
  });
  const [priceMode, setPriceMode] = useState('manual'); // 'manual' | 'percent'
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkDirection, setBulkDirection] = useState('increase');
  const [savingPrices, setSavingPrices] = useState(false);

  const filtered = allServices.filter(s => {
    if (!search) return true;
    return (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.platform || '').toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(s => next.add(s.id));
      return next;
    });
  };

  const clearAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(s => next.delete(s.id));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const added = [];
    const removed = [];
    for (const id of selected) {
      if (!alreadyLinked.has(id)) added.push(id);
    }
    for (const id of alreadyLinked) {
      if (!selected.has(id)) removed.push(id);
    }
    await onSave(added, removed);
    setSaving(false);
  };

  const handleSetPriceForService = (serviceId, val) => {
    setPriceEdits(prev => {
      const m = new Map(prev);
      m.set(serviceId, val);
      return m;
    });
  };

  const handleApplyBulkPercent = () => {
    const pct = parseFloat(bulkPercent);
    if (!pct || isNaN(pct)) return;
    const servicesInFilter = allServices.filter(s => selected.has(s.id));
    setPriceEdits(prev => {
      const m = new Map(prev);
      for (const s of servicesInFilter) {
        const base = parseFloat(customPrices?.[s.id] ?? s.price_per_1k) || 0;
        const newPrice = bulkDirection === 'increase'
          ? base * (1 + pct / 100)
          : base * (1 - pct / 100);
        m.set(s.id, newPrice.toFixed(6));
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
        style={{ maxWidth: '560px', width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{title}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
              {selected.size} service{selected.size !== 1 ? 's' : ''} selected
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        {showPriceEdit && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexShrink: 0 }}>
            {['services', 'prices'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`btn bsm ${tab === t ? 'bp' : 'bgh'}`}
                style={{ flex: 1, textTransform: 'capitalize' }}>
                {t === 'services' ? '📋 Select Services' : '💹 Edit Prices'}
              </button>
            ))}
          </div>
        )}

        {tab === 'services' && (
          <>
            {/* Search + Select All */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexShrink: 0 }}>
              <input className="srch-inp" style={{ flex: 1 }}
                placeholder="🔍 Search services..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexShrink: 0 }}>
              <button className="btn bgh bsm" onClick={selectAll} style={{ flex: 1 }}>
                ✅ Select All ({filtered.length})
              </button>
              <button className="btn bgh bsm" onClick={clearAll} style={{ flex: 1 }}>
                ❌ Clear All
              </button>
            </div>

            {/* Service list */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px' }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>
                  No services found
                </div>
              ) : (
                filtered.map(s => {
                  const isOn = selected.has(s.id);
                  return (
                    <div key={s.id}
                      onClick={() => toggle(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '8px', marginBottom: '5px',
                        cursor: 'pointer', transition: 'all .15s',
                        background: isOn ? 'rgba(0,212,255,.07)' : 'rgba(0,0,0,.2)',
                        border: `1px solid ${isOn ? 'rgba(0,212,255,.3)' : 'var(--br)'}`,
                      }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                        border: `2px solid ${isOn ? 'var(--neon)' : 'var(--br2)'}`,
                        background: isOn ? 'var(--neon)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', color: '#000'
                      }}>
                        {isOn ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                          {s.platform} · ${parseFloat(s.price_per_1k).toFixed(4)}/1k
                        </div>
                      </div>
                      {customPrices?.[s.id] && (
                        <span style={{ fontSize: '9px', color: 'var(--gold)', background: 'rgba(255,215,0,.1)', border: '1px solid rgba(255,215,0,.2)', borderRadius: '4px', padding: '2px 5px' }}>
                          Custom Price
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Save */}
            <button className="btn bp blg bw" onClick={handleSave} disabled={saving} style={{ flexShrink: 0 }}>
              {saving ? '⏳ Saving...' : `💾 Save Selection (${selected.size} services)`}
            </button>
          </>
        )}

        {tab === 'prices' && showPriceEdit && (
          <>
            {/* Price Mode Toggle */}
            <div style={{ marginBottom: '12px', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '2px' }}>
                Price Edit Mode
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setPriceMode('manual')}
                  className={`btn bsm ${priceMode === 'manual' ? 'bp' : 'bgh'}`} style={{ flex: 1 }}>
                  ✏️ Manual
                </button>
                <button onClick={() => setPriceMode('percent')}
                  className={`btn bsm ${priceMode === 'percent' ? 'bp' : 'bgh'}`} style={{ flex: 1 }}>
                  📊 By Percent
                </button>
              </div>
            </div>

            {priceMode === 'percent' && (
              <div style={{
                padding: '12px', borderRadius: '8px', background: 'rgba(0,212,255,.05)',
                border: '1px solid rgba(0,212,255,.15)', marginBottom: '12px', flexShrink: 0
              }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  Bulk Percentage Change — applies to all {servicesInFilter.length} selected services
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <select className="sel" value={bulkDirection} onChange={e => setBulkDirection(e.target.value)} style={{ width: '110px' }}>
                    <option value="increase">📈 Increase</option>
                    <option value="decrease">📉 Decrease</option>
                  </select>
                  <input className="inp" type="number" placeholder="e.g. 10" value={bulkPercent}
                    onChange={e => setBulkPercent(e.target.value)} style={{ width: '90px' }} />
                  <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text3)', fontSize: '12px' }}>%</span>
                  <button className="btn bp bsm" onClick={handleApplyBulkPercent}>
                    ⚡ Apply
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>
                  Example: 10% increase on $1.00 → $1.10 per 1k
                </div>
              </div>
            )}

            {/* Individual price list */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px' }}>
              {servicesInFilter.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>
                  No services selected yet. Go to "Select Services" tab first.
                </div>
              ) : (
                servicesInFilter.map(s => {
                  const origPrice = parseFloat(s.price_per_1k).toFixed(6);
                  const editVal = priceEdits.get(s.id) ?? '';
                  const hasCustom = customPrices?.[s.id] != null;
                  return (
                    <div key={s.id} style={{
                      padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                      background: 'rgba(0,0,0,.2)', border: '1px solid var(--br)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            Original: <span style={{ color: 'var(--gold)' }}>${origPrice}/1k</span>
                            {hasCustom && (
                              <span style={{ marginLeft: '8px', color: 'var(--neon)' }}>
                                → Custom: ${parseFloat(customPrices[s.id]).toFixed(6)}/1k
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0 }}>New Price $</span>
                        <input className="inp" type="number" step="0.0001"
                          placeholder={origPrice}
                          value={editVal}
                          onChange={e => handleSetPriceForService(s.id, e.target.value)}
                          style={{ flex: 1, padding: '6px 10px' }} />
                        <span style={{ fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>/1k</span>
                        {editVal && (
                          <button className="btn bgh bsm" onClick={() => handleSetPriceForService(s.id, '')}>
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button className="btn bp blg bw" onClick={handleSavePrices} disabled={savingPrices} style={{ flexShrink: 0 }}>
              {savingPrices ? '⏳ Saving Prices...' : `💾 Save Custom Prices`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ADD/EDIT FILTER MODAL (for creating/editing filter items)
// ─────────────────────────────────────────────────────────
function FilterFormModal({ filter, onSave, onClose, title }) {
  const [name, setName] = useState(filter?.name || '');
  const [icon, setIcon] = useState(filter?.icon || '🌐');
  const [color, setColor] = useState(filter?.color || '#00d4ff');
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
            <input className="inp" placeholder="#00d4ff" value={color} onChange={e => setColor(e.target.value)} style={{ flex: 1 }} />
            <input type="color" value={color.startsWith('#') && color.length === 7 ? color : '#00d4ff'}
              onChange={e => setColor(e.target.value)}
              style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: 'none', padding: 0 }} />
          </div>
        </div>
        {/* Preview */}
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,.3)', border: '1px solid var(--br)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
            background: `${color}18`, border: `1.5px solid ${color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
          }}>{icon || '🌐'}</div>
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
// FILTER CARD (one pill/card in the filter grid)
// ─────────────────────────────────────────────────────────
function FilterCard({ item, onEdit, onDelete, onManageServices, serviceCount, isSpecial }) {
  const [showDel, setShowDel] = useState(false);
  const color = item.color || '#00d4ff';

  return (
    <div style={{ position: 'relative' }}
      onMouseLeave={() => setShowDel(false)}>
      <div
        onClick={() => !isSpecial && onManageServices(item)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '6px', padding: '12px 8px', borderRadius: '12px', cursor: isSpecial ? 'default' : 'pointer',
          background: `${color}0d`, border: `1.5px solid ${color}30`,
          transition: 'all .15s', minHeight: '80px', position: 'relative',
          userSelect: 'none',
        }}
        onMouseEnter={() => setShowDel(true)}
      >
        <div style={{ fontSize: '22px' }}>{item.icon}</div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>
          {item.name}
        </div>
        {serviceCount != null && (
          <div style={{ fontSize: '9px', color, fontWeight: 600 }}>
            {serviceCount} svc{serviceCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Delete button on hover */}
        {showDel && !isSpecial && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(item); }}
            style={{
              position: 'absolute', top: '-6px', right: '-6px',
              width: '20px', height: '20px', borderRadius: '50%',
              background: 'rgba(255,50,80,.85)', border: 'none',
              color: '#fff', fontSize: '10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, zIndex: 10, boxShadow: '0 2px 8px rgba(255,50,80,.4)'
            }}>×</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────
export default function AdminManageFilters() {
  // ── Data ──────────────────────────────────────────────
  const [allServices, setAllServices] = useState([]);

  // Stage 1: Platforms
  const [platforms, setPlatforms] = useState([]);
  const [platformServiceMap, setPlatformServiceMap] = useState({}); // platformId -> Set<serviceId>

  // Stage 2: Service Types
  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceTypeMap, setServiceTypeMap] = useState({}); // serviceTypeId -> Set<serviceId>

  // Stage 3: Filter Types
  const [filterTypes, setFilterTypes] = useState([]);
  const [filterTypeMap, setFilterTypeMap] = useState({}); // filterTypeId -> Set<serviceId>

  // Custom prices
  const [customPrices, setCustomPrices] = useState({}); // serviceId -> price

  // ── UI State ──────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: '', type: 'success' });
  const [searchStage1, setSearchStage1] = useState('');
  const [searchStage2, setSearchStage2] = useState('');
  const [searchStage3, setSearchStage3] = useState('');

  // Modals
  const [addModal, setAddModal] = useState(null); // { stage: 1|2|3 }
  const [pickerModal, setPickerModal] = useState(null);
  // { stage, item, poolServices, alreadyLinked }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  };

  // ── Load ──────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Load all services
      const BATCH = 1000;
      let allSvc = [];
      let from = 0;
      for (let page = 0; page < 10; page++) {
        const { data } = await supabase.from('services').select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(from, from + BATCH - 1);
        if (!data || data.length === 0) break;
        allSvc = [...allSvc, ...data];
        if (data.length < BATCH) break;
        from += BATCH;
      }
      setAllServices(allSvc);

      // Stage 1
      const { data: plats } = await supabase.from('filter_platforms')
        .select('*').order('sort_order').order('created_at');
      setPlatforms(plats || []);

      const { data: platSvc } = await supabase.from('filter_platform_services').select('*');
      const pm = {};
      (platSvc || []).forEach(r => {
        if (!pm[r.platform_id]) pm[r.platform_id] = new Set();
        pm[r.platform_id].add(r.service_id);
      });
      setPlatformServiceMap(pm);

      // Stage 2
      const { data: svcTypes } = await supabase.from('filter_service_types')
        .select('*').order('sort_order').order('created_at');
      setServiceTypes(svcTypes || []);

      const { data: svcTypeSvc } = await supabase.from('filter_service_type_services').select('*');
      const stm = {};
      (svcTypeSvc || []).forEach(r => {
        if (!stm[r.service_type_id]) stm[r.service_type_id] = new Set();
        stm[r.service_type_id].add(r.service_id);
      });
      setServiceTypeMap(stm);

      // Stage 3
      const { data: ftypes } = await supabase.from('filter_types')
        .select('*').order('sort_order').order('created_at');
      setFilterTypes(ftypes || []);

      const { data: ftypeSvc } = await supabase.from('filter_type_services').select('*');
      const ftm = {};
      (ftypeSvc || []).forEach(r => {
        if (!ftm[r.filter_type_id]) ftm[r.filter_type_id] = new Set();
        ftm[r.filter_type_id].add(r.service_id);
      });
      setFilterTypeMap(ftm);

      // Custom prices
      const { data: prices } = await supabase.from('service_custom_prices').select('*');
      const pm2 = {};
      (prices || []).forEach(r => { pm2[r.service_id] = r.custom_price; });
      setCustomPrices(pm2);

    } catch (e) {
      showToast('Failed to load filter data: ' + e.message, 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Add Filter ────────────────────────────────────────
  const handleAddFilter = async ({ name, icon, color, slug }) => {
    const stage = addModal?.stage;
    try {
      if (stage === 1) {
        const { error } = await supabase.from('filter_platforms').insert({ name, icon, color, slug, sort_order: platforms.length });
        if (error) throw error;
      } else if (stage === 2) {
        const { error } = await supabase.from('filter_service_types').insert({ name, icon, sort_order: serviceTypes.length, slug });
        if (error) throw error;
      } else if (stage === 3) {
        const { error } = await supabase.from('filter_types').insert({ name, icon, sort_order: filterTypes.length, slug });
        if (error) throw error;
      }
      setAddModal(null);
      showToast('Filter added successfully!');
      await loadAll();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // ── Delete Filter ─────────────────────────────────────
  const handleDeleteFilter = async (stage, item) => {
    if (!window.confirm(`Delete "${item.name}" filter? This will remove all service associations for this filter.`)) return;
    try {
      if (stage === 1) {
        await supabase.from('filter_platforms').delete().eq('id', item.id);
      } else if (stage === 2) {
        await supabase.from('filter_service_types').delete().eq('id', item.id);
      } else if (stage === 3) {
        await supabase.from('filter_types').delete().eq('id', item.id);
      }
      showToast('Filter deleted!');
      await loadAll();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // ── Open Service Picker ───────────────────────────────
  const openPicker = (stage, item) => {
    let poolServices = [];
    let alreadyLinked = new Set();

    if (stage === 1) {
      // All services in pool
      poolServices = allServices;
      alreadyLinked = platformServiceMap[item.id] || new Set();
    } else if (stage === 2) {
      // Pool = services that belong to ANY platform filter
      // (so admin only assigns services they already organized by platform)
      const allPlatformServiceIds = new Set();
      Object.values(platformServiceMap).forEach(set => {
        set.forEach(id => allPlatformServiceIds.add(id));
      });
      poolServices = allServices.filter(s => allPlatformServiceIds.has(s.id));
      if (poolServices.length === 0) poolServices = allServices; // fallback
      alreadyLinked = serviceTypeMap[item.id] || new Set();
    } else if (stage === 3) {
      // Pool = services that belong to ANY service type filter
      const allServiceTypeIds = new Set();
      Object.values(serviceTypeMap).forEach(set => {
        set.forEach(id => allServiceTypeIds.add(id));
      });
      poolServices = allServices.filter(s => allServiceTypeIds.has(s.id));
      if (poolServices.length === 0) poolServices = allServices;
      alreadyLinked = filterTypeMap[item.id] || new Set();
    }

    setPickerModal({ stage, item, poolServices, alreadyLinked });
  };

  // ── Save Service Associations ─────────────────────────
  const handleSaveServices = async (addedIds, removedIds) => {
    const { stage, item } = pickerModal;
    try {
      if (stage === 1) {
        if (removedIds.length > 0) {
          await supabase.from('filter_platform_services')
            .delete().eq('platform_id', item.id).in('service_id', removedIds);
        }
        if (addedIds.length > 0) {
          const rows = addedIds.map(sid => ({ platform_id: item.id, service_id: sid }));
          await supabase.from('filter_platform_services').upsert(rows, { onConflict: 'platform_id,service_id' });
        }
      } else if (stage === 2) {
        if (removedIds.length > 0) {
          await supabase.from('filter_service_type_services')
            .delete().eq('service_type_id', item.id).in('service_id', removedIds);
        }
        if (addedIds.length > 0) {
          const rows = addedIds.map(sid => ({ service_type_id: item.id, service_id: sid }));
          await supabase.from('filter_service_type_services').upsert(rows, { onConflict: 'service_type_id,service_id' });
        }
      } else if (stage === 3) {
        if (removedIds.length > 0) {
          await supabase.from('filter_type_services')
            .delete().eq('filter_type_id', item.id).in('service_id', removedIds);
        }
        if (addedIds.length > 0) {
          const rows = addedIds.map(sid => ({ filter_type_id: item.id, service_id: sid }));
          await supabase.from('filter_type_services').upsert(rows, { onConflict: 'filter_type_id,service_id' });
        }
      }
      showToast('Services saved!');
      setPickerModal(null);
      await loadAll();
    } catch (e) {
      showToast('Error saving: ' + e.message, 'error');
    }
  };

  // ── Save Custom Prices ────────────────────────────────
  const handleSavePrices = async (priceMap) => {
    try {
      for (const [serviceId, price] of priceMap) {
        await supabase.from('service_custom_prices').upsert(
          { service_id: serviceId, custom_price: price, updated_at: new Date().toISOString() },
          { onConflict: 'service_id' }
        );
      }
      // Reload custom prices
      const { data: prices } = await supabase.from('service_custom_prices').select('*');
      const pm = {};
      (prices || []).forEach(r => { pm[r.service_id] = r.custom_price; });
      setCustomPrices(pm);
      showToast('Custom prices saved! Marketplace will show these prices.');
    } catch (e) {
      showToast('Error saving prices: ' + e.message, 'error');
    }
  };

  // ── Filter pills filtered by search ──────────────────
  const filteredPlatforms = platforms.filter(p =>
    !searchStage1 || p.name.toLowerCase().includes(searchStage1.toLowerCase())
  );
  const filteredServiceTypes = serviceTypes.filter(st =>
    !searchStage2 || st.name.toLowerCase().includes(searchStage2.toLowerCase())
  );
  const filteredFilterTypes = filterTypes.filter(ft =>
    !searchStage3 || ft.name.toLowerCase().includes(searchStage3.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)' }}>
        <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚙️</div>
        Loading filter data...
      </div>
    );
  }

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} />

      {/* Page Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
            background: 'linear-gradient(135deg,var(--neon2),var(--purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
          }}>🎛️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)' }}>Manage Filters</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
              Control what users see in the Marketplace — 3 stages of filtering
            </div>
          </div>
        </div>

        {/* How it works info box */}
        <div style={{
          padding: '12px 14px', borderRadius: '8px', marginTop: '10px',
          background: 'rgba(0,212,255,.04)', border: '1px solid rgba(0,212,255,.15)',
          fontSize: '11px', color: 'var(--text3)', lineHeight: 1.7
        }}>
          <strong style={{ color: 'var(--neon)' }}>How it works:</strong> User picks a <strong style={{ color: 'var(--text)' }}>Platform</strong> (Stage 1) →
          sees services you added to that platform → picks a <strong style={{ color: 'var(--text)' }}>Service Type</strong> (Stage 2) →
          sees filtered services → picks a <strong style={{ color: 'var(--text)' }}>Filter Type</strong> (Stage 3) like Guaranteed or Non-Drop.
          <br />
          <strong style={{ color: 'var(--gold)' }}>Tap any filter card</strong> to add/remove services.
          <strong style={{ color: 'var(--gold)' }}> Hover over a card</strong> to see the delete (×) button.
        </div>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* STAGE 1: SELECT PLATFORM                        */}
      {/* ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <div className="st">
          <StageBadge label="Stage 1" color="#00d4ff" />
          &nbsp; Select Platform
        </div>

        {/* Search + Add */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input className="srch-inp" style={{ flex: 1 }}
            placeholder="🔍 Search platforms..."
            value={searchStage1} onChange={e => setSearchStage1(e.target.value)} />
          <button className="btn bp bsm"
            onClick={() => setAddModal({ stage: 1 })}
            style={{ flexShrink: 0, padding: '8px 14px', fontSize: '16px', lineHeight: 1 }}
            title="Add new platform filter">
            +
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
          gap: '8px'
        }}>
          {filteredPlatforms.map(item => {
            const isSpecial = item.slug === 'everything';
            return (
              <FilterCard
                key={item.id}
                item={item}
                isSpecial={isSpecial}
                serviceCount={isSpecial ? null : (platformServiceMap[item.id]?.size || 0)}
                onDelete={(it) => handleDeleteFilter(1, it)}
                onManageServices={(it) => openPicker(1, it)}
                onEdit={() => {}}
              />
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* STAGE 2: SELECT SERVICE TYPE                    */}
      {/* ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <div className="st">
          <StageBadge label="Stage 2" color="#7b2fff" />
          &nbsp; Select Service
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input className="srch-inp" style={{ flex: 1 }}
            placeholder="🔍 Search service types..."
            value={searchStage2} onChange={e => setSearchStage2(e.target.value)} />
          <button className="btn bpu bsm"
            onClick={() => setAddModal({ stage: 2 })}
            style={{ flexShrink: 0, padding: '8px 14px', fontSize: '16px', lineHeight: 1 }}
            title="Add new service type filter">
            +
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
          gap: '8px'
        }}>
          {filteredServiceTypes.map(item => {
            const isSpecial = item.slug === 'all';
            return (
              <FilterCard
                key={item.id}
                item={{ ...item, color: '#7b2fff' }}
                isSpecial={isSpecial}
                serviceCount={isSpecial ? null : (serviceTypeMap[item.id]?.size || 0)}
                onDelete={(it) => handleDeleteFilter(2, it)}
                onManageServices={(it) => openPicker(2, it)}
                onEdit={() => {}}
              />
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* STAGE 3: FILTER BY TYPE                         */}
      {/* ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <div className="st">
          <StageBadge label="Stage 3" color="#ffd700" />
          &nbsp; Filter By Type
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input className="srch-inp" style={{ flex: 1 }}
            placeholder="🔍 Search filter types..."
            value={searchStage3} onChange={e => setSearchStage3(e.target.value)} />
          <button className="btn bsm"
            onClick={() => setAddModal({ stage: 3 })}
            style={{
              flexShrink: 0, padding: '8px 14px', fontSize: '16px', lineHeight: 1,
              background: 'linear-gradient(135deg,#b8860b,#ffd700)', color: '#000', fontWeight: 800,
              border: 'none', borderRadius: '7px', cursor: 'pointer'
            }}
            title="Add new filter type">
            +
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: '8px'
        }}>
          {filteredFilterTypes.map(item => {
            const isSpecial = item.slug === 'all';
            return (
              <FilterCard
                key={item.id}
                item={{ ...item, color: '#ffd700' }}
                isSpecial={isSpecial}
                serviceCount={isSpecial ? null : (filterTypeMap[item.id]?.size || 0)}
                onDelete={(it) => handleDeleteFilter(3, it)}
                onManageServices={(it) => openPicker(3, it)}
                onEdit={() => {}}
              />
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* INFO: Custom Price Overview                     */}
      {/* ─────────────────────────────────────────────── */}
      {Object.keys(customPrices).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div className="st">💹 Active Custom Prices</div>
          <div style={{
            padding: '12px 14px', borderRadius: '8px',
            background: 'rgba(255,215,0,.04)', border: '1px solid rgba(255,215,0,.15)',
            fontSize: '11px', color: 'var(--text3)'
          }}>
            <strong style={{ color: 'var(--gold)' }}>{Object.keys(customPrices).length} service{Object.keys(customPrices).length !== 1 ? 's' : ''}</strong> have custom prices set.
            These override both the default service price and the global API markup in Settings.
            To edit, open any filter card containing those services and go to the Prices tab.
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────── */}
      {/* MODALS                                          */}
      {/* ─────────────────────────────────────────────── */}
      {addModal && (
        <FilterFormModal
          filter={null}
          title={
            addModal.stage === 1 ? '➕ Add Platform Filter'
            : addModal.stage === 2 ? '➕ Add Service Type Filter'
            : '➕ Add Filter Type'
          }
          onSave={handleAddFilter}
          onClose={() => setAddModal(null)}
        />
      )}

      {pickerModal && (
        <ServicePickerModal
          title={
            pickerModal.stage === 1
              ? `📋 Services in "${pickerModal.item.name}" Platform`
              : pickerModal.stage === 2
              ? `📋 Services in "${pickerModal.item.name}" Service Type`
              : `📋 Services in "${pickerModal.item.name}" Filter`
          }
          allServices={pickerModal.poolServices}
          alreadyLinked={pickerModal.alreadyLinked}
          onSave={handleSaveServices}
          onClose={() => setPickerModal(null)}
          showPriceEdit={true}
          customPrices={customPrices}
          onSavePrices={handleSavePrices}
        />
      )}
    </div>
  );
}

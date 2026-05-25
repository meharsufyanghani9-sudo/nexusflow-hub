import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// AdminFilters.js
//
// This page lets the admin:
//  1. Create new custom filters (name, icon, color)
//  2. Delete filters
//  3. For each filter — add services to it or remove services from it
//
// HOW IT WORKS:
//  - Filters are stored in the "service_filters" table in Supabase.
//  - Each filter has a "service_ids" column which is a JSON array of service IDs.
//  - When a buyer clicks a custom filter in Marketplace, only services whose
//    ID is in that array are shown.
//
// SUPABASE TABLE YOU NEED TO CREATE:
//  Table name: service_filters
//  Columns:
//    id          - int8, primary key, auto-increment
//    name        - text (e.g. "Pakistan Special")
//    icon        - text (e.g. "🇵🇰") — optional emoji icon
//    color       - text (e.g. "#00d4ff") — hex color for the pill
//    service_ids - jsonb (default '[]') — array of service IDs in this filter
//    is_active   - bool (default true)
//    sort_order  - int4 (default 0) — lower number = shown first
//    created_at  - timestamptz (default now())
//
// RLS: Enable Row Level Security and add a policy:
//   SELECT: allow all (so buyers can see filters)
//   INSERT/UPDATE/DELETE: allow only authenticated admin users
// ─────────────────────────────────────────────────────────────────────────────

const emptyFilter = {
  name: '',
  icon: '🏷',
  color: '#00d4ff',
  sort_order: 0,
  is_active: true,
};

const colorOptions = [
  '#00d4ff', '#00ff88', '#ffd700', '#ff3355', '#7b2fff',
  '#ff9900', '#E1306C', '#1DA1F2', '#0088cc', '#4CAF50',
];

export default function AdminFilters() {
  const [filters, setFilters] = useState([]);
  const [services, setServices] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingServices, setLoadingServices] = useState(true);

  // Create/edit filter modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(emptyFilter);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Manage services modal
  const [manageFilter, setManageFilter] = useState(null); // filter object being managed
  const [serviceSearch, setServiceSearch] = useState('');
  const [servicePlatform, setServicePlatform] = useState('');
  const [manageSaving, setManageSaving] = useState(false);

  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadFilters();
    loadServices();
  }, []);

  // ─── Load filters ──────────────────────────────────────────────────────────
  const loadFilters = async () => {
    setLoadingFilters(true);
    const { data, error } = await supabase
      .from('service_filters')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      // Table probably doesn't exist yet
      setMsg('⚠️ Table "service_filters" not found. See setup instructions below.');
    } else {
      setFilters(data || []);
    }
    setLoadingFilters(false);
  };

  // ─── Load all services (for assigning to filters) ─────────────────────────
  const loadServices = async () => {
    setLoadingServices(true);
    const { data } = await supabase
      .from('services')
      .select('id, name, platform, category, is_active')
      .order('platform', { ascending: true })
      .order('name', { ascending: true });
    if (data) setServices(data);
    setLoadingServices(false);
  };

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  // ─── Create / Update filter ────────────────────────────────────────────────
  const saveFilter = async () => {
    if (!form.name.trim()) { showMsg('❌ Filter name is required'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      icon: form.icon || '🏷',
      color: form.color || '#00d4ff',
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from('service_filters').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('service_filters').insert({ ...payload, service_ids: [] }));
    }
    if (error) {
      showMsg('❌ Error: ' + error.message);
    } else {
      showMsg(editingId ? '✅ Filter updated!' : '✅ Filter created!');
      setShowCreateModal(false);
      setForm(emptyFilter);
      setEditingId(null);
      loadFilters();
    }
    setSaving(false);
  };

  const openEdit = (f) => {
    setForm({
      name: f.name,
      icon: f.icon || '🏷',
      color: f.color || '#00d4ff',
      sort_order: f.sort_order || 0,
      is_active: f.is_active !== false,
    });
    setEditingId(f.id);
    setShowCreateModal(true);
  };

  // ─── Delete filter ─────────────────────────────────────────────────────────
  const deleteFilter = async (id) => {
    if (!window.confirm('Delete this filter? Services will not be deleted — only the filter itself.')) return;
    await supabase.from('service_filters').delete().eq('id', id);
    showMsg('🗑 Filter deleted.');
    loadFilters();
  };

  // ─── Toggle filter active/inactive ────────────────────────────────────────
  const toggleActive = async (f) => {
    await supabase.from('service_filters').update({ is_active: !f.is_active }).eq('id', f.id);
    loadFilters();
  };

  // ─── Manage services in a filter ──────────────────────────────────────────
  const openManage = (f) => {
    setManageFilter({ ...f, service_ids: f.service_ids || [] });
    setServiceSearch('');
    setServicePlatform('');
  };

  const isInFilter = (serviceId) => {
    if (!manageFilter) return false;
    return (manageFilter.service_ids || []).includes(serviceId);
  };

  const toggleServiceInFilter = (serviceId) => {
    if (!manageFilter) return;
    const ids = manageFilter.service_ids || [];
    let newIds;
    if (ids.includes(serviceId)) {
      newIds = ids.filter(id => id !== serviceId);
    } else {
      newIds = [...ids, serviceId];
    }
    setManageFilter({ ...manageFilter, service_ids: newIds });
  };

  const saveFilterServices = async () => {
    if (!manageFilter) return;
    setManageSaving(true);
    const { error } = await supabase
      .from('service_filters')
      .update({ service_ids: manageFilter.service_ids })
      .eq('id', manageFilter.id);
    if (error) {
      showMsg('❌ Error saving: ' + error.message);
    } else {
      showMsg('✅ Services saved to filter!');
      setManageFilter(null);
      loadFilters();
    }
    setManageSaving(false);
  };

  const addAllFiltered = () => {
    if (!manageFilter) return;
    const toAdd = filteredServicesForManage.map(s => s.id);
    const existing = manageFilter.service_ids || [];
    const combined = [...new Set([...existing, ...toAdd])];
    setManageFilter({ ...manageFilter, service_ids: combined });
  };

  const removeAllFiltered = () => {
    if (!manageFilter) return;
    const toRemove = new Set(filteredServicesForManage.map(s => s.id));
    const newIds = (manageFilter.service_ids || []).filter(id => !toRemove.has(id));
    setManageFilter({ ...manageFilter, service_ids: newIds });
  };

  // Services shown in manage modal (filtered by search/platform)
  const filteredServicesForManage = services.filter(s => {
    const mSearch = !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase());
    const mPlat = !servicePlatform || s.platform === servicePlatform;
    return mSearch && mPlat;
  });

  const availablePlatforms = [...new Set(services.map(s => s.platform))].filter(Boolean);

  return (
    <div>
      {/* ─── MESSAGE ─────────────────────────────────────────────────── */}
      {msg && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: msg.startsWith('✅') ? 'rgba(0,255,136,.08)' : msg.startsWith('⚠️') ? 'rgba(255,184,0,.08)' : 'rgba(255,50,80,.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,.2)' : msg.startsWith('⚠️') ? 'rgba(255,184,0,.2)' : 'rgba(255,50,80,.2)'}`,
          color: msg.startsWith('✅') ? 'var(--green)' : msg.startsWith('⚠️') ? 'var(--warn)' : '#ff6b6b',
          fontWeight: 700, fontSize: '13px',
        }}>{msg}</div>
      )}

      {/* ─── SETUP INSTRUCTIONS ──────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px', borderRadius: '10px', marginBottom: '20px',
        background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.15)',
        fontSize: '12px', color: 'var(--text2)', lineHeight: 1.8,
      }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '10px', color: 'var(--neon)', letterSpacing: '2px', marginBottom: '8px' }}>
          📋 ONE-TIME SETUP — CREATE SUPABASE TABLE
        </div>
        Go to your <strong style={{ color: 'var(--gold)' }}>Supabase Dashboard → SQL Editor</strong> and run this SQL once:
        <div style={{
          marginTop: '10px', padding: '10px 12px', borderRadius: '7px',
          background: 'rgba(0,0,0,.4)', border: '1px solid var(--br)',
          fontFamily: 'monospace', fontSize: '11px', color: '#00ff88',
          overflowX: 'auto', whiteSpace: 'pre',
        }}>{`CREATE TABLE service_filters (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  icon text DEFAULT '🏷',
  color text DEFAULT '#00d4ff',
  service_ids jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  sort_order int4 DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Allow everyone to read filters (so marketplace works)
ALTER TABLE service_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read filters" ON service_filters FOR SELECT USING (true);
CREATE POLICY "Admin manage" ON service_filters FOR ALL USING (true);`}</div>
        After running the SQL, refresh this page and you can start creating filters.
      </div>

      {/* ─── STATS ───────────────────────────────────────────────────── */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '🏷', lb: 'Total Filters', vl: filters.length, cl: 'cn' },
          { ic: '✅', lb: 'Active Filters', vl: filters.filter(f => f.is_active).length, cl: 'cg' },
          { ic: '⏸', lb: 'Inactive', vl: filters.filter(f => !f.is_active).length, cl: 'cw' },
          { ic: '🛍', lb: 'Total Services', vl: services.length, cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* ─── ADD FILTER BUTTON ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
        <button className="btn bp bmd" onClick={() => { setForm(emptyFilter); setEditingId(null); setShowCreateModal(true); }}>
          + Create New Filter
        </button>
      </div>

      {/* ─── FILTER LIST ─────────────────────────────────────────────── */}
      {loadingFilters ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading filters...</div>
      ) : filters.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🏷</span>
          <div className="empty-tx">No custom filters yet</div>
          <div className="empty-sb">Create your first filter using the button above. Then add services to it.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filters.map(f => (
            <div key={f.id} className="card" style={{
              padding: '14px 16px',
              borderColor: f.is_active ? (f.color || 'var(--br)') + '40' : 'var(--br)',
              opacity: f.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {/* Color dot + name */}
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                  background: f.color || '#00d4ff',
                  boxShadow: `0 0 8px ${f.color || '#00d4ff'}60`,
                }} />
                <span style={{ fontSize: '18px' }}>{f.icon || '🏷'}</span>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{f.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                    {(f.service_ids || []).length} services assigned · Sort: {f.sort_order || 0}
                  </div>
                </div>

                {/* Status pill */}
                <span style={{
                  padding: '3px 8px', borderRadius: '12px', fontSize: '9px', fontWeight: 700,
                  background: f.is_active ? 'rgba(0,255,136,.1)' : 'rgba(255,50,80,.1)',
                  color: f.is_active ? 'var(--green)' : 'var(--danger)',
                  border: `1px solid ${f.is_active ? 'rgba(0,255,136,.25)' : 'rgba(255,50,80,.25)'}`,
                }}>
                  {f.is_active ? 'Active' : 'Hidden'}
                </span>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => openManage(f)}
                    className="btn bgh bsm"
                    style={{ fontSize: '10px' }}>
                    🛍 Manage Services
                  </button>
                  <button
                    onClick={() => openEdit(f)}
                    className="btn bgh bsm"
                    style={{ fontSize: '10px' }}>
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => toggleActive(f)}
                    style={{
                      padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '10px',
                      fontWeight: 700,
                      border: `1px solid ${f.is_active ? 'rgba(255,50,80,.3)' : 'rgba(0,255,136,.3)'}`,
                      background: f.is_active ? 'rgba(255,50,80,.08)' : 'rgba(0,255,136,.08)',
                      color: f.is_active ? 'var(--danger)' : 'var(--green)',
                    }}>
                    {f.is_active ? '⏸ Hide' : '▶ Show'}
                  </button>
                  <button
                    onClick={() => deleteFilter(f.id)}
                    className="btn bd bsm"
                    style={{ fontSize: '10px' }}>
                    🗑
                  </button>
                </div>
              </div>

              {/* Preview of services in this filter */}
              {(f.service_ids || []).length > 0 && (
                <div style={{
                  marginTop: '10px', paddingTop: '10px',
                  borderTop: '1px solid var(--br)',
                  fontSize: '10px', color: 'var(--text3)',
                }}>
                  <strong style={{ color: 'var(--text2)' }}>Services in filter:</strong>{' '}
                  {services
                    .filter(s => (f.service_ids || []).includes(s.id))
                    .slice(0, 5)
                    .map(s => s.name)
                    .join(' · ')}
                  {(f.service_ids || []).length > 5 && ` · +${(f.service_ids || []).length - 5} more`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── CREATE / EDIT FILTER MODAL ──────────────────────────────── */}
      {showCreateModal && (
        <div className="mlay" onClick={() => setShowCreateModal(false)}>
          <div className="mbox" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '13px', fontWeight: 700, color: 'var(--neon)' }}>
                {editingId ? '✏️ Edit Filter' : '➕ Create New Filter'}
              </div>
              <button onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px' }}>×</button>
            </div>

            <div className="fi">
              <label className="fl">Filter Name *</label>
              <input className="inp"
                placeholder="e.g. Pakistan Special, No Refill, Top Rated..."
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="fi">
                <label className="fl">Icon (emoji)</label>
                <input className="inp"
                  placeholder="🏷"
                  value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
              </div>
              <div className="fi">
                <label className="fl">Sort Order (lower = first)</label>
                <input className="inp" type="number"
                  placeholder="0"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </div>
            </div>

            <div className="fi">
              <label className="fl">Color</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {colorOptions.map(c => (
                  <div key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
                      background: c,
                      border: form.color === c ? '3px solid #fff' : '2px solid transparent',
                      boxShadow: form.color === c ? `0 0 10px ${c}` : 'none',
                      transition: '.15s',
                    }} />
                ))}
              </div>
              <input className="inp"
                placeholder="#00d4ff"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>

            {/* Preview */}
            <div style={{ marginBottom: '14px' }}>
              <label className="fl">Preview</label>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '20px',
                border: `1px solid ${form.color || '#00d4ff'}`,
                background: `${form.color || '#00d4ff'}18`,
                color: form.color || '#00d4ff',
                fontSize: '12px', fontWeight: 700,
              }}>
                {form.icon || '🏷'} {form.name || 'Filter Name'}
              </div>
            </div>

            <div className="fi" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <div
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  style={{
                    width: '38px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                    background: form.is_active ? 'var(--green)' : 'rgba(255,50,80,.3)',
                    position: 'relative', transition: '.2s', flexShrink: 0,
                  }}>
                  <div style={{
                    position: 'absolute', top: '3px', left: form.is_active ? '18px' : '3px',
                    width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: '.2s',
                  }} />
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
                  {form.is_active ? 'Active — visible in marketplace' : 'Hidden — not shown to buyers'}
                </span>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button className="btn bgh bmd" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn bp bmd" onClick={saveFilter} disabled={saving}>
                {saving ? '⏳ Saving...' : editingId ? '✅ Update' : '➕ Create Filter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MANAGE SERVICES MODAL ───────────────────────────────────── */}
      {manageFilter && (
        <div className="mlay" onClick={() => setManageFilter(null)}>
          <div className="mbox" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '92vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontFamily: 'var(--fd)', fontSize: '13px', fontWeight: 700, color: 'var(--neon)' }}>
                  🛍 Manage Services
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>
                  Filter: <span style={{ color: manageFilter.color || 'var(--neon)', fontWeight: 700 }}>
                    {manageFilter.icon} {manageFilter.name}
                  </span>
                  {' '}· {(manageFilter.service_ids || []).length} selected
                </div>
              </div>
              <button onClick={() => setManageFilter(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '22px' }}>×</button>
            </div>

            {/* Info box */}
            <div style={{
              padding: '10px 12px', borderRadius: '8px', marginBottom: '14px',
              background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.15)',
              fontSize: '11px', color: 'var(--text2)', lineHeight: 1.7,
            }}>
              ✅ = service IS in this filter (will show when buyer clicks this filter)
              <br />
              Tap the checkbox to add or remove a service from this filter.
              Click <strong style={{ color: 'var(--green)' }}>Save Changes</strong> when done.
            </div>

            {/* Search and platform filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input className="srch-inp" style={{ flex: 1 }}
                placeholder="Search services..."
                value={serviceSearch}
                onChange={e => setServiceSearch(e.target.value)} />
              <select className="sel" style={{ width: '130px', flexShrink: 0 }}
                value={servicePlatform}
                onChange={e => setServicePlatform(e.target.value)}>
                <option value="">All Platforms</option>
                {availablePlatforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Bulk add/remove filtered */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={addAllFiltered} style={{
                padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                fontWeight: 700, border: '1px solid rgba(0,255,136,.3)',
                background: 'rgba(0,255,136,.08)', color: 'var(--green)',
              }}>
                ✅ Add All Shown ({filteredServicesForManage.length})
              </button>
              <button onClick={removeAllFiltered} style={{
                padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
                fontWeight: 700, border: '1px solid rgba(255,50,80,.3)',
                background: 'rgba(255,50,80,.08)', color: 'var(--danger)',
              }}>
                🗑 Remove All Shown
              </button>
            </div>

            {/* Services list */}
            <div style={{ maxHeight: '380px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--br)' }}>
              {loadingServices ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>Loading services...</div>
              ) : filteredServicesForManage.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>No services found</div>
              ) : (
                filteredServicesForManage.map((s, i) => {
                  const inFilter = isInFilter(s.id);
                  return (
                    <div key={s.id}
                      onClick={() => toggleServiceInFilter(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px', cursor: 'pointer',
                        borderBottom: i < filteredServicesForManage.length - 1 ? '1px solid var(--br)' : 'none',
                        background: inFilter ? 'rgba(0,255,136,.04)' : 'transparent',
                        transition: '.15s',
                      }}>
                      {/* Checkbox */}
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                        border: `2px solid ${inFilter ? 'var(--green)' : 'var(--br2)'}`,
                        background: inFilter ? 'var(--green)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: '.15s',
                      }}>
                        {inFilter && <span style={{ fontSize: '11px', color: '#000', fontWeight: 900 }}>✓</span>}
                      </div>
                      {/* Service info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '12px', fontWeight: 700, color: 'var(--text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{s.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                          {s.platform}{s.category ? ` · ${s.category}` : ''}
                          {!s.is_active && <span style={{ color: 'var(--danger)', marginLeft: '6px' }}>Inactive</span>}
                        </div>
                      </div>
                      {inFilter && (
                        <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✅ In Filter</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Save button */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
              <button className="btn bgh bmd" onClick={() => setManageFilter(null)}>Cancel</button>
              <button className="btn bp bmd" onClick={saveFilterServices} disabled={manageSaving}>
                {manageSaving ? '⏳ Saving...' : `✅ Save Changes (${(manageFilter.service_ids || []).length} services)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

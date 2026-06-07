import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const platforms = [
  'instagram', 'tiktok', 'youtube', 'twitter', 'facebook',
  'telegram', 'snapchat', 'linkedin', 'spotify', 'discord', 'twitch', 'custom',
];

const empty = {
  name: '', description: '', platform: 'instagram',
  price_per_1k: '', min_qty: 100, max_qty: 10000,
  is_active: true, is_featured: false, has_refill: false, category: '',
  provider_id: '', provider_service_id: '', provider_api_url: '', provider_api_key: '',
};

export default function AdminServices({ user }) {
  const [services,       setServices]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [modal,          setModal]          = useState(false);
  const [form,           setForm]           = useState(empty);
  const [editing,        setEditing]        = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [msg,            setMsg]            = useState('');
  const [search,         setSearch]         = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');

  // Bulk selection state
  const [selected,       setSelected]       = useState(new Set());
  const [bulkActing,     setBulkActing]     = useState(false);
  const [showBulkMenu,   setShowBulkMenu]   = useState(false);

  useEffect(() => { loadServices(); }, []);

  // Close bulk menu when clicking elsewhere
  useEffect(() => {
    const close = () => setShowBulkMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const loadServices = async () => {
    setLoading(true);

    // FIX: was while(true) with no escape — now capped at 10 iterations
    // (covers up to 10,000 services; if your panel exceeds this, increase MAX_PAGES)
    const BATCH     = 1000;
    const MAX_PAGES = 10;
    let allData     = [];
    let from        = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + BATCH - 1);

      if (error || !data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < BATCH) break; // Last page — no more rows
      from += BATCH;
    }

    setServices(allData);
    setLoading(false);
    setSelected(new Set());
  };

  // Filtering
  const filtered = services.filter(s => {
    const mSearch = !search || (s.name || '').toLowerCase().includes(search.toLowerCase());
    const mPlat   = !filterPlatform || s.platform === filterPlatform;
    return mSearch && mPlat;
  });

  // Checkbox helpers
  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const someSelected        = selected.size > 0;

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(s => next.add(s.id));
        return next;
      });
    }
  };

  // Bulk Actions
  const selectedIds = [...selected];

  const bulkActivate = async () => {
    setBulkActing(true);
    await supabase.from('services').update({ is_active: true }).in('id', selectedIds);
    setMsg(`✅ ${selectedIds.length} service(s) activated.`);
    loadServices();
    setBulkActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const bulkDeactivate = async () => {
    setBulkActing(true);
    await supabase.from('services').update({ is_active: false }).in('id', selectedIds);
    setMsg(`✅ ${selectedIds.length} service(s) deactivated.`);
    loadServices();
    setBulkActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const bulkFeature = async () => {
    setBulkActing(true);
    await supabase.from('services').update({ is_featured: true }).in('id', selectedIds);
    setMsg(`⭐ ${selectedIds.length} service(s) marked as Featured.`);
    loadServices();
    setBulkActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const bulkUnfeature = async () => {
    setBulkActing(true);
    await supabase.from('services').update({ is_featured: false }).in('id', selectedIds);
    setMsg(`✅ ${selectedIds.length} service(s) removed from Featured.`);
    loadServices();
    setBulkActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected service(s)? This cannot be undone.`)) return;
    setBulkActing(true);
    await supabase.from('services').delete().in('id', selectedIds);
    setMsg(`🗑 ${selectedIds.length} service(s) deleted.`);
    loadServices();
    setBulkActing(false);
    setTimeout(() => setMsg(''), 3000);
  };

  // Individual Actions
  const openAdd = () => { setForm(empty); setEditing(null); setMsg(''); setModal(true); };

  const openEdit = (s) => {
    setForm({
      name:                s.name               || '',
      description:         s.description        || '',
      platform:            s.platform           || 'instagram',
      price_per_1k:        s.price_per_1k       || '',
      min_qty:             s.min_qty            || 100,
      max_qty:             s.max_qty            || 10000,
      is_active:           s.is_active          !== false,
      is_featured:         s.is_featured        || false,
      has_refill:          s.has_refill         || false,
      category:            s.category           || '',
      provider_id:         s.provider_id        || '',
      provider_service_id: s.provider_service_id|| '',
      provider_api_url:    s.provider_api_url   || '',
      provider_api_key:    s.provider_api_key   || '',
    });
    setEditing(s.id);
    setMsg('');
    setModal(true);
  };

  const saveService = async () => {
    if (!form.name || !form.price_per_1k) {
      setMsg('❌ Name and price are required.');
      return;
    }
    setSaving(true);
    const payload = {
      name:                form.name,
      description:         form.description,
      platform:            form.platform,
      price_per_1k:        parseFloat(form.price_per_1k),
      min_qty:             parseInt(form.min_qty, 10),
      max_qty:             parseInt(form.max_qty, 10),
      is_active:           form.is_active,
      is_featured:         form.is_featured,
      has_refill:          form.has_refill,
      category:            form.category,
      provider_id:         form.provider_id,
      provider_service_id: form.provider_service_id,
      provider_api_url:    form.provider_api_url,
      provider_api_key:    form.provider_api_key,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('services').update(payload).eq('id', editing));
    } else {
      ({ error } = await supabase.from('services').insert(payload));
    }

    if (error) {
      setMsg('❌ Error: ' + error.message);
    } else {
      setMsg(editing ? '✅ Service updated!' : '✅ Service added!');
      setModal(false);
      loadServices();
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const toggleActive = async (s) => {
    await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    loadServices();
  };

  const toggleFeatured = async (s) => {
    await supabase.from('services').update({ is_featured: !s.is_featured }).eq('id', s.id);
    loadServices();
  };

  const deleteService = async (id) => {
    if (!window.confirm('Delete this service? This cannot be undone.')) return;
    await supabase.from('services').delete().eq('id', id);
    loadServices();
    setMsg('🗑 Service deleted.');
    setTimeout(() => setMsg(''), 3000);
  };

  const stats = {
    total:    services.length,
    active:   services.filter(s => s.is_active).length,
    featured: services.filter(s => s.is_featured).length,
    inactive: services.filter(s => !s.is_active).length,
  };

  const Checkbox = ({ checked, onChange, indeterminate }) => (
    <div
      onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer',
        border: `2px solid ${checked || indeterminate ? 'var(--neon)' : 'var(--br2)'}`,
        background: checked ? 'var(--neon)' : indeterminate ? 'rgba(0,212,255,.3)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '.15s',
      }}
    >
      {checked     && <span style={{ fontSize: '10px', color: '#000',        fontWeight: 900, lineHeight: 1 }}>✓</span>}
      {!checked && indeterminate && <span style={{ fontSize: '10px', color: 'var(--neon)', fontWeight: 900, lineHeight: 1 }}>–</span>}
    </div>
  );

  // FIX Phase-19: component-level admin role guard — defence-in-depth on top
  // of App.js routing. Prevents any admin page from rendering its content if
  // the user object is missing or has a non-admin role (e.g. manipulated via
  // React DevTools). Must come after all hook declarations (Rules of Hooks).
  if (!user || user.role !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--danger)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>⛔</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 800, letterSpacing: '2px' }}>
          ACCESS DENIED
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
          Admin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg && !modal && (
        <div style={{
          background: msg.startsWith('✅') || msg.startsWith('⭐')
            ? 'rgba(0,255,136,.08)'
            : msg.startsWith('🗑')
            ? 'rgba(255,100,0,.08)'
            : 'rgba(255,50,80,.08)',
          border: `1px solid ${
            msg.startsWith('✅') || msg.startsWith('⭐')
            ? 'rgba(0,255,136,.2)'
            : msg.startsWith('🗑')
            ? 'rgba(255,100,0,.2)'
            : 'rgba(255,50,80,.2)'
          }`,
          borderRadius: '8px', padding: '12px', textAlign: 'center',
          color: msg.startsWith('✅') || msg.startsWith('⭐')
            ? 'var(--green)'
            : msg.startsWith('🗑') ? 'var(--gold)' : '#ff6b6b',
          fontWeight: 700, marginBottom: '16px', fontSize: '13px',
        }}>{msg}</div>
      )}

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '🛍',  lb: 'Total Services', vl: stats.total,    cl: 'cn'  },
          { ic: '✅', lb: 'Active',          vl: stats.active,   cl: 'cg'  },
          { ic: '⭐', lb: 'Featured',        vl: stats.featured, cl: 'cgo' },
          { ic: '❌', lb: 'Inactive',        vl: stats.inactive, cl: 'cd'  },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'rgba(0,212,255,.06)', border: '1px solid var(--br)',
        borderRadius: '10px', padding: '12px 14px', marginBottom: '16px',
        fontSize: '11px', color: 'var(--text2)', lineHeight: 1.8,
      }}>
        <strong style={{ color: 'var(--neon)' }}>⭐ Featured Services</strong> appear prominently on the Marketplace page.
        All other active services are hidden behind "Browse All".<br />
        <strong style={{ color: 'var(--gold)' }}>🔌 API-linked services</strong> automatically place orders with
        the provider the moment a user orders — no manual work needed.
      </div>

      {/* Search + Filter + Add */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input
          className="srch-inp"
          style={{ flex: 1, minWidth: '140px' }}
          placeholder="🔍 Search services..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="sel"
          style={{ width: '130px', flexShrink: 0 }}
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
        >
          <option value="">All Platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn bp bmd" onClick={openAdd}>+ Add Service</button>
      </div>

      {/* Bulk Action Bar */}
      {someSelected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
          background: 'rgba(0,212,255,.08)', border: '1px solid rgba(0,212,255,.25)',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--neon)', whiteSpace: 'nowrap' }}>
            {selected.size} selected
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={bulkActivate} disabled={bulkActing} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(0,255,136,.3)', background: 'rgba(0,255,136,.1)', color: 'var(--green)' }}>
              ✅ Activate
            </button>
            <button onClick={bulkDeactivate} disabled={bulkActing} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(255,50,80,.3)', background: 'rgba(255,50,80,.1)', color: '#ff6b6b' }}>
              ⏸ Deactivate
            </button>
            <button onClick={bulkFeature} disabled={bulkActing} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(255,200,0,.3)', background: 'rgba(255,200,0,.1)', color: 'var(--gold)' }}>
              ⭐ Feature
            </button>
            <button onClick={bulkUnfeature} disabled={bulkActing} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, border: '1px solid var(--br)', background: 'var(--gl)', color: 'var(--text3)' }}>
              ☆ Unfeature
            </button>
            <button onClick={bulkDelete} disabled={bulkActing} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(255,50,80,.5)', background: 'rgba(255,50,80,.15)', color: '#ff4455' }}>
              🗑 Delete All
            </button>
            <button onClick={() => setSelected(new Set())} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', border: '1px solid var(--br)', background: 'transparent', color: 'var(--text3)' }}>
              ✕ Clear
            </button>
          </div>
          {bulkActing && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Working...</span>}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          Loading services...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🛍</span>
          <div className="empty-tx">No services found</div>
          <div className="empty-sb">Add your first service or import from API Import</div>
        </div>
      ) : (
        <div className="tblw">
          <table>
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>
                  <Checkbox
                    checked={allFilteredSelected}
                    indeterminate={!allFilteredSelected && filtered.some(s => selected.has(s.id))}
                    onChange={toggleAll}
                  />
                </th>
                <th>Service</th>
                <th>Platform</th>
                <th>Price/1k</th>
                <th>Qty Range</th>
                <th>Featured</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ background: selected.has(s.id) ? 'rgba(0,212,255,.05)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <Checkbox
                      checked={selected.has(s.id)}
                      onChange={() => toggleOne(s.id)}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '13px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </div>
                    {s.category && (
                      <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{s.category}</div>
                    )}
                  </td>
                  <td>
                    <span style={{ textTransform: 'capitalize', fontSize: '11px', color: 'var(--neon)' }}>
                      {s.platform}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--fm)', color: 'var(--gold)', fontWeight: 700 }}>
                    ${parseFloat(s.price_per_1k || 0).toFixed(3)}
                  </td>
                  <td style={{ fontFamily: 'var(--fm)', fontSize: '10px', color: 'var(--text2)' }}>
                    {(s.min_qty || 0).toLocaleString()} – {(s.max_qty || 0).toLocaleString()}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleFeatured(s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', opacity: s.is_featured ? 1 : 0.3, transition: '.15s' }}
                    >
                      ⭐
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        onClick={() => toggleActive(s)}
                        style={{
                          width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer',
                          background: s.is_active ? 'var(--green)' : 'rgba(255,50,80,.3)',
                          position: 'relative', transition: '.2s', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '3px',
                          left: s.is_active ? '18px' : '3px',
                          width: '14px', height: '14px', borderRadius: '50%',
                          background: '#fff', transition: '.2s',
                        }} />
                      </div>
                      <span style={{ fontSize: '10px', color: s.is_active ? 'var(--green)' : 'var(--text3)' }}>
                        {s.is_active ? 'Live' : 'Off'}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: '10px', color: 'var(--text3)' }}>
                    {s.provider_api_url
                      ? <span style={{ color: 'var(--green)' }}>🔌 API Auto</span>
                      : s.provider_id
                      ? <span style={{ color: 'var(--gold)' }}>📦 {s.provider_id}</span>
                      : <span>Manual</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn bgh bsm" onClick={() => openEdit(s)}>✏️</button>
                      <button className="btn bd bsm"  onClick={() => deleteService(s.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="mlay" onClick={() => setModal(false)}>
          <div
            className="mbox"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '540px', overflowY: 'auto', maxHeight: '90vh', width: 'calc(100% - 20px)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '14px', fontWeight: 700, color: 'var(--neon)' }}>
                {editing ? '✏️ Edit Service' : '➕ Add New Service'}
              </div>
              <button
                onClick={() => setModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '20px' }}
              >×</button>
            </div>

            {msg && (
              <div style={{
                padding: '10px', borderRadius: '7px', marginBottom: '12px',
                fontSize: '12px', fontWeight: 700,
                background: msg.startsWith('✅') ? 'rgba(0,255,136,.1)' : 'rgba(255,50,80,.1)',
                color: msg.startsWith('✅') ? 'var(--green)' : '#ff6b6b',
              }}>{msg}</div>
            )}

            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
              Basic Info
            </div>

            <div className="fi">
              <label className="fl">Service Name *</label>
              <input
                className="inp"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Instagram Followers – Real & Fast"
              />
            </div>
            <div className="fi">
              <label className="fl">Description</label>
              <input
                className="inp"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description shown to buyers..."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="fi">
                <label className="fl">Platform *</label>
                <select
                  className="sel"
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                >
                  {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="fi">
                <label className="fl">Category</label>
                <input
                  className="inp"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Followers, Likes..."
                />
              </div>
            </div>

            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px', marginTop: '6px' }}>
              Pricing & Quantity
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div className="fi">
                <label className="fl">Price / 1000 ($) *</label>
                <input
                  className="inp"
                  type="number"
                  step="0.001"
                  value={form.price_per_1k}
                  onChange={e => setForm(f => ({ ...f, price_per_1k: e.target.value }))}
                  placeholder="1.50"
                />
              </div>
              <div className="fi">
                <label className="fl">Min Qty</label>
                <input
                  className="inp"
                  type="number"
                  value={form.min_qty}
                  onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))}
                />
              </div>
              <div className="fi">
                <label className="fl">Max Qty</label>
                <input
                  className="inp"
                  type="number"
                  value={form.max_qty}
                  onChange={e => setForm(f => ({ ...f, max_qty: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px', marginTop: '6px' }}>
              Visibility
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              {[
                { key: 'is_active',   label: '✅ Active',   desc: 'Visible to buyers on marketplace'         },
                { key: 'is_featured', label: '⭐ Featured', desc: 'Shown first with gold highlight'           },
                { key: 'has_refill',  label: '🔁 Refill',   desc: 'User can request refill after completion'  },
              ].map(opt => (
                <div
                  key={opt.key}
                  className="card"
                  style={{ padding: '12px', cursor: 'pointer' }}
                  onClick={() => setForm(f => ({ ...f, [opt.key]: !f[opt.key] }))}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                      border: `2px solid ${form[opt.key] ? 'var(--neon)' : 'var(--br2)'}`,
                      background: form[opt.key] ? 'var(--neon)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {form[opt.key] && <span style={{ fontSize: '10px', color: '#000', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>{opt.label}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text3)', paddingLeft: '24px' }}>{opt.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px', marginTop: '6px' }}>
              🔌 Provider API — Fully Automatic Orders
            </div>
            <div style={{
              background: 'rgba(0,255,136,.04)', border: '1px solid rgba(0,255,136,.12)',
              borderRadius: '8px', padding: '10px', marginBottom: '12px',
              fontSize: '10px', color: 'var(--text2)', lineHeight: 1.7,
            }}>
              Fill all 3 fields below to enable <strong style={{ color: 'var(--green)' }}>fully automatic</strong> order placement.
              When a buyer orders, the system instantly sends it to the provider — zero manual work.
              Leave blank for manual fulfillment.
            </div>

            <div className="fi">
              <label className="fl">Provider Name / ID</label>
              <input
                className="inp"
                value={form.provider_id}
                onChange={e => setForm(f => ({ ...f, provider_id: e.target.value }))}
                placeholder="e.g. jap, smmraja, peakerr"
              />
            </div>
            <div className="fi">
              <label className="fl">Provider Service ID</label>
              <input
                className="inp"
                value={form.provider_service_id}
                onChange={e => setForm(f => ({ ...f, provider_service_id: e.target.value }))}
                placeholder="The service ID from provider's panel (e.g. 1042)"
              />
            </div>
            <div className="fi">
              <label className="fl">Provider API URL</label>
              <input
                className="inp"
                value={form.provider_api_url}
                onChange={e => setForm(f => ({ ...f, provider_api_url: e.target.value }))}
                placeholder="https://provider.com/api/v2"
              />
            </div>
            <div className="fi">
              <label className="fl">Provider API Key</label>
              <input
                className="inp"
                type="password"
                value={form.provider_api_key}
                onChange={e => setForm(f => ({ ...f, provider_api_key: e.target.value }))}
                placeholder="Your API key from provider dashboard"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
              <button className="btn bgh bmd" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn bp bmd" onClick={saveService} disabled={saving}>
                {saving ? '⏳ Saving...' : editing ? '✅ Update Service' : '➕ Add Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

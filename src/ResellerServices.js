import React, { useState, useEffect } from 'react';
import { ConfirmModal, useConfirm } from './ConfirmModal';
import { supabase } from './supabase';

const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'telegram', 'snapchat', 'linkedin', 'custom'];
const platIc = {
  instagram: '📸', tiktok: '🎵', youtube: '▶️', twitter: '🐦',
  facebook: '👤', telegram: '✈️', snapchat: '👻', linkedin: '💼', custom: '⚙️',
};

const emptyForm = {
  name: '', platform: 'instagram', description: '',
  price_per_1k: '', min_qty: '100', max_qty: '10000',
  delivery_time: '1-6 hrs', is_active: true,
};

export default function ResellerServices({ user }) {
  const [services, setServices] = useState([]);

  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    setLoading(true);
    const { data } = await supabase.from('services')
      .select('*').eq('vendor_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setServices(data);
    setLoading(false);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openCreate = () => { setForm(emptyForm); setEditing(null); setMsg(''); setShowCreate(true); };
  const openEdit = (s) => {
    setForm({
      name: s.name || '', platform: s.platform || 'instagram',
      description: s.description || '', price_per_1k: s.price_per_1k || '',
      min_qty: s.min_qty || '100', max_qty: s.max_qty || '10000',
      delivery_time: s.delivery_time || '1-6 hrs', is_active: s.is_active !== false,
    });
    setEditing(s.id); setMsg(''); setShowCreate(true);
  };

  const saveService = async () => {
    if (!form.name || !form.price_per_1k) { setMsg('❌ Fill name and price'); return; }
    setSaving(true);
    const payload = {
      name: form.name, platform: form.platform, description: form.description,
      price_per_1k: parseFloat(form.price_per_1k),
      min_qty: parseInt(form.min_qty), max_qty: parseInt(form.max_qty),
      delivery_time: form.delivery_time, is_active: form.is_active,
      vendor_id: user.id,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('services').update(payload).eq('id', editing));
    } else {
      ({ error } = await supabase.from('services').insert(payload));
    }
    setSaving(false);
    if (error) { setMsg('❌ Error: ' + error.message); return; }
    setShowCreate(false);
    setEditing(null);
    setForm(emptyForm);
    loadServices();
  };

  const toggleActive = async (svc) => {
    await supabase.from('services').update({ is_active: !svc.is_active }).eq('id', svc.id);
    loadServices();
  };

  const deleteService = async (id) => {
    const ok = await confirm({ title:'Delete Service?', message:'This service will be permanently deleted.', confirmText:'Delete', confirmColor:'danger', icon:'🗑️' });
    if (!ok) return;
    await supabase.from('services').delete().eq('id', id);
    loadServices();
  };

  return (
    <div>
      <ConfirmModal
        {...confirmState}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div className="st" style={{ marginBottom: 0 }}>My Services</div>
        <button className="btn bp bmd" onClick={openCreate}>+ Create Service</button>
      </div>

      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '🛍', lb: 'Total Services', vl: services.length, cl: 'cn' },
          { ic: '✅', lb: 'Active', vl: services.filter(s => s.is_active).length, cl: 'cg' },
          { ic: '⏸', lb: 'Paused', vl: services.filter(s => !s.is_active).length, cl: 'cw' },
          { ic: '💰', lb: 'Avg Price', vl: services.length ? '$' + (services.reduce((a, b) => a + parseFloat(b.price_per_1k), 0) / services.length).toFixed(2) : '$0', cl: 'cgo' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading...</div>
      ) : services.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🏪</span>
          <div className="empty-tx">No services yet</div>
          <div className="empty-sb">Create your first service to start earning</div>
          <button className="btn bp bmd" style={{ marginTop: '14px' }} onClick={openCreate}>+ Create First Service</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {services.map(s => (
            <div key={s.id} className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>{platIc[s.platform] || '🌐'}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{s.platform} · {s.category}</div>
                    </div>
                  </div>
                  {s.description && (
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' }}>{s.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px' }}>
                    <span><span style={{ color: 'var(--text3)' }}>Price: </span><span style={{ color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700 }}>${parseFloat(s.price_per_1k || 0).toFixed(3)}/1k</span></span>
                    <span><span style={{ color: 'var(--text3)' }}>Min: </span>{(s.min_qty || 0).toLocaleString()}</span>
                    <span><span style={{ color: 'var(--text3)' }}>Max: </span>{(s.max_qty || 0).toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <div onClick={() => toggleActive(s)}
                    style={{ width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer', background: s.is_active ? 'var(--green)' : 'rgba(255,50,80,.3)', position: 'relative', transition: '.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '3px', left: s.is_active ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: '.2s' }} />
                  </div>
                  <button className="btn bgh bsm" onClick={() => openEdit(s)}>✏️</button>
                  <button className="btn bd bsm" onClick={() => deleteService(s.id)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setShowCreate(false)}>
          <div className="mbox" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', overflowY: 'auto', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="mttl">{editing ? '✏️ Edit Service' : '➕ Create Service'}</div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {msg && (
              <div style={{ padding: '10px', borderRadius: '7px', marginBottom: '12px', fontSize: '12px', fontWeight: 700,
                background: msg.startsWith('❌') ? 'rgba(255,50,80,.1)' : 'rgba(0,255,136,.1)',
                color: msg.startsWith('❌') ? '#ff6b6b' : 'var(--green)' }}>{msg}
              </div>
            )}

            <div className="fi">
              <label className="fl">Service Name *</label>
              <input className="inp" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Instagram Followers – Real" />
            </div>
            <div className="fi">
              <label className="fl">Description</label>
              <input className="inp" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="fi">
                <label className="fl">Platform</label>
                <select className="sel" value={form.platform} onChange={e => set('platform', e.target.value)}>
                  {platforms.map(p => <option key={p} value={p}>{platIc[p] || ''} {p}</option>)}
                </select>
              </div>
              <div className="fi">
                <label className="fl">Delivery Time</label>
                <input className="inp" value={form.delivery_time} onChange={e => set('delivery_time', e.target.value)} placeholder="1-6 hrs" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div className="fi">
                <label className="fl">Price/1000 ($) *</label>
                <input className="inp" type="number" step="0.001" value={form.price_per_1k} onChange={e => set('price_per_1k', e.target.value)} placeholder="1.50" />
              </div>
              <div className="fi">
                <label className="fl">Min Qty</label>
                <input className="inp" type="number" value={form.min_qty} onChange={e => set('min_qty', e.target.value)} />
              </div>
              <div className="fi">
                <label className="fl">Max Qty</label>
                <input className="inp" type="number" value={form.max_qty} onChange={e => set('max_qty', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'var(--gl)', border: '1px solid var(--br)', cursor: 'pointer' }}
              onClick={() => set('is_active', !form.is_active)}>
              <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: form.is_active ? 'var(--green)' : 'rgba(255,50,80,.3)', position: 'relative', transition: '.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '3px', left: form.is_active ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: '.2s' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Active — visible to buyers</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button className="btn bgh bmd" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn bp bmd" onClick={saveService} disabled={saving}>
                {saving ? '⏳ Saving...' : editing ? '✅ Update' : '➕ Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

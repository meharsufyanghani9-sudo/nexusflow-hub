import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const FILTER_TYPES = [
  { value: 'service_type', label: '🏷 Service Type (Followers, Likes, Views…)' },
  { value: 'quality',      label: '💎 Quality / Delivery Type (Guaranteed, Non-Drop…)' },
];

const emptyForm = {
  name: '', icon: '🏷', color: '#00d4ff',
  filter_type: 'service_type', is_active: true, sort_order: 0,
};

export default function AdminFilters() {
  const [filters, setFilters]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [msg, setMsg]             = useState('');
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [services, setServices]   = useState([]);
  const [selIds, setSelIds]       = useState(new Set());
  const [svcSearch, setSvcSearch] = useState('');

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    // Check if table exists
    const { error } = await supabase.from('service_filters').select('id').limit(1);
    if (error && error.code === '42P01') {
      setSetupNeeded(true);
      setLoading(false);
      return;
    }
    await loadFilters();
    const { data: svcs } = await supabase.from('services').select('id,name,platform').eq('is_active', true).order('name');
    if (svcs) setServices(svcs);
    setLoading(false);
  };

  const loadFilters = async () => {
    const { data } = await supabase.from('service_filters').select('*').order('sort_order');
    if (data) setFilters(data);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setSelIds(new Set());
    setModal(true);
  };

  const openEdit = (f) => {
    setEditing(f.id);
    setForm({ name: f.name, icon: f.icon||'🏷', color: f.color||'#00d4ff', filter_type: f.filter_type||'service_type', is_active: f.is_active, sort_order: f.sort_order||0 });
    setSelIds(new Set((f.service_ids||[]).map(String)));
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg('❌ Filter name is required'); return; }
    setSaving(true);
    const payload = { ...form, service_ids: [...selIds] };
    let error;
    if (editing) {
      ({ error } = await supabase.from('service_filters').update(payload).eq('id', editing));
    } else {
      ({ error } = await supabase.from('service_filters').insert(payload));
    }
    if (error) { setMsg('❌ ' + error.message); }
    else { setMsg(editing ? '✅ Filter updated!' : '✅ Filter created!'); setModal(false); loadFilters(); }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const deleteFilter = async (id) => {
    if (!window.confirm('Delete this filter?')) return;
    await supabase.from('service_filters').delete().eq('id', id);
    loadFilters();
  };

  const toggleActive = async (f) => {
    await supabase.from('service_filters').update({ is_active: !f.is_active }).eq('id', f.id);
    loadFilters();
  };

  const toggleSvc = (id) => {
    setSelIds(prev => {
      const n = new Set(prev);
      n.has(String(id)) ? n.delete(String(id)) : n.add(String(id));
      return n;
    });
  };

  const filteredSvcs = services.filter(s =>
    !svcSearch || s.name.toLowerCase().includes(svcSearch.toLowerCase()) || s.platform.toLowerCase().includes(svcSearch.toLowerCase())
  );

  const SQL_SETUP = `CREATE TABLE service_filters (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  icon text DEFAULT '🏷',
  color text DEFAULT '#00d4ff',
  filter_type text DEFAULT 'service_type',
  service_ids jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  sort_order int4 DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read filters" ON service_filters FOR SELECT USING (true);
CREATE POLICY "Admin manage" ON service_filters FOR ALL USING (true);`;

  if (loading) {
    return <div style={{ textAlign:'center', padding:'60px', color:'var(--text3)' }}>Loading...</div>;
  }

  if (setupNeeded) {
    return (
      <div>
        <div className="card" style={{ padding:'20px', marginBottom:'20px' }}>
          <div style={{ fontFamily:'var(--fd)', fontSize:'13px', color:'var(--gold)', letterSpacing:'2px', marginBottom:'10px' }}>
            🔧 ONE-TIME SETUP REQUIRED
          </div>
          <div style={{ fontSize:'12px', color:'var(--text2)', marginBottom:'14px', lineHeight:1.7 }}>
            Run this SQL once in your <strong style={{ color:'var(--neon)' }}>Supabase Dashboard → SQL Editor</strong>:
          </div>
          <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--green)', background:'rgba(0,0,0,.4)', padding:'14px', borderRadius:'8px', whiteSpace:'pre-wrap', marginBottom:'14px', cursor:'pointer', border:'1px solid rgba(0,255,136,.15)' }}
            onClick={() => { navigator.clipboard.writeText(SQL_SETUP); setMsg('📋 Copied!'); setTimeout(()=>setMsg(''),2000); }}>
            {SQL_SETUP}
            <div style={{ fontSize:'9px', color:'var(--text3)', marginTop:'8px' }}>📋 Tap to copy</div>
          </div>
          {msg && <div style={{ color:'var(--green)', fontWeight:700, marginBottom:'8px' }}>{msg}</div>}
          <button className="btn bp bmd" onClick={() => { setSetupNeeded(false); init(); }}>
            🔄 I've Run the SQL — Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.startsWith('✅')||msg.startsWith('📋') ? 'rgba(0,255,136,.08)' : 'rgba(255,50,80,.08)',
          border:`1px solid ${msg.startsWith('✅')||msg.startsWith('📋') ? 'rgba(0,255,136,.2)' : 'rgba(255,50,80,.2)'}`,
          borderRadius:'8px', padding:'12px', textAlign:'center',
          color: msg.startsWith('✅')||msg.startsWith('📋') ? 'var(--green)' : '#ff6b6b',
          fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>{msg}</div>
      )}

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'🏷', lb:'Total Filters', vl: filters.length, cl:'cn' },
          { ic:'✅', lb:'Active Filters', vl: filters.filter(f=>f.is_active).length, cl:'cg' },
          { ic:'⏸', lb:'Inactive', vl: filters.filter(f=>!f.is_active).length, cl:'cw' },
          { ic:'🛍', lb:'Total Services', vl: services.length, cl:'cn' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Help note */}
      <div style={{ background:'rgba(0,212,255,.05)', border:'1px solid rgba(0,212,255,.15)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px', fontSize:'12px', color:'var(--text2)', lineHeight:1.7 }}>
        <strong style={{ color:'var(--neon)' }}>How filters work:</strong> Create filters and assign services to them. Filters appear in the Marketplace as 3 stages:
        <br />1. <strong>Platform</strong> — auto-detected from service platforms
        <br />2. <strong>Service Type</strong> — you define (e.g. Followers, Likes, Views)
        <br />3. <strong>Quality/Type</strong> — you define (e.g. Guaranteed, Non-Drop, Budget)
      </div>

      <button className="btn bp bmd" style={{ marginBottom:'16px', width:'100%' }} onClick={openNew}>
        + Create New Filter
      </button>

      {/* Filter list */}
      {filters.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">🏷</span>
          <div className="empty-tx">No filters yet</div>
          <div className="empty-sb">Create your first filter above</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {filters.map(f => (
            <div key={f.id} className="card" style={{ padding:'14px', opacity: f.is_active ? 1 : 0.5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                <span style={{ fontSize:'20px' }}>{f.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, color:'var(--text)', fontSize:'14px' }}>{f.name}</div>
                  <div style={{ fontSize:'10px', color:'var(--text3)' }}>
                    {FILTER_TYPES.find(t=>t.value===f.filter_type)?.label || f.filter_type} · {(f.service_ids||[]).length} services
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px' }}>
                  <button className="btn bgh bsm" onClick={() => openEdit(f)}>✏️ Edit</button>
                  <button
                    onClick={() => toggleActive(f)}
                    style={{ padding:'5px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'11px', border:`1px solid ${f.is_active ? 'rgba(0,255,136,.3)' : 'rgba(255,200,0,.3)'}`, background: f.is_active ? 'rgba(0,255,136,.08)' : 'rgba(255,200,0,.08)', color: f.is_active ? 'var(--green)' : 'var(--gold)' }}>
                    {f.is_active ? '✅ On' : '⏸ Off'}
                  </button>
                  <button
                    onClick={() => deleteFilter(f.id)}
                    style={{ padding:'5px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'11px', border:'1px solid rgba(255,50,80,.3)', background:'rgba(255,50,80,.08)', color:'#ff6b6b' }}>
                    🗑
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                <span style={{ fontSize:'9px', padding:'2px 7px', borderRadius:'10px', background:`${f.color||'#00d4ff'}18`, color:f.color||'#00d4ff', border:`1px solid ${f.color||'#00d4ff'}30` }}>
                  {f.color}
                </span>
                <span style={{ fontSize:'9px', padding:'2px 7px', borderRadius:'10px', background:'rgba(255,255,255,.05)', color:'var(--text3)' }}>
                  Sort: {f.sort_order||0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── MODAL ─── */}
      {modal && (
        <div className="mlay" onClick={() => setModal(false)}>
          <div className="mbox" style={{ maxWidth:'480px', maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <div style={{ fontFamily:'var(--fd)', fontSize:'14px', color:'var(--neon)', letterSpacing:'2px' }}>
                {editing ? 'EDIT FILTER' : 'NEW FILTER'}
              </div>
              <button onClick={() => setModal(false)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:'22px' }}>×</button>
            </div>

            <div className="fi">
              <label className="fl">Filter Name *</label>
              <input className="inp" value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="e.g. Followers, Likes, Guaranteed…" />
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <div className="fi" style={{ flex:1 }}>
                <label className="fl">Icon (emoji)</label>
                <input className="inp" value={form.icon} onChange={e => setForm({...form, icon:e.target.value})} style={{ fontSize:'20px' }} />
              </div>
              <div className="fi" style={{ flex:1 }}>
                <label className="fl">Color</label>
                <input className="inp" type="color" value={form.color} onChange={e => setForm({...form, color:e.target.value})} style={{ padding:'4px', height:'40px' }} />
              </div>
            </div>
            <div className="fi">
              <label className="fl">Filter Type</label>
              <select className="sel" value={form.filter_type} onChange={e => setForm({...form, filter_type:e.target.value})}>
                {FILTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="fi">
              <label className="fl">Sort Order (lower = first)</label>
              <input className="inp" type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order:parseInt(e.target.value)||0})} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
              <label style={{ fontSize:'12px', color:'var(--text2)', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active:e.target.checked})} />
                Active (visible in marketplace)
              </label>
            </div>

            {/* Assign services */}
            <div style={{ fontFamily:'var(--fd)', fontSize:'11px', color:'var(--text3)', letterSpacing:'2px', marginBottom:'8px' }}>
              ASSIGN SERVICES ({selIds.size} selected)
            </div>
            <input className="srch-inp" style={{ marginBottom:'8px' }}
              placeholder="🔍 Search services..."
              value={svcSearch} onChange={e => setSvcSearch(e.target.value)} />
            <div style={{ maxHeight:'200px', overflowY:'auto', border:'1px solid var(--br)', borderRadius:'8px', padding:'8px', display:'flex', flexDirection:'column', gap:'4px' }}>
              {filteredSvcs.map(s => (
                <label key={s.id} style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', padding:'4px 6px', borderRadius:'6px', background: selIds.has(String(s.id)) ? 'rgba(0,212,255,.08)' : 'transparent', fontSize:'11px', color:'var(--text2)' }}>
                  <input type="checkbox" checked={selIds.has(String(s.id))} onChange={() => toggleSvc(s.id)} />
                  <span style={{ color:'var(--text3)', marginRight:'4px' }}>[{s.platform}]</span>
                  {s.name}
                </label>
              ))}
              {filteredSvcs.length === 0 && <div style={{ textAlign:'center', color:'var(--text3)', padding:'10px', fontSize:'11px' }}>No services found</div>}
            </div>

            <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
              <button className="btn bgh bmd" style={{ flex:1 }} onClick={() => setModal(false)}>Cancel</button>
              <button className="btn bp bmd" style={{ flex:2 }} onClick={save} disabled={saving}>
                {saving ? 'Saving...' : (editing ? '✅ Update Filter' : '+ Create Filter')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

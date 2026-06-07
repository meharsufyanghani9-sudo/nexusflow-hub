import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminTasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tasks');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title:'', description:'', icon:'⚡', reward:'1.00' });
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const { data: t } = await supabase.from('tasks').select('*').order('created_at', { ascending:false });
    const { data: s } = await supabase.from('task_submissions')
      .select('*, users(full_name, email), tasks(title, reward)')
      .order('created_at', { ascending:false });
    if (t) setTasks(t);
    if (s) setSubmissions(s);
    setLoading(false);
  };

  const createTask = async () => {
    if (!form.title || !form.reward) { alert('Fill title and reward'); return; }
    setSaving(true);
    await supabase.from('tasks').insert({
      title: form.title,
      description: form.description,
      icon: form.icon,
      reward: parseFloat(form.reward),
      is_active: true,
    });
    setSaving(false);
    setShowCreate(false);
    setForm({ title:'', description:'', icon:'⚡', reward:'1.00' });
    loadAll();
  };

  const toggleTask = async (t) => {
    await supabase.from('tasks').update({ is_active: !t.is_active }).eq('id', t.id);
    loadAll();
  };

  const deleteTask = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    loadAll();
  };

  const approveSubmission = async (sub) => {
    setActing(true);
    const reward = parseFloat(sub.tasks?.reward || 1);
    const { data: u } = await supabase.from('users').select('balance').eq('id', sub.user_id).single();
    if (u) {
      await supabase.from('users').update({ balance: parseFloat(u.balance) + reward }).eq('id', sub.user_id);
      await supabase.from('transactions').insert({
        user_id: sub.user_id, type:'task', amount: reward,
        description: `Task reward: ${sub.tasks?.title}`, ref_id:'TASK-'+Date.now(),
      });
    }
    await supabase.from('task_submissions').update({ status:'approved' }).eq('id', sub.id);
    setActing(false);
    loadAll();
    alert(`✅ Approved! $${reward} credited to user.`);
  };

  const rejectSubmission = async (sub) => {
    setActing(true);
    await supabase.from('task_submissions').update({ status:'rejected' }).eq('id', sub.id);
    setActing(false);
    loadAll();
  };

  const pending = submissions.filter(s => s.status === 'pending');

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
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📋', lb:'Total Tasks', vl:tasks.length, cl:'cn' },
          { ic:'✅', lb:'Active', vl:tasks.filter(t=>t.is_active).length, cl:'cg' },
          { ic:'⏳', lb:'Pending Review', vl:pending.length, cl:'cw' },
          { ic:'💰', lb:'Rewards Given', vl:submissions.filter(s=>s.status==='approved').length, cl:'cgo' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', flexWrap:'wrap', gap:'10px' }}>
        <div className="atbs" style={{ marginBottom:0, flex:1 }}>
          <button className={`atb ${tab==='tasks'?'on':''}`} onClick={() => setTab('tasks')}>Tasks</button>
          <button className={`atb ${tab==='submissions'?'on':''}`} onClick={() => setTab('submissions')}>
            Reviews {pending.length > 0 ? `(${pending.length})` : ''}
          </button>
        </div>
        {tab === 'tasks' && (
          <button className="btn bp bsm" onClick={() => setShowCreate(true)}>+ Create Task</button>
        )}
      </div>

      {tab === 'tasks' && (
        loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="empty">
            <span className="empty-ic">📋</span>
            <div className="empty-tx">No tasks created yet</div>
            <button className="btn bp bmd" style={{ marginTop:'14px' }} onClick={() => setShowCreate(true)}>+ Create First Task</button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {tasks.map(t => (
              <div key={t.id} className="card" style={{ padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'10px', flexWrap:'wrap' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                      <span style={{ fontSize:'20px' }}>{t.icon}</span>
                      <span style={{ fontWeight:700, fontSize:'14px' }}>{t.title}</span>
                      <span className={`bdg ${t.is_active ? 'b-completed' : 'b-pending'}`}>
                        {t.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'8px' }}>{t.description}</div>
                    <div style={{ fontSize:'12px', color:'var(--green)', fontWeight:700 }}>
                      Reward: +${parseFloat(t.reward).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button className="btn bgh bsm" onClick={() => toggleTask(t)}>
                      {t.is_active ? '⏸ Pause' : '▶ Activate'}
                    </button>
                    <button className="btn bd bsm" onClick={() => deleteTask(t.id)}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'submissions' && (
        loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
        ) : submissions.length === 0 ? (
          <div className="empty">
            <span className="empty-ic">📭</span>
            <div className="empty-tx">No submissions yet</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {submissions.map(s => (
              <div key={s.id} className="card" style={{ padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'10px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                      <span className={`bdg ${s.status==='approved'?'b-completed':s.status==='rejected'?'b-rejected':'b-pending'}`}>
                        {s.status}
                      </span>
                      <span style={{ fontSize:'12px', fontWeight:700 }}>{s.tasks?.title}</span>
                    </div>
                    <div style={{ fontWeight:600, marginBottom:'2px' }}>{s.users?.full_name}</div>
                    <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'6px' }}>{s.users?.email}</div>
                    <div style={{ fontSize:'11px', color:'var(--text2)', padding:'8px', borderRadius:'6px', background:'var(--gl)', border:'1px solid var(--br)', lineHeight:1.6 }}>
                      <strong style={{ color:'var(--text3)' }}>Proof:</strong> {s.proof}
                    </div>
                    <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'5px' }}>
                      {new Date(s.created_at).toLocaleString()} · Reward: <span style={{ color:'var(--green)' }}>${parseFloat(s.tasks?.reward||0).toFixed(2)}</span>
                    </div>
                  </div>
                  {s.status === 'pending' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                      <button className="btn bs bsm" onClick={() => approveSubmission(s)} disabled={acting}>
                        ✅ Approve
                      </button>
                      <button className="btn bd bsm" onClick={() => rejectSubmission(s)} disabled={acting}>
                        ❌ Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showCreate && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setShowCreate(false)}>
          <div className="mbox">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
              <div className="mttl">Create Task</div>
              <button onClick={() => setShowCreate(false)} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:'18px', cursor:'pointer' }}>✕</button>
            </div>
            <div className="fi">
              <label className="fl">Task Title</label>
              <input className="inp" placeholder="e.g. Follow us on Instagram"
                value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))} />
            </div>
            <div className="fi">
              <label className="fl">Description</label>
              <input className="inp" placeholder="What should the user do?"
                value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} />
            </div>
            <div className="fr">
              <div className="fi" style={{ marginBottom:0 }}>
                <label className="fl">Icon (emoji)</label>
                <input className="inp" placeholder="⚡"
                  value={form.icon} onChange={e => setForm(p=>({...p,icon:e.target.value}))} />
              </div>
              <div className="fi" style={{ marginBottom:0 }}>
                <label className="fl">Reward ($)</label>
                <input className="inp" type="number" placeholder="1.00"
                  value={form.reward} onChange={e => setForm(p=>({...p,reward:e.target.value}))} />
              </div>
            </div>
            <div style={{ marginTop:'14px' }}>
              <button className="btn bp blg bw" onClick={createTask} disabled={saving}>
                <span>{saving ? 'Creating...' : 'Create Task'}</span><span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

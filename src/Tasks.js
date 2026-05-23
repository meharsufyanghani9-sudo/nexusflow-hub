import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [proof, setProof] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedIds, setCompletedIds] = useState([]);
  const [totalEarned, setTotalEarned] = useState(0); // FIXED: real value
  const [inReview, setInReview] = useState(0);
  const [submitMsg, setSubmitMsg] = useState('');

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    setLoading(true);

    const [
      { data: taskList },
      { data: subs },
      { data: earnings },
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('task_submissions').select('task_id, status').eq('user_id', user.id),
      // FIXED: Real earned amount from transactions
      supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'task'),
    ]);

    if (taskList) setTasks(taskList);
    if (subs) {
      setCompletedIds(subs.map(s => s.task_id));
      setInReview(subs.filter(s => s.status === 'pending').length);
    }
    if (earnings) {
      const total = earnings.reduce((a, b) => a + parseFloat(b.amount || 0), 0);
      setTotalEarned(total);
    }

    setLoading(false);
  };

  const submitTask = async () => {
    if (!proof.trim()) {
      setSubmitMsg('❌ Enter proof link or description first.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('task_submissions').insert({
      task_id: selected.id,
      user_id: user.id,
      proof: proof.trim(),
      status: 'pending',
    });
    setSubmitting(false);
    if (error) {
      setSubmitMsg('❌ Failed to submit. Try again.');
      return;
    }
    setSelected(null);
    setProof('');
    setSubmitMsg('');
    loadTasks();
    // Show success message briefly
    setTimeout(() => setSubmitMsg(''), 4000);
  };

  const stats = {
    available: tasks.filter(t => !completedIds.includes(t.id)).length,
    completed: completedIds.length,
    earned: totalEarned,
    inReview,
  };

  return (
    <div>
      <div style={{ fontFamily: 'var(--fd)', fontSize: '10px', letterSpacing: '3px', color: 'var(--gold)', marginBottom: '4px', textTransform: 'uppercase' }}>
        ⚡ Earn by Tasks
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '16px', lineHeight: 1.6 }}>
        Complete tasks assigned by admin to earn free wallet balance.
      </p>

      {/* Stats */}
      <div className="cgrid" style={{ marginBottom: '20px' }}>
        {[
          { ic: '📋', lb: 'Available', vl: stats.available, cl: 'cn' },
          { ic: '✅', lb: 'Completed', vl: stats.completed, cl: 'cg' },
          // FIXED: Real earned amount, was always $0.00
          { ic: '💰', lb: 'Total Earned', vl: `$${stats.earned.toFixed(2)}`, cl: 'cgo' },
          { ic: '⏳', lb: 'In Review', vl: stats.inReview, cl: 'cw' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* Tasks List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📋</span>
          <div className="empty-tx">No tasks available right now</div>
          <div className="empty-sub">Check back later — admin will add new tasks</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tasks.map(task => {
            const done = completedIds.includes(task.id);
            return (
              <div key={task.id} className="card" style={{
                padding: '16px',
                opacity: done ? 0.6 : 1,
                borderColor: done ? 'var(--br)' : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
                    <div style={{ fontSize: '28px', minWidth: '36px' }}>{task.icon || '⚡'}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{task.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>{task.description}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '80px' }}>
                    <div style={{ fontFamily: 'var(--fm)', fontSize: '20px', color: 'var(--gold)', fontWeight: 700, marginBottom: '8px' }}>
                      +${parseFloat(task.reward || 0).toFixed(2)}
                    </div>
                    {done ? (
                      <span className="bdg b-completed">Submitted</span>
                    ) : (
                      <button className="btn bp bsm" onClick={() => { setSelected(task); setProof(''); setSubmitMsg(''); }}>
                        Start →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Modal */}
      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="mttl">Submit Task</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="card" style={{ padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{selected.icon || '⚡'}</div>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{selected.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px', lineHeight: 1.5 }}>{selected.description}</div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: '20px', color: 'var(--gold)', fontWeight: 700 }}>
                Reward: +${parseFloat(selected.reward || 0).toFixed(2)}
              </div>
            </div>

            <div className="fi">
              <label className="fl">Proof Link or Description</label>
              <textarea
                className="inp"
                rows={4}
                placeholder="Paste your screenshot URL, post link, or describe what you did..."
                value={proof}
                onChange={e => setProof(e.target.value)}
                style={{ resize: 'vertical', minHeight: '80px' }}
              />
            </div>

            {submitMsg && (
              <div style={{
                fontSize: '12px', padding: '8px', borderRadius: '6px', marginBottom: '12px', textAlign: 'center',
                background: submitMsg.startsWith('❌') ? 'rgba(255,51,85,.08)' : 'rgba(0,255,136,.08)',
                color: submitMsg.startsWith('❌') ? 'var(--danger)' : 'var(--green)',
                border: submitMsg.startsWith('❌') ? '1px solid rgba(255,51,85,.2)' : '1px solid rgba(0,255,136,.2)',
              }}>
                {submitMsg}
              </div>
            )}

            <button className="btn bp blg bw" onClick={submitTask} disabled={submitting}>
              <span>{submitting ? 'Submitting...' : 'Submit for Review'}</span><span>✦</span>
            </button>

            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
              ⏱ Admin will review your submission and credit ${parseFloat(selected.reward || 0).toFixed(2)} to your balance.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setLoading(true);
    const { data } = await supabase.from('support_tickets')
      .select('*').order('created_at', { ascending:false });
    if (data) setTickets(data);
    setLoading(false);
  };

  const sendReply = async () => {
    if (!reply) { alert('Enter reply message'); return; }
    setReplying(true);
    await supabase.from('support_tickets').update({
      admin_reply: reply,
      status: 'replied',
    }).eq('id', selected.id);
    setReplying(false);
    setSelected(null);
    setReply('');
    loadTickets();
    alert('✅ Reply sent!');
  };

  const closeTicket = async (id) => {
    await supabase.from('support_tickets').update({ status:'closed' }).eq('id', id);
    setSelected(null);
    loadTickets();
  };

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter);
  const open = tickets.filter(t => t.status === 'open').length;

  return (
    <div>
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📬', lb:'Open', vl:tickets.filter(t=>t.status==='open').length, cl:'cw' },
          { ic:'💬', lb:'Replied', vl:tickets.filter(t=>t.status==='replied').length, cl:'cn' },
          { ic:'✅', lb:'Closed', vl:tickets.filter(t=>t.status==='closed').length, cl:'cg' },
          { ic:'📊', lb:'Total', vl:tickets.length, cl:'cp' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
        {['all','open','replied','closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'6px 14px', borderRadius:'20px', cursor:'pointer',
            fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'1px',
            background: filter===f ? 'var(--neon)' : 'var(--gl)',
            color: filter===f ? '#000' : 'var(--text3)',
            border: filter===f ? 'none' : '1px solid var(--br)',
          }}>
            {f} {f==='open' && open > 0 ? `(${open})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📭</span>
          <div className="empty-tx">No tickets found</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {filtered.map(t => (
            <div key={t.id} className="card" style={{ padding:'16px', borderColor: t.status==='open' ? 'rgba(255,184,0,.25)' : 'var(--br)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'10px' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                    <span className={`bdg ${t.status==='open'?'b-pending':t.status==='replied'?'b-processing':'b-completed'}`}>
                      {t.status}
                    </span>
                    <span style={{ fontWeight:700, fontSize:'13px' }}>{t.subject}</span>
                  </div>
                  <div style={{ fontWeight:600, fontSize:'12px', marginBottom:'2px' }}>{t.user_name}</div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'6px' }}>{t.user_email}</div>
                  <div style={{ fontSize:'12px', color:'var(--text2)', padding:'8px', borderRadius:'6px', background:'var(--gl)', border:'1px solid var(--br)', lineHeight:1.6 }}>
                    {t.message}
                  </div>
                  {t.admin_reply && (
                    <div style={{ marginTop:'8px', fontSize:'12px', color:'var(--neon)', padding:'8px', borderRadius:'6px', background:'rgba(0,212,255,.06)', border:'1px solid rgba(0,212,255,.15)', lineHeight:1.6 }}>
                      <strong>Admin Reply:</strong> {t.admin_reply}
                    </div>
                  )}
                  <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'6px' }}>{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {t.status !== 'closed' && (
                    <button className="btn bp bsm" onClick={() => { setSelected(t); setReply(''); }}>Reply →</button>
                  )}
                  {t.status !== 'closed' && (
                    <button className="btn bgh bsm" onClick={() => closeTicket(t.id)}>✅ Close</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
              <div className="mttl">Reply to Ticket</div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:'18px', cursor:'pointer' }}>✕</button>
            </div>
            <div className="card" style={{ padding:'12px', marginBottom:'14px' }}>
              <div style={{ fontWeight:700, marginBottom:'4px' }}>{selected.subject}</div>
              <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'6px' }}>{selected.user_name} · {selected.user_email}</div>
              <div style={{ fontSize:'12px', color:'var(--text2)', lineHeight:1.6 }}>{selected.message}</div>
            </div>
            <div className="fi">
              <label className="fl">Your Reply</label>
              <textarea className="inp" placeholder="Type your reply..."
                value={reply} onChange={e => setReply(e.target.value)}
                style={{ minHeight:'100px', resize:'vertical', fontFamily:'var(--fu)' }} />
            </div>
            <button className="btn bp blg bw" onClick={sendReply} disabled={replying}>
              <span>{replying ? 'Sending...' : 'Send Reply'}</span><span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
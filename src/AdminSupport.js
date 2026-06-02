import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

export default function AdminSupport() {
  const [tickets, setTickets]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('open');
  const [openTicket, setOpenTicket] = useState(null);
  const [reply, setReply]         = useState('');
  const [replying, setReplying]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { loadTickets(); }, []);

  useEffect(() => {
    const ch = supabase.channel('admin-tickets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' },
        () => loadTickets())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [openTicket]);

  const loadTickets = async () => {
    setLoading(true);
    const { data } = await supabase.from('support_tickets')
      .select('*').order('created_at', { ascending: false });
    if (data) {
      setTickets(data);
      if (openTicket) {
        const fresh = data.find(t => t.id === openTicket.id);
        if (fresh) setOpenTicket(fresh);
      }
    }
    setLoading(false);
  };

  const getConversation = (t) => {
    let conv = [];
    try { conv = t.conversation ? JSON.parse(t.conversation) : []; } catch { conv = []; }
    return conv;
  };

  const sendReply = async () => {
    if (!reply.trim()) { alert('Enter a reply message'); return; }
    setReplying(true);

    let conv = getConversation(openTicket);
    conv.push({
      from: 'admin',
      name: 'Admin',
      text: reply.trim(),
      time: new Date().toISOString(),
    });

    await supabase.from('support_tickets').update({
      admin_reply: reply.trim(), // keep legacy field
      conversation: JSON.stringify(conv),
      status: 'replied',
    }).eq('id', openTicket.id);

    setReply('');
    setReplying(false);
    loadTickets();
  };

  const closeTicket = async (id) => {
    if (!window.confirm('Close this ticket?')) return;
    await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', id);
    setOpenTicket(null);
    loadTickets();
  };

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter);
  const open = tickets.filter(t => t.status === 'open').length;
  const replied = tickets.filter(t => t.status === 'replied').length;

  const statusColor = (s) => {
    if (s === 'open')     return 'b-pending';
    if (s === 'replied')  return 'b-processing';
    if (s === 'closed')   return 'b-rejected';
    if (s === 'resolved') return 'b-completed';
    return 'b-pending';
  };

  if (openTicket) {
    const conv = getConversation(openTicket);
    const isClosed = openTicket.status === 'closed' || openTicket.status === 'resolved';
    return (
      <div>
        <div style={{ display:'flex', gap:'10px', marginBottom:'16px', alignItems:'center' }}>
          <button className="btn bgh bsm" onClick={() => { setOpenTicket(null); loadTickets(); }}>
            ← Back
          </button>
          {!isClosed && (
            <button className="btn bd bsm" onClick={() => closeTicket(openTicket.id)}>
              🔒 Close Ticket
            </button>
          )}
        </div>

        <div className="card" style={{ padding:'14px', marginBottom:'12px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text)', marginBottom:'4px' }}>{openTicket.subject}</div>
              <div style={{ fontSize:'11px', color:'var(--text3)' }}>
                {openTicket.user_name} • {openTicket.user_email} • {new Date(openTicket.created_at).toLocaleString()}
              </div>
            </div>
            <span className={`bdg ${statusColor(openTicket.status)}`}>{openTicket.status?.replace('_',' ')}</span>
          </div>
        </div>

        {/* Chat thread */}
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'16px' }}>
          {/* Original message */}
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <div style={{
              maxWidth:'80%', padding:'10px 13px', borderRadius:'14px 14px 14px 4px',
              background:'rgba(0,212,255,.08)', border:'1px solid rgba(0,212,255,.2)',
              fontSize:'12px', color:'var(--text)', lineHeight:1.6
            }}>
              <div style={{ fontSize:'9px', color:'var(--neon)', fontWeight:700, marginBottom:'4px' }}>{openTicket.user_name || 'User'}</div>
              {openTicket.message}
            </div>
          </div>

          {/* Legacy single reply */}
          {openTicket.admin_reply && conv.length === 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 13px', borderRadius:'14px 14px 4px 14px',
                background:'rgba(0,255,136,.06)', border:'1px solid rgba(0,255,136,.15)',
                fontSize:'12px', color:'var(--text)', lineHeight:1.6
              }}>
                <div style={{ fontSize:'9px', color:'var(--green)', fontWeight:700, marginBottom:'4px' }}>💬 Admin</div>
                {openTicket.admin_reply}
              </div>
            </div>
          )}

          {/* Full conversation */}
          {conv.map((msg, i) => (
            <div key={i} style={{ display:'flex', justifyContent: msg.from === 'admin' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 13px',
                borderRadius: msg.from === 'admin' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.from === 'admin' ? 'rgba(0,255,136,.06)' : 'rgba(0,212,255,.08)',
                border: `1px solid ${msg.from === 'admin' ? 'rgba(0,255,136,.15)' : 'rgba(0,212,255,.2)'}`,
                fontSize:'12px', color:'var(--text)', lineHeight:1.6
              }}>
                <div style={{ fontSize:'9px', color: msg.from === 'admin' ? 'var(--green)' : 'var(--neon)', fontWeight:700, marginBottom:'4px' }}>
                  {msg.from === 'admin' ? '💬 Admin' : msg.name}
                </div>
                {msg.text}
                <div style={{ fontSize:'9px', color:'var(--text3)', marginTop:'4px' }}>
                  {new Date(msg.time).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {!isClosed ? (
          <div className="card" style={{ padding:'14px' }}>
            <textarea className="inp" rows={3}
              style={{ resize:'vertical', minHeight:'80px', marginBottom:'10px' }}
              placeholder="Type your reply to the user..."
              value={reply} onChange={e => setReply(e.target.value)} />
            <button className="btn bp blg bw" onClick={sendReply} disabled={replying || !reply.trim()}>
              {replying ? 'Sending...' : '💬 Send Reply'}
            </button>
          </div>
        ) : (
          <div style={{ padding:'12px', background:'rgba(255,50,50,.06)', border:'1px solid rgba(255,50,50,.15)', borderRadius:'8px', textAlign:'center', fontSize:'12px', color:'var(--text3)' }}>
            🔒 Ticket is closed.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="cgrid" style={{ marginBottom:'16px' }}>
        {[
          { ic:'📬', lb:'Open',    vl:open,                                                  cl:'cw' },
          { ic:'💬', lb:'Replied', vl:replied,                                               cl:'cn' },
          { ic:'✅', lb:'Closed',  vl:tickets.filter(t=>t.status==='closed').length,         cl:'cg' },
          { ic:'📊', lb:'Total',   vl:tickets.length,                                        cl:'cp' },
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
            {f==='replied' && replied > 0 ? `(${replied})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">📭</span>
          <div className="empty-tx">No {filter} tickets</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {filtered.map(t => {
            const conv = getConversation(t);
            const lastMsg = conv.length > 0 ? conv[conv.length-1] : null;
            return (
              <div key={t.id} className="card" style={{ padding:'16px', cursor:'pointer' }}
                onClick={() => setOpenTicket(t)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'13px', color:'var(--text)', marginBottom:'2px' }}>{t.subject}</div>
                    <div style={{ fontSize:'11px', color:'var(--text3)' }}>
                      {t.user_name} • {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className={`bdg ${statusColor(t.status)}`}>{t.status?.replace('_',' ')}</span>
                </div>
                {lastMsg && (
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'6px', padding:'6px 10px', background:'var(--gl)', borderRadius:'6px' }}>
                    <strong style={{ color: lastMsg.from==='admin'?'var(--green)':'var(--neon)' }}>
                      {lastMsg.from==='admin' ? 'Admin' : t.user_name}:
                    </strong> {lastMsg.text.slice(0,60)}{lastMsg.text.length>60?'...':''}
                  </div>
                )}
                <div style={{ marginTop:'8px', fontSize:'11px', color:'var(--neon)', textAlign:'right' }}>
                  Open chat →
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

export default function SupportTicket({ user }) {
  const [tickets, setTickets]     = useState([]);
  const [subject, setSubject]     = useState('');
  const [message, setMessage]     = useState('');
  const [category, setCategory]   = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('new'); // 'new' | 'history'
  const [openTicket, setOpenTicket] = useState(null); // ticket being chatted in
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying]   = useState(false);
  const bottomRef = useRef(null);

  const categories = [
    { value:'general',   label:'General Question' },
    { value:'order',     label:'Order Issue' },
    { value:'payment',   label:'Payment / Deposit' },
    { value:'refund',    label:'Refund Request' },
    { value:'technical', label:'Technical Problem' },
  ];

  useEffect(() => { loadTickets(); }, []);

  // Realtime: refresh tickets when any change happens
  useEffect(() => {
    const ch = supabase.channel('tickets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` },
        () => loadTickets())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user.id]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [openTicket]);

  const loadTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) {
      setTickets(data);
      // Refresh open ticket data if viewing one
      if (openTicket) {
        const fresh = data.find(t => t.id === openTicket.id);
        if (fresh) setOpenTicket(fresh);
      }
    }
    setLoading(false);
  };

  const submit = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      subject: subject.trim(),
      message: message.trim(),
      category,
      status: 'open',
    });
    if (!error) {
      setSubject(''); setMessage(''); setCategory('general');
      setDone(true); setView('history');
      loadTickets();
      setTimeout(() => setDone(false), 5000);
    }
    setSubmitting(false);
  };

  // User reply to same ticket thread
  const sendUserReply = async () => {
    if (!replyText.trim() || !openTicket) return;
    setReplying(true);

    // Parse existing conversation
    let conversation = [];
    try {
      conversation = openTicket.conversation ? JSON.parse(openTicket.conversation) : [];
    } catch { conversation = []; }

    // Add user reply
    conversation.push({
      from: 'user',
      name: user.name || user.email,
      text: replyText.trim(),
      time: new Date().toISOString(),
    });

    await supabase.from('support_tickets').update({
      conversation: JSON.stringify(conversation),
      status: 'open', // re-open if it was replied
    }).eq('id', openTicket.id);

    setReplyText('');
    setReplying(false);
    loadTickets();
  };

  const statusColor = (s) => {
    if (s === 'open')        return 'b-pending';
    if (s === 'in_progress') return 'b-processing';
    if (s === 'replied')     return 'b-processing';
    if (s === 'resolved')    return 'b-completed';
    if (s === 'closed')      return 'b-rejected';
    return 'b-rejected';
  };

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'replied').length;

  // Parse conversation from ticket
  const getConversation = (t) => {
    let conv = [];
    try { conv = t.conversation ? JSON.parse(t.conversation) : []; } catch { conv = []; }
    return conv;
  };

  if (openTicket) {
    const conv = getConversation(openTicket);
    const isClosed = openTicket.status === 'closed' || openTicket.status === 'resolved';
    return (
      <div style={{ maxWidth:'640px' }}>
        <button className="btn bgh bsm" style={{ marginBottom:'16px' }}
          onClick={() => { setOpenTicket(null); loadTickets(); }}>
          ← Back to Tickets
        </button>

        <div className="card" style={{ padding:'14px', marginBottom:'12px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text)' }}>{openTicket.subject}</div>
            <span className={`bdg ${statusColor(openTicket.status)}`}>{openTicket.status?.replace('_',' ')}</span>
          </div>
          <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px' }}>
            📁 {categories.find(c=>c.value===openTicket.category)?.label || openTicket.category} &nbsp;•&nbsp;
            {new Date(openTicket.created_at).toLocaleString()}
          </div>
        </div>

        {/* Chat thread */}
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'16px' }}>
          {/* Original message */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{
              maxWidth:'80%', padding:'10px 13px', borderRadius:'14px 14px 4px 14px',
              background:'rgba(0,212,255,.1)', border:'1px solid rgba(0,212,255,.2)',
              fontSize:'12px', color:'var(--text)', lineHeight:1.6
            }}>
              <div style={{ fontSize:'9px', color:'var(--neon)', fontWeight:700, marginBottom:'4px' }}>You</div>
              {openTicket.message}
            </div>
          </div>

          {/* Admin reply (legacy single reply) */}
          {openTicket.admin_reply && conv.length === 0 && (
            <div style={{ display:'flex', justifyContent:'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 13px', borderRadius:'14px 14px 14px 4px',
                background:'rgba(0,255,136,.06)', border:'1px solid rgba(0,255,136,.15)',
                fontSize:'12px', color:'var(--text)', lineHeight:1.6
              }}>
                <div style={{ fontSize:'9px', color:'var(--green)', fontWeight:700, marginBottom:'4px' }}>💬 Admin</div>
                {openTicket.admin_reply}
              </div>
            </div>
          )}

          {/* Conversation thread */}
          {conv.map((msg, i) => (
            <div key={i} style={{ display:'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 13px',
                borderRadius: msg.from === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.from === 'user' ? 'rgba(0,212,255,.1)' : 'rgba(0,255,136,.06)',
                border: `1px solid ${msg.from === 'user' ? 'rgba(0,212,255,.2)' : 'rgba(0,255,136,.15)'}`,
                fontSize:'12px', color:'var(--text)', lineHeight:1.6
              }}>
                <div style={{ fontSize:'9px', color: msg.from === 'user' ? 'var(--neon)' : 'var(--green)', fontWeight:700, marginBottom:'4px' }}>
                  {msg.from === 'user' ? 'You' : '💬 Admin'}
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

        {/* Reply input */}
        {!isClosed ? (
          <div className="card" style={{ padding:'14px' }}>
            <textarea
              className="inp"
              rows={3}
              style={{ resize:'vertical', minHeight:'80px', marginBottom:'10px' }}
              placeholder="Type your reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
            />
            <button className="btn bp blg bw" onClick={sendUserReply} disabled={replying || !replyText.trim()}>
              {replying ? 'Sending...' : '💬 Reply to Admin'}
            </button>
          </div>
        ) : (
          <div style={{ padding:'12px', background:'rgba(255,50,50,.06)', border:'1px solid rgba(255,50,50,.15)', borderRadius:'8px', textAlign:'center', fontSize:'12px', color:'var(--text3)' }}>
            🔒 This ticket is closed. Open a new ticket if you need more help.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth:'640px' }}>
      {done && (
        <div style={{
          background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)',
          borderRadius:'8px', padding:'14px', textAlign:'center', color:'var(--green)',
          fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>
          ✅ Ticket submitted! Our team will reply within 24 hours.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
        {[
          { id:'new',     label:'✏️ New Ticket' },
          { id:'history', label:`📋 My Tickets${openCount > 0 ? ` (${openCount})` : ''}` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)}
            style={{
              padding:'8px 18px', borderRadius:'20px', cursor:'pointer',
              fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
              letterSpacing:'1px',
              background: view===tab.id ? 'var(--neon)' : 'var(--gl)',
              color: view===tab.id ? '#000' : 'var(--text3)',
              border: view===tab.id ? 'none' : '1px solid var(--br)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* New Ticket */}
      {view === 'new' && (
        <div className="card" style={{ padding:'20px' }}>
          <div className="fi">
            <label className="fl">Category</label>
            <select className="inp" value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="fi">
            <label className="fl">Subject</label>
            <input className="inp" placeholder="Brief description" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="fi">
            <label className="fl">Message</label>
            <textarea className="inp" rows={6} style={{ resize:'vertical', minHeight:'120px' }}
              placeholder="Describe your issue in detail. Include order IDs if relevant."
              value={message} onChange={e => setMessage(e.target.value)} />
          </div>
          <button className="btn bp blg bw" onClick={submit}
            disabled={submitting || !subject.trim() || !message.trim()}>
            <span>{submitting ? 'Submitting...' : '📨 Submit Ticket'}</span><span>→</span>
          </button>
        </div>
      )}

      {/* Ticket History */}
      {view === 'history' && (
        <div>
          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading...</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>💬</div>
              No tickets yet. Create one if you need help!
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {tickets.map(t => {
                const conv = getConversation(t);
                const hasNewReply = (t.admin_reply && conv.length === 0) || (conv.length > 0 && conv[conv.length-1].from === 'admin');
                return (
                  <div key={t.id} className="card" style={{ padding:'16px', cursor:'pointer' }}
                    onClick={() => setOpenTicket(t)}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
                      <div style={{ fontWeight:700, fontSize:'13px', color:'var(--text)', flex:1 }}>{t.subject}</div>
                      <span className={`bdg ${statusColor(t.status)}`} style={{ marginLeft:'8px', whiteSpace:'nowrap' }}>
                        {t.status?.replace('_',' ')}
                      </span>
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'8px' }}>
                      📁 {categories.find(c=>c.value===t.category)?.label || t.category} • {new Date(t.created_at).toLocaleString()}
                    </div>
                    {(t.admin_reply || conv.length > 0) && (
                      <div style={{
                        padding:'8px 10px', borderRadius:'6px',
                        background:'rgba(0,255,136,.06)', border:'1px solid rgba(0,255,136,.15)',
                        fontSize:'11px', color:'var(--green)'
                      }}>
                        💬 Admin replied — {hasNewReply ? <strong>Tap to read & reply</strong> : 'View conversation'}
                      </div>
                    )}
                    <div style={{ marginTop:'8px', fontSize:'11px', color:'var(--neon)', textAlign:'right' }}>
                      Open conversation →
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

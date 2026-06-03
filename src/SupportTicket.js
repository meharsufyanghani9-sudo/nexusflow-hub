import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

// ─── BUG FIX: SUPPORT CHAT ────────────────────────────────────────────────────
// ORIGINAL PROBLEM:
//   - Only one admin_reply field per ticket (single plain-text string).
//   - User had to create a NEW ticket to ask another question.
//   - No real conversation thread.
//
// FIX:
//   - Ticket messages are stored in a separate "ticket_messages" table.
//   - Schema for ticket_messages:
//       id          uuid primary key default gen_random_uuid()
//       ticket_id   uuid references support_tickets(id) on delete cascade
//       sender_role text  -- 'user' or 'admin'
//       sender_name text
//       message     text
//       created_at  timestamptz default now()
//   - Users can keep replying in the same ticket until admin closes it.
//   - Real-time subscription updates the chat instantly.
//
// SUPABASE SQL to run once in your Supabase SQL editor:
/*
  create table if not exists ticket_messages (
    id          uuid primary key default gen_random_uuid(),
    ticket_id   uuid references support_tickets(id) on delete cascade not null,
    sender_role text not null check (sender_role in ('user','admin')),
    sender_name text not null default '',
    message     text not null,
    created_at  timestamptz default now()
  );
  create index if not exists ticket_messages_ticket_id_idx on ticket_messages(ticket_id);
  alter table support_tickets add column if not exists last_message_at timestamptz;
  alter table support_tickets add column if not exists unread_admin boolean default false;
*/

const categories = [
  { value: 'general',   label: 'General Question' },
  { value: 'order',     label: 'Order Issue' },
  { value: 'payment',   label: 'Payment / Deposit' },
  { value: 'refund',    label: 'Refund Request' },
  { value: 'technical', label: 'Technical Problem' },
];

export default function SupportTicket({ user }) {
  const [tickets,     setTickets]     = useState([]);
  const [openTicket,  setOpenTicket]  = useState(null); // ticket currently open in chat view
  const [messages,    setMessages]    = useState([]);
  const [newMsg,      setNewMsg]      = useState('');
  const [sending,     setSending]     = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // New ticket form
  const [subject,    setSubject]    = useState('');
  const [firstMsg,   setFirstMsg]   = useState('');
  const [category,   setCategory]   = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');

  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState('list'); // 'list' | 'chat' | 'new'

  const chatEndRef  = useRef(null);
  const realtimeRef = useRef(null);

  // ── Load all tickets for this user ─────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setTickets(data || []);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Open a ticket and load its messages ────────────────────────────────────
  const openChat = useCallback(async (ticket) => {
    setOpenTicket(ticket);
    setView('chat');
    setLoadingMsgs(true);

    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoadingMsgs(false);

    // Subscribe to new messages in real-time
    if (realtimeRef.current) realtimeRef.current.unsubscribe();
    realtimeRef.current = supabase
      .channel(`ticket-${ticket.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ticket_messages',
        filter: `ticket_id=eq.${ticket.id}`,
      }, (payload) => {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .subscribe();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Cleanup realtime on unmount
  useEffect(() => {
    return () => {
      if (realtimeRef.current) realtimeRef.current.unsubscribe();
    };
  }, []);

  // ── Send a message inside an open ticket ───────────────────────────────────
  const sendMessage = async () => {
    if (!newMsg.trim() || !openTicket) return;
    if (openTicket.status === 'closed') {
      alert('This ticket is closed. Please open a new ticket.');
      return;
    }
    setSending(true);
    const msgText = newMsg.trim();
    setNewMsg('');

    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id:   openTicket.id,
      sender_role: 'user',
      sender_name: user.name || user.email,
      message:     msgText,
    });

    if (!error) {
      // Update ticket's last_message_at and mark unread for admin
      await supabase.from('support_tickets').update({
        last_message_at: new Date().toISOString(),
        unread_admin: true,
        status: openTicket.status === 'replied' ? 'open' : openTicket.status,
      }).eq('id', openTicket.id);

      // Refresh ticket list
      loadTickets();
    } else {
      setNewMsg(msgText); // restore on error
      alert('Failed to send message. Please try again.');
    }
    setSending(false);
  };

  // ── Create a brand-new ticket ───────────────────────────────────────────────
  const createTicket = async () => {
    setFormError('');
    if (!subject.trim()) { setFormError('Please enter a subject'); return; }
    if (!firstMsg.trim()) { setFormError('Please enter your message'); return; }
    setSubmitting(true);

    const { data: ticket, error: ticketErr } = await supabase
      .from('support_tickets')
      .insert({
        user_id:         user.id,
        user_name:       user.name || user.email,
        user_email:      user.email,
        subject:         subject.trim(),
        category,
        status:          'open',
        last_message_at: new Date().toISOString(),
        unread_admin:    true,
        // Keep admin_reply for backwards compatibility
        admin_reply:     null,
      })
      .select()
      .single();

    if (ticketErr || !ticket) {
      setFormError('Failed to create ticket. Please try again.');
      setSubmitting(false); return;
    }

    // Insert the first message
    await supabase.from('ticket_messages').insert({
      ticket_id:   ticket.id,
      sender_role: 'user',
      sender_name: user.name || user.email,
      message:     firstMsg.trim(),
    });

    setSubject(''); setFirstMsg(''); setCategory('general');
    setSubmitting(false);

    // Open the newly created ticket
    await loadTickets();
    openChat(ticket);
  };

  // ── Status helpers ──────────────────────────────────────────────────────────
  const statusBadge = (s) => {
    if (s === 'open')     return 'b-pending';
    if (s === 'replied')  return 'b-processing';
    if (s === 'closed')   return 'b-completed';
    return 'b-rejected';
  };

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'replied').length;

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '680px' }}>

      {/* ── CHAT VIEW ── */}
      {view === 'chat' && openTicket && (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <button onClick={() => { setView('list'); loadTickets(); }}
              style={{ background: 'none', border: '1px solid var(--br)', borderRadius: '8px', color: 'var(--text2)', cursor: 'pointer', padding: '6px 12px', fontSize: '12px' }}>
              ← Back
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{openTicket.subject}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                {categories.find(c => c.value === openTicket.category)?.label || openTicket.category}
                &nbsp;•&nbsp;
                <span className={`bdg ${statusBadge(openTicket.status)}`}>{openTicket.status}</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            minHeight: '300px', maxHeight: '420px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '10px',
            padding: '14px', borderRadius: '10px',
            background: 'var(--gl)', border: '1px solid var(--br)',
            marginBottom: '12px',
          }}>
            {loadingMsgs ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px' }}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px' }}>No messages yet</div>
            ) : messages.map(m => {
              const isUser = m.sender_role === 'user';
              return (
                <div key={m.id} style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: '8px',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: isUser ? 'var(--neon2)' : 'var(--purple)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', color: '#fff', fontWeight: 700,
                  }}>
                    {isUser ? (m.sender_name?.[0] || 'U').toUpperCase() : '⚡'}
                  </div>
                  {/* Bubble */}
                  <div style={{
                    maxWidth: '72%',
                    padding: '10px 13px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isUser ? 'rgba(0,212,255,.12)' : 'rgba(123,47,255,.12)',
                    border: `1px solid ${isUser ? 'rgba(0,212,255,.2)' : 'rgba(123,47,255,.2)'}`,
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px', fontWeight: 600 }}>
                      {isUser ? 'You' : '⚡ Admin Support'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.message}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '5px', textAlign: isUser ? 'right' : 'left' }}>
                      {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          {openTicket.status === 'closed' ? (
            <div style={{
              padding: '12px 16px', borderRadius: '8px', textAlign: 'center',
              background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.15)',
              fontSize: '12px', color: 'var(--green)', marginBottom: '10px',
            }}>
              ✅ This ticket has been closed by admin.
              <button onClick={() => setView('new')}
                style={{ marginLeft: '10px', background: 'none', border: '1px solid var(--green)', borderRadius: '6px', color: 'var(--green)', padding: '3px 10px', cursor: 'pointer', fontSize: '11px' }}>
                Open New Ticket
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea
                className="inp"
                placeholder="Type your message..."
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                style={{ flex: 1, minHeight: '44px', maxHeight: '120px', resize: 'vertical', fontFamily: 'var(--fu)', lineHeight: 1.5 }}
              />
              <button className="btn bp bmd" onClick={sendMessage} disabled={sending || !newMsg.trim()}
                style={{ flexShrink: 0, height: '44px', padding: '0 16px' }}>
                {sending ? '...' : '→'}
              </button>
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px', textAlign: 'center' }}>
            Press Enter to send · Shift+Enter for new line
          </div>
        </div>
      )}

      {/* ── NEW TICKET FORM ── */}
      {view === 'new' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <button onClick={() => setView('list')}
              style={{ background: 'none', border: '1px solid var(--br)', borderRadius: '8px', color: 'var(--text2)', cursor: 'pointer', padding: '6px 12px', fontSize: '12px' }}>
              ← Back
            </button>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>New Support Ticket</div>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <div className="fi">
              <label className="fl">Category</label>
              <select className="inp" value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div className="fi">
              <label className="fl">Subject</label>
              <input className="inp" placeholder="Brief description of your issue"
                value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div className="fi">
              <label className="fl">Your Message</label>
              <textarea className="inp" rows={5}
                style={{ resize: 'vertical', minHeight: '100px' }}
                placeholder="Describe your issue in detail. Include order IDs if relevant."
                value={firstMsg} onChange={e => setFirstMsg(e.target.value)} />
            </div>

            {formError && (
              <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '12px',
                padding: '8px', borderRadius: '6px', background: 'rgba(255,51,85,.08)', border: '1px solid rgba(255,51,85,.2)' }}>
                {formError}
              </div>
            )}

            <button className="btn bp blg bw" onClick={createTicket}
              disabled={submitting || !subject.trim() || !firstMsg.trim()}>
              <span>{submitting ? 'Creating...' : '📨 Create Ticket'}</span><span>→</span>
            </button>

            <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '7px',
              background: 'var(--gl)', border: '1px solid var(--br)',
              fontSize: '11px', color: 'var(--text3)', lineHeight: 1.7 }}>
              💡 Once created, you and admin can chat back and forth in the same ticket until it's resolved.
            </div>
          </div>
        </div>
      )}

      {/* ── TICKET LIST ── */}
      {view === 'list' && (
        <div>
          {/* Top bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
              {openCount > 0 ? (
                <span>You have <b style={{ color: 'var(--neon)' }}>{openCount}</b> open ticket{openCount > 1 ? 's' : ''}</span>
              ) : 'No open tickets'}
            </div>
            <button className="btn bp bsm" onClick={() => setView('new')}>
              ✏️ New Ticket
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>💬</div>
              <div style={{ marginBottom: '14px' }}>No support tickets yet.</div>
              <button className="btn bp bmd" onClick={() => setView('new')}>Create Your First Ticket</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tickets.map(t => (
                <div key={t.id} className="card" style={{ padding: '14px', cursor: 'pointer', borderColor: t.status === 'replied' ? 'rgba(0,255,136,.25)' : t.status === 'open' ? 'rgba(255,184,0,.2)' : 'var(--br)' }}
                  onClick={() => openChat(t)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.status === 'replied' && <span style={{ color: 'var(--green)', marginRight: '6px' }}>●</span>}
                        {t.subject}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        {categories.find(c => c.value === t.category)?.label || t.category}
                        &nbsp;•&nbsp;
                        {t.last_message_at
                          ? new Date(t.last_message_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : new Date(t.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      <span className={`bdg ${statusBadge(t.status)}`}>{t.status}</span>
                      {t.status === 'replied' && (
                        <span style={{ fontSize: '10px', color: 'var(--green)', background: 'rgba(0,255,136,.08)', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(0,255,136,.18)' }}>
                          New reply
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                    Tap to {t.status === 'closed' ? 'view conversation' : 'continue chatting'} →
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

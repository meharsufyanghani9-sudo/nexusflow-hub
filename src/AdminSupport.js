import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

// ─── BUG FIX: ADMIN SUPPORT CHAT ─────────────────────────────────────────────
// ORIGINAL PROBLEM:
//   - Admin could only send ONE reply per ticket (overwrote previous admin_reply).
//   - No conversation threading — just a single text box.
//   - Admin had to close and reopen to see new user messages.
//
// FIX:
//   - Reads from/writes to the ticket_messages table (same as SupportTicket.js).
//   - Full chat UI with real-time updates.
//   - Admin can reply multiple times until they click "Close Ticket".
//   - Unread indicator for tickets with new user messages.

export default function AdminSupport() {
  const [tickets,     setTickets]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('open');
  const [openTicket,  setOpenTicket]  = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [reply,       setReply]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const chatEndRef  = useRef(null);
  const realtimeRef = useRef(null);

  // ── Load all tickets ────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setTickets(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Open a ticket ───────────────────────────────────────────────────────────
  const openChat = useCallback(async (ticket) => {
    setOpenTicket(ticket);
    setLoadingMsgs(true);

    // Mark as read by admin
    await supabase.from('support_tickets')
      .update({ unread_admin: false }).eq('id', ticket.id);

    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoadingMsgs(false);

    // Real-time subscription
    if (realtimeRef.current) realtimeRef.current.unsubscribe();
    realtimeRef.current = supabase
      .channel(`admin-ticket-${ticket.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'ticket_messages',
        filter: `ticket_id=eq.${ticket.id}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        // Auto-mark as read when admin is looking at the ticket
        supabase.from('support_tickets')
          .update({ unread_admin: false }).eq('id', ticket.id).then(() => {});
      })
      .subscribe();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    return () => { if (realtimeRef.current) realtimeRef.current.unsubscribe(); };
  }, []);

  // ── Send reply ──────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!reply.trim() || !openTicket) return;
    setSending(true);
    const text = reply.trim();
    setReply('');

    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id:   openTicket.id,
      sender_role: 'admin',
      sender_name: 'Admin Support',
      message:     text,
    });

    if (!error) {
      // Also update legacy admin_reply field for backward compat, and set status
      await supabase.from('support_tickets').update({
        admin_reply:     text,
        status:          'replied',
        last_message_at: new Date().toISOString(),
        unread_admin:    false,
      }).eq('id', openTicket.id);

      setOpenTicket(prev => ({ ...prev, status: 'replied' }));
      loadTickets();
    } else {
      setReply(text);
      alert('Failed to send reply. Please try again.');
    }
    setSending(false);
  };

  // ── Close ticket ────────────────────────────────────────────────────────────
  const closeTicket = async (ticketId) => {
    if (!window.confirm('Close this ticket? The user will not be able to send more messages.')) return;
    await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', ticketId);
    if (openTicket?.id === ticketId) {
      setOpenTicket(prev => ({ ...prev, status: 'closed' }));
    }
    loadTickets();
  };

  // ── Stats ───────────────────────────────────────────────────────────────────
  const open     = tickets.filter(t => t.status === 'open').length;
  const replied  = tickets.filter(t => t.status === 'replied').length;
  const closed   = tickets.filter(t => t.status === 'closed').length;
  const unread   = tickets.filter(t => t.unread_admin && t.status !== 'closed').length;

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter);

  const statusBadge = (s) => {
    if (s === 'open')    return 'b-pending';
    if (s === 'replied') return 'b-processing';
    if (s === 'closed')  return 'b-completed';
    return 'b-rejected';
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Stats */}
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '📬', lb: 'Open',     vl: open,    cl: 'cw' },
          { ic: '💬', lb: 'Replied',  vl: replied, cl: 'cn' },
          { ic: '✅', lb: 'Closed',   vl: closed,  cl: 'cg' },
          { ic: '🔴', lb: 'Unread',   vl: unread,  cl: unread > 0 ? 'cd' : 'cp' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {/* ── CHAT PANEL ── */}
      {openTicket ? (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <button onClick={() => { setOpenTicket(null); loadTickets(); }}
              style={{ background: 'none', border: '1px solid var(--br)', borderRadius: '8px', color: 'var(--text2)', cursor: 'pointer', padding: '6px 12px', fontSize: '12px' }}>
              ← Back
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{openTicket.subject}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                {openTicket.user_name} · {openTicket.user_email}
                &nbsp;•&nbsp;
                <span className={`bdg ${statusBadge(openTicket.status)}`}>{openTicket.status}</span>
              </div>
            </div>
            {openTicket.status !== 'closed' && (
              <button className="btn bgh bsm" onClick={() => closeTicket(openTicket.id)}>
                ✅ Close Ticket
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{
            minHeight: '280px', maxHeight: '400px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '10px',
            padding: '14px', borderRadius: '10px',
            background: 'var(--gl)', border: '1px solid var(--br)',
            marginBottom: '12px',
          }}>
            {loadingMsgs ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px' }}>Loading...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px' }}>No messages yet</div>
            ) : messages.map(m => {
              const isAdmin = m.sender_role === 'admin';
              return (
                <div key={m.id} style={{
                  display: 'flex',
                  flexDirection: isAdmin ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: '8px',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: isAdmin ? 'var(--purple)' : 'var(--neon2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', color: '#fff', fontWeight: 700,
                  }}>
                    {isAdmin ? '⚡' : (m.sender_name?.[0] || 'U').toUpperCase()}
                  </div>
                  <div style={{
                    maxWidth: '72%', padding: '10px 13px',
                    borderRadius: isAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isAdmin ? 'rgba(123,47,255,.12)' : 'rgba(0,212,255,.10)',
                    border: `1px solid ${isAdmin ? 'rgba(123,47,255,.2)' : 'rgba(0,212,255,.18)'}`,
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px', fontWeight: 600 }}>
                      {isAdmin ? '⚡ Admin' : m.sender_name || 'User'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.message}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '5px', textAlign: isAdmin ? 'right' : 'left' }}>
                      {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Reply input */}
          {openTicket.status === 'closed' ? (
            <div style={{ padding: '12px 16px', borderRadius: '8px', textAlign: 'center',
              background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.15)',
              fontSize: '12px', color: 'var(--green)' }}>
              ✅ Ticket is closed. No further replies possible.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea className="inp"
                placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                style={{ flex: 1, minHeight: '50px', maxHeight: '140px', resize: 'vertical', fontFamily: 'var(--fu)' }} />
              <button className="btn bp bmd" onClick={sendReply} disabled={sending || !reply.trim()}
                style={{ flexShrink: 0, height: '50px', padding: '0 18px' }}>
                {sending ? '...' : 'Send →'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── TICKET LIST ── */
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {['all', 'open', 'replied', 'closed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
                fontFamily: 'var(--fu)', fontSize: '11px', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '1px',
                background: filter === f ? 'var(--neon)' : 'var(--gl)',
                color: filter === f ? '#000' : 'var(--text3)',
                border: filter === f ? 'none' : '1px solid var(--br)',
              }}>
                {f} {f === 'open' && open > 0 ? `(${open})` : ''}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">📭</span>
              <div className="empty-tx">No tickets found</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(t => (
                <div key={t.id} className="card" style={{
                  padding: '14px', cursor: 'pointer',
                  borderColor: t.unread_admin && t.status !== 'closed' ? 'rgba(255,184,0,.4)' : t.status === 'open' ? 'rgba(255,184,0,.2)' : 'var(--br)',
                }}
                  onClick={() => openChat(t)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                        {t.unread_admin && t.status !== 'closed' && (
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warn)', flexShrink: 0, display: 'inline-block' }} />
                        )}
                        <span className={`bdg ${statusBadge(t.status)}`}>{t.status}</span>
                        <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{t.user_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.user_email}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                        {t.last_message_at
                          ? new Date(t.last_message_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : new Date(t.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: '12px', color: 'var(--neon)' }}>
                      Chat →
                    </div>
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

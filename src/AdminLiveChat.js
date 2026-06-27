// AdminLiveChat.js
// Agent dashboard — shows all active, waiting, and closed chat sessions.
// Agents can set themselves online/offline, accept chats from the queue,
// reply in real time, and close sessions when done.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

const AI_NAME = '🤖 NexusBot';

export default function AdminLiveChat({ user }) {
  const [sessions,    setSessions]    = useState([]);
  const [openSession, setOpenSession] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [reply,       setReply]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null); // agent row
  const [filter,      setFilter]      = useState('waiting'); // waiting | active | closed | all
  const [loading,     setLoading]     = useState(true);

  const bottomRef   = useRef(null);
  const rtSession   = useRef(null);
  const rtSessions  = useRef(null);

  // ── Ensure agent row exists ─────────────────────────────────────────────────
  const ensureAgent = useCallback(async () => {
    const { data } = await supabase
      .from('chat_agents')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!data) {
      const { data: newAgent } = await supabase
        .from('chat_agents')
        .insert({
          id:           user.id,
          name:         user.name || user.email?.split('@')[0] || 'Agent',
          is_online:    false,
          active_chats: 0,
          max_chats:    3,
        })
        .select().single();
      setAgentStatus(newAgent);
    } else {
      setAgentStatus(data);
    }
  }, [user]);

  // ── Toggle online/offline ───────────────────────────────────────────────────
  const toggleOnline = async () => {
    const newVal = !agentStatus?.is_online;
    await supabase.from('chat_agents')
      .update({ is_online: newVal, last_seen: new Date().toISOString() })
      .eq('id', user.id);
    setAgentStatus(prev => ({ ...prev, is_online: newVal }));
  };

  // ── Load all sessions ───────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setSessions(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    ensureAgent();
    loadSessions();
  }, [ensureAgent, loadSessions]);

  // ── Real-time: watch all sessions for status changes ────────────────────────
  useEffect(() => {
    if (rtSessions.current) rtSessions.current.unsubscribe();
    rtSessions.current = supabase
      .channel('admin-sessions-watch')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_sessions',
      }, () => { loadSessions(); })
      .subscribe();
    return () => { if (rtSessions.current) rtSessions.current.unsubscribe(); };
  }, [loadSessions]);

  // ── Open a session to chat ──────────────────────────────────────────────────
  const openChat = useCallback(async (sess) => {
    setOpenSession(sess);
    setLoadingMsgs(true);

    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sess.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoadingMsgs(false);

    if (rtSession.current) rtSession.current.unsubscribe();
    rtSession.current = supabase
      .channel(`agent-chat-${sess.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `session_id=eq.${sess.id}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chat_sessions',
        filter: `id=eq.${sess.id}`,
      }, (payload) => {
        setOpenSession(prev => ({ ...prev, ...payload.new }));
      })
      .subscribe();
  }, []);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (rtSession.current) rtSession.current.unsubscribe();
    };
  }, []);

  // ── Accept a waiting chat ───────────────────────────────────────────────────
  const acceptChat = async (sess) => {
    const agentName = agentStatus?.name || user.name || 'Agent';

    await supabase.from('chat_sessions').update({
      status:         'active',
      agent_id:       user.id,
      agent_name:     agentName,
      queue_position: 0,
    }).eq('id', sess.id);

    await supabase.from('chat_agents').update({
      active_chats: (agentStatus?.active_chats || 0) + 1,
      is_busy: ((agentStatus?.active_chats || 0) + 1) >= (agentStatus?.max_chats || 3),
    }).eq('id', user.id);

    setAgentStatus(prev => ({
      ...prev,
      active_chats: (prev?.active_chats || 0) + 1,
    }));

    await supabase.from('chat_messages').insert({
      session_id:  sess.id,
      sender_role: 'system',
      sender_name: 'System',
      message:     `AGENT_JOINED:${agentName}`,
    });

    openChat({ ...sess, status: 'active', agent_id: user.id, agent_name: agentName });
  };

  // ── Send reply ──────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!reply.trim() || !openSession) return;
    setSending(true);
    const text = reply.trim();
    setReply('');

    await supabase.from('chat_messages').insert({
      session_id:  openSession.id,
      sender_role: 'agent',
      sender_name: agentStatus?.name || user.name || 'Agent',
      message:     text,
    });

    await supabase.from('chat_sessions').update({
      last_message_at: new Date().toISOString(),
    }).eq('id', openSession.id);

    setSending(false);
  };

  // ── Close session ───────────────────────────────────────────────────────────
  const closeSession = async () => {
    if (!openSession) return;
    if (!window.confirm('Close this chat session?')) return;

    await supabase.from('chat_sessions').update({
      status:    'closed',
      closed_at: new Date().toISOString(),
    }).eq('id', openSession.id);

    await supabase.from('chat_messages').insert({
      session_id:  openSession.id,
      sender_role: 'system',
      sender_name: 'System',
      message:     'Chat closed by agent.',
    });

    // Update agent load
    await supabase.from('chat_agents').update({
      active_chats: Math.max(0, (agentStatus?.active_chats || 1) - 1),
      is_busy: false,
    }).eq('id', user.id);

    setAgentStatus(prev => ({
      ...prev,
      active_chats: Math.max(0, (prev?.active_chats || 1) - 1),
    }));

    setOpenSession(null);
    setMessages([]);
    loadSessions();
  };

  // ── Transfer to another agent ───────────────────────────────────────────────
  const transferChat = async () => {
    if (!openSession) return;
    const { data: agents } = await supabase
      .from('chat_agents')
      .select('*')
      .eq('is_online', true)
      .neq('id', user.id);

    const available = (agents || []).find(a => a.active_chats < a.max_chats);
    if (!available) { alert('No other agents available right now.'); return; }

    await supabase.from('chat_sessions').update({
      agent_id:   available.id,
      agent_name: available.name,
    }).eq('id', openSession.id);

    await supabase.from('chat_messages').insert({
      session_id:  openSession.id,
      sender_role: 'system',
      sender_name: 'System',
      message:     `AGENT_JOINED:${available.name} (transferred)`,
    });

    await supabase.from('chat_agents').update({
      active_chats: (available.active_chats || 0) + 1,
      is_busy: ((available.active_chats || 0) + 1) >= available.max_chats,
    }).eq('id', available.id);

    await supabase.from('chat_agents').update({
      active_chats: Math.max(0, (agentStatus?.active_chats || 1) - 1),
      is_busy: false,
    }).eq('id', user.id);

    setAgentStatus(prev => ({
      ...prev,
      active_chats: Math.max(0, (prev?.active_chats || 1) - 1),
    }));

    alert(`Transferred to ${available.name}`);
    setOpenSession(null);
    setMessages([]);
    loadSessions();
  };

  // ── Send quick reply ────────────────────────────────────────────────────────
  const quickReplies = [
    'Thank you for contacting us! How can I help you?',
    'I\'m looking into this for you right now.',
    'Could you please share your Order ID?',
    'Your issue has been escalated to our technical team.',
    'This has been resolved. Please check and let me know.',
    'Is there anything else I can help you with?',
  ];

  // ── Filtered sessions ────────────────────────────────────────────────────────
  const filtered = sessions.filter(s => {
    if (filter === 'all')     return true;
    if (filter === 'mine')    return s.agent_id === user.id && s.status === 'active';
    return s.status === filter;
  });

  const waitingCount = sessions.filter(s => s.status === 'waiting').length;
  const activeCount  = sessions.filter(s => s.status === 'active').length;

  // ── Render message in agent view ─────────────────────────────────────────────
  const renderMsg = (msg) => {
    if (msg.sender_role === 'system') {
      const text = msg.message;
      if (text?.startsWith('AGENT_JOINED:')) {
        return (
          <div key={msg.id} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--green)',
            background: 'rgba(0,255,136,.06)', borderRadius: '20px', padding: '4px 12px',
            margin: '6px auto', maxWidth: '80%', border: '1px solid rgba(0,255,136,.15)' }}>
            ✅ {text.split(':')[1]}
          </div>
        );
      }
      if (text?.startsWith('QUEUE:')) {
        return (
          <div key={msg.id} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--gold)',
            background: 'rgba(255,184,0,.06)', borderRadius: '20px', padding: '4px 12px',
            margin: '6px auto', maxWidth: '80%', border: '1px solid rgba(255,184,0,.15)' }}>
            ⏳ User joined queue at position #{text.split(':')[1]}
          </div>
        );
      }
      if (text === 'SUGGEST_AGENT') return (
        <div key={msg.id} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text3)',
          margin: '4px auto' }}>
          [AI suggested live agent]
        </div>
      );
      return (
        <div key={msg.id} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text3)',
          margin: '4px auto' }}>
          {text}
        </div>
      );
    }

    const isUser  = msg.sender_role === 'user';
    const isAgent = msg.sender_role === 'agent';
    const isAI    = msg.sender_role === 'ai';

    const bg = isUser
      ? 'rgba(0,212,255,.1)'
      : isAgent ? 'rgba(0,255,136,.1)' : 'rgba(123,47,255,.1)';
    const border = isUser
      ? 'rgba(0,212,255,.2)'
      : isAgent ? 'rgba(0,255,136,.2)' : 'rgba(123,47,255,.2)';

    return (
      <div key={msg.id} style={{
        display: 'flex', flexDirection: isUser ? 'row' : 'row-reverse',
        gap: '8px', alignItems: 'flex-end', marginBottom: '10px',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: isUser ? 'var(--neon)' : isAgent ? 'var(--green)' : 'var(--purple)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', color: '#000', fontWeight: 800,
        }}>
          {isUser ? (msg.sender_name?.[0] || 'U').toUpperCase() : isAgent ? '👤' : '🤖'}
        </div>
        <div style={{ maxWidth: '70%' }}>
          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '3px',
            textAlign: isUser ? 'left' : 'right', fontWeight: 600 }}>
            {isUser ? msg.sender_name : isAI ? AI_NAME : `You (${msg.sender_name})`}
          </div>
          <div style={{
            padding: '8px 12px',
            borderRadius: isUser ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
            background: bg, border: `1px solid ${border}`,
            fontSize: '12px', lineHeight: 1.6, color: 'var(--text)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {msg.message}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '3px',
            textAlign: isUser ? 'left' : 'right' }}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  };

  if (!user || user.role !== 'admin') {
    return <div style={{ color: 'var(--danger)', padding: '40px', textAlign: 'center' }}>⛔ Access Denied</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 120px)', minHeight: '500px' }}>

      {/* ── LEFT PANEL: Session List ──────────────────────────────────────── */}
      <div style={{
        width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--gl)', borderRadius: '12px', border: '1px solid var(--br)',
        overflow: 'hidden',
      }}>
        {/* Agent status bar */}
        <div style={{
          padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(0,212,255,.08), rgba(123,47,255,.08))',
          borderBottom: '1px solid var(--br)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontWeight: 800, fontSize: '13px', fontFamily: 'var(--fd)' }}>
              Live Chat
            </div>
            <button onClick={toggleOnline} style={{
              background: agentStatus?.is_online ? 'rgba(0,255,136,.15)' : 'rgba(255,51,85,.1)',
              border: `1px solid ${agentStatus?.is_online ? 'rgba(0,255,136,.3)' : 'rgba(255,51,85,.25)'}`,
              borderRadius: '20px', padding: '4px 12px',
              color: agentStatus?.is_online ? 'var(--green)' : '#ff3355',
              fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            }}>
              {agentStatus?.is_online ? '🟢 Online' : '🔴 Offline'}
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { lb: 'Waiting', vl: waitingCount, cl: 'var(--gold)' },
              { lb: 'Active',  vl: activeCount,  cl: 'var(--neon)' },
              { lb: 'My chats', vl: agentStatus?.active_chats || 0, cl: 'var(--green)' },
            ].map(s => (
              <div key={s.lb} style={{
                flex: 1, textAlign: 'center',
                background: 'rgba(0,0,0,.2)', borderRadius: '8px', padding: '6px 4px',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: s.cl }}>{s.vl}</div>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{s.lb}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--br)', flexShrink: 0 }}>
          {[
            { id: 'waiting', lb: `Waiting${waitingCount > 0 ? ` (${waitingCount})` : ''}` },
            { id: 'active',  lb: 'Active' },
            { id: 'mine',    lb: 'Mine' },
            { id: 'closed',  lb: 'Closed' },
          ].map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)} style={{
              flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer',
              background: filter === t.id ? 'rgba(0,212,255,.08)' : 'transparent',
              borderBottom: filter === t.id ? '2px solid var(--neon)' : '2px solid transparent',
              color: filter === t.id ? 'var(--neon)' : 'var(--text3)',
              fontSize: '10px', fontWeight: 700,
            }}>{t.lb}</button>
          ))}
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px' }}>
              {filter === 'waiting' ? '✅ No users waiting' : 'No sessions'}
            </div>
          ) : filtered.map(sess => {
            const isSelected = openSession?.id === sess.id;
            const isWaiting  = sess.status === 'waiting';
            const isActive   = sess.status === 'active';

            return (
              <div key={sess.id}
                onClick={() => isWaiting ? acceptChat(sess) : openChat(sess)}
                style={{
                  padding: '10px 12px', borderRadius: '10px', marginBottom: '6px',
                  cursor: 'pointer', transition: 'all .15s',
                  background: isSelected
                    ? 'rgba(0,212,255,.1)'
                    : isWaiting ? 'rgba(255,184,0,.06)' : 'rgba(0,0,0,.15)',
                  border: `1px solid ${isSelected
                    ? 'rgba(0,212,255,.3)'
                    : isWaiting ? 'rgba(255,184,0,.2)' : 'var(--br)'}`,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isWaiting && <span style={{ color: 'var(--gold)' }}>⚡ </span>}
                      {sess.user_name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                      {sess.user_email?.slice(0, 22) || 'No email'}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
                      background: isWaiting ? 'rgba(255,184,0,.15)' : isActive ? 'rgba(0,255,136,.1)' : 'var(--gl2)',
                      color: isWaiting ? 'var(--gold)' : isActive ? 'var(--green)' : 'var(--text3)',
                      border: `1px solid ${isWaiting ? 'rgba(255,184,0,.25)' : isActive ? 'rgba(0,255,136,.2)' : 'var(--br)'}`,
                    }}>
                      {isWaiting ? `#${sess.queue_position || '?'} wait` : sess.status}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '5px' }}>
                  {isWaiting ? '👆 Click to accept' : isActive && sess.agent_id === user.id ? '💬 Click to chat' : sess.agent_name ? `Agent: ${sess.agent_name}` : 'Click to view'}
                </div>
                {isWaiting && (
                  <div style={{ marginTop: '6px' }}>
                    <button onClick={(e) => { e.stopPropagation(); acceptChat(sess); }} style={{
                      width: '100%', padding: '5px', borderRadius: '6px',
                      background: 'linear-gradient(135deg, var(--neon), var(--purple))',
                      border: 'none', color: '#000', fontSize: '10px',
                      fontWeight: 800, cursor: 'pointer',
                    }}>
                      ✅ Accept Chat
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat Window ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--gl)', borderRadius: '12px', border: '1px solid var(--br)', overflow: 'hidden' }}>

        {!openSession ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Agent Dashboard</div>
            <div style={{ fontSize: '12px', textAlign: 'center', lineHeight: 1.8, maxWidth: '280px' }}>
              {waitingCount > 0
                ? `⚡ ${waitingCount} user(s) waiting for an agent. Click a session on the left to accept.`
                : 'Select a chat session from the left panel to start helping users.'}
            </div>
            {!agentStatus?.is_online && (
              <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px',
                background: 'rgba(255,51,85,.06)', border: '1px solid rgba(255,51,85,.2)',
                fontSize: '12px', color: '#ff3355', textAlign: 'center' }}>
                ⚠️ You are currently Offline. Click "Online" to start receiving chats.
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{
              padding: '12px 16px',
              background: 'linear-gradient(135deg, rgba(0,255,136,.06), rgba(0,212,255,.06))',
              borderBottom: '1px solid var(--br)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '14px' }}>
                  {openSession.user_name}
                  {openSession.rating && <span style={{ fontSize: '11px', color: 'var(--gold)', marginLeft: '8px' }}>
                    {'⭐'.repeat(openSession.rating)}
                  </span>}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                  {openSession.user_email} •{' '}
                  <span style={{
                    color: openSession.status === 'active' ? 'var(--green)'
                      : openSession.status === 'waiting' ? 'var(--gold)' : 'var(--text3)',
                    fontWeight: 600,
                  }}>
                    {openSession.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {openSession.status === 'active' && (
                  <button onClick={transferChat} style={{
                    background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.2)',
                    borderRadius: '8px', color: 'var(--neon)', padding: '5px 10px',
                    fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                  }}>↗ Transfer</button>
                )}
                {openSession.status !== 'closed' && (
                  <button onClick={closeSession} style={{
                    background: 'rgba(255,51,85,.1)', border: '1px solid rgba(255,51,85,.2)',
                    borderRadius: '8px', color: '#ff3355', padding: '5px 10px',
                    fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                  }}>✕ Close</button>
                )}
                <button onClick={() => { setOpenSession(null); setMessages([]); }} style={{
                  background: 'var(--gl2)', border: '1px solid var(--br)',
                  borderRadius: '8px', color: 'var(--text3)', padding: '5px 10px',
                  fontSize: '11px', cursor: 'pointer',
                }}>← Back</button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column' }}>
              {loadingMsgs ? (
                <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '30px', fontSize: '12px' }}>
                  Loading messages...
                </div>
              ) : (
                messages.map(renderMsg)
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick replies */}
            {openSession.status === 'active' && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,.04)',
                overflowX: 'auto', display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                {quickReplies.map((q, i) => (
                  <button key={i} onClick={() => setReply(q)} style={{
                    flexShrink: 0, background: 'var(--gl2)', border: '1px solid var(--br)',
                    borderRadius: '14px', color: 'var(--text2)',
                    padding: '4px 10px', fontSize: '10px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    {q.slice(0, 28)}{q.length > 28 ? '...' : ''}
                  </button>
                ))}
              </div>
            )}

            {/* Reply input */}
            {openSession.status === 'closed' ? (
              <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: 'var(--green)',
                background: 'rgba(0,255,136,.04)', borderTop: '1px solid rgba(0,255,136,.1)' }}>
                ✅ This session is closed.
                {openSession.rating && ` User rated: ${'⭐'.repeat(openSession.rating)}`}
              </div>
            ) : (
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--br)',
                display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
                  }}
                  placeholder={
                    openSession.status === 'waiting'
                      ? 'Accept the chat first to reply...'
                      : 'Type your reply... (Enter to send)'
                  }
                  disabled={openSession.status === 'waiting'}
                  rows={2}
                  style={{
                    flex: 1, background: 'var(--bg2)', border: '1px solid var(--br)',
                    borderRadius: '10px', color: 'var(--text)', padding: '8px 12px',
                    fontSize: '13px', resize: 'none', fontFamily: 'var(--fu)',
                    outline: 'none', opacity: openSession.status === 'waiting' ? 0.5 : 1,
                  }}
                />
                <button onClick={sendReply}
                  disabled={sending || !reply.trim() || openSession.status !== 'active'}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: reply.trim() && openSession.status === 'active'
                      ? 'linear-gradient(135deg, var(--green), var(--neon))'
                      : 'var(--gl)',
                    border: '1px solid var(--br)',
                    color: reply.trim() ? '#000' : 'var(--text3)',
                    cursor: 'pointer', fontSize: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {sending ? '⏳' : '↑'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

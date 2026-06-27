// LiveChat.js
// Floating live chat widget for all users.
// Flow: User opens chat → AI answers → user can request live agent
//       → system finds available agent → if all busy, joins queue
//       → agent accepts → real-time conversation begins
//
// SQL to run in Supabase before using:
/*
create table if not exists chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  user_name       text not null default 'Guest',
  user_email      text,
  status          text not null default 'ai'
                  check (status in ('ai','waiting','active','closed')),
  agent_id        uuid references auth.users(id) on delete set null,
  agent_name      text,
  queue_position  int default 0,
  started_at      timestamptz default now(),
  last_message_at timestamptz default now(),
  closed_at       timestamptz,
  rating          int check (rating between 1 and 5),
  category        text default 'general'
);

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references chat_sessions(id) on delete cascade not null,
  sender_role text not null check (sender_role in ('user','ai','agent','system')),
  sender_name text not null default '',
  message     text not null,
  created_at  timestamptz default now()
);

create table if not exists chat_agents (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  is_online   boolean default false,
  is_busy     boolean default false,
  active_chats int default 0,
  max_chats   int default 3,
  last_seen   timestamptz default now()
);

create index if not exists chat_messages_session_idx on chat_messages(session_id);
create index if not exists chat_sessions_status_idx  on chat_sessions(status);
create index if not exists chat_sessions_agent_idx   on chat_sessions(agent_id);
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

// ── AI Knowledge base for the panel ──────────────────────────────────────────
const AI_KB = [
  { q: ['order', 'pending', 'stuck', 'not start'], a: 'Your order may be pending due to high demand or a provider issue. Orders usually start within 0–6 hours. If it\'s been more than 24 hours, please share your Order ID and I\'ll escalate it for you.' },
  { q: ['order', 'cancel', 'refund'], a: 'Cancelled orders are automatically refunded to your panel balance within minutes. If you don\'t see the refund, please share your Order ID so I can check.' },
  { q: ['deposit', 'payment', 'add balance', 'top up', 'fund'], a: 'To add balance, go to Deposits → choose your payment method → enter amount → complete payment. Balance is added instantly for most methods. For crypto, allow 1–3 confirmations.' },
  { q: ['drop', 'followers drop', 'decrease', 'reducing'], a: 'Some services have natural drop — this is normal. If your service has a Refill guarantee, go to Orders → find your order → click Refill. For Lifetime Guarantee services, refill is automatic.' },
  { q: ['slow', 'speed', 'fast', 'delivery time'], a: 'Delivery speed depends on the service you chose. Check the service description for estimated delivery time. High-demand services may take longer during peak hours.' },
  { q: ['wrong link', 'wrong url', 'mistake', 'wrong order'], a: 'Unfortunately orders cannot be cancelled or modified once they start processing. Always double-check your link before ordering. Contact support if the order hasn\'t started yet.' },
  { q: ['price', 'cost', 'cheap', 'expensive', 'rate'], a: 'All prices are shown in your account currency per 1000 units. You can switch currency in your Profile settings. Bulk orders get the same rate — no hidden fees.' },
  { q: ['api', 'reseller', 'api key', 'panel api'], a: 'Our API is available to resellers. Go to Profile → Panel API to get your API key and documentation. You can use it to place orders and check statuses programmatically.' },
  { q: ['referral', 'refer', 'earn', 'commission'], a: 'You earn commission for every user you refer. Go to Referral page to get your unique link. Commission is added to your balance automatically when your referrals make deposits.' },
  { q: ['account', 'login', 'password', 'email'], a: 'For account issues like login problems or password reset, use the Forgot Password link on the login page. If you\'re locked out, contact our support team with your registered email.' },
  { q: ['service', 'available', 'list', 'what service'], a: 'We offer 2400+ SMM services including Instagram, YouTube, TikTok, Facebook, Twitter, Telegram and more. Browse the Services page and use filters to find what you need.' },
  { q: ['balance', 'wallet', 'credit'], a: 'Your balance is shown on the home dashboard. It\'s used automatically when you place orders. Add more balance anytime via the Deposits page.' },
];

const AI_FALLBACK = "I'm not sure about that specific question. Let me connect you with a live support agent who can help you better. Would you like me to transfer you to an agent?";
const AI_NAME = '🤖 NexusBot';
const PANEL_NAME = 'NexusFlow Support';

// ── Simple AI matcher ─────────────────────────────────────────────────────────
function aiReply(msg) {
  const m = msg.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of AI_KB) {
    const score = entry.q.filter(kw => m.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }

  if (bestScore >= 1 && best) return { text: best.a, confident: bestScore >= 2 };
  return { text: AI_FALLBACK, confident: false };
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '8px 12px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--neon)',
          animation: `chatdot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

export default function LiveChat({ user }) {
  const [open,        setOpen]        = useState(false);
  const [session,     setSession]     = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [aiTyping,    setAiTyping]    = useState(false);
  const [status,      setStatus]      = useState('ai'); // ai | waiting | active | closed | rating
  const [queuePos,    setQueuePos]    = useState(0);
  const [agentName,   setAgentName]   = useState('');
  const [rating,      setRating]      = useState(0);
  const [unread,      setUnread]      = useState(0);
  const [starting,    setStarting]    = useState(false);

  const bottomRef    = useRef(null);
  const realtimeRef  = useRef(null);
  const sessionRef   = useRef(null);
  const inputRef     = useRef(null);

  // Keep sessionRef in sync
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    if (open) setUnread(0);
  }, [messages, open]);

  // ── Start a new chat session ────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (session) return;
    setStarting(true);

    const { data: sess, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id:    user?.id || null,
        user_name:  user?.name || user?.email?.split('@')[0] || 'Guest',
        user_email: user?.email || null,
        status:     'ai',
      })
      .select().single();

    if (error || !sess) { setStarting(false); return; }
    setSession(sess);
    setStatus('ai');

    // Welcome message from AI
    const welcome = {
      id: 'welcome',
      session_id: sess.id,
      sender_role: 'ai',
      sender_name: AI_NAME,
      message: `Hi ${user?.name || 'there'}! 👋 I'm NexusBot, your AI assistant. I can help with orders, deposits, services, and more.\n\nWhat can I help you with today?`,
      created_at: new Date().toISOString(),
    };

    await supabase.from('chat_messages').insert({
      session_id:  sess.id,
      sender_role: 'ai',
      sender_name: AI_NAME,
      message:     welcome.message,
    });

    setMessages([welcome]);
    subscribeToSession(sess.id);
    setStarting(false);
  }, [session, user]);

  // ── Subscribe to real-time messages and session changes ──────────────────────
  const subscribeToSession = useCallback((sessionId) => {
    if (realtimeRef.current) realtimeRef.current.unsubscribe();

    realtimeRef.current = supabase
      .channel(`chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const msg = payload.new;
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (!open || document.hidden) {
          setUnread(n => n + 1);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chat_sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        const updated = payload.new;
        setStatus(updated.status);
        setQueuePos(updated.queue_position || 0);
        setAgentName(updated.agent_name || '');
        setSession(prev => ({ ...prev, ...updated }));
      })
      .subscribe();
  }, [open]);

  // Auto-start session when user opens chat
  useEffect(() => {
    if (open && !session && !starting) {
      startSession();
    }
  }, [open, session, starting, startSession]);

  // Cleanup
  useEffect(() => {
    return () => { if (realtimeRef.current) realtimeRef.current.unsubscribe(); };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // ── Send user message ────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !session || sending) return;
    setInput('');
    setSending(true);

    // Insert user message
    await supabase.from('chat_messages').insert({
      session_id:  session.id,
      sender_role: 'user',
      sender_name: user?.name || 'You',
      message:     text,
    });

    await supabase.from('chat_sessions').update({
      last_message_at: new Date().toISOString(),
    }).eq('id', session.id);

    // If in AI mode, generate AI reply
    if (status === 'ai') {
      setAiTyping(true);
      await new Promise(r => setTimeout(r, 900 + Math.random() * 700));

      const { text: replyText, confident } = aiReply(text);

      await supabase.from('chat_messages').insert({
        session_id:  session.id,
        sender_role: 'ai',
        sender_name: AI_NAME,
        message:     replyText,
      });

      setAiTyping(false);

      // If AI is not confident, suggest live agent
      if (!confident) {
        await new Promise(r => setTimeout(r, 600));
        await supabase.from('chat_messages').insert({
          session_id:  session.id,
          sender_role: 'system',
          sender_name: 'System',
          message:     'SUGGEST_AGENT',
        });
      }
    }

    setSending(false);
  }, [input, session, sending, status, user]);

  // ── Request live agent ───────────────────────────────────────────────────────
  const requestAgent = useCallback(async () => {
    if (!session) return;

    // Find an available agent
    const { data: agents } = await supabase
      .from('chat_agents')
      .select('*')
      .eq('is_online', true)
      .order('active_chats', { ascending: true });

    const available = (agents || []).find(a => a.active_chats < a.max_chats);

    if (available) {
      // Assign directly
      await supabase.from('chat_sessions').update({
        status:     'active',
        agent_id:   available.id,
        agent_name: available.name,
      }).eq('id', session.id);

      await supabase.from('chat_agents').update({
        active_chats: available.active_chats + 1,
        is_busy: (available.active_chats + 1) >= available.max_chats,
      }).eq('id', available.id);

      await supabase.from('chat_messages').insert({
        session_id:  session.id,
        sender_role: 'system',
        sender_name: 'System',
        message:     `AGENT_JOINED:${available.name}`,
      });

      setStatus('active');
      setAgentName(available.name);
    } else {
      // Put in queue
      const { count } = await supabase
        .from('chat_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');

      const pos = (count || 0) + 1;

      await supabase.from('chat_sessions').update({
        status:         'waiting',
        queue_position: pos,
      }).eq('id', session.id);

      await supabase.from('chat_messages').insert({
        session_id:  session.id,
        sender_role: 'system',
        sender_name: 'System',
        message:     `QUEUE:${pos}`,
      });

      setStatus('waiting');
      setQueuePos(pos);
    }
  }, [session]);

  // ── End chat ─────────────────────────────────────────────────────────────────
  const endChat = useCallback(async () => {
    if (!session) return;

    await supabase.from('chat_sessions').update({
      status:    'closed',
      closed_at: new Date().toISOString(),
    }).eq('id', session.id);

    if (session.agent_id) {
      const { data: agent } = await supabase
        .from('chat_agents').select('active_chats').eq('id', session.agent_id).single();
      if (agent) {
        await supabase.from('chat_agents').update({
          active_chats: Math.max(0, (agent.active_chats || 1) - 1),
          is_busy: false,
        }).eq('id', session.agent_id);
      }
    }

    setStatus('rating');
  }, [session]);

  // ── Submit rating ─────────────────────────────────────────────────────────────
  const submitRating = useCallback(async (stars) => {
    if (!session) return;
    setRating(stars);
    await supabase.from('chat_sessions').update({ rating: stars }).eq('id', session.id);
    setStatus('closed');
  }, [session]);

  // ── New chat ──────────────────────────────────────────────────────────────────
  const newChat = useCallback(() => {
    if (realtimeRef.current) realtimeRef.current.unsubscribe();
    setSession(null);
    setMessages([]);
    setStatus('ai');
    setAgentName('');
    setRating(0);
    setQueuePos(0);
  }, []);

  // ── Render a single message ───────────────────────────────────────────────────
  const renderMessage = (msg) => {
    if (msg.sender_role === 'system') {
      // Special system messages
      if (msg.message === 'SUGGEST_AGENT') {
        return (
          <div key={msg.id} style={{ textAlign: 'center', margin: '8px 0' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
              Want to speak with a human agent?
            </div>
            <button
              onClick={requestAgent}
              style={{
                background: 'linear-gradient(135deg, var(--purple), var(--neon))',
                border: 'none', borderRadius: '20px', color: '#fff',
                padding: '8px 18px', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer',
              }}>
              👤 Connect to Live Agent
            </button>
          </div>
        );
      }
      if (msg.message?.startsWith('AGENT_JOINED:')) {
        const name = msg.message.split(':')[1];
        return (
          <div key={msg.id} style={{
            textAlign: 'center', fontSize: '11px', color: 'var(--green)',
            background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.15)',
            borderRadius: '20px', padding: '6px 14px', margin: '6px auto', maxWidth: '80%',
          }}>
            ✅ {name} has joined the chat
          </div>
        );
      }
      if (msg.message?.startsWith('QUEUE:')) {
        const pos = msg.message.split(':')[1];
        return (
          <div key={msg.id} style={{
            textAlign: 'center', fontSize: '11px', color: 'var(--gold)',
            background: 'rgba(255,184,0,.06)', border: '1px solid rgba(255,184,0,.15)',
            borderRadius: '20px', padding: '6px 14px', margin: '6px auto', maxWidth: '85%',
          }}>
            ⏳ You are #{pos} in queue. An agent will be with you shortly.
          </div>
        );
      }
      return null;
    }

    const isUser  = msg.sender_role === 'user';
    const isAI    = msg.sender_role === 'ai';
    const isAgent = msg.sender_role === 'agent';

    const bubbleColor = isUser
      ? 'linear-gradient(135deg, rgba(0,212,255,.18), rgba(0,212,255,.08))'
      : isAI
        ? 'linear-gradient(135deg, rgba(123,47,255,.18), rgba(123,47,255,.08))'
        : 'linear-gradient(135deg, rgba(0,255,136,.18), rgba(0,255,136,.08))';

    const borderColor = isUser
      ? 'rgba(0,212,255,.25)'
      : isAI ? 'rgba(123,47,255,.25)' : 'rgba(0,255,136,.25)';

    const avatar = isUser
      ? (user?.name?.[0] || 'U').toUpperCase()
      : isAI ? '🤖' : '👤';

    const avatarBg = isUser ? 'var(--neon)' : isAI ? 'var(--purple)' : 'var(--green)';

    return (
      <div key={msg.id} style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: '7px', marginBottom: '10px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: avatarBg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '11px', color: '#000', fontWeight: 800,
        }}>
          {avatar}
        </div>
        <div style={{ maxWidth: '75%' }}>
          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '3px',
            textAlign: isUser ? 'right' : 'left', fontWeight: 600 }}>
            {isUser ? 'You' : isAI ? AI_NAME : `👤 ${msg.sender_name}`}
          </div>
          <div style={{
            padding: '9px 12px', borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            background: bubbleColor, border: `1px solid ${borderColor}`,
            fontSize: '12px', lineHeight: 1.6, color: 'var(--text)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {msg.message}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '3px',
            textAlign: isUser ? 'right' : 'left' }}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  };

  // ── Status bar ─────────────────────────────────────────────────────────────────
  const StatusBar = () => {
    if (status === 'ai') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neon)', boxShadow: '0 0 6px var(--neon)' }} />
        <span style={{ fontSize: '10px', color: 'var(--neon)' }}>AI Assistant Online</span>
      </div>
    );
    if (status === 'waiting') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
        <span style={{ fontSize: '10px', color: 'var(--gold)' }}>Queue position: #{queuePos}</span>
      </div>
    );
    if (status === 'active') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
        <span style={{ fontSize: '10px', color: 'var(--green)' }}>Connected to {agentName}</span>
      </div>
    );
    return null;
  };

  return (
    <>
      {/* ── CSS for typing dots ─── */}
      <style>{`
        @keyframes chatdot {
          0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
          40%          { transform: scale(1);   opacity: 1; }
        }
        .chat-widget {
          position: fixed; bottom: 80px; right: 16px;
          width: min(380px, calc(100vw - 32px));
          height: min(560px, calc(100vh - 140px));
          z-index: 9999;
          display: flex; flex-direction: column;
          background: var(--bg2);
          border: 1px solid rgba(0,212,255,.2);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(0,212,255,.08);
          overflow: hidden;
          animation: chatSlideUp .25s ease-out;
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .chat-fab {
          position: fixed; bottom: 20px; right: 16px; z-index: 9999;
          width: 52px; height: 52px; border-radius: 50%;
          background: linear-gradient(135deg, var(--neon), var(--purple));
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          box-shadow: 0 4px 20px rgba(0,212,255,.4);
          transition: transform .2s, box-shadow .2s;
        }
        .chat-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(0,212,255,.6); }
        .chat-fab:active { transform: scale(.95); }
      `}</style>

      {/* ── Floating Action Button ──────────────────────────────────────────── */}
      <button className="chat-fab" onClick={() => setOpen(o => !o)} title="Live Support">
        {open ? '✕' : '💬'}
        {unread > 0 && !open && (
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: '#ff3355', color: '#fff',
            fontSize: '10px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg0)',
          }}>{unread > 9 ? '9+' : unread}</div>
        )}
      </button>

      {/* ── Chat Widget ────────────────────────────────────────────────────── */}
      {open && (
        <div className="chat-widget">

          {/* Header */}
          <div style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(0,212,255,.12), rgba(123,47,255,.12))',
            borderBottom: '1px solid rgba(255,255,255,.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--neon), var(--purple))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}>💬</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '13px', fontFamily: 'var(--fd)' }}>
                  {PANEL_NAME}
                </div>
                <StatusBar />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(status === 'active' || status === 'ai' || status === 'waiting') && (
                <button onClick={endChat} style={{
                  background: 'rgba(255,51,85,.12)', border: '1px solid rgba(255,51,85,.25)',
                  borderRadius: '8px', color: '#ff3355', padding: '4px 10px',
                  cursor: 'pointer', fontSize: '10px', fontWeight: 700,
                }}>End Chat</button>
              )}
              <button onClick={() => setOpen(false)} style={{
                background: 'var(--gl)', border: '1px solid var(--br)',
                borderRadius: '8px', color: 'var(--text3)', padding: '4px 8px',
                cursor: 'pointer', fontSize: '14px',
              }}>✕</button>
            </div>
          </div>

          {/* ── RATING SCREEN ── */}
          {status === 'rating' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: '32px 24px',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>🌟</div>
              <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '8px', textAlign: 'center' }}>
                How was your experience?
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '20px', textAlign: 'center' }}>
                Rate your support session to help us improve
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} onClick={() => submitRating(s)} style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: rating >= s ? 'var(--gold)' : 'var(--gl)',
                    border: `2px solid ${rating >= s ? 'var(--gold)' : 'var(--br)'}`,
                    fontSize: '20px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s',
                  }}>⭐</button>
                ))}
              </div>
              <button onClick={() => setStatus('closed')} style={{
                background: 'none', border: 'none', color: 'var(--text3)',
                fontSize: '11px', cursor: 'pointer', textDecoration: 'underline',
              }}>Skip rating</button>
            </div>
          )}

          {/* ── CLOSED SCREEN ── */}
          {status === 'closed' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: '32px 24px',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '8px' }}>Chat Ended</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '22px', textAlign: 'center', lineHeight: 1.7 }}>
                Thanks for contacting {PANEL_NAME}. We hope we could help!
              </div>
              <button onClick={newChat} style={{
                background: 'linear-gradient(135deg, var(--neon), var(--purple))',
                border: 'none', borderRadius: '24px', color: '#000',
                padding: '10px 24px', fontSize: '13px', fontWeight: 800,
                cursor: 'pointer',
              }}>Start New Chat</button>
            </div>
          )}

          {/* ── LOADING ── */}
          {starting && status !== 'closed' && status !== 'rating' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>💬</div>
                Connecting...
              </div>
            </div>
          )}

          {/* ── CHAT AREA ── */}
          {!starting && status !== 'closed' && status !== 'rating' && (
            <>
              {/* Messages */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '14px 14px 4px',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Quick help buttons (show before first user message) */}
                {messages.length <= 1 && status === 'ai' && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', textAlign: 'center' }}>
                      Common questions:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                      {['Order pending?', 'Add balance', 'Service slow', 'Refund request', 'How to order?'].map(q => (
                        <button key={q} onClick={() => {
                          setInput(q);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }} style={{
                          background: 'var(--gl)', border: '1px solid var(--br)',
                          borderRadius: '16px', color: 'var(--text2)',
                          padding: '5px 12px', fontSize: '11px', cursor: 'pointer',
                        }}>{q}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map(renderMessage)}

                {aiTyping && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '7px', marginBottom: '10px' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--purple)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '11px',
                    }}>🤖</div>
                    <div style={{
                      padding: '2px 4px', borderRadius: '14px 14px 14px 4px',
                      background: 'linear-gradient(135deg, rgba(123,47,255,.18), rgba(123,47,255,.08))',
                      border: '1px solid rgba(123,47,255,.25)',
                    }}>
                      <TypingDots />
                    </div>
                  </div>
                )}

                {/* Waiting banner */}
                {status === 'waiting' && (
                  <div style={{
                    textAlign: 'center', padding: '12px',
                    background: 'rgba(255,184,0,.06)', borderRadius: '10px',
                    border: '1px solid rgba(255,184,0,.15)', marginBottom: '10px',
                  }}>
                    <div style={{ fontSize: '18px', marginBottom: '6px' }}>⏳</div>
                    <div style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: 700 }}>
                      You are #{queuePos} in queue
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                      An agent will join shortly. You can keep chatting with AI while you wait.
                    </div>
                  </div>
                )}

                {/* Agent connect button (if in AI mode) */}
                {status === 'ai' && messages.length > 2 && (
                  <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <button onClick={requestAgent} style={{
                      background: 'none', border: '1px solid rgba(123,47,255,.3)',
                      borderRadius: '16px', color: 'var(--purple2, #9b6dff)',
                      padding: '5px 14px', fontSize: '10px', cursor: 'pointer',
                    }}>
                      👤 Talk to a human agent
                    </button>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: '10px 12px',
                borderTop: '1px solid rgba(255,255,255,.06)',
                background: 'rgba(0,0,0,.2)',
                display: 'flex', gap: '8px', alignItems: 'flex-end',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    status === 'waiting' ? 'Waiting for agent... you can still chat with AI' :
                    status === 'active'  ? `Message ${agentName}...` :
                    'Ask me anything...'
                  }
                  rows={1}
                  style={{
                    flex: 1, background: 'var(--gl)', border: '1px solid var(--br)',
                    borderRadius: '10px', color: 'var(--text)', padding: '8px 12px',
                    fontSize: '13px', resize: 'none', fontFamily: 'var(--fu)',
                    outline: 'none', lineHeight: 1.5, maxHeight: '80px',
                    overflowY: 'auto',
                  }}
                />
                <button
                  onClick={send}
                  disabled={sending || !input.trim() || !session}
                  style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: input.trim()
                      ? 'linear-gradient(135deg, var(--neon), var(--purple))'
                      : 'var(--gl)',
                    border: `1px solid ${input.trim() ? 'transparent' : 'var(--br)'}`,
                    color: input.trim() ? '#000' : 'var(--text3)',
                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '16px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', transition: 'all .2s',
                  }}>
                  {sending ? '⏳' : '↑'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

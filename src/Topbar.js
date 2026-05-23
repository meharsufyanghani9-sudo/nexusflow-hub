import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabase';

export default function Topbar({ user, page, onNav, onLogout, onCurrency, onTheme, darkMode, setSbOpen }) {
  const [dropOpen, setDropOpen] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState(''); // ── NEW: Telegram state
  const dropRef = useRef(null);

  const pageTitles = {
    dashboard:'Dashboard',marketplace:'Marketplace',orders:'My Orders',
    deposit:'Add Funds',transactions:'Transactions',referral:'Referral & Earn',
    tasks:'Earn Tasks',profile:'My Profile',services:'Services',
    earnings:'Earnings',deposits:'Manage Deposits',withdrawals:'Withdrawals',
    users:'All Users',resellers:'Resellers',api:'API Import',
    disputes:'Disputes',settings:'Settings',admintasks:'Manage Tasks',
    adminreferral:'Referral Settings',support:'Support Tickets',
    currencies:'Currency Rates',
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    loadContactSettings();
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── FIX: Now loads BOTH WhatsApp and Telegram from settings ──────────────
  const loadContactSettings = async () => {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['whatsapp', 'telegram']);

    if (data) {
      data.forEach(row => {
        if (row.key === 'whatsapp' && row.value) setWhatsapp(row.value);
        if (row.key === 'telegram' && row.value) setTelegram(row.value);
      });
    }
  };

  // ── Helper: build the correct Telegram URL ────────────────────────────────
  // Admin can enter: @nexusflow  OR  nexusflow  OR  https://t.me/nexusflow
  const getTelegramUrl = (val) => {
    if (!val) return '';
    if (val.startsWith('http')) return val; // already a full URL
    const clean = val.replace(/^@/, ''); // strip leading @
    return `https://t.me/${clean}`;
  };

  const sendTicket = async () => {
    if (!subject || !message) { alert('Fill all fields'); return; }
    setSending(true);
    await supabase.from('support_tickets').insert({
      user_id: user.id, user_name: user.name,
      user_email: user.email, subject, message, status: 'open',
    });
    setSending(false); setSent(true);
    setSubject(''); setMessage('');
    setTimeout(() => { setSent(false); setShowSupport(false); }, 2500);
  };

  const roleColor = user.role === 'admin' ? 'var(--purple)' : user.role === 'reseller' ? 'var(--gold)' : 'var(--neon)';

  const dropItems = [
    { ic: '👤', lb: 'My Profile', fn: () => { onNav('profile'); setDropOpen(false); } },
    ...(user.role === 'buyer' ? [
      { ic: '📦', lb: 'My Orders', fn: () => { onNav('orders'); setDropOpen(false); } },
      { ic: '💳', lb: 'Add Funds', fn: () => { onNav('deposit'); setDropOpen(false); } },
      { ic: '🎁', lb: 'Referral', fn: () => { onNav('referral'); setDropOpen(false); } },
    ] : []),
    { ic: '📊', lb: 'Transactions', fn: () => { onNav('transactions'); setDropOpen(false); } },
    { ic: '💱', lb: 'Change Currency', fn: () => { onCurrency(); setDropOpen(false); } },
    { ic: darkMode ? '☀️' : '🌙', lb: darkMode ? 'Light Mode' : 'Dark Mode', fn: () => { onTheme(); setDropOpen(false); } },
    { ic: '🎧', lb: 'Support', fn: () => { setShowSupport(true); setDropOpen(false); } },
  ];

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div className="ham" onClick={() => setSbOpen(true)}>
            <div className="hl" /><div className="hl" /><div className="hl" />
          </div>
          <div className="pgtl">{pageTitles[page] || page}</div>
        </div>

        <div className="topbar-right">
          {/* Balance */}
          <div className="bal-chip">
            <span className="bc-lbl">Balance</span>
            <span className="bc-val">${user.balance.toFixed(2)}</span>
          </div>

          {/* Currency button */}
          <button className="btn bgh bsm" onClick={onCurrency}
            style={{ padding: '6px 8px', fontSize: '14px' }} title="Currency">
            💱
          </button>

          {/* Theme button */}
          <button className="btn bgh bsm" onClick={onTheme}
            style={{ padding: '6px 8px', fontSize: '14px' }} title="Theme">
            {darkMode ? '☀️' : '🌙'}
          </button>

          {/* Profile Dropdown Avatar */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <div onClick={() => setDropOpen(!dropOpen)} style={{
              width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
              background: `linear-gradient(135deg,${roleColor},var(--purple))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Orbitron,monospace', fontWeight: 900, fontSize: '12px', color: '#fff',
              boxShadow: `0 0 10px ${roleColor}50`, border: `2px solid ${roleColor}60`,
              flexShrink: 0, userSelect: 'none', transition: 'all .2s',
            }}>
              {user.name[0].toUpperCase()}
            </div>

            {dropOpen && (
              <div style={{
                position: 'absolute', top: '40px', right: 0, width: '205px',
                background: 'var(--bg2)', border: '1px solid var(--br2)',
                borderRadius: '12px', padding: '5px', zIndex: 9999,
                boxShadow: '0 16px 40px rgba(0,0,0,.75)',
              }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--br)', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px' }}>{user.name}</div>
                  {user.username && (
                    <div style={{ fontSize: '10px', color: 'var(--neon)', marginBottom: '2px', fontFamily: 'var(--fm)' }}>@{user.username}</div>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px', wordBreak: 'break-all' }}>{user.email}</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span className={`bdg b-${user.role}`}>{user.role}</span>
                    <span className="bdg b-completed">${user.balance.toFixed(2)}</span>
                  </div>
                </div>

                {dropItems.map((item, i) => (
                  <div key={i} onClick={item.fn} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', borderRadius: '7px', cursor: 'pointer',
                    fontSize: '12px', color: 'var(--text2)', fontWeight: 600, transition: 'all .15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--gl2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: '13px' }}>{item.ic}</span>
                    <span>{item.lb}</span>
                  </div>
                ))}

                <div style={{ borderTop: '1px solid var(--br)', marginTop: '4px', paddingTop: '4px' }}>
                  <div onClick={() => { onLogout(); setDropOpen(false); }} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', borderRadius: '7px', cursor: 'pointer',
                    fontSize: '12px', color: 'var(--danger)', fontWeight: 700, transition: 'all .15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,51,85,.08)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <span>⏻</span><span>Logout</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Telegram Floating Button ── */}
      {telegram && (
        <a href={getTelegramUrl(telegram)}
          target="_blank" rel="noreferrer"
          style={{
            position: 'fixed',
            bottom: `calc(var(--mnh) + 136px)`, // above WhatsApp button
            right: '16px', width: '48px', height: '48px',
            borderRadius: '50%', zIndex: 8000,
            background: '#0088cc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(0,136,204,.5)',
            transition: 'transform .2s',
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Telegram Support">
          ✈️
        </a>
      )}

      {/* ── WhatsApp Floating Button ── */}
      {whatsapp && (
        <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
          target="_blank" rel="noreferrer"
          style={{
            position: 'fixed',
            bottom: `calc(var(--mnh) + 76px)`, // above support button
            right: '16px', width: '48px', height: '48px',
            borderRadius: '50%', zIndex: 8000,
            background: '#25D366',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(37,211,102,.5)',
            transition: 'transform .2s',
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          title="WhatsApp Support">
          💬
        </a>
      )}

      {/* ── Support Floating Button ── */}
      <button onClick={() => setShowSupport(true)} style={{
        position: 'fixed',
        bottom: `calc(var(--mnh) + 16px)`,
        right: '16px', width: '48px', height: '48px',
        borderRadius: '50%', zIndex: 8000,
        background: 'linear-gradient(135deg,var(--neon2),var(--purple))',
        border: 'none', cursor: 'pointer', fontSize: '20px',
        boxShadow: '0 4px 16px rgba(0,212,255,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform .2s',
      }}
      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
      onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      title="Contact Support">
        🎧
      </button>

      {/* ── Support Modal ── */}
      {showSupport && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setShowSupport(false)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div className="mttl">🎧 Contact Support</div>
              <button onClick={() => setShowSupport(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '28px' }}>
                <div style={{ fontSize: '44px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontFamily: 'Orbitron,monospace', fontSize: '13px', color: 'var(--green)', marginBottom: '6px' }}>Ticket Submitted!</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Admin will reply within 24 hours.</div>
              </div>
            ) : (
              <>
                {/* WhatsApp quick link in modal */}
                {whatsapp && (
                  <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                    target="_blank" rel="noreferrer"
                    style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
                    <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.25)', color: '#25D366', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>💬</span><span>Chat on WhatsApp →</span>
                    </div>
                  </a>
                )}
                {/* Telegram quick link in modal */}
                {telegram && (
                  <a href={getTelegramUrl(telegram)}
                    target="_blank" rel="noreferrer"
                    style={{ textDecoration: 'none', display: 'block', marginBottom: '12px' }}>
                    <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,136,204,.08)', border: '1px solid rgba(0,136,204,.25)', color: '#0088cc', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>✈️</span><span>Message on Telegram →</span>
                    </div>
                  </a>
                )}
                <div style={{ padding: '8px 12px', borderRadius: '7px', background: 'rgba(0,212,255,.06)', border: '1px solid var(--br)', fontSize: '11px', color: 'var(--text2)', marginBottom: '12px' }}>
                  Submitting as: <strong style={{ color: 'var(--neon)' }}>{user.email}</strong>
                </div>
                <div className="fi">
                  <label className="fl">Subject</label>
                  <input className="inp" placeholder="e.g. Order not delivered"
                    value={subject} onChange={e => setSubject(e.target.value)} />
                </div>
                <div className="fi">
                  <label className="fl">Message</label>
                  <textarea className="inp" placeholder="Describe your issue..."
                    value={message} onChange={e => setMessage(e.target.value)}
                    style={{ minHeight: '90px', resize: 'vertical', fontFamily: 'Rajdhani,sans-serif' }} />
                </div>
                <button className="btn bp blg bw" onClick={sendTicket} disabled={sending}>
                  <span>{sending ? 'Sending...' : 'Submit Ticket'}</span><span>→</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
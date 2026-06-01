import React, { useState } from 'react';
import { supabase } from './supabase';

// ─── SECURITY FIX: Escape HTML to prevent injection in email body ─────────────
// If an admin types <script> or <img onerror=...> in the subject or message,
// this function converts it to safe plain text before putting it in the HTML email.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export default function AdminMassEmail() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const [targetRole, setTargetRole] = useState('all');
  const [preview, setPreview] = useState(false);

  const sendEmails = async () => {
    if (!subject.trim() || !message.trim()) {
      setResult('❌ Please fill in both subject and message.');
      return;
    }
    // Basic length limits
    if (subject.trim().length > 200) {
      setResult('❌ Subject is too long (max 200 characters).');
      return;
    }
    if (message.trim().length > 5000) {
      setResult('❌ Message is too long (max 5000 characters).');
      return;
    }

    if (!window.confirm(`Send email to all ${targetRole === 'all' ? 'users' : targetRole + 's'}? This cannot be undone.`)) return;

    setSending(true);
    setResult('');

    let query = supabase.from('users').select('email, full_name, role');
    if (targetRole !== 'all') query = query.eq('role', targetRole);
    const { data: users, error } = await query;

    if (error || !users) {
      setResult('❌ Failed to fetch users. Check Supabase connection.');
      setSending(false);
      return;
    }

    const usersWithEmail = users.filter(u => u.email);
    let sent = 0;
    let failed = 0;

    // ─── FIX: Escape all user-supplied values before putting in HTML ─────────
    const safeSubject = escapeHtml(subject.trim());
    const safeMessage = escapeHtml(message.trim()).replace(/\n/g, '<br/>');
    // ─────────────────────────────────────────────────────────────────────────

    for (const u of usersWithEmail) {
      try {
        const safeName = escapeHtml(u.full_name || 'User');
        const { error: fnError } = await supabase.functions.invoke('send-email', {
          body: {
            to: u.email,
            subject: subject.trim(), // plain text subject
            body: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#7b2fff;">${safeSubject}</h2>
                <p>Hi ${safeName},</p>
                <div style="margin:20px 0;line-height:1.6;">
                  ${safeMessage}
                </div>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
                <p style="color:#999;font-size:12px;">— NexusFlow Team</p>
              </div>
            `
          }
        });
        if (fnError) failed++;
        else sent++;
      } catch (e) {
        failed++;
      }
    }

    if (failed === 0) {
      setResult(`✅ Email sent successfully to ${sent} users!`);
    } else {
      setResult(`⚠️ Sent to ${sent} users. ${failed} failed (check Edge Function setup).`);
    }

    setSending(false);
  };

  const isSuccess = result.startsWith('✅');
  const isWarning = result.startsWith('⚠️');

  return (
    <div style={{ maxWidth: '640px' }}>
      <div className="st">📨 Mass Email</div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '20px' }}>
        Send an email to all users or a specific group. Requires Supabase Edge Function "send-email" to be set up.
      </div>

      {result && (
        <div style={{
          padding: '12px 14px', borderRadius: '8px', marginBottom: '16px',
          fontSize: '12px', fontWeight: 700,
          background: isSuccess ? 'rgba(0,255,136,.08)' : isWarning ? 'rgba(255,184,0,.08)' : 'rgba(255,51,85,.08)',
          border: `1px solid ${isSuccess ? 'rgba(0,255,136,.25)' : isWarning ? 'rgba(255,184,0,.25)' : 'rgba(255,51,85,.25)'}`,
          color: isSuccess ? 'var(--green)' : isWarning ? 'var(--warn)' : 'var(--danger)',
        }}>
          {result}
        </div>
      )}

      <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
        <div className="fi">
          <label className="fl">Send To</label>
          <select className="sel" value={targetRole} onChange={e => setTargetRole(e.target.value)}>
            <option value="all">👥 All Users</option>
            <option value="buyer">🛒 Buyers Only</option>
            <option value="reseller">🏪 Resellers Only</option>
            <option value="admin">👑 Admins Only</option>
          </select>
        </div>
        <div className="fi">
          <label className="fl">Email Subject <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(max 200 chars)</span></label>
          <input
            className="inp"
            placeholder="e.g. New payment method added!"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={200}
          />
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{subject.length}/200</div>
        </div>
        <div className="fi">
          <label className="fl">Message Body <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(plain text only, max 5000 chars)</span></label>
          <textarea
            className="inp"
            rows={8}
            style={{ resize: 'vertical', minHeight: '160px' }}
            placeholder="Write your message here. Line breaks will be preserved. Do not use HTML tags."
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={5000}
          />
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>{message.length}/5000</div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button className="btn bgh bmd" onClick={() => setPreview(!preview)}>
            {preview ? '🙈 Hide Preview' : '👁 Preview Email'}
          </button>
        </div>

        {preview && subject && message && (
          <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--br)', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '10px', letterSpacing: '2px', textTransform: 'uppercase' }}>Email Preview (plain text — safe)</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--purple)', marginBottom: '8px' }}>{subject}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>Hi [User Name],</div>
            <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{message}</div>
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text3)' }}>— NexusFlow Team</div>
          </div>
        )}

        <button
          className="btn bp blg bw"
          onClick={sendEmails}
          disabled={sending || !subject.trim() || !message.trim()}>
          <span>{sending ? 'Sending... please wait' : `📨 Send to All ${targetRole === 'all' ? 'Users' : targetRole + 's'}`}</span>
          <span>→</span>
        </button>
      </div>

      <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255,184,0,.06)', border: '1px solid rgba(255,184,0,.2)', fontSize: '11px', color: 'var(--text2)', lineHeight: 1.8 }}>
        ⚠️ <strong style={{ color: 'var(--warn)' }}>Requires Edge Function:</strong><br />
        Deploy a Supabase Edge Function named <code style={{ fontFamily: 'var(--fm)', color: 'var(--neon)' }}>send-email</code> that accepts <code style={{ fontFamily: 'var(--fm)', color: 'var(--neon)' }}>to</code>, <code style={{ fontFamily: 'var(--fm)', color: 'var(--neon)' }}>subject</code>, and <code style={{ fontFamily: 'var(--fm)', color: 'var(--neon)' }}>body</code> fields.
        Use Resend, SendGrid or Postmark as your email provider.
      </div>
    </div>
  );
}

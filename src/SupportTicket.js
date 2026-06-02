import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function SupportTicket({ user }) {
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('new'); // 'new' or 'history'

  const categories = [
    { value:'general', label:'General Question' },
    { value:'order', label:'Order Issue' },
    { value:'payment', label:'Payment / Deposit' },
    { value:'refund', label:'Refund Request' },
    { value:'technical', label:'Technical Problem' },
  ];

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setTickets(data);
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
      setSubject('');
      setMessage('');
      setCategory('general');
      setDone(true);
      setView('history');
      loadTickets();
      setTimeout(() => setDone(false), 5000);
    }
    setSubmitting(false);
  };

  const statusColor = (s) => {
    if (s === 'open') return 'b-pending';
    if (s === 'in_progress') return 'b-processing';
    if (s === 'replied') return 'b-processing';
    if (s === 'resolved') return 'b-completed';
    return 'b-rejected';
  };

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

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
          { id:'new', label:'✏️ New Ticket' },
          { id:'history', label:`📋 My Tickets${openCount > 0 ? ` (${openCount})` : ''}` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)}
            style={{
              padding:'8px 18px', borderRadius:'20px', cursor:'pointer',
              fontFamily:'var(--fu)', fontSize:'11px', fontWeight:700,
              letterSpacing:'1px', transition:'.15s',
              background: view === tab.id ? 'var(--neon)' : 'var(--gl)',
              color: view === tab.id ? '#000' : 'var(--text3)',
              border: view === tab.id ? 'none' : '1px solid var(--br)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* New Ticket Form */}
      {view === 'new' && (
        <div className="card" style={{ padding:'20px' }}>
          <div className="fi">
            <label className="fl">Category</label>
            <select className="inp" value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="fi">
            <label className="fl">Subject</label>
            <input
              className="inp"
              placeholder="Brief description of your issue"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          <div className="fi">
            <label className="fl">Message</label>
            <textarea
              className="inp"
              rows={6}
              style={{ resize:'vertical', minHeight:'120px' }}
              placeholder="Describe your issue in detail. Include order IDs if relevant."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <button
            className="btn bp blg bw"
            onClick={submit}
            disabled={submitting || !subject.trim() || !message.trim()}
          >
            <span>{submitting ? 'Submitting...' : '📨 Submit Ticket'}</span>
            <span>→</span>
          </button>

          <div style={{
            marginTop:'14px', padding:'10px 12px', borderRadius:'7px',
            background:'var(--gl)', border:'1px solid var(--br)',
            fontSize:'11px', color:'var(--text3)', lineHeight:1.7
          }}>
            💡 For urgent issues, you can also contact us on WhatsApp or Telegram from your profile page.
          </div>
        </div>
      )}

      {/* Ticket History */}
      {view === 'history' && (
        <div>
          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>💬</div>
              No tickets yet. Create one if you need help!
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {tickets.map(t => (
                <div key={t.id} className="card" style={{ padding:'16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                    <div style={{ fontWeight:700, fontSize:'13px', color:'var(--text)', flex:1 }}>
                      {t.subject}
                    </div>
                    <span className={`bdg ${statusColor(t.status)}`} style={{ marginLeft:'8px', whiteSpace:'nowrap' }}>
                      {t.status?.replace('_',' ')}
                    </span>
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'8px' }}>
                    📁 {categories.find(c => c.value === t.category)?.label || t.category} &nbsp;•&nbsp;
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                  <div style={{
                    fontSize:'12px', color:'var(--text)', background:'var(--gl)',
                    borderRadius:'6px', padding:'10px', lineHeight:1.6
                  }}>
                    {t.message}
                  </div>
                  {t.admin_reply && (
                    <div style={{
                      marginTop:'10px', padding:'10px 12px', borderRadius:'6px',
                      background:'rgba(0,255,136,.06)', border:'1px solid rgba(0,255,136,.15)'
                    }}>
                      <div style={{ fontSize:'10px', color:'var(--green)', fontWeight:700, marginBottom:'4px' }}>
                        💬 Admin Reply
                      </div>
                      <div style={{ fontSize:'12px', color:'var(--text)', lineHeight:1.6 }}>
                        {t.admin_reply}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    site_name: 'NexusFlow HUB',
    site_tagline: 'Multi-Vendor SMM Marketplace',
    easypaisa_number: '',
    easypaisa_name: '',
    jazzcash_number: '',
    jazzcash_name: '',
    binance_uid: '',
    binance_network: 'TRC-20 / BEP-20',
    welcome_bonus: '5.00',
    min_deposit: '500',
    whatsapp: '',
    telegram: '',
    bulk_discount_percent: '10',
    bulk_discount_min_qty: '1000',
    announcement: '',
    announcement_active: 'false',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('*');
    if (data && data.length > 0) {
      const s = { ...settings };
      data.forEach(row => { s[row.key] = row.value; });
      setSettings(s);
    }
    setLoading(false);
  };

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('settings')
        .upsert({ key, value: String(value) }, { onConflict: 'key' });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const Field = ({ label, k, placeholder, type = 'text' }) => (
    <div className="fi">
      <label className="fl">{label}</label>
      <input
        className="inp"
        type={type}
        placeholder={placeholder}
        value={settings[k] || ''}
        onChange={e => set(k, e.target.value)}
      />
    </div>
  );

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px', color:'var(--text3)' }}>Loading settings...</div>
  );

  return (
    <div style={{ maxWidth:'560px' }}>
      {saved && (
        <div style={{
          background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)',
          borderRadius:'8px', padding:'12px', textAlign:'center',
          color:'var(--green)', fontWeight:700, marginBottom:'16px', fontSize:'13px'
        }}>
          ✅ Settings saved! All users see updated details instantly.
        </div>
      )}

      {/* Site Info */}
      <div className="st">🌐 Site Info</div>
      <div className="card" style={{ padding:'18px', marginBottom:'16px' }}>
        <Field label="Site Name" k="site_name" placeholder="NexusFlow HUB" />
        <Field label="Site Tagline" k="site_tagline" placeholder="Multi-Vendor SMM Marketplace" />
        <Field label="WhatsApp Number" k="whatsapp" placeholder="+923001234567" />
        <Field label="Telegram Link" k="telegram" placeholder="@nexusflow" />
      </div>

      {/* Announcement Banner */}
      <div className="st">📢 Announcement Banner</div>
      <div className="card" style={{ padding:'18px', marginBottom:'16px', borderColor:'rgba(0,212,255,.25)' }}>
        <div className="fi">
          <label className="fl">Banner Message (shown to all users on their dashboard)</label>
          <input
            className="inp"
            placeholder="e.g. New payment method added! 🎉"
            value={settings.announcement || ''}
            onChange={e => set('announcement', e.target.value)}
          />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'10px' }}>
          <input
            type="checkbox"
            id="ann_active"
            checked={settings.announcement_active === 'true'}
            onChange={e => set('announcement_active', e.target.checked ? 'true' : 'false')}
            style={{ width:'16px', height:'16px', cursor:'pointer' }}
          />
          <label htmlFor="ann_active" style={{ fontSize:'12px', color:'var(--text)', cursor:'pointer' }}>
            Show this banner to all users
          </label>
        </div>
        {settings.announcement_active === 'true' && settings.announcement && (
          <div style={{
            marginTop:'12px', padding:'10px 14px', borderRadius:'8px',
            background:'linear-gradient(90deg,rgba(0,212,255,.08),rgba(123,47,255,.08))',
            border:'1px solid rgba(0,212,255,.2)', fontSize:'12px', color:'var(--text)'
          }}>
            📢 Preview: {settings.announcement}
          </div>
        )}
      </div>

      {/* Easypaisa */}
      <div className="st">💚 Easypaisa Details</div>
      <div className="card" style={{ padding:'18px', marginBottom:'16px', borderColor:'rgba(76,175,80,.25)' }}>
        <Field label="Easypaisa Number" k="easypaisa_number" placeholder="0300-1234567" />
        <Field label="Account Name" k="easypaisa_name" placeholder="NexusFlow Digital" />
      </div>

      {/* JazzCash */}
      <div className="st">💗 JazzCash Details</div>
      <div className="card" style={{ padding:'18px', marginBottom:'16px', borderColor:'rgba(233,30,99,.25)' }}>
        <Field label="JazzCash Number" k="jazzcash_number" placeholder="0310-9876543" />
        <Field label="Account Name" k="jazzcash_name" placeholder="NexusFlow Services" />
      </div>

      {/* Binance */}
      <div className="st">🟡 Binance USDT</div>
      <div className="card" style={{ padding:'18px', marginBottom:'16px', borderColor:'rgba(240,185,11,.25)' }}>
        <Field label="Binance UID" k="binance_uid" placeholder="123456789" />
        <Field label="Network" k="binance_network" placeholder="TRC-20 / BEP-20" />
      </div>

      {/* Bonus and Limits */}
      <div className="st">💰 Bonus and Limits</div>
      <div className="card" style={{ padding:'18px', marginBottom:'16px' }}>
        <div className="fr">
          <Field label="Welcome Bonus ($)" k="welcome_bonus" placeholder="5.00" type="number" />
          <Field label="Min Deposit (PKR)" k="min_deposit" placeholder="500" type="number" />
        </div>
      </div>

      {/* Bulk Discount */}
      <div className="st">🎉 Bulk Order Discount</div>
      <div className="card" style={{ padding:'18px', marginBottom:'20px', borderColor:'rgba(123,47,255,.25)' }}>
        <div style={{ fontSize:'12px', color:'var(--text3)', marginBottom:'12px', lineHeight:1.6 }}>
          When a buyer orders more than the minimum quantity, they automatically get a discount.
          For example: 10% off for orders of 1000+ quantity.
        </div>
        <div className="fr">
          <Field label="Discount %" k="bulk_discount_percent" placeholder="10" type="number" />
          <Field label="Min Qty to Qualify" k="bulk_discount_min_qty" placeholder="1000" type="number" />
        </div>
        {settings.bulk_discount_percent && settings.bulk_discount_min_qty && (
          <div style={{
            marginTop:'10px', padding:'8px 12px', borderRadius:'6px',
            background:'rgba(123,47,255,.08)', border:'1px solid rgba(123,47,255,.2)',
            fontSize:'11px', color:'var(--neon)'
          }}>
            🎉 Buyers get {settings.bulk_discount_percent}% off when ordering {parseInt(settings.bulk_discount_min_qty).toLocaleString()}+ quantity
          </div>
        )}
      </div>

      {/* Save Button */}
      <button className="btn bp blg bw" onClick={save} disabled={saving}>
        <span>{saving ? 'Saving...' : '💾 Save All Settings'}</span>
        <span>→</span>
      </button>

      <div style={{
        marginTop:'12px', padding:'10px 12px', borderRadius:'7px',
        background:'var(--gl)', border:'1px solid var(--br)',
        fontSize:'11px', color:'var(--text3)', lineHeight:1.7
      }}>
        💡 All changes go live instantly. Every user sees your updated details on their next page load.
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import LiveStats from './LiveStats';
import { supabase } from './supabase';

export default function Landing({ onAuth }) {
  const [showReseller, setShowReseller] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    supabase.from('settings').select('key,value').eq('key', 'whatsapp').single()
      .then(({ data }) => { if (data?.value) setWhatsapp(data.value); });
  }, []);

  const features = [
    { ic: '🛒', tl: 'Buy SMM Services', tx: 'Instagram, TikTok, YouTube, Twitter and more. Real quality, fast delivery.' },
    { ic: '🔐', tl: 'Escrow Protected', tx: 'Funds held safely until order delivered. No risk for buyer or seller.' },
    { ic: '⚡', tl: 'Instant Processing', tx: 'Orders start within minutes. Real-time progress tracking.' },
    { ic: '💰', tl: 'Multi Payment', tx: 'Easypaisa, JazzCash, Binance USDT. Easy top-up anytime.' },
    { ic: '🔄', tl: 'Refill Guarantee', tx: 'Selected services include a drop refill guarantee up to 30 days.' },
    { ic: '👑', tl: 'Admin Control', tx: 'Full admin panel. Manage users, approve deposits, control everything.' },
  ];

  const platforms = [
    { ic: '📸', name: 'Instagram', color: '#E1306C' },
    { ic: '🎵', name: 'TikTok', color: '#00d4ff' },
    { ic: '▶️', name: 'YouTube', color: '#FF0000' },
    { ic: '🐦', name: 'Twitter', color: '#1DA1F2' },
    { ic: '👤', name: 'Facebook', color: '#1877F2' },
    { ic: '✈️', name: 'Telegram', color: '#0088cc' },
  ];

  const steps = [
    { n: '01', tl: 'Create Account', tx: 'Sign up free in 2 minutes. Instant access to all services.' },
    { n: '02', tl: 'Add Funds', tx: 'Top up via Easypaisa, JazzCash or Binance USDT.' },
    { n: '03', tl: 'Place Order', tx: 'Choose service, enter your link, place order.' },
    { n: '04', tl: 'Track & Deliver', tx: 'Watch real-time progress. Delivery guaranteed.' },
  ];

  const buyerBenefits = [
    { ic: '🛒', text: 'Access to 2,500+ SMM services across all platforms' },
    { ic: '⚡', text: 'Instant order processing with real-time tracking' },
    { ic: '💳', text: 'Easy deposit via Easypaisa, JazzCash & Crypto' },
    { ic: '🔄', text: 'Refill guarantees on selected services' },
    { ic: '🎧', text: '24/7 support via WhatsApp & Ticket system' },
    { ic: '💰', text: 'Lowest prices in Pakistan market' },
  ];

  const resellerBenefits = [
    { ic: '🏪', text: 'Get your own branded SMM panel to sell to clients' },
    { ic: '💵', text: 'Set your own prices and earn on every order' },
    { ic: '📊', text: 'Full earnings dashboard and transaction history' },
    { ic: '🔌', text: 'API access to connect your own website or bot' },
    { ic: '📦', text: 'Access to all 2,500+ services at wholesale rates' },
    { ic: '👑', text: 'Priority support and dedicated reseller tools' },
  ];

  return (
    <div style={{ position: 'relative', zIndex: 10 }}>
      <div className="gbg" />

      {/* NAVBAR */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(2,4,8,.95)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--br)', padding: '0 20px',
        height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: 'clamp(14px,3vw,20px)', fontWeight: 900,
          letterSpacing: '2px', background: 'linear-gradient(135deg,var(--neon),var(--gold))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
        }}>
          NEXUS<span style={{ WebkitTextFillColor: 'var(--neon)' }}>FLOW</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn bgh bsm" onClick={() => onAuth('login')}>Login</button>
          <button className="btn bp bsm" onClick={() => onAuth('signup')}>Sign Up Free</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: '60px 20px 40px', textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: '9px', letterSpacing: '5px',
          color: 'var(--neon)', textTransform: 'uppercase', marginBottom: '16px'
        }}>
          🚀 Multi-Vendor SMM Marketplace
        </div>
        <h1 style={{ fontFamily: 'var(--fd)', fontSize: 'clamp(28px,6vw,52px)', fontWeight: 900, lineHeight: 1.1, marginBottom: '16px' }}>
          <span style={{
            background: 'linear-gradient(135deg,var(--neon),var(--gold),var(--purple))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
          }}>
            NEXUSFLOW HUB
          </span>
        </h1>
        <p style={{
          fontSize: 'clamp(13px,2vw,16px)', color: 'var(--text2)', lineHeight: 1.7,
          marginBottom: '28px', maxWidth: '500px', margin: '0 auto 28px'
        }}>
          The safest SMM marketplace with escrow protection, multi-vendor support and instant order processing.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn bp blg" onClick={() => onAuth('signup')}>
            🛒 Start Buying Free →
          </button>
          <button className="btn bpu blg" onClick={() => setShowReseller(true)}>
            🏪 Become a Reseller
          </button>
        </div>
      </section>

      {/* PLATFORMS */}
      <section style={{ padding: '20px', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '40px' }}>
          {platforms.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '20px',
              border: `1px solid ${p.color}30`,
              background: `${p.color}10`, fontSize: '12px', fontWeight: 700,
              color: p.color,
            }}>
              <span>{p.ic}</span><span>{p.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE STATS */}
      <section style={{ padding: '0 20px', maxWidth: '900px', margin: '0 auto' }}>
        <LiveStats />
      </section>

      {/* BUYER vs RESELLER COMPARISON */}
      <section style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: '9px', letterSpacing: '4px',
          color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '24px'
        }}>
          Choose Your Account Type
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '16px', marginBottom: '40px' }}>
          {/* Buyer Card */}
          <div className="card" style={{ padding: '24px', border: '1px solid rgba(0,212,255,.25)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛒</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 900, color: 'var(--neon)', marginBottom: '4px' }}>BUYER</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Buy SMM services for yourself</div>
            </div>
            {buyerBenefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{b.ic}</span>
                <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>{b.text}</span>
              </div>
            ))}
            <button className="btn bp bmd bw" style={{ marginTop: '16px', width: '100%' }} onClick={() => onAuth('signup')}>
              Create Buyer Account →
            </button>
          </div>

          {/* Reseller Card */}
          <div className="card" style={{ padding: '24px', border: '1px solid rgba(255,180,0,.25)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>👑</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 900, color: 'var(--gold)', marginBottom: '4px' }}>RESELLER</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Sell services & earn money</div>
            </div>
            {resellerBenefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{b.ic}</span>
                <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>{b.text}</span>
              </div>
            ))}
            <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(255,180,0,.08)', border: '1px solid rgba(255,180,0,.2)',
              fontSize: '11px', color: 'var(--gold)', marginBottom: '10px', lineHeight: 1.6 }}>
              ⚠️ Reseller accounts are created by admin only. Contact us to apply.
            </div>
            <button className="btn bgo bmd bw" style={{ width: '100%' }} onClick={() => setShowReseller(true)}>
              👑 Apply to Become Reseller →
            </button>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: '9px', letterSpacing: '4px',
          color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '24px'
        }}>
          Why Choose NexusFlow
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '14px', marginBottom: '40px' }}>
          {features.map((f, i) => (
            <div key={i} className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>{f.ic}</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '11px', fontWeight: 700, color: 'var(--neon)', letterSpacing: '1px', marginBottom: '8px' }}>
                {f.tl}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>{f.tx}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: '9px', letterSpacing: '4px',
          color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '24px'
        }}>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '14px', marginBottom: '40px' }}>
          {steps.map((s, i) => (
            <div key={i} className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--fd)', fontSize: '28px', fontWeight: 900,
                color: 'rgba(0,212,255,.15)', marginBottom: '8px'
              }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', color: 'var(--text)' }}>{s.tl}</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>{s.tx}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '40px 20px 60px', textAlign: 'center' }}>
        <div style={{
          maxWidth: '500px', margin: '0 auto',
          padding: '32px', borderRadius: '16px',
          background: 'linear-gradient(135deg,rgba(0,212,255,.08),rgba(123,47,255,.08))',
          border: '1px solid rgba(0,212,255,.2)'
        }}>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 'clamp(18px,4vw,28px)', fontWeight: 900, marginBottom: '12px' }}>
            Ready to Start?
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '24px', lineHeight: 1.7 }}>
            Join thousands of buyers and resellers on NexusFlow HUB. Free to sign up, no hidden fees.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn bp blg" onClick={() => onAuth('signup')}>Create Free Account →</button>
            <button className="btn bgh blg" onClick={() => onAuth('login')}>Sign In</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        textAlign: 'center', padding: '20px',
        borderTop: '1px solid var(--br)',
        fontSize: '11px', color: 'var(--text3)'
      }}>
        © {new Date().getFullYear()} NexusFlow HUB · Multi-Vendor SMM Marketplace
      </footer>

      {/* ─── RESELLER INFO MODAL ─── */}
      {showReseller && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setShowReseller(false)}
          style={{ zIndex: 9999 }}>
          <div className="mbox" style={{ maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div className="mttl">👑 Become a Reseller</div>
              <button onClick={() => setShowReseller(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>👑</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '14px', color: 'var(--gold)', fontWeight: 800 }}>
                NEXUSFLOW RESELLER PROGRAM
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                Start earning money by reselling SMM services
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--neon)', letterSpacing: '1.5px', marginBottom: '10px' }}>
                WHAT YOU GET AS A RESELLER
              </div>
              {resellerBenefits.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>{b.ic}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>{b.text}</span>
                </div>
              ))}
            </div>

            <div style={{
              padding: '14px', borderRadius: '10px', marginBottom: '16px',
              background: 'rgba(255,180,0,.06)', border: '1px solid rgba(255,180,0,.2)'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold)', marginBottom: '8px' }}>
                ⚠️ HOW TO BECOME A RESELLER
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.8 }}>
                Reseller accounts are <strong style={{ color: 'var(--gold)' }}>created by admin only</strong> — not through the normal signup page. To apply, contact our admin directly via WhatsApp. Share your name, email, and why you want to resell. Admin will review and create your reseller account within 24 hours.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {whatsapp ? (
                <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hi, I want to become a reseller on NexusFlow HUB. Please create a reseller account for me.')}`}
                  target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <div style={{
                    padding: '14px', borderRadius: '10px', textAlign: 'center',
                    background: 'rgba(37,211,102,.1)', border: '1px solid rgba(37,211,102,.3)',
                    color: '#25D366', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                  }}>
                    💬 Contact Admin on WhatsApp →
                  </div>
                </a>
              ) : (
                <div style={{
                  padding: '14px', borderRadius: '10px', textAlign: 'center',
                  background: 'var(--gl)', border: '1px solid var(--br)',
                  color: 'var(--text3)', fontSize: '12px'
                }}>
                  💬 Contact admin to get your reseller account
                </div>
              )}
              <button className="btn bgh bmd" onClick={() => { setShowReseller(false); onAuth('signup'); }}>
                Or Create a Buyer Account First
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

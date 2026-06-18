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
    { ic: '🎵', name: 'TikTok', color: '#00e5ff' },
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

      {/* ── NAVBAR ── */}
      <nav className="landing-nav">
        <div style={{
          fontFamily: 'Orbitron, monospace', fontSize: 'clamp(14px,3vw,20px)', fontWeight: 900,
          letterSpacing: '2px', background: 'linear-gradient(135deg,var(--neon),var(--gold))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          NEXUS<span style={{ WebkitTextFillColor: 'var(--neon)' }}>FLOW</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn bgh bsm" onClick={() => onAuth('login')}>Login</button>
          <button className="btn bp bsm" onClick={() => onAuth('signup')}>Sign Up Free</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px 40px', textAlign: 'center', maxWidth: '760px', margin: '0 auto' }}>
        {/* Eyebrow badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div className="hero-eyebrow">
            <span>🚀</span> Multi-Vendor SMM Marketplace
          </div>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: 'clamp(32px,6vw,58px)',
          fontWeight: 900, lineHeight: 1.08, marginBottom: '20px', letterSpacing: '-1px',
        }}>
          <span style={{
            background: 'linear-gradient(135deg,var(--neon) 0%,var(--gold) 50%,var(--purple) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            display: 'block',
          }}>
            NEXUSFLOW HUB
          </span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(14px,2vw,17px)', color: 'var(--text2)', lineHeight: 1.75,
          marginBottom: '32px', maxWidth: '520px', margin: '0 auto 32px',
        }}>
          The safest SMM marketplace with escrow protection,<br />
          multi-vendor support and instant order processing.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn bp blg" onClick={() => onAuth('signup')}>
            🛒 Start Buying Free →
          </button>
          <button className="btn bpu blg" onClick={() => setShowReseller(true)}>
            👑 Become a Reseller
          </button>
        </div>
      </section>

      {/* ── PLATFORM PILLS ── */}
      <section style={{ padding: '20px 24px 0', maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '48px' }}>
          {platforms.map((p, i) => (
            <div key={i} className="platform-pill" style={{
              border: `1px solid ${p.color}35`, background: `${p.color}12`,
              color: p.color, fontSize: '12px', fontWeight: 700,
            }}>
              <span>{p.ic}</span><span>{p.name}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="glow-line-h" style={{ maxWidth: '900px', margin: '0 auto 40px', opacity: .2 }} />

      {/* ── LIVE STATS ── */}
      <section style={{ padding: '0 24px', maxWidth: '960px', margin: '0 auto 48px' }}>
        <LiveStats />
      </section>

      {/* ── BUYER vs RESELLER ── */}
      <section style={{ padding: '0 24px 48px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'Orbitron, monospace', fontSize: '9px', letterSpacing: '4px',
          color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '28px',
        }}>
          Choose Your Account Type
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px' }}>

          {/* Buyer */}
          <div className="compare-card compare-card-buyer">
            <div style={{ textAlign: 'center', marginBottom: '22px' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px', filter: 'drop-shadow(0 4px 12px rgba(0,229,255,.2))' }}>🛒</div>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '16px', fontWeight: 900, color: 'var(--neon)', marginBottom: '5px' }}>BUYER</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Buy SMM services for yourself</div>
            </div>
            {buyerBenefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '11px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '15px', flexShrink: 0 }}>{b.ic}</span>
                <span style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.55 }}>{b.text}</span>
              </div>
            ))}
            <button className="btn bp bmd bw" style={{ marginTop: '20px' }} onClick={() => onAuth('signup')}>
              Create Buyer Account →
            </button>
          </div>

          {/* Reseller */}
          <div className="compare-card compare-card-reseller">
            <div style={{ textAlign: 'center', marginBottom: '22px' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px', filter: 'drop-shadow(0 4px 12px rgba(255,215,0,.2))' }}>👑</div>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '16px', fontWeight: 900, color: 'var(--gold)', marginBottom: '5px' }}>RESELLER</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Sell services & earn money</div>
            </div>
            {resellerBenefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '11px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '15px', flexShrink: 0 }}>{b.ic}</span>
                <span style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.55 }}>{b.text}</span>
              </div>
            ))}
            <div style={{
              marginTop: '16px', padding: '11px 14px', borderRadius: '9px',
              background: 'rgba(255,215,0,.07)', border: '1px solid rgba(255,215,0,.18)',
              fontSize: '12px', color: 'var(--warn)', marginBottom: '12px', lineHeight: 1.65,
            }}>
              ⚠️ Reseller accounts are created by admin only. Contact us to apply.
            </div>
            <button className="btn bgo bmd bw" onClick={() => setShowReseller(true)}>
              👑 Apply to Become Reseller →
            </button>
          </div>
        </div>
      </section>

      <div className="glow-line-h" style={{ maxWidth: '900px', margin: '0 auto 48px', opacity: .15 }} />

      {/* ── FEATURES ── */}
      <section style={{ padding: '0 24px 56px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'Orbitron, monospace', fontSize: '9px', letterSpacing: '4px',
          color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '28px',
        }}>
          Why Choose NexusFlow
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '16px' }}>
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.ic}</div>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '11px', fontWeight: 700, color: 'var(--neon)', letterSpacing: '1px', marginBottom: '10px' }}>
                {f.tl}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.65 }}>{f.tx}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '0 24px 56px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{
          fontFamily: 'Orbitron, monospace', fontSize: '9px', letterSpacing: '4px',
          color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '28px',
        }}>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '16px' }}>
          {steps.map((s, i) => (
            <div key={i} className="step-card">
              <div className="step-number">{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: 'var(--text)', position: 'relative', zIndex: 1 }}>{s.tl}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.65, position: 'relative', zIndex: 1 }}>{s.tx}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '0 24px 72px', maxWidth: '600px', margin: '0 auto' }}>
        <div className="cta-box">
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 'clamp(18px,4vw,30px)', fontWeight: 900, marginBottom: '14px' }}>
            Ready to Start?
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '28px', lineHeight: 1.75, maxWidth: '400px', margin: '0 auto 28px' }}>
            Join thousands of buyers and resellers on NexusFlow HUB. Free to sign up, no hidden fees.
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn bp blg" onClick={() => onAuth('signup')}>Create Free Account →</button>
            <button className="btn bgh blg" onClick={() => onAuth('login')}>Sign In</button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        © {new Date().getFullYear()} NexusFlow HUB · Multi-Vendor SMM Marketplace
      </footer>

      {/* ── RESELLER MODAL ── */}
      {showReseller && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setShowReseller(false)} style={{ zIndex: 9999 }}>
          <div className="mbox" style={{ maxWidth: '490px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '22px' }}>
              <div className="mttl">👑 Become a Reseller</div>
              <button onClick={() => setShowReseller(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '20px', cursor: 'pointer', lineHeight: 1, minWidth: '32px', minHeight: '32px' }}
                aria-label="Close modal">✕</button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '22px' }}>
              <div style={{ fontSize: '52px', marginBottom: '10px', filter: 'drop-shadow(0 4px 16px rgba(255,215,0,.25))' }}>👑</div>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '14px', color: 'var(--gold)', fontWeight: 800 }}>
                NEXUSFLOW RESELLER PROGRAM
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '5px' }}>
                Start earning money by reselling SMM services
              </div>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--neon)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
                What You Get as a Reseller
              </div>
              {resellerBenefits.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: '11px', marginBottom: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '15px', flexShrink: 0 }}>{b.ic}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.55 }}>{b.text}</span>
                </div>
              ))}
            </div>
            <div style={{
              padding: '14px', borderRadius: '10px', marginBottom: '18px',
              background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.18)',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold)', marginBottom: '9px' }}>
                ⚠️ How to Become a Reseller
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.75 }}>
                Reseller accounts are <strong style={{ color: 'var(--gold)' }}>created by admin only</strong> — not through the normal signup page. Contact our admin via WhatsApp with your name, email, and why you want to resell. Admin will review and create your account within 24 hours.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {whatsapp ? (
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hi, I want to become a reseller on NexusFlow HUB. Please create a reseller account for me.')}`}
                  target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    padding: '14px', borderRadius: '10px', textAlign: 'center',
                    background: 'rgba(37,211,102,.09)', border: '1px solid rgba(37,211,102,.28)',
                    color: '#25D366', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                    transition: 'var(--tr)',
                  }}>
                    💬 Contact Admin on WhatsApp →
                  </div>
                </a>
              ) : (
                <div style={{
                  padding: '14px', borderRadius: '10px', textAlign: 'center',
                  background: 'var(--gl)', border: '1px solid var(--br)',
                  color: 'var(--text3)', fontSize: '13px',
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

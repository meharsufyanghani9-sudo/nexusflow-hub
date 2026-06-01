import React from 'react';
import LiveStats from './LiveStats';

export default function Landing({ onAuth }) {
  const features = [
    { ic: '🛒', tl: 'Buy SMM Services', tx: 'Instagram, TikTok, YouTube, Twitter and more. Real quality, fast delivery.' },
    { ic: '🏪', tl: 'Sell & Earn', tx: 'List your services as a reseller. Set your price, earn on every order.' },
    { ic: '🔐', tl: 'Escrow Protected', tx: 'Funds held safely until order delivered. No risk for buyer or seller.' },
    { ic: '⚡', tl: 'Instant Processing', tx: 'Orders start within minutes. Real-time progress tracking.' },
    { ic: '💰', tl: 'Multi Payment', tx: 'Easypaisa, JazzCash, Binance USDT. Easy top-up anytime.' },
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
    { n: '01', tl: 'Create Account', tx: 'Sign up free in 2 minutes. Get $5 welcome bonus instantly.' },
    { n: '02', tl: 'Add Funds', tx: 'Top up via Easypaisa, JazzCash or Binance USDT.' },
    { n: '03', tl: 'Place Order', tx: 'Choose service, enter your link, place order.' },
    { n: '04', tl: 'Track & Deliver', tx: 'Watch real-time progress. Delivery guaranteed.' },
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
          <button className="btn bpu blg" onClick={() => onAuth('signup')}>
            🏪 Become a Reseller
          </button>
        </div>
      </section>

      {/* PLATFORMS */}
      <section style={{ padding: '20px', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '12px',
          flexWrap: 'wrap', marginBottom: '40px'
        }}>
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
    </div>
  );
}

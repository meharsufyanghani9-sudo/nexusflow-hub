import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

export default function Auth({ onLogin, defaultTab }) {
  const [tab, setTab] = useState(defaultTab || 'login');

  // Login fields
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  // Signup fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [usernameStatus, setUsernameStatus] = useState('');
  const usernameTimerRef = useRef(null);

  // Forgot password
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const [refCode, setRefCode] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setRefCode(ref);
      setTab('signup');
    }
  }, []);

  const checkUsernameAvailability = (uname) => {
    if (usernameTimerRef.current) {
      clearTimeout(usernameTimerRef.current);
      usernameTimerRef.current = null;
    }
    if (!uname || uname.length < 3) {
      setUsernameStatus('');
      return;
    }
    setUsernameStatus('checking');
    usernameTimerRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('username', uname.toLowerCase())
          .maybeSingle();
        if (error) {
          setUsernameStatus('available');
          return;
        }
        setUsernameStatus(data ? 'taken' : 'available');
      } catch (e) {
        setUsernameStatus('available');
      }
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    };
  }, []);

  const handleNameChange = (val) => {
    setName(val);
    const autoUsername = val.toLowerCase().replace(/[^a-z0-9]/g, '');
    setSignupUsername(autoUsername);
    if (autoUsername) checkUsernameAvailability(autoUsername);
    else setUsernameStatus('');
  };

  const handleUsernameChange = (val) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setSignupUsername(clean);
    checkUsernameAvailability(clean);
  };

  // ── LOGIN (email OR username) ─────────────────────────────────────────────
  const handleLogin = async () => {
    setError(''); setMsg('');
    if (!loginId || !password) { setError('Fill all fields'); return; }
    setLoading(true);

    // Strip leading @ if user typed @username
    const rawInput = loginId.trim();
    const cleanedInput = rawInput.startsWith('@') ? rawInput.slice(1) : rawInput;

    // ── FIX: A proper email must match the pattern: something@something.something
    // We use a simple but reliable email regex instead of just checking for @ and .
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const looksLikeEmail = emailRegex.test(cleanedInput);

    let emailToUse = '';

    if (looksLikeEmail) {
      // User typed an email — use it directly (lowercase to avoid case issues)
      emailToUse = cleanedInput.toLowerCase();
    } else {
      // User typed a username — look up their email in the users table
      const { data: userRow, error: lookupErr } = await supabase
        .from('users')
        .select('email')
        .eq('username', cleanedInput.toLowerCase())
        .maybeSingle();

      if (lookupErr || !userRow) {
        setError('Username not found. Please check and try again, or use your email.');
        setLoading(false);
        return;
      }

      // ── FIX: Always use the exact email stored in the database (lowercase)
      // This prevents case mismatch issues with Supabase Auth
      emailToUse = userRow.email.toLowerCase().trim();
    }

    // Now sign in with email + password
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: password,
    });

    if (err) {
      // ── FIX: Give a more helpful error message
      if (err.message && err.message.toLowerCase().includes('invalid')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError('Login failed: ' + err.message);
      }
      setLoading(false);
      return;
    }

    if (!data?.user) {
      setError('Login failed. Please try again.');
      setLoading(false);
      return;
    }

    // Fetch profile (retry in case trigger is still running)
    let profile = null;
    for (let i = 0; i < 5; i++) {
      const { data: p } = await supabase
        .from('users').select('*').eq('id', data.user.id).maybeSingle();
      if (p) { profile = p; break; }
      await new Promise(r => setTimeout(r, 700));
    }

    // If profile still missing, create it manually (trigger may have failed)
    if (!profile) {
      await supabase.from('users').insert({
        id: data.user.id,
        full_name: data.user.user_metadata?.full_name || emailToUse.split('@')[0],
        email: emailToUse,
        role: 'buyer',
      });
      await new Promise(r => setTimeout(r, 500));
      const { data: p2 } = await supabase
        .from('users').select('*').eq('id', data.user.id).maybeSingle();
      profile = p2;
    }

    if (!profile) {
      setError('Profile not found. Contact support.');
      setLoading(false);
      return;
    }

    if (profile.is_active === false) {
      setError('Account suspended. Contact support.');
      setLoading(false);
      return;
    }

    onLogin({
      id: data.user.id,
      name: profile.full_name,
      email: profile.email,
      username: profile.username,
      role: profile.role,
      balance: parseFloat(profile.balance || 0),
      referral_code: profile.referral_code,
    });
  };

  // ── SIGNUP ────────────────────────────────────────────────────────────────
  const handleSignup = async () => {
    setError(''); setMsg('');
    if (!name || !email || !signupPassword || !signupUsername) {
      setError('Fill all fields'); return;
    }
    if (signupPassword.length < 8) { setError('Password min 8 characters'); return; }
    if (signupUsername.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (usernameStatus === 'taken') { setError('That username is already taken'); return; }
    if (usernameStatus === 'checking') { setError('Please wait, checking username...'); return; }

    setLoading(true);

    // Final double-check
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', signupUsername.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      setError('Username was just taken. Please choose another.');
      setLoading(false);
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password: signupPassword,
      options: { data: { full_name: name } }
    });

    if (err) { setError(err.message); setLoading(false); return; }

    if (data?.user) {
      await new Promise(r => setTimeout(r, 1500));
      await supabase.from('users').update({
        username: signupUsername.toLowerCase(),
        referred_by: refCode || null,
      }).eq('id', data.user.id);
    }

    setMsg('✅ Account created! You can now login.');
    setTab('login');
    setName(''); setEmail(''); setSignupPassword(''); setSignupUsername('');
    setUsernameStatus('');
    setLoading(false);
  };

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!forgotEmail) { setError('Enter your email'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setForgotSent(true);
  };

  const UsernameIndicator = () => {
    if (!signupUsername || signupUsername.length < 3) return null;
    if (usernameStatus === 'checking') return (
      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>⏳ Checking...</span>
    );
    if (usernameStatus === 'available') return (
      <span style={{ fontSize: '11px', color: 'var(--green)' }}>✅ Available!</span>
    );
    if (usernameStatus === 'taken') return (
      <span style={{ fontSize: '11px', color: 'var(--danger)' }}>❌ Already taken</span>
    );
    return null;
  };

  // ── FORGOT PASSWORD VIEW ──────────────────────────────────────────────────
  if (showForgot) {
    return (
      <div className="auth-wrap" style={{ position: 'relative', zIndex: 10 }}>
        <div className="gbg" />
        <div className="aw">
          <div className="agl" />
          <div className="ai">
            <div style={{ textAlign: 'center', marginBottom: '22px' }}>
              <div className="lt">NEXUSFLOW HUB</div>
              <div className="ls">Reset Your Password</div>
            </div>
            {forgotSent ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📧</div>
                <div style={{ color: 'var(--green)', fontWeight: 700, marginBottom: '8px' }}>Reset email sent!</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '20px', lineHeight: 1.6 }}>
                  Check your inbox at <strong>{forgotEmail}</strong> and click the link to reset your password.
                </div>
                <button className="btn bgh bmd" onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}>
                  ← Back to Login
                </button>
              </div>
            ) : (
              <div>
                <div className="fi">
                  <label className="fl">Your Email Address</label>
                  <input className="inp" type="email" placeholder="your@email.com"
                    value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                </div>
                <div className="aerr">{error}</div>
                <button className="btn bp blg bw" onClick={handleForgotPassword} disabled={loading}>
                  <span>{loading ? 'Sending...' : 'Send Reset Link'}</span><span>→</span>
                </button>
                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                  <button onClick={() => { setShowForgot(false); setError(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px' }}>
                    ← Back to Login
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="auth-wrap" style={{ position: 'relative', zIndex: 10 }}>
      <div className="gbg" />
      <div className="aw">
        <div className="agl" />
        <div className="ai">
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div className="lt">NEXUSFLOW HUB</div>
            <div className="ls">Multi-Vendor SMM Marketplace</div>
          </div>

          {refCode && tab === 'signup' && (
            <div style={{
              background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.2)',
              borderRadius: '7px', padding: '10px', fontSize: '12px', color: 'var(--green)',
              textAlign: 'center', marginBottom: '12px'
            }}>
              🎁 You were referred! Sign up to get a bonus on your first deposit.
            </div>
          )}

          <div className="atbs">
            <button className={`atb ${tab === 'login' ? 'on' : ''}`}
              onClick={() => { setTab('login'); setError(''); setMsg(''); }}>Login</button>
            <button className={`atb ${tab === 'signup' ? 'on' : ''}`}
              onClick={() => { setTab('signup'); setError(''); setMsg(''); }}>Sign Up</button>
          </div>

          {msg && (
            <div style={{
              background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.2)',
              borderRadius: '7px', padding: '10px', fontSize: '12px', color: 'var(--green)',
              textAlign: 'center', marginBottom: '12px'
            }}>{msg}</div>
          )}

          {/* ── LOGIN TAB ── */}
          {tab === 'login' && (
            <div>
              <div className="fi">
                <label className="fl">Email or Username</label>
                <input
                  className="inp" type="text"
                  placeholder="your@email.com or username"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  autoCapitalize="none" autoCorrect="off"
                />
              </div>
              <div className="fi">
                <label className="fl">Password</label>
                <input
                  className="inp" type="password" placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
              </div>
              <div className="aerr">{error}</div>
              <button className="btn bp blg bw" onClick={handleLogin} disabled={loading}>
                <span>{loading ? 'Signing in...' : 'Access Panel'}</span><span>→</span>
              </button>
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button onClick={() => { setShowForgot(true); setError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px' }}>
                  Forgot password?
                </button>
              </div>
              <div style={{
                marginTop: '16px', padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.1)',
                fontSize: '11px', color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6
              }}>
                💡 Login with your <strong style={{ color: 'var(--neon)' }}>email</strong> or your <strong style={{ color: 'var(--neon)' }}>username</strong> (without the @)
              </div>
            </div>
          )}

          {/* ── SIGNUP TAB ── */}
          {tab === 'signup' && (
            <div>
              <div className="fi">
                <label className="fl">Full Name</label>
                <input className="inp" type="text" placeholder="Your Name"
                  value={name} onChange={e => handleNameChange(e.target.value)} />
              </div>

              <div className="fi">
                <label className="fl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Username</span>
                  <UsernameIndicator />
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text3)', fontSize: '14px', pointerEvents: 'none'
                  }}>@</span>
                  <input className="inp" type="text" placeholder="yourname"
                    value={signupUsername}
                    onChange={e => handleUsernameChange(e.target.value)}
                    style={{ paddingLeft: '26px' }}
                    autoCapitalize="none" autoCorrect="off"
                  />
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                  Only letters, numbers and underscore. Min 3 characters.
                </div>
              </div>

              <div className="fi">
                <label className="fl">Email</label>
                <input className="inp" type="email" placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>

              <div className="fi">
                <label className="fl">Password</label>
                <input className="inp" type="password" placeholder="Min 8 characters"
                  value={signupPassword} onChange={e => setSignupPassword(e.target.value)} />
              </div>

              <div className="aerr">{error}</div>
              <button className="btn bgd blg bw" onClick={handleSignup}
                disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}>
                <span>{loading ? 'Creating...' : 'Create Account'}</span><span>✦</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
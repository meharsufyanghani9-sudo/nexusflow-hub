import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import './style.css';
import { supabase } from './supabase';
// REFACTOR Phase-15: nav data centralised — no longer duplicated across App/Topbar/Sidebar
import { pageTitles, buyerNav, resellerNav, adminNav } from './navigation';

// ─── Always-loaded (tiny shell components, needed on every screen) ────────────
import Landing        from './Landing';
import Auth           from './Auth';
import Sidebar        from './Sidebar';
import Topbar         from './Topbar';
import CurrencySwitcher from './CurrencySwitcher';

// ─── Lazy-loaded page components (only downloaded when the user visits them) ──
//     Each of these becomes its own separate JS chunk. The browser only fetches
//     a chunk the moment the user navigates to that page for the first time.
const BuyerDashboard    = lazy(() => import('./BuyerDashboard'));
const Marketplace       = lazy(() => import('./Marketplace'));
const Deposit           = lazy(() => import('./Deposit'));
const Orders            = lazy(() => import('./Orders'));
const Transactions      = lazy(() => import('./Transactions'));
const Profile           = lazy(() => import('./Profile'));
const Referral          = lazy(() => import('./Referral'));
const Tasks             = lazy(() => import('./Tasks'));
const PanelApi          = lazy(() => import('./PanelApi'));
const SupportTicket     = lazy(() => import('./SupportTicket'));

const AdminDashboard    = lazy(() => import('./AdminDashboard'));
const AdminOrders       = lazy(() => import('./AdminOrders'));
const AdminServices     = lazy(() => import('./AdminServices'));
const AdminManageFilters= lazy(() => import('./AdminManageFilters'));
const AdminDeposits     = lazy(() => import('./AdminDeposits'));
const AdminUsers        = lazy(() => import('./AdminUsers'));
const AdminSettings     = lazy(() => import('./AdminSettings'));
const AdminDisputes     = lazy(() => import('./AdminDisputes'));
const AdminApiImport    = lazy(() => import('./AdminApiImport'));
const AdminWithdrawals  = lazy(() => import('./AdminWithdrawals'));
const AdminResellers    = lazy(() => import('./AdminResellers'));
const AdminTasks        = lazy(() => import('./AdminTasks'));
const AdminReferral     = lazy(() => import('./AdminReferral'));
const AdminSupport      = lazy(() => import('./AdminSupport'));
const AdminCurrencies   = lazy(() => import('./AdminCurrencies'));
const AdminMassEmail    = lazy(() => import('./AdminMassEmail'));
const AdminCreateReseller = lazy(() => import('./AdminCreateReseller'));

const ResellerDashboard = lazy(() => import('./ResellerDashboard'));
const ResellerServices  = lazy(() => import('./ResellerServices'));
const ResellerEarnings  = lazy(() => import('./ResellerEarnings'));

// ─── Page-transition loading spinner ─────────────────────────────────────────
//     Shown for ~100-300ms while the new page chunk is downloading.
function PageLoader() {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      '50vh',
      flexDirection:  'column',
      gap:            '14px',
    }}>
      <div style={{
        width:           '32px',
        height:          '32px',
        border:          '3px solid var(--border)',
        borderTopColor:  'var(--neon)',
        borderRadius:    '50%',
        animation:       'spin 0.7s linear infinite',
      }} />
      <div style={{
        fontSize:      '11px',
        color:         'var(--text3)',
        letterSpacing: '2px',
      }}>
        LOADING…
      </div>
    </div>
  );
}

// ─── Data (REFACTOR Phase-15: imported from navigation.js) ───────────────────
// pageTitles, buyerNav, resellerNav, adminNav all come from ./navigation

// ─── Helpers ──────────────────────────────────────────────────────────────────
// FIX #31: capped loop replaces the while(true) that was here — can never hang
async function generateUniqueUsername(baseName) {
  const base = (baseName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? base : base + attempt;
    const { data } = await supabase
      .from('users').select('id').eq('username', candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Guaranteed unique fallback — UUID suffix can never collide
  return base + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 6);
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,       setScreen]       = useState('loading');
  const [authTab,      setAuthTab]      = useState('login');
  const [user,         setUser]         = useState(null);
  const [page,         setPage]         = useState('dashboard');
  const [sbOpen,       setSbOpen]       = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [darkMode,     setDarkMode]     = useState(true);
  const [pageHistory,  setPageHistory]  = useState(['dashboard']);

  const navigate = useCallback((newPage) => {
    setPage(newPage);
    setPageHistory(prev => {
      if (prev[prev.length - 1] === newPage) return prev;
      return [...prev, newPage];
    });
  }, []);

  // Back-button handler — navigates within app history, not browser history
  useEffect(() => {
    const handlePopState = (e) => {
      e.preventDefault();
      setPageHistory(prev => {
        if (prev.length <= 1) {
          window.history.pushState(null, '', window.location.href);
          return prev;
        }
        const newHistory = prev.slice(0, -1);
        setPage(newHistory[newHistory.length - 1]);
        return newHistory;
      });
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // FIX forgot-password (final): Supabase appends #access_token=...&type=recovery
    // to the URL when the user clicks a password-reset email link. We must check
    // this hash BEFORE restoreSession() runs, because restoreSession() calls
    // getSession() — which on a fresh load with no prior session returns null and
    // sets screen='landing', racing against and overwriting the PASSWORD_RECOVERY
    // event fired by onAuthStateChange. Checking the hash first lets us skip
    // restoreSession entirely and go straight to the reset screen.
    const hash   = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (params.get('type') === 'recovery') {
      // FIX: Sign out any existing logged-in session first so the dashboard
      // restore logic doesn't run and overwrite the reset screen.
      // NOTE: replaceState runs AFTER a tick so Supabase's own hash-exchange
      // (which fires synchronously on client init) has already read the token.
      supabase.auth.signOut().finally(() => {
        setUser(null);
        setScreen('auth');
        setAuthTab('reset');
      });

      // Clean the hash after a short delay so Supabase JS has already parsed it
      setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
      }, 500);

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event) => {
          if (event === 'PASSWORD_RECOVERY') {
            // Token exchanged successfully — stay on reset screen
            setScreen('auth');
            setAuthTab('reset');
          }
          // Ignore SIGNED_OUT (we triggered it) and any SIGNED_IN during recovery
        }
      );
      return () => subscription.unsubscribe();
    }

    // ── Normal (non-recovery) boot path ──────────────────────────────────────
    const restoreSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users').select('*').eq('id', session.user.id).maybeSingle();

        if (profile && profile.is_active !== false) {
          let username = profile.username;
          if (!username) {
            // FIX #31: uses the capped generateUniqueUsername above
            username = await generateUniqueUsername(profile.full_name || 'user');
            await supabase.from('users').update({ username }).eq('id', session.user.id);
          }
          setUser({
            id:            session.user.id,
            name:          profile.full_name,
            email:         profile.email,
            username,
            role:          profile.role,
            balance:       parseFloat(profile.balance || 0),
            referral_code: profile.referral_code,
          });
          setScreen('app');
          return;
        }
      }
      setScreen('landing');
    };

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setScreen('landing');
          setPage('dashboard');
          setPageHistory(['dashboard']);
        }
        if (event === 'PASSWORD_RECOVERY') {
          setScreen('auth');
          setAuthTab('reset');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // FIX Phase-20: Subscribe to real-time balance updates for the logged-in user.
  // Without this, the balance shown in Topbar/Sidebar is stale after any order,
  // deposit approval, admin edit, or refund — until a full page refresh.
  // We create/destroy the channel whenever the user id changes (login/logout).
  useEffect(() => {
    if (!user?.id) return;

    const balanceChannel = supabase
      .channel(`user-balance-${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'users',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && payload.new.balance !== undefined) {
            setUser(prev =>
              prev ? { ...prev, balance: parseFloat(payload.new.balance || 0) } : prev
            );
          }
        }
      )
      .subscribe();

    return () => { balanceChannel.unsubscribe(); };
  }, [user?.id]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setScreen('landing');
    setPage('dashboard');
    setPageHistory(['dashboard']);
  };

  const handleAuth  = (tab) => { setAuthTab(tab); setScreen('auth'); };
  const handleLogin = (u)   => { setUser(u); navigate('dashboard'); setScreen('app'); };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.body.className = next ? '' : 'light';
  };

  // ─── Screens that show before the user is logged in ─────────────────────
  if (screen === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div className="gbg" />
        <div style={{ fontFamily: 'var(--fd)', fontSize: '18px', letterSpacing: '4px', color: 'var(--neon)' }}>
          NEXUSFLOW HUB
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', letterSpacing: '2px' }}>Loading...</div>
      </div>
    );
  }

  if (screen === 'landing') return <Landing onAuth={handleAuth} />;
  if (screen === 'auth')    return <Auth onLogin={handleLogin} defaultTab={authTab} />;
  if (!user)                return <Auth onLogin={handleLogin} defaultTab="login" />;

  const mobileNav = user.role === 'admin'    ? adminNav
    : user.role === 'reseller' ? resellerNav
    : buyerNav;

  // ─── Page router ──────────────────────────────────────────────────────────
  //     Every branch returns a lazy component.  The <Suspense> wrapper below
  //     shows <PageLoader> while the chunk is downloading (typically < 300ms
  //     on broadband; first visit only — the browser caches the chunk after that).
  const renderPage = () => {
    if (user.role === 'buyer') {
      if (page === 'dashboard')    return <BuyerDashboard user={user} onNav={navigate} />;
      if (page === 'marketplace')  return <Marketplace    user={user} onNav={navigate} />;
      if (page === 'deposit')      return <Deposit        user={user} />;
      if (page === 'orders')       return <Orders         user={user} />;
      if (page === 'transactions') return <Transactions   user={user} />;
      if (page === 'referral')     return <Referral       user={user} />;
      if (page === 'tasks')        return <Tasks          user={user} />;
      if (page === 'panelapi')     return <PanelApi       user={user} />;
      if (page === 'buyersupport') return <SupportTicket  user={user} />;
      if (page === 'profile')      return <Profile        user={user} onLogout={logout} />;
    }

    if (user.role === 'admin') {
      if (page === 'dashboard')    return <AdminDashboard   user={user} onNav={navigate} />;
      if (page === 'adminorders')  return <AdminOrders      user={user} />;
      if (page === 'adminservices')return <AdminServices    user={user} />;
      if (page === 'adminfilters') return <AdminManageFilters user={user} />;
      if (page === 'deposits')     return <AdminDeposits    user={user} />;
      if (page === 'users')        return <AdminUsers       user={user} />;
      if (page === 'settings')     return <AdminSettings    user={user} />;
      if (page === 'disputes')     return <AdminDisputes    user={user} />;
      if (page === 'api')          return <AdminApiImport   user={user} />;
      if (page === 'withdrawals')  return <AdminWithdrawals user={user} />;
      if (page === 'resellers')    return <AdminResellers   user={user} />;
      if (page === 'admintasks')   return <AdminTasks       user={user} />;
      if (page === 'adminreferral')return <AdminReferral    user={user} />;
      if (page === 'support')      return <AdminSupport     user={user} />;
      if (page === 'currencies')   return <AdminCurrencies  user={user} />;
      if (page === 'massemail')    return <AdminMassEmail   user={user} />;
      if (page === 'createreseller') return <AdminCreateReseller />;
      if (page === 'profile')      return <Profile user={user} onLogout={logout} />;
    }

    if (user.role === 'reseller') {
      if (page === 'dashboard')    return <ResellerDashboard user={user} onNav={navigate} />;
      if (page === 'services')     return <ResellerServices  user={user} />;
      if (page === 'earnings')     return <ResellerEarnings  user={user} />;
      if (page === 'transactions') return <Transactions      user={user} />;
      if (page === 'deposit')      return <Deposit           user={user} />;
      if (page === 'panelapi')     return <PanelApi          user={user} />;
      if (page === 'profile')      return <Profile           user={user} onLogout={logout} />;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '12px', textAlign: 'center', padding: '20px' }}>
        <div style={{ fontSize: '40px' }}>🚧</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: '14px', color: 'var(--neon)', letterSpacing: '2px' }}>
          {pageTitles[page] || page}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Coming soon</div>
        <button className="btn bgh bsm" onClick={() => navigate('dashboard')}>← Back</button>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="gbg" />
      <Sidebar
        user={user} page={page}
        onNav={navigate} open={sbOpen}
        onClose={() => setSbOpen(false)}
      />
      <main className="main">
        <Topbar
          user={user} page={page}
          onNav={navigate} onLogout={logout}
          onCurrency={() => setShowCurrency(true)}
          onTheme={toggleTheme} darkMode={darkMode}
          setSbOpen={setSbOpen}
        />
        <div className="page-content">
          {/*
            Suspense catches the lazy load and shows <PageLoader> until the
            chunk arrives. fallback swaps out automatically — you do nothing.
          */}
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </div>
      </main>
      <nav className="mobnav">
        {mobileNav.map(item => (
          <div
            key={item.id}
            className={`mni ${page === item.id ? 'on' : ''}`}
            onClick={() => navigate(item.id)}
          >
            <span className="mni-ic">{item.ic}</span>
            <span>{item.lb}</span>
          </div>
        ))}
      </nav>
      {showCurrency && <CurrencySwitcher onClose={() => setShowCurrency(false)} />}
    </div>
  );
}

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import './style.css';
import { supabase } from './supabase';

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

// ─── Data ─────────────────────────────────────────────────────────────────────
const pageTitles = {
  dashboard:    'Dashboard',    marketplace:   'Marketplace',
  orders:       'My Orders',    deposit:       'Add Funds',
  transactions: 'Transactions', referral:      'Referral & Earn',
  tasks:        'Earn Tasks',   profile:       'My Profile',
  panelapi:     'API Access',   services:      'Services',
  earnings:     'Earnings',     deposits:      'Manage Deposits',
  withdrawals:  'Withdrawals',  users:         'All Users',
  resellers:    'Resellers',    api:           'API Import',
  disputes:     'Disputes',     settings:      'Settings',
  admintasks:   'Manage Tasks', adminreferral: 'Referral Settings',
  support:      'Support Tickets', currencies: 'Currency Rates',
  massemail:    'Mass Email',   buyersupport:  'Support',
  adminorders:  'Manage Orders', adminservices: 'Manage Services',
  adminfilters: 'Manage Filters',
};

const buyerNav = [
  { ic: '🏠', lb: 'Home',     id: 'dashboard'   },
  { ic: '🛒', lb: 'Services', id: 'marketplace' },
  { ic: '📦', lb: 'Orders',   id: 'orders'      },
  { ic: '✅', lb: 'Deposits', id: 'deposit'     },
  { ic: '👤', lb: 'Profile',  id: 'profile'     },
];
const resellerNav = [
  { ic: '🏠', lb: 'Home',     id: 'dashboard'    },
  { ic: '🏪', lb: 'Services', id: 'services'     },
  { ic: '💵', lb: 'Earnings', id: 'earnings'     },
  { ic: '📊', lb: 'Txns',     id: 'transactions' },
  { ic: '👤', lb: 'Profile',  id: 'profile'      },
];
const adminNav = [
  { ic: '🏠', lb: 'Home',     id: 'dashboard'    },
  { ic: '📦', lb: 'Orders',   id: 'adminorders'  },
  { ic: '🛍',  lb: 'Services', id: 'adminservices'},
  { ic: '✅', lb: 'Deposits', id: 'deposits'     },
  { ic: '👤', lb: 'Profile',  id: 'profile'      },
];

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
    // FIX #30: orphaned fire-and-forget warm-up query REMOVED from here.
    // The getSession() call below already warms the Supabase connection.

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
          setAuthTab('login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
      if (page === 'adminorders')  return <AdminOrders />;
      if (page === 'adminservices')return <AdminServices />;
      if (page === 'adminfilters') return <AdminManageFilters />;
      if (page === 'deposits')     return <AdminDeposits />;
      if (page === 'users')        return <AdminUsers />;
      if (page === 'settings')     return <AdminSettings />;
      if (page === 'disputes')     return <AdminDisputes />;
      if (page === 'api')          return <AdminApiImport />;
      if (page === 'withdrawals')  return <AdminWithdrawals />;
      if (page === 'resellers')    return <AdminResellers />;
      if (page === 'admintasks')   return <AdminTasks />;
      if (page === 'adminreferral')return <AdminReferral />;
      if (page === 'support')      return <AdminSupport />;
      if (page === 'currencies')   return <AdminCurrencies />;
      if (page === 'massemail')    return <AdminMassEmail />;
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

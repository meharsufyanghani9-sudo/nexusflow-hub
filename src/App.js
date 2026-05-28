import React, { useState, useEffect, lazy, Suspense } from 'react';
import './style.css';
import { supabase } from './supabase';
import Landing from './Landing';
import Auth from './Auth';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CurrencySwitcher from './CurrencySwitcher';

// ─── LAZY LOAD all heavy pages ─────────────────────────────
const BuyerDashboard   = lazy(() => import('./BuyerDashboard'));
const Marketplace      = lazy(() => import('./Marketplace'));
const Deposit          = lazy(() => import('./Deposit'));
const Orders           = lazy(() => import('./Orders'));
const Transactions     = lazy(() => import('./Transactions'));
const Profile          = lazy(() => import('./Profile'));
const Referral         = lazy(() => import('./Referral'));
const Tasks            = lazy(() => import('./Tasks'));
const PanelApi         = lazy(() => import('./PanelApi'));
const SupportTicket    = lazy(() => import('./SupportTicket'));
const AdminDashboard   = lazy(() => import('./AdminDashboard'));
const AdminDeposits    = lazy(() => import('./AdminDeposits'));
const AdminUsers       = lazy(() => import('./AdminUsers'));
const AdminSettings    = lazy(() => import('./AdminSettings'));
const AdminDisputes    = lazy(() => import('./AdminDisputes'));
const AdminApiImport   = lazy(() => import('./AdminApiImport'));
const AdminWithdrawals = lazy(() => import('./AdminWithdrawals'));
const AdminResellers   = lazy(() => import('./AdminResellers'));
const AdminTasks       = lazy(() => import('./AdminTasks'));
const AdminReferral    = lazy(() => import('./AdminReferral'));
const AdminSupport     = lazy(() => import('./AdminSupport'));
const AdminCurrencies  = lazy(() => import('./AdminCurrencies'));
const AdminMassEmail   = lazy(() => import('./AdminMassEmail'));
const AdminOrders      = lazy(() => import('./AdminOrders'));
const AdminServices    = lazy(() => import('./AdminServices'));
const AdminFilters     = lazy(() => import('./AdminFilters'));
const ResellerDashboard = lazy(() => import('./ResellerDashboard'));
const ResellerServices  = lazy(() => import('./ResellerServices'));
const ResellerEarnings  = lazy(() => import('./ResellerEarnings'));

const pageTitles = {
  dashboard: 'Dashboard', marketplace: 'Marketplace',
  orders: 'My Orders', deposit: 'Add Funds',
  transactions: 'Transactions', referral: 'Referral & Earn',
  tasks: 'Earn Tasks', profile: 'My Profile',
  panelapi: 'API Access', services: 'Services',
  earnings: 'Earnings', deposits: 'Manage Deposits',
  withdrawals: 'Withdrawals', users: 'All Users',
  resellers: 'Resellers', api: 'API Import',
  disputes: 'Disputes', settings: 'Settings',
  admintasks: 'Manage Tasks', adminreferral: 'Referral Settings',
  support: 'Support Tickets', currencies: 'Currency Rates',
  massemail: 'Mass Email', buyersupport: 'Support',
  adminorders: 'Manage Orders', adminservices: 'Manage Services',
  adminfilters: 'Manage Filters',
};

const buyerNav = [
  { ic: '🏠', lb: 'Home', id: 'dashboard' },
  { ic: '🛒', lb: 'Market', id: 'marketplace' },
  { ic: '📦', lb: 'Orders', id: 'orders' },
  { ic: '💳', lb: 'Funds', id: 'deposit' },
  { ic: '👤', lb: 'Profile', id: 'profile' },
];
const resellerNav = [
  { ic: '🏠', lb: 'Home', id: 'dashboard' },
  { ic: '🏪', lb: 'Services', id: 'services' },
  { ic: '💵', lb: 'Earnings', id: 'earnings' },
  { ic: '📊', lb: 'Txns', id: 'transactions' },
  { ic: '👤', lb: 'Profile', id: 'profile' },
];
const adminNav = [
  { ic: '🏠', lb: 'Home', id: 'dashboard' },
  { ic: '📦', lb: 'Orders', id: 'adminorders' },
  { ic: '🛍', lb: 'Services', id: 'adminservices' },
  { ic: '✅', lb: 'Deposits', id: 'deposits' },
  { ic: '👤', lb: 'Profile', id: 'profile' },
];

async function generateUniqueUsername(baseName) {
  const base = baseName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  let candidate = base;
  let attempt = 0;
  while (true) {
    const { data } = await supabase
      .from('users').select('id').eq('username', candidate).maybeSingle();
    if (!data) return candidate;
    attempt++;
    candidate = base + attempt;
  }
}

function PageLoader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', flexDirection:'column', gap:'12px' }}>
      <div style={{ width:'32px', height:'32px', border:'3px solid var(--br)', borderTopColor:'var(--neon)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <div style={{ fontSize:'11px', letterSpacing:'2px', fontFamily:'var(--fd)' }}>LOADING...</div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [authTab, setAuthTab] = useState('login');
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [sbOpen, setSbOpen] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // ─── HISTORY API: push state on every page navigation ────
  const navigateTo = (newPage) => {
    window.history.pushState({ page: newPage }, '', '#' + newPage);
    setPage(newPage);
  };

  useEffect(() => {
    // Handle back/forward button
    const handlePopState = (e) => {
      if (e.state && e.state.page) {
        setPage(e.state.page);
      } else {
        // No more history — go to dashboard instead of exiting
        setPage('dashboard');
        window.history.replaceState({ page: 'dashboard' }, '', '#dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Seed initial history entry so first back goes to dashboard not exit
    if (!window.history.state) {
      window.history.replaceState({ page: 'dashboard' }, '', '#dashboard');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    supabase.from('settings').select('key').limit(1);

    const restoreSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users').select('*').eq('id', session.user.id).maybeSingle();

        if (profile && profile.is_active !== false) {
          let username = profile.username;
          if (!username) {
            username = await generateUniqueUsername(profile.full_name || 'user');
            await supabase.from('users').update({ username }).eq('id', session.user.id);
          }
          setUser({
            id: session.user.id,
            name: profile.full_name,
            email: profile.email,
            username,
            role: profile.role,
            balance: parseFloat(profile.balance || 0),
            referral_code: profile.referral_code,
          });
          setScreen('app');
          return;
        }
      }
      setScreen('landing');
    };
    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setScreen('landing'); setPage('dashboard'); }
      if (event === 'PASSWORD_RECOVERY') { setScreen('auth'); setAuthTab('login'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null); setScreen('landing'); setPage('dashboard');
  };

  const handleAuth = (tab) => { setAuthTab(tab); setScreen('auth'); };
  const handleLogin = (u) => { setUser(u); setPage('dashboard'); setScreen('app'); };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.body.className = next ? '' : 'light';
  };

  if (screen === 'loading') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', flexDirection:'column', gap:'16px' }}>
        <div className="gbg" />
        <div style={{ fontFamily:'var(--fd)', fontSize:'18px', letterSpacing:'4px', color:'var(--neon)' }}>NEXUSFLOW HUB</div>
        <div style={{ fontSize:'12px', color:'var(--text3)', letterSpacing:'2px' }}>Loading...</div>
      </div>
    );
  }

  if (screen === 'landing') return <Landing onAuth={handleAuth} />;
  if (screen === 'auth') return <Auth onLogin={handleLogin} defaultTab={authTab} />;
  if (!user) return <Auth onLogin={handleLogin} defaultTab="login" />;

  const mobileNav = user.role === 'admin' ? adminNav
    : user.role === 'reseller' ? resellerNav
    : buyerNav;

  const renderPage = () => {
    if (user.role === 'buyer') {
      if (page === 'dashboard')    return <BuyerDashboard user={user} onNav={navigateTo} />;
      if (page === 'marketplace')  return <Marketplace user={user} onNav={navigateTo} />;
      if (page === 'deposit')      return <Deposit user={user} />;
      if (page === 'orders')       return <Orders user={user} />;
      if (page === 'transactions') return <Transactions user={user} />;
      if (page === 'referral')     return <Referral user={user} />;
      if (page === 'tasks')        return <Tasks user={user} />;
      if (page === 'panelapi')     return <PanelApi user={user} />;
      if (page === 'buyersupport') return <SupportTicket user={user} />;
      if (page === 'profile')      return <Profile user={user} onLogout={logout} />;
    }
    if (user.role === 'admin') {
      if (page === 'dashboard')    return <AdminDashboard user={user} onNav={navigateTo} />;
      if (page === 'adminorders')  return <AdminOrders />;
      if (page === 'adminservices') return <AdminServices />;
      if (page === 'adminfilters') return <AdminFilters />;
      if (page === 'deposits')     return <AdminDeposits />;
      if (page === 'users')        return <AdminUsers />;
      if (page === 'settings')     return <AdminSettings />;
      if (page === 'disputes')     return <AdminDisputes />;
      if (page === 'api')          return <AdminApiImport />;
      if (page === 'withdrawals')  return <AdminWithdrawals />;
      if (page === 'resellers')    return <AdminResellers />;
      if (page === 'admintasks')   return <AdminTasks />;
      if (page === 'adminreferral') return <AdminReferral />;
      if (page === 'support')      return <AdminSupport />;
      if (page === 'currencies')   return <AdminCurrencies />;
      if (page === 'massemail')    return <AdminMassEmail />;
      if (page === 'profile')      return <Profile user={user} onLogout={logout} />;
    }
    if (user.role === 'reseller') {
      if (page === 'dashboard')    return <ResellerDashboard user={user} onNav={navigateTo} />;
      if (page === 'services')     return <ResellerServices user={user} />;
      if (page === 'earnings')     return <ResellerEarnings user={user} />;
      if (page === 'transactions') return <Transactions user={user} />;
      if (page === 'deposit')      return <Deposit user={user} />;
      if (page === 'panelapi')     return <PanelApi user={user} />;
      if (page === 'profile')      return <Profile user={user} onLogout={logout} />;
    }
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'50vh', gap:'12px', textAlign:'center', padding:'20px' }}>
        <div style={{ fontSize:'40px' }}>🚧</div>
        <div style={{ fontFamily:'var(--fd)', fontSize:'14px', color:'var(--neon)', letterSpacing:'2px' }}>{pageTitles[page] || page}</div>
        <div style={{ fontSize:'12px', color:'var(--text3)' }}>Coming soon</div>
        <button className="btn bgh bsm" onClick={() => navigateTo('dashboard')}>← Back</button>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="gbg" />
      <Sidebar user={user} page={page} onNav={navigateTo} open={sbOpen} onClose={() => setSbOpen(false)} />
      <main className="main">
        <Topbar
          user={user} page={page} onNav={navigateTo} onLogout={logout}
          onCurrency={() => setShowCurrency(true)} onTheme={toggleTheme}
          darkMode={darkMode} setSbOpen={setSbOpen}
        />
        <div className="page-content">
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </div>
      </main>
      <nav className="mobnav">
        {mobileNav.map(item => (
          <div key={item.id} className={`mni ${page === item.id ? 'on' : ''}`} onClick={() => navigateTo(item.id)}>
            <span className="mni-ic">{item.ic}</span>
            <span>{item.lb}</span>
          </div>
        ))}
      </nav>
      {showCurrency && <CurrencySwitcher onClose={() => setShowCurrency(false)} />}
    </div>
  );
}

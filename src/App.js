import React, { useState, useEffect, useCallback } from 'react';
import './style.css';
import { supabase } from './supabase';
import Landing from './Landing';
import Auth from './Auth';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BuyerDashboard from './BuyerDashboard';
import Marketplace from './Marketplace';
import Deposit from './Deposit';
import Orders from './Orders';
import Transactions from './Transactions';
import Profile from './Profile';
import Referral from './Referral';
import Tasks from './Tasks';
import PanelApi from './PanelApi';
import AdminDashboard from './AdminDashboard';
import AdminDeposits from './AdminDeposits';
import AdminUsers from './AdminUsers';
import AdminSettings from './AdminSettings';
import AdminDisputes from './AdminDisputes';
import AdminApiImport from './AdminApiImport';
import AdminWithdrawals from './AdminWithdrawals';
import AdminResellers from './AdminResellers';
import AdminTasks from './AdminTasks';
import AdminReferral from './AdminReferral';
import AdminSupport from './AdminSupport';
import AdminCurrencies from './AdminCurrencies';
import AdminMassEmail from './AdminMassEmail';
import AdminOrders from './AdminOrders';
import AdminServices from './AdminServices';
import ResellerDashboard from './ResellerDashboard';
import ResellerServices from './ResellerServices';
import ResellerEarnings from './ResellerEarnings';
import SupportTicket from './SupportTicket';
import CurrencySwitcher from './CurrencySwitcher';

const pageTitles = {
  dashboard:'Dashboard', marketplace:'Marketplace',
  orders:'My Orders', deposit:'Add Funds',
  transactions:'Transactions', referral:'Referral & Earn',
  tasks:'Earn Tasks', profile:'My Profile',
  panelapi:'API Access', services:'Services',
  earnings:'Earnings', deposits:'Manage Deposits',
  withdrawals:'Withdrawals', users:'All Users',
  resellers:'Resellers', api:'API Import',
  disputes:'Disputes', settings:'Settings',
  admintasks:'Manage Tasks', adminreferral:'Referral Settings',
  support:'Support Tickets', currencies:'Currency Rates',
  massemail:'Mass Email', buyersupport:'Support',
  adminorders:'Manage Orders', adminservices:'Manage Services',
};

const buyerNav = [
  { ic:'🏠', lb:'Home',   id:'dashboard'  },
  { ic:'🛒', lb:'Market', id:'marketplace'},
  { ic:'📦', lb:'Orders', id:'orders'     },
  { ic:'💳', lb:'Funds',  id:'deposit'    },
  { ic:'👤', lb:'Profile',id:'profile'    },
];
const resellerNav = [
  { ic:'🏠', lb:'Home',     id:'dashboard'    },
  { ic:'🏪', lb:'Services', id:'services'     },
  { ic:'💵', lb:'Earnings', id:'earnings'     },
  { ic:'📊', lb:'Txns',     id:'transactions' },
  { ic:'👤', lb:'Profile',  id:'profile'      },
];
const adminNav = [
  { ic:'🏠', lb:'Home',     id:'dashboard'    },
  { ic:'📦', lb:'Orders',   id:'adminorders'  },
  { ic:'🛍', lb:'Services', id:'adminservices'},
  { ic:'✅', lb:'Deposits', id:'deposits'     },
  { ic:'👤', lb:'Profile',  id:'profile'      },
];

async function generateUniqueUsername(baseName) {
  const base = baseName.toLowerCase().replace(/[^a-z0-9]/g,'') || 'user';
  let candidate = base, attempt = 0;
  while (true) {
    const { data } = await supabase.from('users').select('id').eq('username', candidate).maybeSingle();
    if (!data) return candidate;
    attempt++;
    candidate = base + attempt;
  }
}

export default function App() {
  const [screen, setScreen]         = useState('loading');
  const [authTab, setAuthTab]       = useState('login');
  const [user, setUser]             = useState(null);
  const [page, setPage]             = useState('dashboard');
  const [pageHistory, setPageHistory] = useState(['dashboard']); // history stack
  const [sbOpen, setSbOpen]         = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [darkMode, setDarkMode]     = useState(true);

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
            id: session.user.id, name: profile.full_name,
            email: profile.email, username, role: profile.role,
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
      if (event === 'SIGNED_OUT') { setUser(null); setScreen('landing'); setPage('dashboard'); setPageHistory(['dashboard']); }
      if (event === 'PASSWORD_RECOVERY') { setScreen('auth'); setAuthTab('login'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Browser back button support ──────────────────────────
  useEffect(() => {
    const handlePop = () => {
      setPageHistory(prev => {
        if (prev.length > 1) {
          const next = [...prev];
          next.pop();
          const target = next[next.length - 1];
          setPage(target);
          return next;
        }
        // Already at root — if on app, go to dashboard; otherwise let browser handle it
        if (screen === 'app') {
          setPage('dashboard');
          return ['dashboard'];
        }
        return prev;
      });
    };

    // Push a dummy state so popstate fires on first back press
    window.history.pushState({ panel: true }, '');
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [screen]);

  const navigate = useCallback((newPage) => {
    if (newPage === page) return;
    // Push state so back button works
    window.history.pushState({ panel: true, page: newPage }, '');
    setPageHistory(prev => [...prev.slice(-19), newPage]); // keep last 20
    setPage(newPage);
    setSbOpen(false);
  }, [page]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null); setScreen('landing'); setPage('dashboard'); setPageHistory(['dashboard']);
  };

  const handleAuth  = (tab) => { setAuthTab(tab); setScreen('auth'); };
  const handleLogin = (u)   => { setUser(u); setPage('dashboard'); setPageHistory(['dashboard']); setScreen('app'); };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.body.className = next ? '' : 'light';
  };

  if (screen === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', flexDirection:'column', gap:'16px' }}>
      <div className="gbg" />
      <div style={{ fontFamily:'var(--fd)', fontSize:'18px', letterSpacing:'4px', color:'var(--neon)' }}>NEXUSFLOW HUB</div>
      <div style={{ fontSize:'12px', color:'var(--text3)', letterSpacing:'2px' }}>Loading...</div>
    </div>
  );

  if (screen === 'landing') return <Landing onAuth={handleAuth} />;
  if (screen === 'auth')    return <Auth onLogin={handleLogin} defaultTab={authTab} />;
  if (!user)                return <Auth onLogin={handleLogin} defaultTab="login" />;

  const mobileNav = user.role === 'admin' ? adminNav
    : user.role === 'reseller' ? resellerNav
    : buyerNav;

  const renderPage = () => {
    if (user.role === 'buyer') {
      if (page === 'dashboard')   return <BuyerDashboard user={user} onNav={navigate} />;
      if (page === 'marketplace') return <Marketplace user={user} onNav={navigate} />;
      if (page === 'deposit')     return <Deposit user={user} />;
      if (page === 'orders')      return <Orders user={user} onNav={navigate} />;
      if (page === 'transactions')return <Transactions user={user} />;
      if (page === 'referral')    return <Referral user={user} />;
      if (page === 'tasks')       return <Tasks user={user} />;
      if (page === 'panelapi')    return <PanelApi user={user} />;
      if (page === 'buyersupport')return <SupportTicket user={user} />;
      if (page === 'profile')     return <Profile user={user} onLogout={logout} />;
    }
    if (user.role === 'admin') {
      if (page === 'dashboard')    return <AdminDashboard user={user} onNav={navigate} />;
      if (page === 'adminorders')  return <AdminOrders />;
      if (page === 'adminservices')return <AdminServices />;
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
      if (page === 'profile')      return <Profile user={user} onLogout={logout} />;
    }
    if (user.role === 'reseller') {
      if (page === 'dashboard')    return <ResellerDashboard user={user} onNav={navigate} />;
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
        <button className="btn bgh bsm" onClick={() => navigate('dashboard')}>← Back</button>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="gbg" />
      <Sidebar user={user} page={page} onNav={navigate} open={sbOpen} onClose={() => setSbOpen(false)} />
      <main className="main">
        <Topbar
          user={user} page={page} onNav={navigate} onLogout={logout}
          onCurrency={() => setShowCurrency(true)} onTheme={toggleTheme}
          darkMode={darkMode} setSbOpen={setSbOpen}
        />
        <div className="page-content">
          {renderPage()}
        </div>
      </main>
      <nav className="mobnav">
        {mobileNav.map(item => (
          <div key={item.id} className={`mni ${page === item.id ? 'on' : ''}`} onClick={() => navigate(item.id)}>
            <span className="mni-ic">{item.ic}</span>
            <span>{item.lb}</span>
          </div>
        ))}
      </nav>
      {showCurrency && <CurrencySwitcher onClose={() => setShowCurrency(false)} />}
    </div>
  );
}

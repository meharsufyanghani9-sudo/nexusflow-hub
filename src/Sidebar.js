import React from 'react';

const menus = {
  buyer: [
    { ic: '🏠', lb: 'Dashboard', id: 'dashboard' },
    { ic: '🛒', lb: 'Marketplace', id: 'marketplace' },
    { ic: '📦', lb: 'My Orders', id: 'orders' },
    { ic: '💳', lb: 'Add Funds', id: 'deposit' },
    { ic: '📊', lb: 'Transactions', id: 'transactions' },
    { ic: '🎁', lb: 'Referral & Earn', id: 'referral' },
    { ic: '⚡', lb: 'Earn Tasks', id: 'tasks' },
    { ic: '📡', lb: 'API Access', id: 'panelapi' },
    { ic: '💬', lb: 'Support', id: 'buyersupport' },
    { ic: '👤', lb: 'Profile', id: 'profile' },
  ],
  reseller: [
    { ic: '🏠', lb: 'Dashboard', id: 'dashboard' },
    { ic: '🏪', lb: 'My Services', id: 'services' },
    { ic: '💵', lb: 'Earnings', id: 'earnings' },
    { ic: '📊', lb: 'Transactions', id: 'transactions' },
    { ic: '💳', lb: 'Add Funds', id: 'deposit' },
    { ic: '📡', lb: 'API Access', id: 'panelapi' },
    { ic: '👤', lb: 'Profile', id: 'profile' },
  ],
  admin: [
    { ic: '🏠', lb: 'Dashboard', id: 'dashboard' },
    { ic: '📦', lb: 'Manage Orders', id: 'adminorders' },
    { ic: '🛍', lb: 'Manage Services', id: 'adminservices' },
    { ic: '🎛️', lb: 'Manage Filters', id: 'adminfilters' },
    { ic: '✅', lb: 'Deposits', id: 'deposits' },
    { ic: '💸', lb: 'Withdrawals', id: 'withdrawals' },
    { ic: '👥', lb: 'All Users', id: 'users' },
    { ic: '🏪', lb: 'Resellers', id: 'resellers' },
    { ic: '⚖️', lb: 'Disputes',          id: 'disputes'     },
    { ic: '💬', lb: 'Live Chat',          id: 'livechat'      },
    { ic: '🏷️', lb: 'User Discounts',     id: 'userdiscounts' },
    { ic: '🔄', lb: 'Order Sync',         id: 'ordersync'     },
    { ic: '🔁', lb: 'Provider Auto-Sync', id: 'providersync' },
    { ic: '🔌', lb: 'API Import', id: 'api' },
    { ic: '📋', lb: 'Manage Tasks', id: 'admintasks' },
    { ic: '🎁', lb: 'Referral Settings', id: 'adminreferral' },
    { ic: '💱', lb: 'Currency Rates', id: 'currencies' },
    { ic: '💬', lb: 'Support Tickets', id: 'support' },
    { ic: '📨', lb: 'Mass Email', id: 'massemail' },
    { ic: '⚙️', lb: 'Settings', id: 'settings' },
    { ic: '👤', lb: 'Profile', id: 'profile' },
  ],
};

export default function Sidebar({ user, page, onNav, open, onClose }) {
  const items = menus[user.role] || menus.buyer;
  return (
    <>
      <div className={`sb-ov ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sb-top">
          <div className="sb-mk">N</div>
          <div>
            <div className="sb-tl">NEXUSFLOW</div>
            <div className="sb-vr">HUB v1.0</div>
          </div>
        </div>
        <nav className="sb-nav">
          <div className="nlbl">{user.role} panel</div>
          {items.map(item => (
            <div key={item.id} className={`ni ${page === item.id ? 'on' : ''}`}
              onClick={() => { onNav(item.id); onClose(); }}>
              <span className="ni-ic">{item.ic}</span>
              <span>{item.lb}</span>
            </div>
          ))}
        </nav>
        <div className="sb-usr">
          <div className="u-card">
            <div className="uav">{user.name[0].toUpperCase()}</div>
            <div>
              <div className="u-nm">{user.name}</div>
              <div className="u-rl">{user.role}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '5px 0' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Balance</div>
            <div className="u-bv">${user.balance.toFixed(2)}</div>
          </div>
        </div>
      </aside>
    </>
  );
}

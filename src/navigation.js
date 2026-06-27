// navigation.js — Single source of truth for all nav/menu/page-title data.
//
// REFACTOR Phase-15: previously pageTitles was defined twice (App.js and
// Topbar.js — with slightly different entry sets), buyerNav/resellerNav/
// adminNav were defined in App.js only, and sidebarMenus were defined only
// in Sidebar.js. Any new page required edits in 2–3 separate files.
// Now all nav data lives here; consumers import what they need.

// ─── Page titles shown in the Topbar ─────────────────────────────────────────
export const pageTitles = {
  dashboard:      'Dashboard',
  marketplace:    'Marketplace',
  orders:         'My Orders',
  deposit:        'Add Funds',
  transactions:   'Transactions',
  referral:       'Referral & Earn',
  tasks:          'Earn Tasks',
  profile:        'My Profile',
  panelapi:       'API Access',
  buyersupport:   'Support',
  services:       'Services',
  earnings:       'Earnings',
  deposits:       'Manage Deposits',
  withdrawals:    'Withdrawals',
  users:          'All Users',
  resellers:      'Resellers',
  api:            'API Import',
  disputes:       'Disputes',
  settings:       'Settings',
  admintasks:     'Manage Tasks',
  adminreferral:  'Referral Settings',
  support:        'Support Tickets',
  currencies:     'Currency Rates',
  massemail:      'Mass Email',
  adminorders:    'Manage Orders',
  adminservices:  'Manage Services',
  adminfilters:   'Manage Filters',
  createreseller: 'Create Reseller',
  ordersync:      'Order Sync',
  providersync:   'Provider Auto-Sync',
  livechat:       'Live Chat Support',
};

// ─── Mobile bottom-nav items (5 max) ─────────────────────────────────────────
export const buyerNav = [
  { ic: '🏠', lb: 'Home',     id: 'dashboard'   },
  { ic: '🛒', lb: 'Services', id: 'marketplace' },
  { ic: '📦', lb: 'Orders',   id: 'orders'      },
  { ic: '✅', lb: 'Deposits', id: 'deposit'     },
  { ic: '👤', lb: 'Profile',  id: 'profile'     },
];

export const resellerNav = [
  { ic: '🏠', lb: 'Home',     id: 'dashboard'    },
  { ic: '🏪', lb: 'Services', id: 'services'     },
  { ic: '💵', lb: 'Earnings', id: 'earnings'     },
  { ic: '📊', lb: 'Txns',     id: 'transactions' },
  { ic: '👤', lb: 'Profile',  id: 'profile'      },
];

export const adminNav = [
  { ic: '🏠', lb: 'Home',     id: 'dashboard'    },
  { ic: '📦', lb: 'Orders',   id: 'adminorders'  },
  { ic: '🛍',  lb: 'Services', id: 'adminservices'},
  { ic: '✅', lb: 'Deposits', id: 'deposits'     },
  { ic: '👤', lb: 'Profile',  id: 'profile'      },
];

// ─── Sidebar full menu (all pages for each role) ──────────────────────────────
export const sidebarMenus = {
  buyer: [
    { ic: '🏠', lb: 'Dashboard',     id: 'dashboard'   },
    { ic: '🛒', lb: 'Marketplace',   id: 'marketplace' },
    { ic: '📦', lb: 'My Orders',     id: 'orders'      },
    { ic: '💳', lb: 'Add Funds',     id: 'deposit'     },
    { ic: '📊', lb: 'Transactions',  id: 'transactions'},
    { ic: '🎁', lb: 'Referral & Earn', id: 'referral'  },
    { ic: '⚡', lb: 'Earn Tasks',    id: 'tasks'       },
    { ic: '📡', lb: 'API Access',    id: 'panelapi'    },
    { ic: '💬', lb: 'Support',       id: 'buyersupport'},
    { ic: '👤', lb: 'Profile',       id: 'profile'     },
  ],
  reseller: [
    { ic: '🏠', lb: 'Dashboard',     id: 'dashboard'    },
    { ic: '🏪', lb: 'My Services',   id: 'services'     },
    { ic: '💵', lb: 'Earnings',      id: 'earnings'     },
    { ic: '📊', lb: 'Transactions',  id: 'transactions' },
    { ic: '💳', lb: 'Add Funds',     id: 'deposit'      },
    { ic: '📡', lb: 'API Access',    id: 'panelapi'     },
    { ic: '👤', lb: 'Profile',       id: 'profile'      },
  ],
  admin: [
    { ic: '🏠', lb: 'Dashboard',       id: 'dashboard'    },
    { ic: '📦', lb: 'Manage Orders',   id: 'adminorders'  },
    { ic: '🛍',  lb: 'Manage Services', id: 'adminservices'},
    { ic: '🎛️', lb: 'Manage Filters',  id: 'adminfilters' },
    { ic: '✅', lb: 'Deposits',        id: 'deposits'     },
    { ic: '💸', lb: 'Withdrawals',     id: 'withdrawals'  },
    { ic: '👥', lb: 'All Users',       id: 'users'        },
    { ic: '🏪', lb: 'Resellers',       id: 'resellers'    },
    { ic: '⚖️', lb: 'Disputes',        id: 'disputes'     },
    { ic: '🔄', lb: 'Order Sync',       id: 'ordersync'    },
    { ic: '🔁', lb: 'Provider Auto-Sync', id: 'providersync' },
    { ic: '🔌', lb: 'API Import',      id: 'api'          },
    { ic: '📋', lb: 'Manage Tasks',    id: 'admintasks'   },
    { ic: '🎁', lb: 'Referral Settings', id: 'adminreferral'},
    { ic: '💱', lb: 'Currency Rates',  id: 'currencies'   },
    { ic: '💬', lb: 'Support Tickets', id: 'support'      },
    { ic: '📨', lb: 'Mass Email',      id: 'massemail'    },
    { ic: '⚙️', lb: 'Settings',        id: 'settings'     },
    { ic: '👤', lb: 'Profile',         id: 'profile'      },
  ],
};

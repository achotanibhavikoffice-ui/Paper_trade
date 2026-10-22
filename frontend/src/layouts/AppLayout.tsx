import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Compass,
  Flame,
  LayoutDashboard,
  LogOut,
  Newspaper,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { accountApi, authApi, marketApi, type AccountInfo, type MarketStatus, type User } from '../api';
import { Brand } from '../components/Brand';
import { GlobalSearchModal } from '../components/common/GlobalSearchModal';
import { HelpChatPanel } from '../components/HelpChatPanel';

export interface AppLayoutProps {
  user: User | null;
  onAuth: (user: User | null) => void;
  children: ReactNode;
}

const navItems = [
  { label: 'Overview', path: '/dashboard', Icon: LayoutDashboard },
  { label: 'Explore', path: '/explore', Icon: Compass },
  { label: 'Market News', path: '/news', Icon: Newspaper },
  { label: 'Watchlist', path: '/watchlist', Icon: Star },
  { label: 'Portfolio', path: '/portfolio', Icon: Wallet },
  { label: 'Orders', path: '/orders', Icon: Clock3 },
  { label: 'What-if Lab', path: '/what-if', Icon: Activity, isNew: true },
  { label: 'Market Stress', path: '/market-stress', Icon: Flame, isNew: true },
  { label: 'Recovery Shield', path: '/recovery', Icon: RotateCcw, isNew: true },
  { label: 'Learn', path: '/learn', Icon: BookOpen },
  { label: 'Notifications', path: '/notifications', Icon: Bell },
  { label: 'Practice Account', path: '/account', Icon: ShieldCheck },
  { label: 'Profile', path: '/profile', Icon: UserRound },
];

export function AppLayout({ user, onAuth, children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    accountApi.getAccount().then(setAccount).catch(() => setAccount(null));
    const refreshMarketStatus = () => marketApi.status().then(setMarketStatus).catch(() => setMarketStatus(null));
    void refreshMarketStatus();
    const timer = window.setInterval(() => void refreshMarketStatus(), 15000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      /* Return to public overview */
    }
    onAuth(null);
    navigate('/');
  }

  const currentNavItem = navItems.find((item) =>
    item.path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname.startsWith(item.path)
  );
  const snapshotMode = ['indianapi', 'snapshot+demo'].includes(marketStatus?.mode ?? '');
  const snapshotError = marketStatus?.indian_api?.last_error;
  const providerError = marketStatus?.provider_error;
  const marketBadgeTitle = snapshotError
    ? `${snapshotError.message}${marketStatus?.indian_api?.retry_after_seconds ? ` Retry in about ${Math.ceil(marketStatus.indian_api.retry_after_seconds / 60)} minute(s).` : ''}`
    : providerError ? `021 market feed: ${providerError}`
    : snapshotMode
      ? 'IndianAPI provides periodic price snapshots without market depth.'
      : marketStatus?.mode === 'demo'
        ? 'Generated practice prices are used when 021 has no current quote. Orders are simulated in your local paper account.'
        : marketStatus?.connected
          ? '021 market feed connected; orders execute in the local paper simulator.'
          : 'Market feed is disconnected. Quotes may be unavailable; orders require a fresh quote.';
  const marketBadgeLabel = snapshotError ? 'SNAPSHOT ISSUE'
    : providerError && !marketStatus?.connected ? 'FEED ISSUE'
    : snapshotMode ? 'API SNAPSHOT'
      : marketStatus?.mode === 'demo' ? 'DATA'
        : marketStatus?.connected ? 'MARKET FEED LIVE' : 'PAPER PRACTICE';
  const currentTitle = location.pathname === '/settings' ? 'Settings' : currentNavItem ? currentNavItem.label : location.pathname.startsWith('/stocks/') ? 'Stock details' : 'Workspace';

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="side-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <button className="workspace-switch" onClick={() => navigate('/account')}>
          <span className="workspace-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? 'G'}</span>
          <span className="workspace-copy">
            <strong>{user?.name?.split(' ')[0] ?? 'Guest'}’s workspace</strong>
            <small>{account?.account_number ?? 'Paper portfolio'}</small>
          </span>
          <ChevronDown size={15} />
        </button>

        <span className="nav-caption">WORKSPACE</span>

        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, path, Icon, isNew }) => {
            const isActive =
              path === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => {
                  navigate(path);
                  setSidebarOpen(false);
                }}
                className={`nav-link ${isActive ? 'nav-active' : ''}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
                {isNew && <span className="nav-new">NEW</span>}
              </button>
            );
          })}
        </nav>



        <div className="side-bottom">
          <button className="nav-link" onClick={() => { setHelpOpen(true); setSidebarOpen(false); }}>
            <CircleHelp size={17} />
            <span>Help & support</span>
          </button>
          <button className={`nav-link ${location.pathname === '/settings' ? 'nav-active' : ''}`} onClick={() => navigate('/settings')}>
            <Settings2 size={17} />
            <span>Settings</span>
          </button>

          <div className="profile-row">
            <span className="profile-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? 'G'}</span>
            <span className="profile-copy">
              <strong>{user?.name ?? 'Guest explorer'}</strong>
              <small>{user ? user.email : 'Preview mode'}</small>
            </span>
            <button
              className="icon-button logout-button"
              aria-label={user ? 'Sign out' : 'Go to sign in'}
              onClick={user ? logout : () => navigate('/login')}
            >
              {user ? <LogOut size={16} /> : <ArrowUpRight size={16} />}
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Viewport */}
      <main className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Command size={19} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span>/</span>
              <strong>{currentTitle}</strong>
            </div>
          </div>

          <div className="topbar-right">
            {/* Global Search Button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-700 transition-colors"
            >
              <Search size={14} />
              <span>Search stocks...</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-slate-200 rounded text-slate-500 font-mono">
                ⌘K
              </kbd>
            </button>

            <span className={`market-status workspace-market-status ${snapshotError || (providerError && !marketStatus?.connected) ? 'market-error' : marketStatus?.connected && !['demo', 'indianapi', 'snapshot+demo'].includes(marketStatus.mode) ? 'connected' : ''}`} title={marketBadgeTitle}>
              <i /> {marketBadgeLabel}
            </span>

            {/* Buying Power Pill */}
            {account && (
              <button
                onClick={() => navigate('/account')}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                title="Paper buying power"
              >
                <Wallet size={14} />
                <span>₹{Number(account.cash_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </button>
            )}

            {/* Notifications Button */}
            <button
              className="icon-button notification-button relative"
              aria-label="Notifications"
              onClick={() => navigate('/notifications')}
            >
              <Bell size={18} />
              <i />
            </button>

            {/* User Dropdown */}
            <div className="relative">
              <button
                className="top-avatar"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-label="Open user menu"
              >
                {user?.name?.slice(0, 1).toUpperCase() ?? 'G'}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl z-50 animate-in fade-in duration-150">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <strong className="block text-xs font-semibold text-slate-800">{user?.name}</strong>
                    <small className="block text-[11px] text-slate-500 truncate">{user?.email}</small>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2 mt-1"
                  >
                    <UserRound size={14} /> Profile
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Settings2 size={14} /> Settings
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/account');
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <ShieldCheck size={14} /> Practice Capital
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-2 border-t border-slate-100 mt-1"
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="content-wrap">{children}</div>
      </main>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <HelpChatPanel
        isOpen={helpOpen}
        page={location.pathname}
        pageTitle={currentTitle}
        onClose={() => setHelpOpen(false)}
        onNavigate={navigate}
      />

      {/* Mobile Bottom Tabbar */}
      <div className="mobile-tabbar">
        <button
          className={location.pathname === '/dashboard' ? 'mobile-tab-active' : ''}
          onClick={() => navigate('/dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>Home</span>
        </button>
        <button
          className={location.pathname.startsWith('/explore') ? 'mobile-tab-active' : ''}
          onClick={() => navigate('/explore')}
        >
          <Compass size={18} />
          <span>Explore</span>
        </button>
        <button
          className={location.pathname.startsWith('/watchlist') ? 'mobile-tab-active' : ''}
          onClick={() => navigate('/watchlist')}
        >
          <Star size={18} />
          <span>Watchlist</span>
        </button>
        <button
          className={location.pathname.startsWith('/portfolio') ? 'mobile-tab-active' : ''}
          onClick={() => navigate('/portfolio')}
        >
          <Wallet size={18} />
          <span>Portfolio</span>
        </button>
      </div>
    </div>
  );
}

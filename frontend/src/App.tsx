import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { User } from './api';
import { accountApi, authApi } from './api';

import { AuthPage } from './components/AuthPage';
import { ForgotPasswordPage, ResetPasswordPage } from './components/PasswordRecoveryPages';
import { HomePage } from './components/HomePage';
import { Brand } from './components/Brand';
import { AppLayout } from './layouts/AppLayout';

import { DashboardPage } from './pages/DashboardPage';
import { ExplorePage } from './pages/ExplorePage';
import { StockDetailsPage } from './pages/StockDetailsPage';
import { NewsPage } from './pages/NewsPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { PositionsPage } from './pages/PositionsPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailsPage } from './pages/OrderDetailsPage';
import { WhatIfPage } from './pages/WhatIfPage';
import { MarketStressPage } from './pages/MarketStressPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { LearnPage } from './pages/LearnPage';
import { LessonDetailsPage } from './pages/LessonDetailsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountPage } from './pages/AccountPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CapitalSetupPage } from './pages/CapitalSetupPage';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [capitalConfigured, setCapitalConfigured] = useState<boolean | null>(null);
  const [accountInitialCapital, setAccountInitialCapital] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) {
      setCapitalConfigured(null);
      setAccountInitialCapital(null);
      return;
    }
    let active = true;
    setCapitalConfigured(null);
    accountApi.getAccount()
      .then((account) => {
        if (active) {
          setCapitalConfigured(account.capital_configured);
          setAccountInitialCapital(account.initial_capital);
        }
      })
      .catch(() => { if (active) setCapitalConfigured(false); });
    return () => { active = false; };
  }, [user?.id]);

  if (!ready && location.pathname !== '/') {
    return (
      <div className="boot-screen min-h-screen">
        <Brand />
        <span>Preparing your workspace</span>
      </div>
    );
  }

  // Wrapper helper for protected routes
  const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    if (capitalConfigured === null) {
      return <div className="boot-screen min-h-screen"><Brand /><span>Preparing your workspace</span></div>;
    }
    if (!capitalConfigured) return <Navigate to="/setup-account" replace />;
    return <AppLayout user={user} onAuth={setUser}>{children}</AppLayout>;
  };

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage user={user} />} />
      <Route
        path="/setup-account"
        element={user
          ? capitalConfigured === null
            ? <div className="boot-screen min-h-screen"><Brand /><span>Preparing your workspace</span></div>
            : capitalConfigured && (location.state as { promptCapitalSetup?: boolean } | null)?.promptCapitalSetup !== true
              ? <Navigate to="/dashboard" replace />
              : <CapitalSetupPage currentCapital={capitalConfigured ? accountInitialCapital : null} onComplete={() => { setCapitalConfigured(true); navigate('/dashboard', { replace: true }); }} />
          : <Navigate to="/login" replace />}
      />
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" onAuth={setUser} />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="register" onAuth={setUser} />}
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Authenticated Application Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage user={user} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/explore"
        element={
          <ProtectedRoute>
            <ExplorePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/stocks/:symbol"
        element={
          <ProtectedRoute>
            <StockDetailsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/news"
        element={
          <ProtectedRoute>
            <NewsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/watchlist"
        element={
          <ProtectedRoute>
            <WatchlistPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/portfolio"
        element={
          <ProtectedRoute>
            <PortfolioPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/portfolio/holdings"
        element={
          <ProtectedRoute>
            <HoldingsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/portfolio/positions"
        element={
          <ProtectedRoute>
            <PositionsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders/:orderId"
        element={
          <ProtectedRoute>
            <OrderDetailsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/what-if"
        element={
          <ProtectedRoute>
            <WhatIfPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/market-stress"
        element={
          <ProtectedRoute>
            <MarketStressPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/recovery"
        element={
          <ProtectedRoute>
            <RecoveryPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/learn"
        element={
          <ProtectedRoute>
            <LearnPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/learn/:lessonId"
        element={
          <ProtectedRoute>
            <LessonDetailsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfileSettingsPage user={user!} onAuth={setUser} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />

      {/* 404 Catch-All Route */}
      <Route
        path="*"
        element={
          user ? (
            <AppLayout user={user} onAuth={setUser}>
              <NotFoundPage />
            </AppLayout>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
    </Routes>
  );
}

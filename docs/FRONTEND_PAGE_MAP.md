# Tradeo — Frontend Architecture & Page Map

This document defines the frontend application structure, route mapping, shared components, API boundaries, and team development guidelines for Tradeo.

---

## 1. Route Table & Page Scaffolding Status

| Route Path | Component File | Auth Required | Implementation Status | Connected APIs | Key Shared Components |
|---|---|:---:|---|---|---|
| `/` | `src/components/HomePage.tsx` | No | Operational | `authApi.me()` | Public Landing Shell |
| `/login` | `src/components/AuthPage.tsx` | No | Operational | `authApi.login()` | Auth Card, Form Inputs |
| `/register` | `src/components/AuthPage.tsx` | No | Operational | `authApi.register()` | Auth Card, Form Inputs |
| `/forgot-password` | `src/components/PasswordRecoveryPages.tsx` | No | Operational | `authApi.forgotPassword()` | Form Card |
| `/reset-password` | `src/components/PasswordRecoveryPages.tsx` | No | Operational | `authApi.resetPassword()` | Form Card |
| `/dashboard` | `src/pages/DashboardPage.tsx` | Yes | Scaffolded | `accountApi.getAccount()` | `PageHeader`, `StatCard`, Sparklines, Quick Order |
| `/explore` | `src/pages/ExplorePage.tsx` | Yes | Scaffolded | `accountApi.getInstruments()` | `PageHeader`, `TabNavigation`, Search Filters |
| `/stocks/:symbol` | `src/pages/StockDetailsPage.tsx` | Yes | Scaffolded | Demo Instrument Data | `PageHeader`, Order Ticket, Chart Workspace |
| `/watchlist` | `src/pages/WatchlistPage.tsx` | Yes | Scaffolded | Local/Demo State | `PageHeader`, `EmptyState`, Stock Action Table |
| `/portfolio` | `src/pages/PortfolioPage.tsx` | Yes | Scaffolded | `accountApi.getAccount()` | `PageHeader`, `StatCard`, `TabNavigation` |
| `/portfolio/holdings` | `src/pages/HoldingsPage.tsx` | Yes | Scaffolded | Demo Holdings Data | `PageHeader`, `StatusBadge`, `EmptyState` |
| `/portfolio/positions` | `src/pages/PositionsPage.tsx` | Yes | Scaffolded | Demo Intraday Positions | `PageHeader`, `StatusBadge`, `EmptyState` |
| `/orders` | `src/pages/OrdersPage.tsx` | Yes | Scaffolded | Demo Orders Data | `PageHeader`, `StatusBadge`, `TabNavigation` |
| `/orders/:orderId` | `src/pages/OrderDetailsPage.tsx` | Yes | Scaffolded | Demo Order Detail | `PageHeader`, `StatusBadge`, Fill Timeline |
| `/what-if` | `src/pages/WhatIfPage.tsx` | Yes | Scaffolded | Client-side Calculator | `PageHeader`, Slider, Comparison Grid |
| `/learn` | `src/pages/LearnPage.tsx` | Yes | Scaffolded | Embedded Curriculum | `PageHeader`, Lesson Card Grid |
| `/learn/:lessonId` | `src/pages/LessonDetailsPage.tsx` | Yes | Scaffolded | Lesson Content | `PageHeader`, Interactive Quiz |
| `/notifications` | `src/pages/NotificationsPage.tsx` | Yes | Scaffolded | Demo System Alerts | `PageHeader`, `TabNavigation`, Alert Rows |
| `/profile` | `src/pages/ProfileSettingsPage.tsx` | Yes | Operational | `authApi.updateProfile()`, `authApi.logout()` | `PageHeader`, `TabNavigation`, Form Controls |
| `/account` | `src/pages/AccountPage.tsx` | Yes | Operational | `accountApi.getAccount()`, `accountApi.getLedger()` | `PageHeader`, `StatCard`, `LoadingSkeleton`, `EmptyState` |
| `*` (404) | `src/pages/NotFoundPage.tsx` | Contextual | Operational | None | Compass 404 Card |

---

## 2. Shared Component Architecture

Developers working on separate pages must use the shared components in `src/components/common/` rather than re-creating duplicate UI elements.

- **Layout Shell**: `src/layouts/AppLayout.tsx` (sidebar, topbar, mobile tabbar, global search trigger, user dropdown).
- **Page Headers**: `src/components/common/PageHeader.tsx` (handles title, eyebrow, breadcrumbs, action buttons).
- **Metric Cards**: `src/components/common/StatCard.tsx` (handles values, labels, P&L badges, subtexts).
- **Status Badges**: `src/components/common/StatusBadge.tsx` (handles order status, side BUY/SELL, product CNC/MIS).
- **Sub-navigation**: `src/components/common/TabNavigation.tsx` (handles tab items with count badges).
- **Loading Skeletons**: `src/components/common/LoadingSkeleton.tsx` (`LoadingSkeleton`, `TableSkeleton`, `CardSkeleton`).
- **Empty States**: `src/components/common/EmptyState.tsx` (handles empty tables and zero-state views).
- **Global Search**: `src/components/common/GlobalSearchModal.tsx` (Cmd+K / Ctrl+K stock search connected to backend instruments).

---

## 3. Team Development Guidelines & Work Boundaries

### Shared Files (Do NOT edit unless coordinating with team)
1. `src/App.tsx` — Routing configuration.
2. `src/layouts/AppLayout.tsx` — Main application frame and topbar.
3. `src/api.ts` & `src/types/index.ts` — Shared API client and domain type contracts.
4. `src/components/common/*` — Shared reusable presentation UI.

### Independent Page Ownership Boundaries
- **Developer 1 (Trading Engine & Orders)**:
  - Focus: `src/pages/StockDetailsPage.tsx`, `src/pages/OrdersPage.tsx`, `src/pages/OrderDetailsPage.tsx`.
- **Developer 2 (Portfolio & Ledger)**:
  - Focus: `src/pages/PortfolioPage.tsx`, `src/pages/HoldingsPage.tsx`, `src/pages/PositionsPage.tsx`, `src/pages/AccountPage.tsx`.
- **Developer 3 (Market Discovery & Watchlist)**:
  - Focus: `src/pages/DashboardPage.tsx`, `src/pages/ExplorePage.tsx`, `src/pages/WatchlistPage.tsx`.
- **Developer 4 (Education & Simulation)**:
  - Focus: `src/pages/WhatIfPage.tsx`, `src/pages/LearnPage.tsx`, `src/pages/LessonDetailsPage.tsx`, `src/pages/NotificationsPage.tsx`.

---

## 4. Mock Data vs Backend API Policy

1. Real API endpoints (`GET /api/account/me`, `GET /api/account/ledger`, `GET /api/instruments`) are already integrated into `AccountPage`, `DashboardPage`, `ExplorePage`, and `GlobalSearchModal`.
2. Pages requiring order execution, live market feeds, position tracking, or lesson progress use explicitly typed mock data located directly within the page file or `src/types/index.ts`.
3. When real order/matching endpoints are implemented in backend milestones, replace page mock states by calling `accountApi` or creating an equivalent domain API helper in `src/api.ts`.

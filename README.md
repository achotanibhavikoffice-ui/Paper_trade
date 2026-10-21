<div align="center">
  <h1>Paper_trade — Next-Gen Indian Market Paper Trading &amp; Strategy Simulator</h1>
  <p><em>A zero-risk workspace for learning Indian equities, practicing simulated orders, and understanding how execution costs affect a portfolio.</em></p>
  <p>
    <img src="https://img.shields.io/badge/Frontend-React%20%7C%20TypeScript-149eca?logo=react&logoColor=white" alt="React and TypeScript">
    <img src="https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
    <img src="https://img.shields.io/badge/Database-PostgreSQL-4169e1?logo=postgresql&logoColor=white" alt="PostgreSQL">
    <img src="https://img.shields.io/badge/Market-INR%20%7C%20NSE%20%7C%20BSE-087f72" alt="Indian market">
    <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License"></a>
    <a href="#-project-status-and-license"><img src="https://img.shields.io/badge/status-active%20development-blue" alt="Active development"></a>
    <a href="#-contributing"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="Pull requests welcome"></a>
  </p>
</div>

**Paper_trade** is the repository name; **Quantx** is the application brand. Quantx is a practice workspace for Indian equities where learners can explore instruments, place simulated orders, and see how fills, fees, cash, positions, and profit and loss interact. It is designed to make the move from learning market concepts to practicing an order workflow without risking real funds.

The app combines a local paper-order engine with configurable brokerage assumptions, account controls, market-data integrations, and analysis tools. Orders and account activity stay inside Quantx: the 021 integration is used for authentication, instrument reference data, and market quotes, never for sending orders. Quote labels distinguish exchange-stream data, third-party snapshots, and generated practice data so users can judge what they are seeing.

> **Practice environment:** Balances, orders, fills, and positions in Quantx are simulated. Market data availability depends on configured providers and market sessions. This is educational software, not a broker or investment adviser.

## 📋 Table of contents

- [Platform features](#-platform-features)
- [Architecture and order execution](#-architecture)
- [Technology stack](#-technology-stack)
- [Repository structure](#-repository-structure)
- [Data sources](#-data-sources)
- [Getting started](#-getting-started)
- [Settings and simulation controls](#-settings--simulation-controls)
- [API surface](#-api-surface)
- [UI showcase](#-ui-showcase)
- [AI and analytics roadmap](#-ai--analytics-roadmap)
- [Checks and development](#-checks-and-development)
- [Deployment](#-deployment)
- [Security and market-data notes](#-security-and-market-data-notes)
- [Contributing](#-contributing)
- [Project status and license](#-project-status-and-license)

## ✨ Platform features

### 1. Simulation and account controls

- **Stepped virtual-capital selector:** A ruler-style selector offers ₹1L–₹10L in ₹1L steps, ₹20L, then ₹25L–₹50L in ₹5L steps. The selected starting amount becomes the account's initial virtual capital.
- **Balance and history reset:** Restore virtual cash or reset the practice account and its simulated trading history. Full reset affects the practice account records; it does not remove the user's login.
- **Cash and margin preferences:** Settings offers Cash/Margin modes and leverage choices. These are currently planning/display preferences; Margin mode does **not** increase executable buying power or change order validation.
- **Fee simulation:** Per-order brokerage and an optional additional regulatory fee can be configured. Exchange, SEBI, GST, STT, and stamp-duty assumptions are also configurable by the backend environment. These are simulation assumptions and should be checked against current published schedules before a demo.
- **Market Stress Mode:** Widen the simulated execution spread and reduce available simulated depth for stress-testing. It changes paper execution only; it does not transform the upstream quote.
- **Recovery Shield:** Capture and restore practice-account SafePoints for supported cash, positions, and open-order state.

### 2. Trading and order preferences

- **Order ticket defaults:** Set a default quantity, Market or Limit default order type, and order-confirmation preference. These preferences are stored in the browser.
- **Paper order types:** Market, Limit, stop-loss (SL), and stop-loss-market (SL-M), with DAY/IOC validity where applicable.
- **Local matching:** The paper matcher checks instrument constraints and available market depth, supports partial fills and cancellation, and updates simulated cash, reservations, positions, charges, and order audit events.
- **Intraday square-off:** The backend worker can submit simulated exits for open MIS positions after 3:20 PM IST on weekdays when usable market depth is available. The Settings-page auto-liquidation selector is currently a reminder preference and does not change that backend schedule.
- **What-If Lab:** Explore hypothetical stock moves, portfolio shocks, and allocation changes without modifying the live practice account.

### 3. Profile, security, and trader workspace

- **Account setup:** Choose virtual capital after sign-in; the chosen balance is shown across account and portfolio views.
- **Profile:** Update the display name. Email is currently read-only because email verification is not implemented.
- **Password recovery:** Request a single-use, time-limited reset link. In local development, the link is printed to the backend terminal unless SMTP is configured.
- **Theme:** Light, dark, and system-synced appearance preferences.
- **Workspace:** Dashboard, Explore, stock details, Watchlist, Market News, Orders, Portfolio, Holdings, Positions, Learn, What-If Lab, Market Stress, Recovery Shield, Notifications, and account pages.

### 4. Market data and research

- **021 market feed:** Optional server-side integration for instrument synchronization and streaming market quotes/depth. It requires authorized developer credentials and an available provider session.
- **IndianAPI snapshots and reference data:** Optional quote snapshots, movers, company information, and historical chart data. Snapshots are periodically refreshed and are not the same as a streaming order book.
- **Generated practice feed:** Optional synthetic quotes and depth let users exercise charts and paper order flow without live provider data. Generated prices are explicitly marked as practice data.
- **Market News:** Optional Marketaux integration for financial headlines.
- **Source labels:** The UI distinguishes feed state and quote source. `DATA` means generated practice values; `API SNAPSHOT` means a provider snapshot; a connected market-feed badge indicates the streaming provider state.

### 5. AI-powered trading intelligence

- **Available now — Quantx Guide:** In-app help explains workspace pages and common market concepts. The built-in knowledge base works without an AI key. An optional OpenAI Responses API integration can generate richer replies; replies fall back to the built-in guide if the provider is unavailable.
- **Planned — contextual concept co-pilot:** Explain metrics such as margin, Greeks, and slippage in the context of a selected practice trade.
- **Planned — behavioral and fee-drag analysis:** Review completed practice sessions for patterns such as repeated entries, oversized positions, and the impact of simulated charges. This is not currently an automated diagnostic.
- **Planned — macro and sentiment synthesis:** Summarize market events and explore hypothetical portfolio shocks. Current Market News and What-If features do not constitute this planned synthesis engine.

## 🏗️ Architecture

### System overview

```mermaid
flowchart LR
  Browser[React + TypeScript workspace] -->|HTTP-only session cookie| API[FastAPI application]
  Browser <-->|Authenticated quote WebSocket| API
  API --> DB[(PostgreSQL)]
  API --> Redis[(Redis quote cache / stream)]
  API --> Auth[Quantx authentication]
  API -->|Server-side auth, instruments, quote session| Broker[021 developer API]
  Broker -->|Market quote/depth frames| Feed[Market data decoder]
  Feed --> Cache[Normalized quote cache]
  Cache --> Matcher[Local paper matcher]
  Matcher -->|orders, fills, charges, ledger, positions| DB
  API --> IndianAPI[Optional IndianAPI snapshots/history]
  API --> News[Optional Marketaux news]
  API --> Guide[Built-in help / optional OpenAI]
```

The app owns its paper-trading records. PostgreSQL is authoritative for users, accounts, orders, fills, charges, positions, and ledgers. Redis supports quote caching/streaming; the local matcher processes feed updates in the backend. A provider outage can leave account features available while market quotes are disconnected or stale.

### Paper order execution

```mermaid
sequenceDiagram
  actor Trader
  participant UI as Trade ticket
  participant API as FastAPI validation
  participant Feed as Quote and depth cache
  participant Engine as Local paper matcher
  participant DB as PostgreSQL

  Trader->>UI: Choose symbol, side, product, type, quantity
  UI->>API: Submit paper order (session cookie)
  API->>API: Validate account, instrument, price, limits, and funds
  API->>DB: Record accepted order and reserve funds
  Feed-->>Engine: Current quote and available depth
  Engine->>Engine: Apply order rules, matching, and simulated fees
  Engine->>DB: Record fills, charges, cash ledger, positions, and events
  DB-->>UI: Updated order and account state
  Note over UI,DB: Orders never go to the 021 order API
```

### Order flow, in brief

1. The signed-in user submits an order through the React trade ticket.
2. FastAPI validates the account, instrument constraints, quantity, order parameters, and available funds.
3. The local engine matches against available quote depth according to order type, records partial or complete fills, and calculates configured simulated charges.
4. PostgreSQL records the order lifecycle and applies the corresponding virtual-cash and position changes.
5. The UI refreshes order, trade, portfolio, and ledger views. If there is no usable quote/depth, market execution may wait or be rejected according to the order rules.

## 🧰 Technology stack

| Layer | Technology | Purpose in Paper_trade |
| --- | --- | --- |
| Frontend | React 18, TypeScript, Vite | Single-page workspace, account flows, and trade interfaces |
| Styling & UI | Tailwind CSS, custom CSS, Lucide React, Motion | Layout, theme system, icons, and interaction polish |
| Routing & state | React Router, React hooks, browser storage | Route protection and local UI preference state |
| Charts | TradingView Lightweight Charts | Candlesticks and historical/streamed quote visualization |
| Backend / API | Python 3.11+, FastAPI, Pydantic | Session-authenticated REST API and market WebSocket |
| Data layer | SQLAlchemy, PostgreSQL, psycopg | Persistent user, account, and paper-trading records |
| Cache / streaming support | Redis, WebSockets | Quote cache/stream support and browser market updates |
| Market integrations | 021 developer API, IndianAPI, Marketaux | Optional market feed, snapshots/reference data, and news |
| AI & analytics | Built-in market/project knowledge; optional OpenAI Responses API | Quantx Guide answers and navigation help; advanced coaching remains on the roadmap |
| Development & tests | Docker Compose, pytest, Vitest, Testing Library | Local multi-service environment and code checks |

## 🌐 Data sources

| Source | Used for | What to expect |
| --- | --- | --- |
| 021 developer API | Optional instrument synchronization and streaming market quotes/depth | Requires authorized credentials and an active provider session; Quantx does not submit orders to this API |
| IndianAPI | Optional price snapshots, market movers, company details, and chart history | Periodic/cached reference data; snapshots are not a streaming order book |
| Generated practice feed | Local quote and depth simulation | Synthetic data for exercising charts and the paper matcher; shown with a practice-data source label |
| Marketaux | Optional financial-news results | Requires a server-side API token; responses may be cached or unavailable |
| Quantx knowledge / optional OpenAI | In-app page help and market concept explanations | Built-in answers work without a key; generated answers require a backend-only OpenAI key |

Provider settings are configured on the backend. Source badges and update times in the UI are the guide to whether a displayed value is a stream quote, a snapshot, or generated practice data.

## 📁 Repository structure

```text
Paper_trade/
├── frontend/
│   ├── public/brand/             # Quantx logo and brand assets
│   └── src/
│       ├── components/           # Auth, help, layout primitives, charts, shared UI
│       ├── hooks/                # Market-feed and watchlist hooks
│       ├── layouts/              # Authenticated application shell
│       ├── pages/                # Dashboard, Explore, Orders, Settings, and feature pages
│       ├── services/             # Frontend notification helpers
│       ├── api.ts                # Typed API client
│       ├── theme.ts              # Theme persistence and application
│       └── App.tsx               # Route table and session/capital guards
├── backend/
│   ├── app/
│   │   ├── routes/               # Auth, account, trading, news, What-If, help APIs
│   │   ├── services/             # Matcher, fees, market providers, recovery, knowledge
│   │   ├── models.py             # SQLAlchemy database models
│   │   ├── schemas.py            # Request and response validation
│   │   ├── config.py             # Environment-backed application settings
│   │   └── main.py               # FastAPI setup, startup, and background workers
│   ├── tests/                    # API/service integration and unit tests
│   ├── Instruments.csv           # Instrument reference/fallback data
│   ├── requirements.txt          # Runtime Python dependencies
│   └── .env.example              # Backend environment template
├── docs/                         # Frontend page map and provider/API references
├── postman/                      # API request collection
├── docker-compose.yml            # Frontend, API, PostgreSQL, and Redis services
├── ARCHITECTURE.md               # Extended flow, API, and operations notes
├── package.json                  # Root development scripts
└── README.md
```

## 🚀 Getting started

### Prerequisites

- Git
- Docker Desktop with Compose (recommended), **or** Node.js 20.19+ and Python 3.11+
- PostgreSQL for a native setup; Redis is included in the Docker Compose setup
- Optional provider credentials for live/snapshot market data, news, or generated AI responses

### Option A: Docker Compose (recommended)

From PowerShell, Terminal, or a shell in the repository root:

```bash
git clone https://github.com/achotanibhavikoffice-ui/Paper_trade.git
cd Paper_trade
docker compose up --build -d
```

Open the app at [http://localhost:5173](http://localhost:5173). The API health endpoint is [http://localhost:4000/api/health](http://localhost:4000/api/health). Compose starts the frontend, FastAPI, PostgreSQL, and Redis. The local PostgreSQL host port defaults to `5433`; inside Compose, the API uses `db:5432`.

Compose reads `backend/.env` and root `.env`. Copy `backend/.env.example` to `backend/.env` if it is missing. For Docker overrides, create a root `.env` file. The Compose development defaults include a generated practice market feed; they do not establish a live exchange feed.

Useful commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

`docker compose down` keeps the named database and Redis volumes. Avoid `docker compose down -v` unless you intend to delete those local data volumes.

### Option B: Native development

1. Install Node.js 20.19+ and Python 3.11+; install and start PostgreSQL.
2. Create a PostgreSQL database and role for the app (the default native URL expects database/user `quantx` on `localhost:5432`).
3. Copy the backend environment template and set a unique local `JWT_SECRET` and correct `DATABASE_URL`:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```

4. Install dependencies from the repository root:

   ```bash
   npm install
   npm --prefix frontend install
   python -m venv .venv
   # Windows PowerShell:
   .\.venv\Scripts\Activate.ps1
   # macOS/Linux:
   # source .venv/bin/activate
   python -m pip install -r backend/requirements.txt
   ```

5. Start both development services from the root:

   ```bash
   npm run dev
   ```

   The frontend is at `http://localhost:5173`; the API is at `http://localhost:4000`. Or start separately with `npm run dev:frontend` and `npm run dev:backend` in two terminals.

6. Build the frontend for production output:

   ```bash
   npm run build
   ```

For a local PostgreSQL install on Windows, see the database instructions in [ARCHITECTURE.md](ARCHITECTURE.md). The development API creates its schema and seed instruments on startup; deployments need managed migrations and operational review.

### Environment variables

`backend/.env.example` documents all provider and mail settings. Keep real credentials in ignored local environment files or deployment secret storage. Never put provider secrets in `frontend/.env` or variables prefixed with `VITE_`.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `APP_ENV` | No | `development` locally; production applies stricter startup validation |
| `DATABASE_URL` | Yes | SQLAlchemy PostgreSQL connection string |
| `JWT_SECRET` | Yes | Unique random signing secret, at least 32 characters |
| `FRONTEND_ORIGIN` | Yes | Browser origin allowed by the API; use HTTPS in production |
| `SESSION_COOKIE_SECURE` | Production | Must be `true` when deployed over HTTPS |
| `MAIL_BACKEND` | No | `console` for local reset links; `smtp` for delivery |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | SMTP only | Outbound password-recovery email settings |
| `DEMO_MARKET_DATA_ENABLED` | Optional | Generate clearly labeled practice quotes/depth when developing without provider data; disabled in production |
| `MARKET_DATA_ENABLED` | Optional | Connect to 021 when authorized credentials are set |
| `MARKET_DATA_USERNAME`, `MARKET_DATA_PASSWORD` | 021 only | Developer credentials used server-side for provider authentication |
| `INDIAN_API_KEY` | Optional | IndianAPI history, movers, snapshots, and company reference data |
| `MARKETAUX_API_TOKEN` | Optional | Financial news integration |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional | Generated Help & Support replies; built-in guide remains available without a key |
| `PAPER_BROKERAGE_PER_ORDER` and `PAPER_*` fee variables | Optional | Default simulated brokerage, exchange, SEBI, GST, STT, and stamp-duty assumptions |
| `PAPER_STRESS_SPREAD_PERCENT`, `PAPER_STRESS_LIQUIDITY_FACTOR` | Optional | Market Stress execution assumptions |
| `REDIS_URL` | Optional in some local flows | Redis service connection for quote-cache/stream features |

A minimal local `.env` example (replace the secret and database credentials):

```dotenv
APP_ENV=development
DATABASE_URL=postgresql+psycopg://quantx:YOUR_LOCAL_PASSWORD@localhost:5432/quantx
JWT_SECRET=replace-with-a-unique-random-secret-at-least-32-characters
FRONTEND_ORIGIN=http://localhost:5173
SESSION_COOKIE_SECURE=false
MAIL_BACKEND=console
DEMO_MARKET_DATA_ENABLED=true
MARKET_DATA_ENABLED=false
# Optional integrations — leave blank until configured:
MARKET_DATA_USERNAME=
MARKET_DATA_PASSWORD=
INDIAN_API_KEY=
MARKETAUX_API_TOKEN=
OPENAI_API_KEY=
```

Use separate secrets and secure cookies in production. Do not deploy with the local Docker database password, placeholder JWT secret, console email backend, or generated demo feed.

## ⚙️ Settings & simulation controls

| Setting | Current behavior | Persistence / limitation |
| --- | --- | --- |
| Starting virtual capital | Set during post-login account setup using the stepped ₹1L–₹50L ruler | Stored on the account and reflected in account/portfolio calculations |
| Reset balance | Resets virtual cash to a selected allowed amount | Does not clear existing positions or trading history |
| Reset account & history | Resets practice activity, including supported orders, fills, positions, scenarios, checkpoints, and ledger records | Destructive within the virtual account; confirmation is shown in the UI |
| Cash/Margin and leverage | Choose Cash/Margin and a planning leverage value | Browser preference only; does not extend buying power or change matching rules |
| Brokerage and extra regulatory fee | Configure per-order brokerage and an additional percentage | Fee settings are saved to the account and apply to future simulated fills; statutory defaults are environment-configured |
| Default order size/type and confirmation | Controls starting quantity, Market/Limit default, and confirmation prompt | Browser-local preferences; these do not modify completed orders |
| Auto-liquidation preference | Choose an on-screen closeout reminder offset | Backend MIS square-off is currently a separate fixed worker after 3:20 PM IST on weekdays; this selector does not schedule it |
| Appearance | Light, dark, or system theme | Saved on the current device/browser |

The fee engine is configurable because fees and applicable schedules can change. Current defaults are simulation values, not a statement of current official charges. The account type preference is not a margin facility and does not provide leverage for real or simulated order execution.

## 🔌 API surface

Authenticated APIs use the Quantx HTTP-only session cookie. The OpenAPI documentation is available from FastAPI at `/docs` while the backend is running.

| Area | Representative routes |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Password recovery | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Account | `GET /api/account/me`, `PUT /api/account/initial-capital`, `GET/PUT /api/account/fee-settings`, `PUT /api/account/reset-balance`, `POST /api/account/reset` |
| Instruments and quotes | `GET /api/instruments`, `GET /api/market/quotes`, `GET /api/market/status`, `WS /api/market/ws` |
| Orders and trades | `POST /api/orders`, `GET /api/orders`, `GET/PUT/DELETE /api/orders/{id}`, `GET /api/orders/{id}/events`, `GET /api/trades` |
| Portfolio | `GET /api/portfolio/summary`, `GET /api/portfolio/positions`, `GET /api/portfolio/holdings` |
| Research and support | `GET /api/news`, `GET/POST /api/scenarios`, `POST /api/support/chat` |
| Health | `GET /api/health`, `GET /api/health/ready` |

Check the route implementations and [ARCHITECTURE.md](ARCHITECTURE.md) for request schemas and detailed behavior. Do not treat an HTTP `200` from health as confirmation that an external market feed is connected; inspect readiness and the market-source badge.

## 🖼️ UI showcase

Add current product screenshots under `docs/screenshots/` and update the image paths below. These placeholders are intentionally not linked to generated or sample screens.

| Overview dashboard | Explore equities |
| --- | --- |
| ![Overview dashboard screenshot placeholder](docs/screenshots/dashboard.png) | ![Explore equities screenshot placeholder](docs/screenshots/explore.png) |
| **Paper order and portfolio** | **Settings and capital setup** |
| ![Paper order and portfolio screenshot placeholder](docs/screenshots/portfolio.png) | ![Settings and capital setup screenshot placeholder](docs/screenshots/settings-capital-setup.png) |

## 🧭 AI & analytics roadmap

Quantx Guide currently combines project-specific page knowledge with an offline reference for common market concepts. When `OPENAI_API_KEY` is configured, the backend may use the OpenAI Responses API for generated support answers; it is optional and server-side only. The guide is not an autonomous trading agent and cannot submit orders or alter the account.

Planned work is tracked separately from shipping features:

1. **Trade-context concept explanations:** Explain execution metrics in the context of a selected paper order while clearly separating quote facts from assumptions.
2. **Practice-session diagnostics:** Analyze user-authorized simulated order history for sizing patterns, repeated trades, and accumulated simulated fees; show evidence and let the user inspect the underlying trades.
3. **Macro/event scenarios:** Summarize sourced news and let users test transparent, user-selected hypothetical shocks in What-If Lab.

These items are roadmap ideas, not claims of current product capability. Any future recommendations should remain educational, cite their source data, and avoid presenting predictions as certainty.

## 🧪 Checks and development

Run the frontend production build:

```bash
npm run build
```

Run backend checks from the repository root after installing development dependencies:

```bash
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
```

Frontend component tests use Vitest and Testing Library:

```bash
npm --prefix frontend test
```

Tests do not verify access to 021, IndianAPI, Marketaux, SMTP, or OpenAI. Those integrations require valid credentials and their services to be reachable.

## 🚢 Deployment

The repository includes Dockerfiles and a Compose stack intended for local development. A production deployment needs an HTTPS frontend origin, a PostgreSQL database, a unique secret, private environment-managed credentials, and a configured SMTP sender for account recovery. Set `APP_ENV=production`, use `SESSION_COOKIE_SECURE=true`, and disable `DEMO_MARKET_DATA_ENABLED`; the API validates these production requirements at startup.

The Compose database password, JWT defaults, console mail backend, and generated practice feed are local-development settings. Replace them before deploying. Configure live market providers only with credentials you are authorized to use, and verify data access and current market availability independently of the API health endpoint.

## 🔐 Security and market-data notes

- Provider credentials belong in the backend environment only. Never commit `.env` files or place secrets in frontend variables.
- Passwords are hashed; browser sessions use HTTP-only cookies. Use HTTPS and a unique secret in deployed environments.
- The 021 integration is intentionally limited to the authorized authentication, instrument, and market-data workflow. Quantx paper orders are local and are never sent to broker order endpoints.
- Market snapshots may be delayed, cached, incomplete, or unavailable. A snapshot price does not imply that bid/ask depth is available for execution.
- Configure market fees against current official sources before demos; the included rates are simulation defaults.
- Do not use the simulator as financial, tax, or investment advice.

## 🤝 Contributing

Issues and pull requests are welcome. For a useful contribution:

1. Open an issue or describe the user problem and proposed change.
2. Keep credentials, personal data, and provider secrets out of commits.
3. Update the relevant documentation when behavior or environment settings change.
4. Run the applicable frontend build and backend checks before opening a pull request.

## 📄 Project status and license

Quantx is under active development. Some workspace preferences are browser-local, market-data availability depends on external services, and AI coaching features beyond the help guide are planned.

This project is licensed under the **MIT License**. See [LICENSE.md](LICENSE.md) for the full terms and copyright notice.

<p align="center"><strong>Built for Indian retail traders who want to learn the market before the market teaches them.</strong> 📈🇮🇳</p>

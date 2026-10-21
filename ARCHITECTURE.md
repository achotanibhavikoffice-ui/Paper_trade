# Tradeo product and architecture guide

## Product in one sentence

Tradeo is an exchange-accurate paper trading workspace where a learner can practice NSE equity orders against simulated market conditions, then understand how orders affect cash, holdings, profit and loss, and charges.

The hackathon brief calls for realistic market, limit, and stop-loss orders; order edits, cancels, and partial fills; delivery (CNC) and intraday (MIS) trading; accurate money and P&L tracking; volatile-market stress mode; portfolio what-if scenarios; and recovery from delayed, repeated, out-of-order, or bursty market updates. The brief’s stack is React, TypeScript, Vite, Tailwind CSS; Python, FastAPI, SQLAlchemy, REST/OpenAPI; PostgreSQL; Redis, Redis Streams, and WebSockets.

The backend now includes PostgreSQL-backed signup/login, daily instrument sync from 021, a decoded 021 market-data feed, Redis quote history, an authenticated Tradeo market WebSocket, and a local paper-order simulator. The selected 021-02 problem statement requires orders, fills, positions, cash, and P&L to stay inside this application. Tradeo must not call 021 order REST endpoints or connect to the 021 order-events socket.

## User journey

1. **Arrive:** `/` shows the public Tradeo home page with a clear product overview, how-it-works section, illustrative market preview, practice principle, and links to sign in or register. The public page does not expose a user's portfolio.
2. **Register:** a visitor chooses **Create free account**, enters name, email, and password, and submits `/register`. The API validates the fields, hashes the password with Argon2, inserts a user in PostgreSQL, and sets an HTTP-only session cookie.
3. **Sign in:** an existing user chooses **Sign in** at `/login`. The API checks the stored password hash and sets a fresh cookie. `GET /api/auth/me` restores their session after a refresh.
4. **Open the workspace:** successful login or registration sends the user to `/dashboard`. The route redirects signed-out visitors to `/login`; signed-in visitors who open `/login` or `/register` are sent back to `/dashboard`.
5. **Manage the account:** select the dashboard avatar to view the user's saved name, sign-in email, account id, and created/updated timestamps. The display name can be edited; the email is read-only until email verification exists.
6. **Recover access:** choose **Forgot your password?** on sign-in, request a link, open the one-time link delivered by SMTP (or printed in the local Uvicorn terminal), and set a new password. Existing sessions are invalidated.
7. **Orient:** the app syncs instruments and subscribes to a small default watchlist when `MARKET_DATA_ENABLED=true`. Quotes are decoded from binary 021 frames, cached in memory and Redis, and sent to signed-in browser sessions over Tradeo's own WebSocket.
8. **Practice a trade:** select a symbol → subscribe to its market depth → submit a Tradeo paper order → the local matcher checks current bid/ask depth, order type, funds, lot/tick/circuit limits, and order state → PostgreSQL records fills, cash ledger entries, positions, and realized P&L. Tradeo does not submit the paper order to 021.
9. **Explore scenarios:** create a What-If run with percentage price shocks by symbol. The API projects market value and P&L, saves the scenario, and leaves live cash, holdings, and orders unchanged.
10. **Practice under stress:** enable Market Stress Mode in trading settings. The paper matcher widens simulated spreads and reduces available depth for that user's fills; live market quotes remain unchanged.
11. **Close intraday trades:** while the backend is running, a scheduler submits local market exit orders for open MIS positions after 3:20 PM India time on weekdays, using current market depth.

### Frontend routes

| Route | Who can open it | Purpose |
| --- | --- | --- |
| `/` | Everyone | Public product home page and calls to sign in/register. |
| `/login` | Signed-out visitors | Authenticate; success redirects to `/dashboard`. |
| `/register` | Signed-out visitors | Create an account; success redirects to `/dashboard`. |
| `/dashboard` | Signed-in users | Private practice workspace. Signed-out visitors are redirected to `/login`. |
| `/profile` | Signed-in users | View account details and update the display name. |
| `/forgot-password` | Everyone | Request a password-reset link. |
| `/reset-password?token=...` | Anyone with a valid reset link | Set a new password using the one-time token. |

### Example local paper-trade interaction

Suppose a learner has ₹100,000 simulated cash and enters a limit buy for 10 shares at ₹500. The API validates the instrument token, product, quantity, tick size, circuit range, and available funds, then reserves estimated buying power including estimated charges. If ask depth is at or below ₹500, the local engine consumes available ask quantity and records one or more fills. PostgreSQL records each fill, per-fill charges, cash ledger entries, order events, order status, and position changes. Any unfilled remainder stays open unless validity is IOC. Charge ratios are configurable via environment variables because applicable fees can change and brokerage depends on the chosen simulation assumptions.

## Backend and market-data architecture

```mermaid
flowchart LR
  Browser[React app] -->|HttpOnly session cookie| API[FastAPI]
  API --> DB[(PostgreSQL)]
  API --> Auth[Tradeo account auth]
  API -->|UCC + password; server side only| REST[021 auth + instruments]
  REST -->|ephemeral key| Feed[021 market data WebSocket]
  Feed -->|binary TC1/TC3 frames| Decoder[Big-endian decoder]
  Decoder --> Cache[Redis quote cache + stream]
  Decoder --> Matcher[Local paper order matcher]
  Matcher -->|transaction: order, fill, cash, position, ledger| DB
  API -->|session authenticated| AppWS[Tradeo market WebSocket]
  AppWS --> Browser
```

### Repository layout

```text
frontend/                 React, TypeScript, Vite, Tailwind theme, dashboard, auth forms
backend/app/              FastAPI routes, SQLAlchemy models, auth, DB connection
backend/requirements.txt  Python dependencies
backend/src/db/schema.sql Local PostgreSQL bootstrap schema
docker-compose.yml        Frontend, API, PostgreSQL, and Redis services
backend/Dockerfile        Container image for the FastAPI API
frontend/Dockerfile       Container image for the Vite frontend
ARCHITECTURE.md           Product journey, domain flow, and setup guide
```

## Authentication flow

**Register**

```http
POST /api/auth/register
Content-Type: application/json

{"name":"Asha Rao","email":"asha@example.com","password":"long-unique-password"}
```

The API trims the name, normalizes the email, validates the input, hashes the password with Argon2, and creates a user through SQLAlchemy. It returns the user's id, name, email, and account timestamps; the password hash is never sent to the browser. A signed JWT session is set as an HTTP-only, same-site cookie.

**Login**

```http
POST /api/auth/login
Content-Type: application/json

{"email":"asha@example.com","password":"long-unique-password"}
```

Success sets the cookie. A bad email/password pair returns the same generic `401` response. The frontend calls `GET /api/auth/me` with credentials to restore the signed-in user. `PATCH /api/auth/me` updates the user's display name; email is read-only until email verification is implemented. `POST /api/auth/logout` clears the cookie. Cookies are HTTP-only, `SameSite=Lax`, and secure in production. Session tokens include a keyed fingerprint of the password hash, so a password reset invalidates existing sessions. Keep `JWT_SECRET` private and use HTTPS in deployed environments.

### Password recovery

The login screen links to `/forgot-password`. The request endpoint always returns the same message whether or not the email exists. For a matching account, it creates a cryptographically random token, stores only its SHA-256 hash in `password_reset_tokens`, invalidates earlier reset links, and sends a reset URL. Tokens expire after 30 minutes, are single-use, and reset requests for an account are throttled to one email per minute. These choices follow the [OWASP Forgot Password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

```http
POST /api/auth/forgot-password
Content-Type: application/json

{"email":"asha@example.com"}
```

The link opens `/reset-password?token=...`. The user enters and confirms a new password, then the browser posts the token and new password:

```http
POST /api/auth/reset-password
Content-Type: application/json

{"token":"one-time-token-from-email","new_password":"a-new-long-password"}
```

The API hashes the new password with Argon2, marks the reset token used, invalidates any other reset links, clears the current session cookie, and causes all other sessions to fail validation. The user then signs in with the new password. The reset page is served with a `no-referrer` policy to avoid leaking its token to other sites.

#### Local development email

The default `MAIL_BACKEND=console` does not send an email. After submitting the forgot-password form, copy the one-time URL printed in the Uvicorn terminal and open it in the browser. The page displays the same generic response for any email address; only a registered address produces a URL in the backend terminal.

For email delivery, set `MAIL_BACKEND=smtp` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` in `backend/.env`. `SMTP_STARTTLS=true` is the default. Production startup refuses the console backend and incomplete SMTP configuration. Keep SMTP credentials private and use a dedicated sender identity.

The development server creates the new token table automatically. For an existing production database, apply `backend/src/db/schema.sql` (it uses `CREATE TABLE IF NOT EXISTS`) before deploying this backend version.

## Docker setup for the whole app

Docker Desktop is the recommended team setup. It starts the frontend, backend, and PostgreSQL together; teammates do not install PostgreSQL or manually create its database or tables.

1. Start Docker Desktop and wait for it to report that the engine is running.
2. Open PowerShell in the repository root (the directory containing `docker-compose.yml`).
3. Build and start all services:

   ```powershell
   docker compose up --build -d
   ```

4. Visit `http://localhost:5173`. Check API/database connectivity at `http://localhost:4000/api/health`.

Compose waits for PostgreSQL's health check before starting the API. PostgreSQL initializes from `backend/src/db/schema.sql` on a new volume; the development API also creates ORM tables on startup. Data persists in the named `tradeo_pgdata` volume.

The local database defaults are database `tradeo`, role `tradeo`, password `tradeo_local_only`, and host port `5433` (container port `5432`). Use those values to connect pgAdmin at `localhost:5433`. Port `5433` avoids a conflict with native PostgreSQL commonly installed on Windows. The API talks to the database over Compose's private network using host `db` and port `5432`.

Useful commands:

```powershell
docker compose ps
docker compose logs -f backend
docker compose down
```

`docker compose down` stops and removes containers while keeping database data. Do not share production or personal credentials in source control. The Compose defaults are for local development only. To override them, create a root `.env` file (Git ignores it) with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, and `JWT_SECRET`; set the same values on each local setup that needs to use those credentials. Changing database environment values does not rewrite users/passwords in an already initialized volume.

Do not run `docker compose down -v` unless you intend to permanently erase the local database volume and all its data.

For optional Redis, run `docker compose --profile market-data up --build -d`.

## Windows local setup: PostgreSQL, API, and frontend

The native setup below is an alternative to Docker. PostgreSQL can run as a Windows service installed by the PostgreSQL installer.

### 1. Confirm PostgreSQL is running

In PowerShell:

```powershell
Get-Service postgresql-x64-18
```

The status should be `Running`. If it is `Stopped`, open PowerShell as Administrator and run `Start-Service postgresql-x64-18`. Use the service name/version installed on your machine if it differs.

If `psql` is not on `PATH`, call it by its install path (change `18` if you have another version):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h 127.0.0.1 -p 5432 -d postgres
```

### 2. Create or reset the Tradeo database role

PostgreSQL asks for a password for the role named after `-U`. In the command above, that is the **PostgreSQL administrator role `postgres`** password chosen during installation. It is different from the app role `tradeo` password and from `JWT_SECRET`.

After connecting as `postgres`, inspect existing roles and databases:

```text
\du
\l
```

If role `tradeo` does not exist, create it (replace the sample password):

```sql
CREATE ROLE tradeo WITH LOGIN PASSWORD 'ChooseALocalPassword';
```

If database `tradeo` does not exist, create it:

```sql
CREATE DATABASE tradeo OWNER tradeo;
```

Do not create a role or database that already exists. To set/reset the app role password from the `psql` prompt, use `\password tradeo`; for the administrator password, use `\password postgres`. Each prompts for the new value without putting it directly in the SQL command history. Exit with `\q`.

### 3. Configure `backend/.env`

Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` to the `tradeo` role password, for example:

```env
DATABASE_URL=postgresql+psycopg://tradeo:ChooseALocalPassword@localhost:5432/tradeo
JWT_SECRET=paste-a-generated-secret-here
FRONTEND_ORIGIN=http://localhost:5173
APP_ENV=development
SESSION_COOKIE_SECURE=false
```

Generate the JWT secret in PowerShell:

```powershell
$jwtBytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
[Convert]::ToBase64String($jwtBytes)
```

Paste the output after `JWT_SECRET=`. Keep the `DATABASE_URL` password synchronized with the password set for PostgreSQL role `tradeo`. If you choose URL-reserved symbols such as `@`, `#`, `/`, or `:`, percent-encode them in the URL password component.

### 4. Install dependencies and start the API

A Python `venv` is an isolated package directory, not a virtual machine. From the repository root, create and activate it, then install backend packages:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Keep `(.venv)` active and run the API **from the repository root** so it reads `backend/.env`:

```powershell
python -m uvicorn app.main:app --reload --app-dir backend --port 4000
```

Leave this terminal open. `Application startup complete.` means the API connected to PostgreSQL and, in development, SQLAlchemy created the initial `users` table if needed. Check `http://localhost:4000/api/health`; the expected response is `{"status":"ok","database":"connected"}`.

### 5. Start or leave the frontend running

Install Node.js 20.19+ or 22.12+. In a separate terminal, from the project root, install the Node packages once and start the frontend:

```powershell
npm install
npm --prefix frontend install
npm --prefix frontend run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). If the frontend is already running in another terminal, leave it open; start only the API in a new terminal. The combined `npm run dev` command uses the root `concurrently` package and must be run from the repository root after `npm install`.

### 6. Connect with pgAdmin and inspect users

The API uses the database role `tradeo`, so pgAdmin can use that account too; there is no need to use the `postgres` administrator just to inspect Tradeo’s database. Register a server in pgAdmin with:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| Maintenance database | `tradeo` |
| Username | `tradeo` |
| Password | The password in `DATABASE_URL` |

In pgAdmin, right-click the `tradeo` database and open **Query Tool**. Enter a query and press **F5** or click **Execute** (the ▶ toolbar button). For example:

```sql
SELECT id, name, email, created_at
FROM public.users
ORDER BY created_at DESC;
```

Do not use `SELECT *` in a client-facing flow because it includes `password_hash`. Register at `http://localhost:5173/register`, then execute the query again to see the new user. A result of `Query complete` with `Total rows: 0` is not a query error; it means no account has been registered yet. Avoid inserting user rows manually because the password must be hashed by the API.

For a hosted database, create a least-privilege database user, store `DATABASE_URL` and `JWT_SECRET` as deployment secrets, require TLS, and restrict network access. Use Alembic migrations before production rather than relying on `create_all`. Do not use the compose password outside local development.

### Market-data and paper-trading behavior

Docker Compose starts Redis with the rest of the app. It stores the latest normalized quote by symbol and appends ticks to `tradeo:market:quotes`. PostgreSQL remains authoritative for users, orders, fills, cash, positions, and ledger. The current order matcher processes each feed update in the API process; the Redis stream is retained for inspection/replay and future worker separation.

The 021 binary market decoder supports TC 1 LTP and TC 3 full packets across NSE/BSE cash, derivatives, and index segments. Tradeo subscribes with `Mode: full`, so local execution can use five levels of bid/ask depth. Heartbeat TC 10 (`00 0A`) is ignored. One upstream market connection is shared by the backend, with the API guide's 100-instrument limit enforced. The app resubscribes after reconnect and gets a fresh ephemeral key. The 021 orders socket is intentionally not used for this problem statement.

The local matcher accepts `MARKET`, `LIMIT`, `SL`, and `SL-M`, uses paise-to-rupee conversion, validates tick/circuit/lot/freeze limits, reserves buy cash, supports partial fills and IOC cancellation, and updates position average price and realized P&L net of configured charges. It does not use 021 order APIs. Market Stress Mode alters only simulated execution prices/depth. The What-If endpoint saves read-only scenario results. Stale market depth blocks new market orders, duplicate packets are ignored, and full-packet exchange timestamps prevent older packets replacing newer quotes. This is a hackathon simulator and fee/market-data assumptions should be reviewed before any financial use.

For development without a current 021 quote, set `DEMO_MARKET_DATA_ENABLED=true`. The backend then publishes generated quotes and five-level depth through the same authenticated API WebSocket and quote cache. Quotes carry `data_source: "demo"`; a fresh 021 quote takes precedence for that symbol. The local order matcher accepts instruments without 021 provider tokens only while this setting is enabled, and paper fills update PostgreSQL orders, trades, balances, and positions. This setting is rejected in production. The TradingView Lightweight Charts library renders the app's quote feed directly, avoiding TradingView's embedded-widget symbol restrictions.

## API and configuration

Copy `backend/.env.example` to `backend/.env`, then configure database/session values. Development defaults `DEMO_MARKET_DATA_ENABLED=true`; set it to false to require live 021 quotes. For 021 market data, set `MARKET_DATA_ENABLED=true`, `MARKET_DATA_USERNAME` to your UCC, and `MARKET_DATA_PASSWORD` to your developer password. These credentials are used only by FastAPI for `/auth/token`, `/instruments`, and `/websocket/ephemeral-key`; keep them out of Git and the browser. Run the API from the repository root with `python -m uvicorn app.main:app --reload --app-dir backend --port 4000`.

Implemented trading routes (all require a Tradeo session): `GET /api/instruments?q=REL&limit=50`, `GET /api/market/quotes?symbols=RELIANCE,TCS`, `GET /api/market/status`, `WS /api/market/ws`, `POST /api/orders`, `GET /api/orders`, `GET /api/orders/{id}`, `PUT /api/orders/{id}`, `DELETE /api/orders/{id}`, `GET /api/orders/{id}/events`, `GET /api/trades`, `GET /api/orders/{id}/trades`, `GET /api/portfolio/positions`, `GET /api/portfolio/holdings`, `GET/PUT /api/account/trading-settings`, `PUT /api/account/trading-settings/stress-mode`, and `GET/POST /api/scenarios`. Order prices are entered in rupees at the Tradeo API boundary and stored in rupees; the 021 feed and CSV are paise and are converted by the backend.

To subscribe from the signed-in browser's WebSocket, send `{"task":"subscribe","symbols":["RELIANCE"]}`. To stop it, send `{"task":"unsubscribe","symbols":["RELIANCE"]}`. The socket sends `ready`, `subscribed`, `quote`, and `error` messages. Request an instrument subscription before placing a market order so a current quote and depth are available.

Example paper-order request:

```http
POST /api/orders
Content-Type: application/json

{"instrument_id":"<instrument UUID>","side":"BUY","product":"CNC","order_type":"LIMIT","quantity":10,"limit_price":"500.00","validity":"DAY","idempotency_key":"web-demo-order-0001"}
```

Example What-If scenario:

```http
POST /api/scenarios
Content-Type: application/json

{"name":"Market pullback","shocks":{"RELIANCE":-5,"TCS":3.5}}
```

The response includes the projected values and P&L per current position. `PUT /api/account/trading-settings/stress-mode` accepts `{"enabled":true}` to turn on the user's stress mode. `GET /api/orders/{id}/events` returns the order's audit history. All of these endpoints use the Tradeo HTTP-only session cookie.

### Integrated frontend and operational behavior

The signed-in dashboard, Explore, Watchlist, instrument detail, Orders, Portfolio, Holdings, Positions, and What-If pages use the FastAPI endpoints above. The main dashboard and instrument pages subscribe to `WS /api/market/ws`; cookies authenticate the socket, and the browser reconnects with backoff after a disconnect. Search and account data use the same-origin-configured `VITE_API_URL` (defaults to `http://localhost:4000/api`). No front-end page should treat missing quotes as zero or as a real market price; it displays a waiting/offline state instead.

The API retains subscriptions for symbols with an open paper order or position even after a browser closes. A background worker reconciles these symbols as orders/positions change. PostgreSQL advisory locks serialize schema changes and elect one process to own the 021 session and MIS square-off worker. Multiple API processes can serve HTTP requests; the elected worker owns that one upstream session. MIS square-off orders are idempotent per date and position and wait for a fresh quote if the feed is unavailable.

Production startup rejects the local JWT/database placeholders, non-HTTPS frontend origins, insecure session-cookie settings, non-PostgreSQL database URLs, and incomplete SMTP setup. Configure these values as deployment secrets; do not reuse the local Docker role/password or the developer account credentials. `GET /api/health` checks PostgreSQL connectivity. `GET /api/health/ready` reports a degraded state when market data is enabled but disconnected; the HTTP account endpoints can still be available while the feed reconnects.

Run integration checks from the repository root:

```powershell
\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
\.venv\Scripts\python.exe -m pytest backend\tests -q
npm --prefix frontend run build
```

The API integration test covers registration, paper capital, duplicate/idempotent order submission, simulated fill, trade history, and portfolio reflection on an isolated SQLite test database. The test app skips startup DDL and background workers. A real 021 feed check still requires authorized developer credentials and an active session; the build and local tests do not claim to verify that external service.

Charge assumptions are configured in `backend/.env` for a native setup or root `.env` for Docker. Defaults are ratios: exchange transaction fee `0.0000325`, SEBI fee `0.000001`, GST `0.18`, delivery STT `0.001`, intraday sell STT `0.00025`, delivery stamp `0.00015`, intraday buy stamp `0.00003`, and brokerage `0.00` per order. These are simulation defaults; review and update them against current official rates before a demo. The total per fill appears in `GET /api/trades` and the cash ledger.

## Troubleshooting the local setup

| Symptom | What it means | Fix |
| --- | --- | --- |
| `docker` is not recognized | Docker CLI is missing or unavailable on `PATH`. | Start or reinstall Docker Desktop and confirm its CLI is available; alternatively, use the native PostgreSQL setup below. |
| `'concurrently' is not recognized` | Root Node dependencies are not installed, or `npm run dev` was run from the wrong folder. | From the repository root run `npm install`. If the frontend already runs, do not restart it; start only the API in a second terminal. |
| `ModuleNotFoundError: No module named 'psycopg'` | Uvicorn is running with a Python environment that does not have the PostgreSQL driver installed. This often happens when PowerShell uses global Python instead of `.venv`. | From the repository root run `\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt`, then start with `\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir backend --port 4000`. `psycopg[binary]` is already listed in `backend/requirements.txt`. |
| `password authentication failed for user "postgres"` | pgAdmin/psql is using a wrong password for the PostgreSQL administrator. | Try the installer password. If forgotten, use the temporary local-only `pg_hba.conf` recovery below, or connect to Tradeo with the `tradeo` app role. |
| `password authentication failed for user "tradeo"` | `DATABASE_URL` password differs from the password for role `tradeo`. | As `postgres`, run `\password tradeo`, then update the `DATABASE_URL` password to match and restart Uvicorn. |
| Uvicorn says `Application startup failed` with `OperationalError` | The database credentials, service, database name, or port are wrong. | Check the service, `DATABASE_URL`, and that `tradeo` exists. Then restart Uvicorn from the repository root. |
| pgAdmin query says `Query complete`, `Total rows: 0` | The query ran, but the users table is empty. | Register through the frontend, then execute the `SELECT id, name, email, created_at ...` query again. |
| `psql`/pgAdmin asks for a password | It is asking for the password for the selected PostgreSQL role (`postgres` or `tradeo`), not the JWT secret. | Use the matching role’s password. For app/API and pgAdmin Tradeo connection, use the `tradeo` password. |

### If the `postgres` administrator password is forgotten

Use this only on a local development machine and restore password authentication immediately. Back up `C:\Program Files\PostgreSQL\18\data\pg_hba.conf` first and edit it as Administrator. Add or temporarily change a **specific** rule above the general host rules:

```text
host    postgres    postgres    127.0.0.1/32    trust
```

Do not change the general `host all all` rules to `trust`. Connect only over IPv4 to match the temporary rule:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h 127.0.0.1 -p 5432 -d postgres
```

At the `psql` prompt run `\password postgres` and, if needed, `\password tradeo`, then `\q`. Immediately restore the original authentication method (normally `scram-sha-256`) on the specific rule or remove the temporary rule. On Windows, PostgreSQL applies `pg_hba.conf` changes to new connections; restarting the `postgresql-x64-18` service is an option if the edited rule does not take effect. `trust` permits password-free local login, so never leave it enabled. If pgAdmin still shows the old password error, edit the registered server's **Connection** properties and save the new password, or create a separate `Tradeo Local` server registration using username/database `tradeo` and the app password.

## Later domain model

Keep fee rates configurable and check them against current official schedules before demos. Scenario calculations are separate from the live paper account. The order event log records accepted, modified, filled, partially filled, and cancelled transitions for user-visible audit history.

# Quantx

Quantx is a paper trading workspace for practicing NSE equity orders against simulated market conditions. The frontend starts with a public product home page, then guides users through registration or sign-in before opening the protected practice dashboard. The FastAPI/SQLAlchemy authentication API is backed by PostgreSQL.

The implementation uses React, TypeScript, Vite, Tailwind CSS; Python, FastAPI, SQLAlchemy; PostgreSQL; and Redis/WebSockets for market data. It includes account recovery and a local paper-order engine. For the 021-02 problem statement, the app may use 021 authentication, instruments, and the market-data WebSocket; orders are simulated locally and are never sent to 021 order APIs. See [ARCHITECTURE.md](ARCHITECTURE.md) for routes, flow, and constraints.

## Run with Docker Desktop (recommended)

This starts the frontend, FastAPI backend, PostgreSQL, and Redis together. Teammates do not need to install PostgreSQL, create a database, or run SQL commands.

1. Install and open Docker Desktop; wait until it says Docker is running.
2. Open PowerShell in the repository folder (the folder containing `docker-compose.yml`).
3. Start the application:

   ```powershell
   docker compose up --build -d
   ```

4. Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/api/health`.

The local PostgreSQL database is named `quantx`, with the development role `quantx`. Its host port is `5433` to avoid colliding with a PostgreSQL installation already running on Windows. For pgAdmin, use host `localhost`, port `5433`, database `quantx`, username `quantx`, password `quantx_local_only`.

Useful commands:

```powershell
docker compose ps                 # see service status
docker compose logs -f backend    # follow API logs (password reset links appear here)
docker compose down               # stop services; keep database data
```

PostgreSQL and Redis data persist in named Docker volumes. For live market data, create a root `.env` file (ignored by Git) with your own `JWT_SECRET`, `MARKET_DATA_ENABLED=true`, `MARKET_DATA_USERNAME=<your UCC>`, and `MARKET_DATA_PASSWORD=<your developer password>`. Do not share or commit that file. Startup will authenticate to 021 and sync instruments once per day; 021 may invalidate a previous access token when it logs in, so the backend owns this login while running. Teammates should use their own 021 credentials rather than copy yours. Without these values, local auth and the app remain available, but real quotes and order matching are unavailable.

When 021 is unavailable, enable `DEMO_MARKET_DATA_ENABLED=true` to start a backend quote and depth stream. Docker Compose enables it by default; native setup uses the setting in `backend/.env`. The dashboard shows a **Data** badge for generated practice prices. These prices drive the local paper matcher, so accepted orders can fill and update the account, positions, and order history; nothing is sent to a broker. Set `DEMO_MARKET_DATA_ENABLED=false` to require 021 quotes. The instrument charts use TradingView Lightweight Charts with quotes from the Quantx backend.

### Run without Docker

1. Install Node.js 20.19+ (or 22.12+) and Python 3.11+.
2. Use a locally installed PostgreSQL service. Native PostgreSQL setup is below.
3. Copy `backend/.env.example` to `backend/.env`, set `DATABASE_URL` for your PostgreSQL instance, and set a unique random `JWT_SECRET` of at least 32 characters.
4. Install frontend dependencies: `npm install` and `npm --prefix frontend install`.
5. Create a Python virtual environment, activate it, and run `pip install -r backend/requirements.txt`.
6. Run `npm run dev`. Frontend: `http://localhost:5173`; API: `http://localhost:4000/api/health`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the user journey, API examples, and PostgreSQL setup guide.

### Windows setup with installed PostgreSQL (no Docker)

If PostgreSQL is already installed and its service is running, open `psql` using the versioned install path (adjust the version if needed):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -p 5432 -d postgres
```

Enter the `postgres` password you chose during installation. In the `psql` prompt, create the app role and database (replace the example password with your own local password):

```sql
CREATE ROLE quantx WITH LOGIN PASSWORD 'ChooseALocalPassword';
CREATE DATABASE quantx OWNER quantx;
\q
```

Set `DATABASE_URL` in `backend/.env` to `postgresql+psycopg://quantx:ChooseALocalPassword@localhost:5432/quantx`. The FastAPI app creates the initial `users` table in development when it starts. You do not need Docker for this setup. If `psql` asks for a password and you do not know the PostgreSQL install password, reset it through the PostgreSQL administrator account/pgAdmin first.

The API includes session authentication, instrument sync, market quotes/depth, a local paper-order matcher, fills, cash/position accounting, configurable charges, order audit events, market-stress settings, What-If scenarios, and intraday square-off. 021 is used for authentication/instruments/market data only; it does not receive paper orders. Redis runs as part of the default Compose stack.

### Run the integration checks

```powershell
\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
\.venv\Scripts\python.exe -m pytest backend\tests -q
npm --prefix frontend run build
```

The integration tests use an isolated SQLite database and do not need your local PostgreSQL data. The production bundle build checks the TypeScript frontend. Live 021 feed behavior requires your authorized developer credentials and an available market session.

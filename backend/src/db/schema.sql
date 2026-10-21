CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_name_nonempty CHECK (length(trim(name)) >= 2),
  CONSTRAINT users_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id ON password_reset_tokens (user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  account_number VARCHAR(32) NOT NULL UNIQUE,
  account_type VARCHAR(20) NOT NULL DEFAULT 'PAPER',
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  initial_capital NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  cash_balance NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  reserved_cash NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  stress_mode BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_cash_balance_nonnegative CHECK (cash_balance >= 0),
  CONSTRAINT accounts_initial_capital_positive CHECK (initial_capital > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_user_id ON accounts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_account_number ON accounts (account_number);

CREATE TABLE IF NOT EXISTS instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  exchange VARCHAR(10) NOT NULL DEFAULT 'NSE',
  instrument_type VARCHAR(20) NOT NULL DEFAULT 'EQUITY',
  sector VARCHAR(60) NULL,
  is_tradable BOOLEAN NOT NULL DEFAULT true,
  lot_size INT NOT NULL DEFAULT 1,
  provider_token INT NULL,
  provider_exchange VARCHAR(10) NULL,
  provider_exchange_code INT NULL,
  board_lot_quantity INT NOT NULL DEFAULT 1,
  freeze_quantity INT NULL,
  tick_size_paise INT NOT NULL DEFAULT 1,
  lower_circuit_paise INT NULL,
  upper_circuit_paise INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_instruments_exchange_symbol UNIQUE (exchange, symbol)
);

CREATE INDEX IF NOT EXISTS ix_instruments_symbol ON instruments (symbol);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id),
  side VARCHAR(4) NOT NULL,
  product VARCHAR(5) NOT NULL,
  order_type VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  filled_quantity INT NOT NULL DEFAULT 0,
  limit_price NUMERIC(14, 2) NULL,
  trigger_price NUMERIC(14, 2) NULL,
  average_execution_price NUMERIC(14, 2) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  rejection_reason VARCHAR(255) NULL,
  idempotency_key VARCHAR(64) NULL UNIQUE,
  validity VARCHAR(8) NOT NULL DEFAULT 'DAY',
  reserved_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  triggered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
  CONSTRAINT orders_filled_quantity_check CHECK (filled_quantity >= 0 AND filled_quantity <= quantity),
  CONSTRAINT orders_side_check CHECK (side IN ('BUY', 'SELL')),
  CONSTRAINT orders_product_check CHECK (product IN ('CNC', 'MIS')),
  CONSTRAINT orders_type_check CHECK (order_type IN ('MARKET', 'LIMIT', 'SL', 'SL-M')),
  CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS ix_orders_account_id ON orders (account_id);
CREATE INDEX IF NOT EXISTS ix_orders_instrument_id ON orders (instrument_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS ix_orders_created_at ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id),
  sequence INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  price NUMERIC(14, 2) NOT NULL CHECK (price > 0),
  side VARCHAR(4) NOT NULL,
  product VARCHAR(5) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trades_order_sequence UNIQUE (order_id, sequence)
);

CREATE INDEX IF NOT EXISTS ix_trades_account_id ON trades (account_id);
CREATE INDEX IF NOT EXISTS ix_trades_order_id ON trades (order_id);
CREATE INDEX IF NOT EXISTS ix_trades_instrument_id ON trades (instrument_id);
CREATE INDEX IF NOT EXISTS ix_trades_created_at ON trades (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_instruments_provider_token ON instruments (provider_token);

CREATE TABLE IF NOT EXISTS trade_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,
  brokerage NUMERIC(14, 2) NOT NULL DEFAULT 0,
  exchange_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sebi_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  stt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  stamp_duty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gst NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,
  details JSON NOT NULL DEFAULT '{}'::json,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_order_events_order_id ON order_events (order_id);
CREATE INDEX IF NOT EXISTS ix_order_events_account_id ON order_events (account_id);
CREATE INDEX IF NOT EXISTS ix_order_events_created_at ON order_events (created_at DESC);

CREATE TABLE IF NOT EXISTS scenario_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  shocks JSON NOT NULL,
  result JSON NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_scenario_runs_account_id ON scenario_runs (account_id);
CREATE INDEX IF NOT EXISTS ix_scenario_runs_created_at ON scenario_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id),
  product VARCHAR(5) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  buy_quantity INT NOT NULL DEFAULT 0,
  sell_quantity INT NOT NULL DEFAULT 0,
  buy_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  sell_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  average_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  realized_pnl NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_positions_account_instrument_product UNIQUE (account_id, instrument_id, product),
  CONSTRAINT positions_product_check CHECK (product IN ('CNC', 'MIS'))
);

CREATE INDEX IF NOT EXISTS ix_positions_account_id ON positions (account_id);

CREATE TABLE IF NOT EXISTS cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entry_type VARCHAR(30) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2) NOT NULL,
  reference_id VARCHAR(64) NULL,
  description VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cash_ledger_entry_type_check CHECK (entry_type IN ('INITIAL_CAPITAL', 'TRADE_DEBIT', 'TRADE_CREDIT', 'CHARGE', 'ADJUSTMENT', 'RESET'))
);

CREATE INDEX IF NOT EXISTS ix_cash_ledger_account_id ON cash_ledger (account_id);
CREATE INDEX IF NOT EXISTS ix_cash_ledger_created_at ON cash_ledger (created_at DESC);

-- Seed initial tradable NSE instruments
INSERT INTO instruments (symbol, name, exchange, instrument_type, sector, is_tradable)
VALUES
  ('RELIANCE', 'Reliance Industries Limited', 'NSE', 'EQUITY', 'Energy', true),
  ('TCS', 'Tata Consultancy Services Limited', 'NSE', 'EQUITY', 'Information Technology', true),
  ('HDFCBANK', 'HDFC Bank Limited', 'NSE', 'EQUITY', 'Financial Services', true),
  ('INFY', 'Infosys Limited', 'NSE', 'EQUITY', 'Information Technology', true),
  ('ICICIBANK', 'ICICI Bank Limited', 'NSE', 'EQUITY', 'Financial Services', true),
  ('BHARTIARTL', 'Bharti Airtel Limited', 'NSE', 'EQUITY', 'Telecommunication', true),
  ('SBIN', 'State Bank of India', 'NSE', 'EQUITY', 'Financial Services', true),
  ('LTIM', 'LTIMindtree Limited', 'NSE', 'EQUITY', 'Information Technology', true),
  ('TRENT', 'Trent Limited', 'NSE', 'EQUITY', 'Consumer Discretionary', true),
  ('BAJFINANCE', 'Bajaj Finance Limited', 'NSE', 'EQUITY', 'Financial Services', true)
ON CONFLICT (exchange, symbol) DO NOTHING;

-- Seed default demo user account (test@mail.com / 123456789)
INSERT INTO users (id, name, email, password_hash)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'Test Explorer',
  'test@mail.com',
  '$argon2id$v=19$m=65536,t=3,p=4$fEdkW7bSSfllPqqvaRBlyw$0lXUpbX7zvM4KOyDuUZEtYaVJG9ukl+sjxvl04JcZmM'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO accounts (id, user_id, account_number, account_type, currency, initial_capital, cash_balance, status)
VALUES (
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000001',
  'TRADEO-10000001',
  'PAPER',
  'INR',
  100000.00,
  100000.00,
  'ACTIVE'
)
ON CONFLICT (account_number) DO NOTHING;

INSERT INTO cash_ledger (account_id, entry_type, amount, balance_after, description, idempotency_key)
VALUES (
  '00000000-0000-4000-a000-000000000002',
  'INITIAL_CAPITAL',
  100000.00,
  100000.00,
  'Initial virtual trading capital allocation',
  'init-ledger-00000000-0000-4000-a000-000000000002'
)
ON CONFLICT (idempotency_key) DO NOTHING;



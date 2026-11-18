-- =============================================================================
-- Food Order Platform - PostgreSQL schema
-- =============================================================================
-- Run this from pgAdmin's Query Tool (or psql) to create the schema.
-- It is idempotent: re-running it will not destroy existing data.
--
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Tables:
--   restaurants  - restaurant catalogue served by the Restaurant Service
--   menu_items   - menu items belonging to a restaurant
--   orders       - order header (A2 will move the Order Service store here)
--   order_items  - order line items
-- =============================================================================

CREATE TABLE IF NOT EXISTS restaurants (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    cuisine     TEXT        NOT NULL,
    address     TEXT        NOT NULL,
    rating      NUMERIC(2,1) NOT NULL DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
    image_url   TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
    id            SERIAL PRIMARY KEY,
    restaurant_id INTEGER     NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    price_cents   INTEGER     NOT NULL CHECK (price_cents >= 0),
    currency      TEXT        NOT NULL DEFAULT 'BDT',
    description   TEXT        NOT NULL DEFAULT '',
    available     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items (restaurant_id);

-- -----------------------------------------------------------------------------
-- Orders (A2 migration target; already created so pgAdmin can inspect them)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    order_id       TEXT        PRIMARY KEY,
    correlation_id TEXT        NOT NULL,
    restaurant_id  INTEGER     NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'CONFIRMED'
                   CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
    total_cents    INTEGER     NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    currency       TEXT        NOT NULL DEFAULT 'BDT',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders (restaurant_id);

CREATE TABLE IF NOT EXISTS order_items (
    id               SERIAL PRIMARY KEY,
    order_id         TEXT    NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    menu_item_id     INTEGER NOT NULL,
    item_name        TEXT    NOT NULL,
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

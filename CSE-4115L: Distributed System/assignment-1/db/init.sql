-- =============================================================================
-- Food Order Platform - automatic database bootstrap
-- =============================================================================
-- Runs schema.sql + seed.sql against the PostgreSQL container the first time it
-- is created. It is a convenience only: the same two files can be executed by
-- hand from pgAdmin's Query Tool at any time (see README -> pgAdmin section).
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

CREATE TABLE IF NOT EXISTS order_items (
    id               SERIAL PRIMARY KEY,
    order_id         TEXT    NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    menu_item_id     INTEGER NOT NULL,
    item_name        TEXT    NOT NULL,
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

INSERT INTO restaurants (id, name, cuisine, address, rating, image_url)
VALUES
  (1, 'Bella Pizza Napoli',  'Italian',      '12 Harbour Road, Dhaka',  4.6, 'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=800'),
  (2, 'Saffron Spice House', 'Bangladeshi',  '48 Gulshan Avenue, Dhaka', 4.4, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800'),
  (3, 'Tokyo Ramen Bar',     'Japanese',     '5 Gulshan 1, Dhaka',      4.8, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800'),
  (4, 'Green Bowl Kitchen',  'Healthy',      '22 Dhanmondi 27, Dhaka',  4.2, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, cuisine = EXCLUDED.cuisine, address = EXCLUDED.address,
  rating = EXCLUDED.rating, image_url = EXCLUDED.image_url;

INSERT INTO menu_items (id, restaurant_id, name, price_cents, currency, description, available)
VALUES
  (101, 1, 'Margherita', 950, 'BDT', 'San Marzano tomato, fior di latte, basil, olive oil', TRUE),
  (102, 1, 'Diavola', 1250, 'BDT', 'Spicy salami, mozzarella, chilli honey', TRUE),
  (103, 1, 'Quattro Formaggi', 1450, 'BDT', 'Mozzarella, gorgonzola, parmesan, blue cheese', FALSE),
  (201, 2, 'Chicken Biryani', 320, 'BDT', 'Saffron rice, slow-cooked chicken, raita, pickled onion', TRUE),
  (202, 2, 'Beef Kala Bhuna', 420, 'BDT', 'Slow-fried beef in dark spice gravy with steamed rice', TRUE),
  (203, 2, 'Vegetable Khichuri', 260, 'BDT', 'Lentils and rice with seasonal vegetables', TRUE),
  (301, 3, 'Tonkotsu Ramen', 780, 'BDT', '12-hour pork bone broth, chashu, egg, nori', TRUE),
  (302, 3, 'Spicy Miso Ramen', 820, 'BDT', 'Red miso paste, corn, butter, bamboo shoots', TRUE),
  (303, 3, 'Chicken Gyoza (6 pcs)', 450, 'BDT', 'Pan-fried dumplings with soy dipping sauce', TRUE),
  (401, 4, 'Quinoa Power Bowl', 550, 'BDT', 'Quinoa, grilled chicken, avocado, tahini dressing', TRUE),
  (402, 4, 'Mediterranean Falafel Wrap', 390, 'BDT', 'Falafel, hummus, pickled turnip, flatbread', TRUE),
  (403, 4, 'Cold Pressed Green Juice', 280, 'BDT', 'Spinach, apple, celery, ginger, lime', TRUE)
ON CONFLICT (id) DO UPDATE SET
  restaurant_id = EXCLUDED.restaurant_id, name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency,
  description = EXCLUDED.description, available = EXCLUDED.available;

SELECT setval(pg_get_serial_sequence('restaurants', 'id'), (SELECT MAX(id) FROM restaurants));
SELECT setval(pg_get_serial_sequence('menu_items', 'id'), (SELECT MAX(id) FROM menu_items));

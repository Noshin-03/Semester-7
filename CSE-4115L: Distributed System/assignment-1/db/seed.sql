-- =============================================================================
-- Food Order Platform - seed catalogue
-- =============================================================================
-- Run this AFTER db/schema.sql (pgAdmin -> Query Tool -> paste -> Execute).
-- The catalogue is identical to the in-code seed used by the Restaurant Service
-- (services/restaurant/src/seed.ts), so pgAdmin and the API always agree.
--
-- Idempotent: re-running updates the existing rows instead of duplicating them.
-- =============================================================================

INSERT INTO restaurants (id, name, cuisine, address, rating, image_url)
VALUES
  (1, 'Bella Pizza Napoli',  'Italian',      '12 Harbour Road, Dhaka',    4.6, 'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=800'),
  (2, 'Saffron Spice House', 'Bangladeshi',  '48 Gulshan Avenue, Dhaka',   4.4, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800'),
  (3, 'Tokyo Ramen Bar',     'Japanese',     '5 Gulshan 1, Dhaka',        4.8, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800'),
  (4, 'Green Bowl Kitchen',  'Healthy',      '22 Dhanmondi 27, Dhaka',    4.2, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800')
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  cuisine    = EXCLUDED.cuisine,
  address    = EXCLUDED.address,
  rating     = EXCLUDED.rating,
  image_url  = EXCLUDED.image_url;

INSERT INTO menu_items (id, restaurant_id, name, price_cents, currency, description, available)
VALUES
  (101, 1, 'Margherita',              950, 'BDT', 'San Marzano tomato, fior di latte, basil, olive oil', TRUE),
  (102, 1, 'Diavola',                1250, 'BDT', 'Spicy salami, mozzarella, chilli honey',               TRUE),
  (103, 1, 'Quattro Formaggi',       1450, 'BDT', 'Mozzarella, gorgonzola, parmesan, blue cheese',         FALSE),
  (201, 2, 'Chicken Biryani',         320, 'BDT', 'Saffron rice, slow-cooked chicken, raita, pickled onion', TRUE),
  (202, 2, 'Beef Kala Bhuna',         420, 'BDT', 'Slow-fried beef in dark spice gravy with steamed rice', TRUE),
  (203, 2, 'Vegetable Khichuri',      260, 'BDT', 'Lentils and rice with seasonal vegetables',             TRUE),
  (301, 3, 'Tonkotsu Ramen',          780, 'BDT', '12-hour pork bone broth, chashu, egg, nori',            TRUE),
  (302, 3, 'Spicy Miso Ramen',        820, 'BDT', 'Red miso paste, corn, butter, bamboo shoots',            TRUE),
  (303, 3, 'Chicken Gyoza (6 pcs)',   450, 'BDT', 'Pan-fried dumplings with soy dipping sauce',              TRUE),
  (401, 4, 'Quinoa Power Bowl',       550, 'BDT', 'Quinoa, grilled chicken, avocado, tahini dressing',     TRUE),
  (402, 4, 'Mediterranean Falafel Wrap', 390, 'BDT', 'Falafel, hummus, pickled turnip, flatbread',          TRUE),
  (403, 4, 'Cold Pressed Green Juice',280, 'BDT', 'Spinach, apple, celery, ginger, lime',                    TRUE)
ON CONFLICT (id) DO UPDATE SET
  restaurant_id = EXCLUDED.restaurant_id,
  name          = EXCLUDED.name,
  price_cents   = EXCLUDED.price_cents,
  currency      = EXCLUDED.currency,
  description   = EXCLUDED.description,
  available     = EXCLUDED.available;

-- Reset the sequences so that future inserts (without an explicit id) do not
-- collide with the seeded ids.
SELECT setval(pg_get_serial_sequence('restaurants', 'id'), (SELECT MAX(id) FROM restaurants));
SELECT setval(pg_get_serial_sequence('menu_items', 'id'), (SELECT MAX(id) FROM menu_items));

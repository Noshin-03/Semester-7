# Using pgAdmin to create the database and data

This guide covers the two ways of getting the database and its seed data into
PostgreSQL:

- **Way A (recommended for the demo):** `docker compose up -d` runs
  `db/init.sql` automatically, then you browse the data in pgAdmin.
- **Way B (manual):** create the database and tables by hand from pgAdmin's
  Query Tool, pasting `db/schema.sql` and `db/seed.sql`.

Both end with exactly the same rows, and the Restaurant Service reads the same
tables.

---

## 0. Start the stack

```bash
cd "/home/demo/Documents/7th Semester/CSE-4115L: Distributed System/assignment-1"
cp .env.example .env          # optional: adjust ports / credentials
docker compose up -d --build
docker compose ps
```

Expected output (5 healthy containers):

```
foodapp-postgres    Up (healthy)   0.0.0.0:5433->5432/tcp
foodapp-pgadmin     Up             0.0.0.0:5050->80/tcp
foodapp-restaurant  Up (healthy)   0.0.0.0:8081->8081/tcp
foodapp-order       Up (healthy)   0.0.0.0:8082->8082/tcp
foodapp-web         Up             0.0.0.0:8080->80/tcp
```

> **Port note:** PostgreSQL is published on host port **5433** because this
> workstation already runs a system PostgreSQL on 5432. The container-internal
> port is still 5432, so `postgres:5432` inside the Docker network is
> unchanged. If 5432 is free on your machine, set `POSTGRES_HOST_PORT=5432` in
> `.env`.

---

## 1. Open pgAdmin and register the server

1. Open **<http://localhost:5050>** in your browser.
2. Log in with the credentials from `.env` (defaults):

   | Field    | Value               |
   | -------- | ------------------- |
   | Email    | `admin@foodapp.com` |
   | Password | `admin123`          |

   > The email **must** use a real domain. pgAdmin rejects `.local`, `.test`
   > and other non-routable TLDs with
   > `'...' does not appear to be a valid email address`.

3. The web interface asks for a **master password** for encrypting saved
   server passwords. Enter any non-empty value (e.g. `admin123`) - this is a
   local-only passphrase and is unrelated to your PostgreSQL password.

4. On the left sidebar, right-click **Servers** -> **Add** -> **Add Server**.

   | Tab           | Field               | Value                                             |
   | ------------- | ------------------- | ------------------------------------------------- |
   | **General**   | Name                | `FoodApp Local`                                    |
   | **Connection**| Host                | `postgres`  *(not `localhost` - this is the container DNS name)* |
   |               | Port                | `5432`                                             |
   |               | Maintain database   | `foodapp`                                          |
   | **Password**  | Password            | `foodapp`  *(the `POSTGRES_PASSWORD` from `.env`)* |

5. Click **Save**. The green status bar and the tree on the left confirm the
   connection.

> **Why `postgres` and not `localhost`?** pgAdmin runs *inside* a container on
> the `foodapp-net` network. `localhost` there means the pgAdmin container
> itself. The hostname `postgres` is the compose service name, resolved by
> Docker's embedded DNS on the user-defined network.

---

## 2. Way A - the data is already there (automatic)

`db/init.sql` is baked into the `foodapp/postgres:1.0.0` image at
`/docker-entrypoint-initdb.d/init.sql`. The official Postgres entrypoint runs
every file in that directory **the first time the data volume is created**.

It creates:

| Object            | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `restaurants`     | 4 seeded restaurants                                          |
| `menu_items`      | 12 seeded menu items (3 per restaurant)                       |
| `orders`          | Order header table (A2 migration target, already present)     |
| `order_items`     | Order line items (A2 migration target, already present)       |

Verify in pgAdmin: expand **FoodApp Local -> Databases -> foodapp -> Tables**.
You should see `menu_items`, `order_items`, `orders`, `restaurants`.

To re-run the bootstrap from scratch:

```bash
docker compose down -v      # -v deletes the volumes -> wipes the database
docker compose up -d
```

---

## 3. Way B - create it manually from pgAdmin (for the viva / demo)

If you want to show the schema being created by hand:

1. In pgAdmin, open the **Query Tool** (<https://localhost:5050> -> select
   server -> database `foodapp` -> the **Query Tool** icon, or
   right-click the database -> **Query Tool**).
2. Open `db/schema.sql` in your editor, select all, copy.
3. Paste into the pgAdmin Query Tool and press **F5** (Execute) or click the
   lightning bolt.
4. Repeat with `db/seed.sql` -> copy -> paste -> **F5**.

Both files are idempotent, so running them twice is harmless.

### Alternative: run them from the terminal

```bash
docker compose exec -T postgres psql -U foodapp -d foodapp < db/schema.sql
docker compose exec -T postgres psql -U foodapp -d foodapp < db/seed.sql
```

### The SQL, in short

`db/schema.sql` creates the tables:

```sql
CREATE TABLE IF NOT EXISTS restaurants (
    id         SERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    cuisine    TEXT        NOT NULL,
    address    TEXT        NOT NULL,
    rating     NUMERIC(2,1) NOT NULL DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
    image_url  TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
```

`db/seed.sql` inserts the catalogue:

```sql
INSERT INTO restaurants (id, name, cuisine, address, rating, image_url)
VALUES
  (1, 'Bella Pizza Napoli',  'Italian',     '12 Harbour Road, Dhaka', 4.6, '...'),
  (2, 'Saffron Spice House', 'Bangladeshi', '48 Gulshan Avenue, Dhaka', 4.4, '...'),
  (3, 'Tokyo Ramen Bar',     'Japanese',    '5 Gulshan 1, Dhaka',      4.8, '...'),
  (4, 'Green Bowl Kitchen',  'Healthy',     '22 Dhanmondi 27, Dhaka',  4.2, '...')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, ...;

INSERT INTO menu_items (id, restaurant_id, name, price_cents, currency, description, available)
VALUES
  (101, 1, 'Margherita',        950, 'BDT', 'San Marzano tomato, fior di latte, basil, olive oil', TRUE),
  (102, 1, 'Diavola',          1250, 'BDT', 'Spicy salami, mozzarella, chilli honey', TRUE),
  (103, 1, 'Quattro Formaggi', 1450, 'BDT', 'Mozzarella, gorgonzola, parmesan, blue cheese', FALSE),
  (201, 2, 'Chicken Biryani',   320, 'BDT', 'Saffron rice, slow-cooked chicken, raita, pickled onion', TRUE),
  (202, 2, 'Beef Kala Bhuna',   420, 'BDT', 'Slow-fried beef in dark spice gravy with steamed rice', TRUE),
  (203, 2, 'Vegetable Khichuri',260, 'BDT', 'Lentils and rice with seasonal vegetables', TRUE),
  (301, 3, 'Tonkotsu Ramen',    780, 'BDT', '12-hour pork bone broth, chashu, egg, nori', TRUE),
  (302, 3, 'Spicy Miso Ramen',  820, 'BDT', 'Red miso paste, corn, butter, bamboo shoots', TRUE),
  (303, 3, 'Chicken Gyoza (6 pcs)',450,'BDT','Pan-fried dumplings with soy dipping sauce', TRUE),
  (401, 4, 'Quinoa Power Bowl', 550, 'BDT', 'Quinoa, grilled chicken, avocado, tahini dressing', TRUE),
  (402, 4, 'Mediterranean Falafel Wrap', 390, 'BDT', 'Falafel, hummus, pickled turnip, flatbread', TRUE),
  (403, 4, 'Cold Pressed Green Juice', 280, 'BDT', 'Spinach, apple, celery, ginger, lime', TRUE)
ON CONFLICT (id) DO UPDATE SET ...;
```

---

## 4. Check the data in pgAdmin

Open the Query Tool and run:

```sql
-- catalogue with item counts
SELECT r.id, r.name, r.cuisine, count(m.id) AS items
FROM restaurants r
LEFT JOIN menu_items m ON m.restaurant_id = r.id
GROUP BY r.id, r.name, r.cuisine
ORDER BY r.id;
```

```
 id |        name         |  cuisine   | items
----+--------------------+------------+-------
  1 | Bella Pizza Napoli  | Italian    |     3
  2 | Saffron Spice House | Bangladeshi|     3
  3 | Tokyo Ramen Bar     | Japanese   |     3
  4 | Green Bowl Kitchen  | Healthy    |     3
```

```sql
-- the menu of one restaurant
SELECT id, name, price_cents, currency, available
FROM menu_items WHERE restaurant_id = 1 ORDER BY id;
```

```
 id |       name       | price_cents | currency | available
----+------------------+-------------+----------+----------
101 | Margherita      |         950 | BDT      | t
102 | Diavola         |        1250 | BDT      | t
103 | Quattro Formaggi |        1450 | BDT      | f
```

Menu item 103 (`Quattro Formaggi`) is intentionally seeded as **sold out** so
that the `409 item_unavailable` path of the Order Service is reachable against
the real catalogue.

```sql
-- orders created during the demo (A2 migration target, empty in A1)
SELECT order_id, correlation_id, restaurant_id, status, total_cents, created_at
FROM orders ORDER BY created_at DESC LIMIT 10;
```

The `orders` table stays empty in A1 because the Order Service keeps its state
in a mutex-protected in-memory map. It is created now so that A2 is a
data-layer swap rather than a schema change.

---

## 5. The API reads the same data

The Restaurant Service connects with `DATABASE_URL`:

```
postgres://foodapp:foodapp@postgres:5432/foodapp
```

Check which source it is using:

```bash
curl http://localhost:8081/healthz
```

```json
{
  "status": "ok",
  "service": "restaurant-service",
  "catalogue_source": "postgres",
  "uptime_s": 25,
  "timestamp": "2026-11-12T15:08:26.833Z"
}
```

- `catalogue_source: "postgres"` -> the API is serving the rows you see in
  pgAdmin.
- `catalogue_source: "memory"` -> PostgreSQL was unreachable at boot, so the
  service fell back to the identical in-code seed catalogue
  (`services/restaurant/src/seed.ts`). The API stays up during a database
  outage.

To prove the fallback, stop Postgres and restart the restaurant service:

```bash
docker compose stop postgres
docker compose restart restaurant-service
curl http://localhost:8081/healthz      # -> catalogue_source: "memory"
docker compose start postgres
docker compose restart restaurant-service
curl http://localhost:8081/healthz      # -> catalogue_source: "postgres"
```

---

## 6. Troubleshooting

| Symptom                                                     | Fix                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `'admin@foodapp.local' does not appear to be a valid email` | pgAdmin rejects the `.local` TLD. Use `admin@foodapp.com` (the default). |
| pgAdmin shows `Connection refused` on the Host field        | Use `postgres`, not `localhost` - pgAdmin runs in a container.           |
| `could not translate host name "postgres"`                  | The server was not added on the `foodapp-net` network, or the container is down. Check `docker compose ps`. |
| `password authentication failed for user "foodapp"`         | The password must match `POSTGRES_PASSWORD` in `.env` (default `foodapp`). |
| pgAdmin login screen loops / restarts the container         | A stale `pgadmin-data` volume holds the old invalid email. Fix with `docker compose down -v && docker compose up -d`. |
| `port is already allocated` for 5432                        | Something already uses 5432 on the host. Keep `POSTGRES_HOST_PORT=5433`. |
| Tables are missing in pgAdmin                               | The volume was created before `init.sql` existed. Reset with `docker compose down -v && docker compose up -d`. |

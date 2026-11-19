# Food Order Platform - Assignment 1 (Distributed Systems)

Two **isolated** microservices that talk to each other over an HTTP boundary,
plus a React admin console, PostgreSQL and pgAdmin.

```
                        Docker network: foodapp-net
  ┌──────────────┐        ┌───────────────────────┐        ┌──────────────┐
  │  restaurant  │◄──────►│      order-service   │        │    web       │
  │  -service    │  HTTP  │  POST /orders         │        │ (React UI)  │
  │  :8081       │        │  GET  /orders/{id}    │        │    :8080     │
  └──────┬───────┘        └───────────┬───────────┘        └──────────────┘
         │                            │
         ▼                            ▼
  ┌──────────────┐             (in-memory store,
  │  postgres    │              mutex-protected)
  │  :5432       │
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │   pgAdmin    │
  │   :5050      │
  └──────────────┘
```

The Order Service **never** imports or calls Restaurant Service code. It makes
a real HTTP request to `RESTAURANT_URL` with a bounded timeout.

---

## Repository layout

```
.
├── docker-compose.yml          # all 5 containers + the foodapp-net network
├── .env.example                # copy to .env to override any setting
├── db/
│   ├── Dockerfile              # Postgres image pre-loaded with init.sql
│   ├── init.sql                # schema + seed, auto-run on first boot
│   ├── schema.sql              # the same schema, for pgAdmin's Query Tool
│   └── seed.sql                # the same seed data, for pgAdmin's Query Tool
├── docs/
│   ├── API_CONTRACT.md         # endpoints, payloads, status codes
│   ├── PGADMIN_GUIDE.md        # how to create the DB and data with pgAdmin
│   ├── EXPERIMENTS.md          # concurrency + outage experiment transcripts
│   └── logs/                   # captured container logs
├── scripts/
│   ├── concurrency-check.sh    # 20 concurrent POSTs -> 20 unique ids
│   └── outage-check.sh         # stop Restaurant -> bounded 503
├── services/
│   ├── restaurant/             # independent service (own package.json + Dockerfile)
│   │   ├── Dockerfile
│   │   ├── src/{index,app,catalogue,seed,types,logger}.ts
│   │   └── test/restaurant.test.ts
│   └── order/                  # independent service (own package.json + Dockerfile)
│       ├── Dockerfile
│       ├── src/{index,app,orderStore,mutex,restaurantClient,validation,types,logger}.ts
│       └── test/{order,concurrency,outage}.test.ts
└── web/                        # React 18 + Vite admin console
```

---

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

| URL                                  | What it is                        |
| ------------------------------------ | --------------------------------- |
| <http://localhost:8080>              | React admin console               |
| <http://localhost:8081/restaurants>  | Restaurant Service                |
| <http://localhost:8082/orders>       | Order Service                     |
| <http://localhost:8081/healthz>      | Restaurant health                 |
| <http://localhost:8082/healthz>      | Order health                      |
| <http://localhost:5050>              | pgAdmin                           |

Quick smoke test:

```bash
curl -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":2}]}'
```

```json
{
  "order_id": "ord_e792fc10-0b79-4179-9d2a-0f298c44efc3",
  "status": "CONFIRMED",
  "created_at": "2026-11-12T15:08:55.459Z",
  "correlation_id": "cor_demo_001",
  "restaurant_id": 1,
  "items": [{ "menu_item_id": 101, "quantity": 2, "unit_price_cents": 950, "name": "Margherita" }],
  "total_cents": 1900,
  "currency": "BDT"
}
```

---

## Run the services without Docker (Node 20+)

Each service is a standalone package with its own dependencies.

```bash
# terminal 1 - Restaurant Service on 8081
cd services/restaurant
npm install
npm run build
PORT=8081 node dist/src/index.js

# terminal 2 - Order Service on 8082
cd services/order
npm install
npm run build
PORT=8082 RESTAURANT_URL=http://localhost:8081 node dist/src/index.js
```

`RESTAURANT_URL` is read from the environment in **both** cases - the source
contains no hard-coded service URL.

> If your folder path contains a colon (`CSE-4115L:`), npm's `.bin` PATH
> handling breaks and `npm run build` cannot find `tsc`. The `build` scripts in
> this repo already call `node node_modules/typescript/bin/tsc` directly, so
> they work regardless.

---

## Tests

24 automated test cases across the two services, using Node's built-in test
runner:

```bash
npm --prefix services/restaurant test     #  6 tests
npm --prefix services/order test          # 18 tests
```

| Suite             | Covers                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| `restaurant.test.ts` | list, get, 404, 400, healthz, correlation-id propagation                |
| `order.test.ts`      | create, fetch, 404 restaurant, 404 item, 400 missing field, 400 quantity, 400 items, 400 malformed JSON, 404 unknown order, healthz, unique ids, 409 unavailable item |
| `concurrency.test.ts` | 20 concurrent POSTs -> 20 unique ids, intact state; 20 concurrent GETs |
| `outage.test.ts`     | connection refused -> 503, hanging dependency -> 503 within timeout, 5xx -> 503, 4xx -> 400, no order persisted on failure |

---

## Mandatory experiments

```bash
bash scripts/concurrency-check.sh   # 20 concurrent POSTs
bash scripts/outage-check.sh        # stop Restaurant, submit an order, restore
```

Transcripts are in [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md).

---

## Configuration

All settings are environment variables (see `.env.example`).

| Variable                 | Default (Docker)                     | Purpose                                   |
| ------------------------ | ------------------------------------ | ----------------------------------------- |
| `RESTAURANT_URL`         | `http://restaurant-service:8081`     | Order -> Restaurant base URL (**not hard-coded**) |
| `RESTAURANT_TIMEOUT_MS`  | `2000`                               | Downstream request timeout                |
| `PORT` / `RESTAURANT_PORT` | `8081`                             | Restaurant port                           |
| `PORT` / `ORDER_PORT`    | `8082`                               | Order port                                |
| `DATABASE_URL`           | `postgres://foodapp:foodapp@postgres:5432/foodapp` | Restaurant catalogue source |
| `LOG_LEVEL`              | `info`                               | `debug` / `info` / `warn` / `error`       |
| `POSTGRES_HOST_PORT`     | `5433`                               | Host port for PostgreSQL                  |
| `WEB_PORT`               | `8080`                               | Host port for the React console           |

---

## Cross-service tracing

Every request carries an `x-correlation-id`. If the client does not send one,
the service mints it. The id is echoed in the response header and included in
every log line, so a single user action is traceable end to end:

```
order-service  restaurant_call_ok   correlation_id=cor_demo_001  duration_ms=5
order-service  order_created        correlation_id=cor_demo_001
```

Both services emit one JSON object per line, so they can be grepped or shipped
to a log aggregator as-is.

---

## More documentation

- [`README_DETAILED.md`](README_DETAILED.md) - **full walkthrough**: requirements checklist, how it works, Docker, tests, experiments
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) - endpoints, payloads, status codes
- [`docs/PGADMIN_GUIDE.md`](docs/PGADMIN_GUIDE.md) - creating the database and data with pgAdmin
- [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) - concurrency and outage transcripts
- [`services/restaurant/README.md`](services/restaurant/README.md)
- [`services/order/README.md`](services/order/README.md)

---

## Known environment caveats

1. **Folder path contains a colon** (`CSE-4115L:`). Docker's bind-mount parser
   treats `:` as a mount-option separator, so `db/init.sql` is baked into a
   small Postgres image (`db/Dockerfile`) instead of being bind-mounted.
2. **Host port 5432 was already taken** by a system PostgreSQL, so the
   container publishes on 5433. The internal network port is unchanged.

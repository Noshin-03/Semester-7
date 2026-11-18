# Order Service

Order creation microservice for Assignment 1.

- **Port:** 8082
- **Stack:** Node 20 + Express 4 + TypeScript 5
- **Depends on:** the Restaurant Service, over **real HTTP**
- **Store:** in-memory `Map` protected by an async mutex (migrates to
  PostgreSQL in A2)

## Endpoints

| Method | Path          | Success | Errors                                            |
| ------ | ------------- | ------- | ------------------------------------------------- |
| POST   | `/orders`     | 201     | 400 invalid input, 404 restaurant/item, 409 unavailable item, 503 dependency down |
| GET    | `/orders/{id}`| 200     | 404                                                |
| GET    | `/orders`     | 200     | - (convenience, used by the admin console)        |
| GET    | `/healthz`    | 200     | -                                                  |

See [`../../docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md) for payloads.

## The HTTP boundary

`src/restaurantClient.ts` performs a genuine `fetch` to
`${RESTAURANT_URL}/restaurants/{id}`:

```ts
await fetch(url, {
  headers: { 'x-correlation-id': correlationId },
  signal: AbortSignal.timeout(this.timeoutMs),   // bounded: never hangs
});
```

`RESTAURANT_URL` comes **only** from the environment. Inside Docker it is
`http://restaurant-service:8081` (the compose service name on the
user-defined `foodapp-net` network) - `localhost` inside the Order container
is the Order container itself.

### Failure mapping

| Downstream condition            | `LookupResult.kind` | HTTP status |
| ------------------------------- | ------------------- | ----------- |
| 404 restaurant missing          | `not_found`         | 404         |
| other 4xx                       | `bad_request`       | 400         |
| 5xx                             | `unavailable`       | 503         |
| connection refused / DNS error | `unavailable`       | 503         |
| timeout (`RESTAURANT_TIMEOUT_MS`) | `timeout`         | 503         |
| unparseable body                | `invalid_response`  | 503         |

## Concurrency

`src/mutex.ts` is an async mutex; `src/orderStore.ts` runs **every** read and
write through it, so a `POST /orders` can never observe a partially written
order. `order_id` is a UUIDv4 (`ord_<uuid>`), so ids are unique by
construction. 20 concurrent POSTs produce 20 distinct ids with intact totals.

## Run

```bash
npm install
npm run build
PORT=8082 RESTAURANT_URL=http://localhost:8081 node dist/src/index.js
```

```bash
npm run dev        # watch mode (tsx)
npm test           # 12 automated tests (API, concurrency, outage)
npm run typecheck
```

## Environment variables

| Variable                | Default                             | Purpose                                  |
| ----------------------- | ----------------------------------- | ---------------------------------------- |
| `PORT`                  | `8082`                              | Listen port                             |
| `HOST`                  | `0.0.0.0`                           | Bind address                            |
| `RESTAURANT_URL`        | `http://localhost:8081` (local)     | **Required in Docker**: downstream base URL |
| `RESTAURANT_TIMEOUT_MS` | `2000`                              | Downstream timeout                      |
| `LOG_LEVEL`             | `info`                              | Log verbosity                           |
| `SERVICE_NAME`          | `order-service`                     | Log field                               |

## Source layout

| File                   | Responsibility                                                |
| ---------------------- | ------------------------------------------------------------- |
| `index.ts`             | Boot: build the client, listen, graceful shutdown            |
| `app.ts`               | Express app: routes, validation flow, error mapping          |
| `validation.ts`        | Pure request validation (400 cases)                           |
| `restaurantClient.ts`  | HTTP client with timeout + failure classification            |
| `orderStore.ts`        | Mutex-protected in-memory order store                         |
| `mutex.ts`             | Async mutex                                                  |
| `types.ts`             | `Order`, id generators                                        |
| `logger.ts`            | JSON line logger                                              |

## Docker

```bash
docker build -t foodapp/order-service:1.0.0 .
docker run --rm -p 8082:8082 \
  -e RESTAURANT_URL=http://restaurant-service:8081 \
  -e RESTAURANT_TIMEOUT_MS=2000 \
  foodapp/order-service:1.0.0
```

Two-stage build, unprivileged `node` user, `HEALTHCHECK` against `/healthz`.

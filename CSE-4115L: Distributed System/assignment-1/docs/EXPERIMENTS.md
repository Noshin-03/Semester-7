# Verification Experiments - Assignment 1

All transcripts below were captured on this machine with the stack running via
`docker compose up -d --build`.

| Service       | Image                          | Host port | Container port |
| ------------- | ------------------------------ | --------- | -------------- |
| Restaurant    | `foodapp/restaurant-service:1.0.0` | 8081  | 8081           |
| Order         | `foodapp/order-service:1.0.0`      | 8082  | 8082           |
| Web console   | `foodapp/web:1.0.0`            | 8080      | 80             |
| PostgreSQL    | `foodapp/postgres:1.0.0`       | 5433      | 5432           |
| pgAdmin       | `dpage/pgadmin4:8`             | 5050      | 80             |

Raw container logs: [`logs/order-service-sample.log`](logs/order-service-sample.log),
[`logs/restaurant-service-sample.log`](logs/restaurant-service-sample.log).
Outage-only log lines: [`logs/outage-experiment.log`](logs/outage-experiment.log); full script
outputs: [`logs/outage-experiment-transcript.txt`](logs/outage-experiment-transcript.txt),
[`logs/concurrency-experiment-transcript.txt`](logs/concurrency-experiment-transcript.txt).

---

## Experiment 1 - 20 concurrent POST /orders

**Requirement:** "Accept >=20 concurrent requests without corrupting order
state" / "20 concurrent POSTs yield 20 unique IDs, no race/panic".

```bash
bash scripts/concurrency-check.sh
```

### Transcript

```
=== Concurrency experiment: 20 concurrent POST http://localhost:8082/orders ===

--- HTTP status codes ---
     20 201

--- Unique order_ids + state integrity ---
orders created : 20
unique ids     : 20
corrupt orders : 0
RESULT         : PASS - every order has a unique id and intact state

--- Every created order is retrievable via GET /orders/{id} ---
RESULT         : PASS - all 20 orders fetched successfully
```

### What the script actually does

1. Fires **20 background `curl` processes simultaneously** (each with its own
   `x-correlation-id: cor_conc_NNN` and a different restaurant / menu item /
   quantity, so the requests are genuinely different).
2. Waits for all of them, then checks the status codes.
3. Parses all 20 response bodies and asserts:
   - every body has an `order_id`
   - all 20 `order_id` values are distinct
   - `total_cents == sum(unit_price_cents * quantity)` for every order
   - every `status` is `CONFIRMED`
   - every order carries a `correlation_id`
4. Issues `GET /orders/{id}` for all 20 ids and asserts HTTP 200 each time.

### Why it is safe

- `order_id` is `ord_<UUIDv4>` - unique by construction, not by a counter.
- Every read and write of the order map goes through the async mutex in
  `services/order/src/mutex.ts`, so no request can observe a half-written
  order.
- Node's single-threaded event loop serialises the actual map writes; the
  mutex makes that guarantee explicit and keeps the code identical to the A2
  PostgreSQL implementation.

### Automated equivalent

`npm --prefix services/order test` -> `services/order/test/concurrency.test.ts`
covers the same scenario (T13, T14) plus 20 concurrent `GET /orders/{id}`
requests.

---

## Experiment 2 - Downstream outage

**Requirement:** "Stop Restaurant; order submission returns a bounded failure
(no indefinite hanging)".

```bash
bash scripts/outage-check.sh
```

### Transcript

```
=== Outage experiment ===

--- Step 1: baseline (both services up) ---
HTTP 201 in 0.006016s
{"order_id":"ord_af51de49-d3eb-46a3-83da-c3c311dbf72f","status":"CONFIRMED","created_at":"2026-11-18T12:27:18.300Z","correlation_id":"cor_3d923083-0541-4ad6-aa64-1c01189daddd","restaurant_id":1,"items":[{"menu_item_id":101,"quantity":1,"unit_price_cents":950,"name":"Margherita"}],"total_cents":950,"currency":"BDT"}

--- Step 2: stop the Restaurant Service ---
 Container foodapp-restaurant Stopping
 Container foodapp-restaurant Stopped
restaurant-service stopped

--- Step 3: submit an order while the dependency is down ---
HTTP 503 in 354ms (curl timeout was 30s)
{"error":"service_unavailable","message":"Restaurant Service is unreachable: fetch failed","correlation_id":"cor_outage_demo"}

--- Step 4: restore the Restaurant Service ---
 Container foodapp-postgres Waiting
 Container foodapp-postgres Healthy
 Container foodapp-restaurant Starting
 Container foodapp-restaurant Started

--- Step 5: Restaurant HANGS (container paused, TCP accepted but no reply) ---
 Container foodapp-restaurant Paused
HTTP 503 in 2014ms (bounded by RESTAURANT_TIMEOUT_MS)
{"error":"service_unavailable","message":"Restaurant Service did not respond within 2000ms","correlation_id":"cor_hang_demo"}
 Container foodapp-restaurant Unpaused

--- Step 6: recovery ---
recovered: HTTP 201 in 0.005850s

--- Order Service log lines for the failed requests ---
{"ts":"2026-11-18T12:27:18.874Z","level":"error","service":"order-service","message":"restaurant_call_failed","url":"http://restaurant-service:8081/restaurants/1","correlation_id":"cor_outage_demo","reason":"network_error","error":"fetch failed","duration_ms":341}
{"ts":"2026-11-18T12:27:18.874Z","level":"warn","service":"order-service","message":"order_rejected_dependency","correlation_id":"cor_outage_demo","restaurant_id":1,"reason":"Restaurant Service is unreachable: fetch failed","kind":"unavailable","mapped_status":503}
{"ts":"2026-11-18T12:27:18.875Z","level":"info","service":"order-service","message":"http_request","method":"POST","path":"/orders","status":503,"duration_ms":343,"correlation_id":"cor_outage_demo"}
{"ts":"2026-11-18T12:27:27.238Z","level":"error","service":"order-service","message":"restaurant_call_failed","url":"http://restaurant-service:8081/restaurants/1","correlation_id":"cor_hang_demo","reason":"timeout","error":"The operation was aborted due to timeout","duration_ms":2002}
{"ts":"2026-11-18T12:27:27.238Z","level":"warn","service":"order-service","message":"order_rejected_dependency","correlation_id":"cor_hang_demo","restaurant_id":1,"reason":"Restaurant Service did not respond within 2000ms","kind":"timeout","mapped_status":503}
{"ts":"2026-11-18T12:27:27.239Z","level":"info","service":"order-service","message":"http_request","method":"POST","path":"/orders","status":503,"duration_ms":2003,"correlation_id":"cor_hang_demo"}

=== Outage experiment finished ===
```

### The two failure modes

Both are exercised by the script (step 3 = stopped, step 5 = paused/hanging), and both produce a **bounded** failure:

| Scenario                                    | Detected as      | HTTP | Latency  |
| ------------------------------------------- | ---------------- | ---- | -------- |
| Container stopped (DNS resolves, TCP refused) | `network_error`  | 503  | ~150-350 ms  |
| Service hangs (accepts TCP, never replies)   | `timeout`        | 503  | ~2000 ms (the configured `RESTAURANT_TIMEOUT_MS`) |

An earlier run produced the timeout variant, because Docker's DNS kept
resolving `restaurant-service` to the stopped container's IP for a moment:

```
{"level":"error","message":"restaurant_call_failed","url":"http://restaurant-service:8081/restaurants/1","correlation_id":"cor_outage_demo","reason":"timeout","error":"The operation was aborted due to timeout","duration_ms":2001}
{"level":"warn","message":"order_rejected_dependency","correlation_id":"cor_outage_demo","restaurant_id":1,"reason":"Restaurant Service did not respond within 2000ms","kind":"timeout","mapped_status":503}
{"level":"info","message":"http_request","method":"POST","path":"/orders","status":503,"duration_ms":2002,"correlation_id":"cor_outage_demo"}
```

**In both cases the request returns 503 in ~2 s or less.** The Order Service
never hangs, and it never returns a 5xx that is not a clean, typed error
envelope. `curl --max-time 30` was used in the script precisely to prove the
request completes long before the client-side timeout.

### Why it is bounded

`RestaurantClient.getRestaurant` uses
`AbortSignal.timeout(this.timeoutMs)`, so the downstream call is aborted
after `RESTAURANT_TIMEOUT_MS` (2000 ms). Connection errors surface
immediately. There is no retry loop and no unbounded wait anywhere in the
request path.

### Recovery

Restarting the container restores service with no restart of the Order Service
- the client holds no sticky state:

```
recovered: HTTP 201 in 0.009561s
```

### No partial writes

A failed order is never persisted: the store write happens only after the
downstream lookup succeeds. Covered by `services/order/test/outage.test.ts`
(T18).

---

## Experiment 3 - Cross-service correlation tracing

One client request, traceable through both services.

**Request:**

```bash
curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -H 'x-correlation-id: cor_conc_001' \
  -d '{"restaurant_id":2,"items":[{"menu_item_id":202,"quantity":2}]}'
```

**Order Service log** (`logs/order-service-sample.log`):

```json
{"service":"order-service","message":"restaurant_call_ok","url":"http://restaurant-service:8081/restaurants/2","correlation_id":"cor_conc_001","status":200,"duration_ms":77}
{"service":"order-service","message":"order_created","order_id":"ord_...","correlation_id":"cor_conc_001","restaurant_id":2,"item_count":1,"total_cents":840}
{"service":"order-service","message":"http_request","method":"POST","path":"/orders","status":201,"duration_ms":80,"correlation_id":"cor_conc_001"}
```

**Restaurant Service log** (`logs/restaurant-service-sample.log`):

```json
{"service":"restaurant-service","message":"http_request","method":"GET","path":"/restaurants/2","status":200,"duration_ms":3,"correlation_id":"cor_conc_001"}
```

The same `correlation_id` appears in both services, so a single grep finds the
entire cross-service path:

```bash
grep cor_conc_001 docs/logs/*.log
```

---

## Experiment 4 - Both containers run without a local Go/Node toolchain

**Requirement:** "Start both containers without local installed Go and
retrieve created orders."

The services are built **inside** their Docker images - the host does not need
Node, TypeScript or any other toolchain installed:

```bash
docker compose up -d --build     # builds TypeScript inside node:20-alpine
docker compose ps
```

```
foodapp-postgres    Up (healthy)   0.0.0.0:5433->5432/tcp
foodapp-pgadmin     Up             0.0.0.0:5050->80/tcp
foodapp-restaurant  Up (healthy)   0.0.0.0:8081->8081/tcp
foodapp-order       Up (healthy)   0.0.0.0:8082->8082/tcp
foodapp-web         Up             0.0.0.0:8080->80/tcp
```

Retrieving a created order, using only the published host port:

```bash
curl -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":2}]}'
# {"order_id":"ord_e792fc10-...","status":"CONFIRMED","created_at":"...","total_cents":1900,...}

curl http://localhost:8082/orders/ord_e792fc10-0b79-4179-9d2a-0f298c44efc3
```

```json
{"order_id":"ord_e792fc10-0b79-4179-9d2a-0f298c44efc3","correlation_id":"cor_demo_001","restaurant_id":1,"items":[{"menu_item_id":101,"quantity":2,"unit_price_cents":950,"name":"Margherita"}],"status":"CONFIRMED","total_cents":1900,"currency":"BDT","created_at":"2026-11-12T15:08:55.459Z"}
```

---

## Experiment 5 - Validation and error mapping

| Case                                              | Request                                                    | Result |
| ------------------------------------------------- | ---------------------------------------------------------- | ------ |
| Missing `restaurant_id`                          | `{"items":[...]}`                                           | 400 `Missing required field: restaurant_id` |
| Missing `items`                                  | `{"restaurant_id":1}`                                      | 400 `Missing required field: items` |
| Empty `items` array                              | `{"restaurant_id":1,"items":[]}`                           | 400 `items must contain at least one menu item` |
| `quantity` = 0                                   | `quantity: 0`                                               | 400 `items[0].quantity must be greater than 0` |
| `quantity` = -3                                  | `quantity: -3`                                              | 400 `items[0].quantity must be greater than 0` |
| `quantity` = 1.5 (non-integer)                   | `quantity: 1.5`                                             | 400 `items[0].quantity must be an integer` |
| `quantity` = 1000 (over the cap)                 | `quantity: 1000`                                           | 400 `items[0].quantity must not exceed 99` |
| Non-integer `menu_item_id`                       | `menu_item_id: "abc"`                                       | 400 `items[0].menu_item_id must be a positive integer` |
| Malformed JSON                                   | `{ this is not json`                                        | 400 `Request body is not valid JSON` |
| Unknown restaurant                               | `restaurant_id: 999`                                       | 404 `Restaurant 999 does not exist` |
| Unknown menu item                                | `menu_item_id: 99999`                                      | 404 `Menu item 99999 does not exist for restaurant 1` |
| Unavailable menu item                            | `menu_item_id: 103` (seeded `available = false`)            | 409 `Menu item 103 is currently unavailable` |
| Unknown order id                                 | `GET /orders/ord_nope`                                      | 404 `Order ord_nope does not exist` |
| Restaurant Service down                          | any valid order                                             | 503 `Restaurant Service is unreachable: fetch failed` |

Example 400:

```json
{
  "error": "bad_request",
  "message": "items[0].quantity must be greater than 0",
  "field": "items[0].quantity",
  "correlation_id": "cor_..."
}
```

Example 404 (downstream 404 is propagated as 404, not masked as 503):

```json
{
  "error": "not_found",
  "message": "Restaurant 999 does not exist",
  "correlation_id": "cor_..."
}
```

---

## Summary

| Requirement                                                   | Status | Evidence |
| ------------------------------------------------------------- | ------ | -------- |
| 20 concurrent POSTs -> 20 unique ids, no race/panic           | PASS   | Experiment 1, `concurrency.test.ts` T13/T14 |
| Stopping Restaurant -> bounded failure, no hanging            | PASS   | Experiment 2 (503 in ~350 ms stopped / ~2000 ms hanging), `outage.test.ts` T15-T18 |
| Both containers run without a local toolchain, orders retrievable | PASS | Experiment 4 |
| Cross-service traceability                                    | PASS   | Experiment 3 |
| 24 automated test cases pass                                  | PASS   | `npm --prefix services/restaurant test` (6) + `npm --prefix services/order test` (18) |

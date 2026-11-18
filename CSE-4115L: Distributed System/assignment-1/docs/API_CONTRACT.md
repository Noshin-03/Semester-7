# API Contract - Food Order Platform (Assignment 1)

Base URLs (as seen from the Docker network / host):

| Service                | Base URL                    | Container port | Host port |
| ---------------------- | --------------------------- | -------------- | --------- |
| Restaurant Service     | `http://restaurant-service:8081` | 8081        | 8081      |
| Order Service          | `http://order-service:8082`      | 8082        | 8082      |
| React admin console    | `http://localhost:8080`          | 80           | 8080      |
| pgAdmin                 | `http://localhost:5050`          | 80           | 5050      |

The Order Service reaches the Restaurant Service through the environment
variable `RESTAURANT_URL` (default `http://restaurant-service:8081` inside
Docker). It is never hard-coded in the source.

---

## 1. Common conventions

### 1.1 Correlation id

Every request may carry an `x-correlation-id` header.

- If the client sends one, the service **propagates it unchanged**.
- If the client omits it, the service **mints** one (`cor_<uuid>`).
- The id is always returned in the `x-correlation-id` response header and is
  written to every structured log line, so one inbound request can be traced
  through both services.

```bash
curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -H 'x-correlation-id: cor_demo_001' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":2}]}'
```

### 1.2 Error envelope

```json
{
  "error": "bad_request",
  "message": "restaurant_id must be a positive integer",
  "field": "restaurant_id",
  "correlation_id": "cor_demo_001"
}
```

`field` is only present for validation errors.

---

## 2. Restaurant Service

Read-only catalogue. Sourced from PostgreSQL when `DATABASE_URL` is reachable,
otherwise from the in-code seed catalogue (see `/healthz` -> `catalogue_source`).

### 2.1 `GET /restaurants`

Returns the restaurant list (summary view, no nested menu items).

**200 OK**

```json
{
  "count": 4,
  "restaurants": [
    {
      "id": 1,
      "name": "Bella Pizza Napoli",
      "cuisine": "Italian",
      "address": "12 Harbour Road, Dhaka",
      "rating": 4.6,
      "image_url": "https://images.unsplash.com/photo-1579751626657-72bc17010498?w=800",
      "item_count": 3
    }
  ]
}
```

### 2.2 `GET /restaurants/{id}`

Returns a single restaurant **including** its menu items.

**200 OK**

```json
{
  "id": 1,
  "name": "Bella Pizza Napoli",
  "cuisine": "Italian",
  "address": "12 Harbour Road, Dhaka",
  "rating": 4.6,
  "image_url": "https://images.unsplash.com/photo-1579751626657-72bc17010498?w=800",
  "items": [
    {
      "id": 101,
      "name": "Margherita",
      "price_cents": 950,
      "currency": "BDT",
      "description": "San Marzano tomato, fior di latte, basil, olive oil",
      "available": true
    },
    {
      "id": 102,
      "name": "Diavola",
      "price_cents": 1250,
      "currency": "BDT",
      "description": "Spicy salami, mozzarella, chilli honey",
      "available": true
    },
    {
      "id": 103,
      "name": "Quattro Formaggi",
      "price_cents": 1450,
      "currency": "BDT",
      "description": "Mozzarella, gorgonzola, parmesan, blue cheese",
      "available": false
    }
  ]
}
```

**404 Not Found** - unknown id

```json
{ "error": "not_found", "message": "Restaurant 999999 does not exist", "correlation_id": "cor_..." }
```

**400 Bad Request** - non-numeric id

```json
{ "error": "bad_request", "message": "Restaurant id must be a positive integer", "correlation_id": "cor_..." }
```

### 2.3 `GET /restaurants/{id}/items`

Convenience endpoint used by the admin console.

```json
{ "restaurant_id": 1, "count": 3, "items": [ /* menu items */ ] }
```

### 2.4 `GET /healthz`

```json
{
  "status": "ok",
  "service": "restaurant-service",
  "catalogue_source": "postgres",
  "uptime_s": 25,
  "timestamp": "2026-11-12T15:08:26.833Z"
}
```

---

## 3. Order Service

Validates every order against the Restaurant Service over **real HTTP**, then
stores the order in a mutex-protected in-memory map (migrates to PostgreSQL in
A2).

### 3.1 `POST /orders`

**Request**

```json
{
  "restaurant_id": 1,
  "items": [
    { "menu_item_id": 101, "quantity": 2 },
    { "menu_item_id": 102, "quantity": 1 }
  ]
}
```

**201 Created**

```json
{
  "order_id": "ord_e792fc10-0b79-4179-9d2a-0f298c44efc3",
  "status": "CONFIRMED",
  "created_at": "2026-11-12T15:08:55.459Z",
  "correlation_id": "cor_demo_001",
  "restaurant_id": 1,
  "items": [
    { "menu_item_id": 101, "quantity": 2, "unit_price_cents": 950, "name": "Margherita" },
    { "menu_item_id": 102, "quantity": 1, "unit_price_cents": 1250, "name": "Diavola" }
  ],
  "total_cents": 3150,
  "currency": "BDT"
}
```

The three mandatory fields are `order_id`, `status` and `created_at`; the rest is
useful extra context.

**Status codes**

| Code | Meaning                | Example message                                             |
| ---- | ---------------------- | ----------------------------------------------------------- |
| 201  | Order created          | -                                                            |
| 400  | Malformed input        | `Missing required field: restaurant_id`                     |
| 400  | Bad quantity           | `items[0].quantity must be greater than 0`                  |
| 400  | Malformed JSON         | `Request body is not valid JSON`                            |
| 404  | Restaurant missing     | `Restaurant 999 does not exist`                             |
| 404  | Menu item missing       | `Menu item 99999 does not exist for restaurant 1`           |
| 409  | Menu item unavailable   | `Menu item 103 is currently unavailable`                    |
| 503  | Dependency unavailable | `Restaurant Service did not respond within 2000ms`           |
| 503  | Dependency 5xx         | `Restaurant Service returned HTTP 500`                      |

**400 Bad Request - missing field**

```json
{
  "error": "bad_request",
  "message": "Missing required field: restaurant_id",
  "field": "restaurant_id",
  "correlation_id": "cor_..."
}
```

**400 Bad Request - invalid quantity**

```json
{
  "error": "bad_request",
  "message": "items[0].quantity must be greater than 0",
  "field": "items[0].quantity",
  "correlation_id": "cor_..."
}
```

**404 Not Found - unknown menu item**

```json
{
  "error": "not_found",
  "message": "Menu item 99999 does not exist for restaurant 1",
  "correlation_id": "cor_..."
}
```

**503 Service Unavailable - downstream outage**

```json
{
  "error": "service_unavailable",
  "message": "Restaurant Service did not respond within 2000ms",
  "correlation_id": "cor_outage_demo"
}
```

### 3.2 `GET /orders/{id}`

**200 OK**

```json
{
  "order_id": "ord_e792fc10-0b79-4179-9d2a-0f298c44efc3",
  "correlation_id": "cor_demo_001",
  "restaurant_id": 1,
  "items": [
    { "menu_item_id": 101, "quantity": 2, "unit_price_cents": 950, "name": "Margherita" }
  ],
  "status": "CONFIRMED",
  "total_cents": 1900,
  "currency": "BDT",
  "created_at": "2026-11-12T15:08:55.459Z"
}
```

**404 Not Found** - unknown order id

```json
{ "error": "not_found", "message": "Order ord_x does not exist", "correlation_id": "cor_..." }
```

### 3.3 `GET /orders`

Convenience endpoint used by the admin console.

```json
{ "count": 2, "orders": [ /* orders */ ] }
```

### 3.4 `GET /healthz`

```json
{
  "status": "ok",
  "service": "order-service",
  "restaurant_service_url": "http://restaurant-service:8081",
  "restaurant_timeout_ms": 2000,
  "uptime_s": 19,
  "timestamp": "2026-11-12T15:08:26.858Z"
}
```

---

## 4. Seed catalogue

4 restaurants, 12 menu items (the assignment requires >= 3 restaurants and
>= 6 items). Restaurant `r` owns menu items `r*100+1 .. r*100+3`.

| Restaurant id | Name                 | Cuisine     | Menu item ids          |
| ------------- | -------------------- | ----------- | ---------------------- |
| 1             | Bella Pizza Napoli   | Italian     | 101 Margherita, 102 Diavola, 103 Quattro Formaggi *(sold out)* |
| 2             | Saffron Spice House  | Bangladeshi | 201 Chicken Biryani, 202 Beef Kala Bhuna, 203 Vegetable Khichuri |
| 3             | Tokyo Ramen Bar      | Japanese    | 301 Tonkotsu Ramen, 302 Spicy Miso Ramen, 303 Chicken Gyoza |
| 4             | Green Bowl Kitchen   | Healthy     | 401 Quinoa Power Bowl, 402 Falafel Wrap, 403 Green Juice |

The same catalogue is in `db/seed.sql` (PostgreSQL) and
`services/restaurant/src/seed.ts` (in-code fallback).

---

## 5. cURL cheat sheet

```bash
# Restaurant catalogue
curl http://localhost:8081/restaurants
curl http://localhost:8081/restaurants/1
curl http://localhost:8081/restaurants/999      # 404
curl http://localhost:8081/healthz

# Order lifecycle
curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":2}]}'

curl http://localhost:8082/orders/<order_id>
curl http://localhost:8082/healthz

# Failure cases
curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"items":[{"menu_item_id":101,"quantity":1}]}'                       # 400 missing restaurant_id

curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":0}]}'   # 400 bad quantity

curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":999,"items":[{"menu_item_id":101,"quantity":1}]}'  # 404 restaurant missing

curl -i -X POST http://localhost:8082/orders \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":99999,"quantity":1}]}' # 404 item missing
```

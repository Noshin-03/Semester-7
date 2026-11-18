# Restaurant Service

Read-only catalogue microservice for Assignment 1.

- **Port:** 8081
- **Stack:** Node 20 + Express 4 + TypeScript 5
- **Data source:** PostgreSQL (`restaurants` + `menu_items`), with an identical
  in-code seed as a fallback when the database is unreachable
- **Dependency:** none (it is the dependency, not a dependant)

## Endpoints

| Method | Path                    | Success | Errors                       |
| ------ | ----------------------- | ------- | ---------------------------- |
| GET    | `/restaurants`          | 200     | -                            |
| GET    | `/restaurants/{id}`     | 200     | 400 non-numeric id, 404      |
| GET    | `/restaurants/{id}/items` | 200   | 400 non-numeric id, 404      |
| GET    | `/healthz`              | 200     | -                            |

See [`../../docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md) for payloads.

## Run

```bash
npm install
npm run build
PORT=8081 DATABASE_URL=postgres://foodapp:foodapp@localhost:5433/foodapp node dist/src/index.js
```

Without `DATABASE_URL` the service serves the in-code seed catalogue and logs
`catalogue_source = memory`.

```bash
npm run dev        # watch mode (tsx)
npm test           # 6 automated tests
npm run typecheck
```

## Environment variables

| Variable          | Default            | Purpose                          |
| ----------------- | ------------------ | -------------------------------- |
| `PORT`            | `8081`             | Listen port                      |
| `HOST`            | `0.0.0.0`          | Bind address                     |
| `DATABASE_URL`    | _(unset)_          | PostgreSQL connection string     |
| `LOG_LEVEL`       | `info`             | Log verbosity                    |
| `SERVICE_NAME`    | `restaurant-service` | Log field                      |

## Source layout

| File            | Responsibility                                                     |
| --------------- | ------------------------------------------------------------------ |
| `index.ts`      | Boot: resolve catalogue, listen, graceful shutdown                |
| `app.ts`        | Express app: routes, correlation middleware, error envelope        |
| `catalogue.ts`  | `PostgresCatalogue` / `MemoryCatalogue` + fallback selection       |
| `seed.ts`       | Canonical A1 catalogue (4 restaurants, 12 items)                    |
| `types.ts`      | Shared response types                                              |
| `logger.ts`     | JSON line logger                                                   |

## Docker

```bash
docker build -t foodapp/restaurant-service:1.0.0 .
docker run --rm -p 8081:8081 -e DATABASE_URL=postgres://... foodapp/restaurant-service:1.0.0
```

The image is a two-stage build: TypeScript is compiled in the builder stage and
only production dependencies plus `dist/` are copied into the runtime stage,
which runs as the unprivileged `node` user and carries a `HEALTHCHECK`.

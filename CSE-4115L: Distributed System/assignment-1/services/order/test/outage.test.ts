import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { OrderStore } from '../src/orderStore';
import { RestaurantClient } from '../src/restaurantClient';

async function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { server, port };
}

async function close(server: http.Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('Order Service - downstream outage handling', () => {
  let orderServer: http.Server;
  let baseUrl: string;
  let store: OrderStore;

  before(async () => {
    store = new OrderStore();
    const deadPort = await listen(() => undefined);
    const deadPortNumber = (deadPort.server.address() as AddressInfo).port;
    await close(deadPort.server);

    const app = createApp({
      store,
      restaurantClient: new RestaurantClient({
        baseUrl: `http://127.0.0.1:${deadPortNumber}`,
        timeoutMs: 1000,
      }),
      serviceName: 'order-service-outage-test',
    });
    await new Promise<void>((resolve) => {
      orderServer = app.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(orderServer.address() as AddressInfo).port}`;
  });

  after(async () => {
    await close(orderServer);
  });

  it('T15: returns 503 quickly when the Restaurant Service is down (connection refused)', async () => {
    const startedAt = Date.now();
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 1 }] }),
    });
    const elapsed = Date.now() - startedAt;

    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string; correlation_id: string };
    assert.equal(body.error, 'service_unavailable');
    assert.ok(body.correlation_id);
    assert.ok(elapsed < 3000, `expected a bounded failure, took ${elapsed}ms`);
  });

  it('T16: returns 503 within the configured timeout when the Restaurant Service hangs', async () => {
    const hanging = await listen(() => {
    });
    const orderApp = createApp({
      store,
      restaurantClient: new RestaurantClient({
        baseUrl: `http://127.0.0.1:${hanging.port}`,
        timeoutMs: 1000,
      }),
      serviceName: 'order-service-timeout-test',
    });
    const server = http.createServer(orderApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const startedAt = Date.now();
    const res = await fetch(`${url}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 1 }] }),
    });
    const elapsed = Date.now() - startedAt;

    assert.equal(res.status, 503);
    assert.ok(elapsed < 3000, `expected the request to fail within the timeout, took ${elapsed}ms`);
    assert.ok(elapsed >= 900, `should respect the configured 1000ms timeout, took ${elapsed}ms`);

    await close(server);
    await close(hanging.server);
  });

  it('T17: maps a downstream 500 to 503 and a downstream 4xx to 400', async () => {
    const failing = await listen((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error' }));
    });
    const orderApp = createApp({
      store,
      restaurantClient: new RestaurantClient({
        baseUrl: `http://127.0.0.1:${failing.port}`,
        timeoutMs: 1000,
      }),
      serviceName: 'order-service-mapping-test',
    });
    const server = http.createServer(orderApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (): Promise<Response> =>
      fetch(`${url}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 1 }] }),
      });

    const serverError = await post();
    assert.equal(serverError.status, 503, 'downstream 5xx must surface as 503');

    await close(server);
    await close(failing.server);

    const rejecting = await listen((_req, res) => {
      res.writeHead(422, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_request' }));
    });
    const orderApp2 = createApp({
      store,
      restaurantClient: new RestaurantClient({
        baseUrl: `http://127.0.0.1:${rejecting.port}`,
        timeoutMs: 1000,
      }),
      serviceName: 'order-service-mapping-test-2',
    });
    const server2 = http.createServer(orderApp2);
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', () => resolve()));
    const url2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;

    const clientError = await fetch(`${url2}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 1 }] }),
    });
    assert.equal(clientError.status, 400, 'downstream 4xx must surface as 400');

    await close(server2);
    await close(rejecting.server);
  });

  it('T18: no order is persisted when the downstream lookup fails', async () => {
    const stored = await store.list();
    assert.equal(stored.length, 0, 'a failed order must not be persisted');
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { OrderStore } from '../src/orderStore';
import { RestaurantClient } from '../src/restaurantClient';

const RESTAURANT_PORT = 9099;
const ORDER_PORT = 9098;

const RESTAURANT_URL = `http://127.0.0.1:${RESTAURANT_PORT}`;

/**
 * A stub of the Restaurant Service that mimics the real contract.
 * The Order Service talks to it over real HTTP on a real socket.
 */
function createRestaurantStub(overrides: { status?: number; body?: unknown; delayMs?: number } = {}) {
  const state = { calls: 0, ...overrides };
  const server = require('node:http').createServer((req: any, res: any) => {
    state.calls += 1;
    const respond = () => {
      const status = state.status ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      if (status === 404) {
        res.end(JSON.stringify({ error: 'not_found', message: 'Restaurant does not exist' }));
        return;
      }
      res.end(JSON.stringify(state.body ?? defaultRestaurantBody));
    };
    if (state.delayMs) setTimeout(respond, state.delayMs);
    else respond();
  });
  return { server, state };
}

const defaultRestaurantBody = {
  id: 1,
  name: 'Bella Pizza Napoli',
  cuisine: 'Italian',
  address: '12 Harbour Road, Dhaka',
  rating: 4.6,
  image_url: 'https://example.com/x.jpg',
  items: [
    { id: 101, name: 'Margherita', price_cents: 950, currency: 'BDT', description: 'Tomato, mozzarella', available: true },
    { id: 102, name: 'Diavola', price_cents: 1250, currency: 'BDT', description: 'Spicy salami', available: true },
    { id: 103, name: 'Quattro Formaggi', price_cents: 1450, currency: 'BDT', description: 'Four cheeses', available: false },
  ],
};

describe('Order Service API', () => {
  let restaurantStub: ReturnType<typeof createRestaurantStub>;
  let restaurantServer: Server;
  let orderServer: Server;
  let baseUrl: string;
  let store: OrderStore;

  before(async () => {
    restaurantStub = createRestaurantStub();
    await new Promise<void>((resolve) => {
      restaurantServer = restaurantStub.server.listen(RESTAURANT_PORT, '127.0.0.1', () => resolve());
    });

    store = new OrderStore();
    const app = createApp({
      store,
      restaurantClient: new RestaurantClient({ baseUrl: RESTAURANT_URL, timeoutMs: 2000 }),
      serviceName: 'order-service-test',
    });
    await new Promise<void>((resolve) => {
      orderServer = app.listen(ORDER_PORT, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${ORDER_PORT}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => orderServer.close(() => resolve()));
    await new Promise<void>((resolve) => restaurantServer.close(() => resolve()));
  });

  it('T1: POST /orders creates an order and returns order_id, status and created_at', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 2 }] }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.order_id === 'string' && body.order_id.length > 0);
    assert.equal(body.status, 'CONFIRMED');
    assert.ok(typeof body.created_at === 'string' && !Number.isNaN(Date.parse(body.created_at as string)));
  });

  it('T2: GET /orders/:id returns the created order', async () => {
    const created = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 1 }] }),
    }).then((r) => r.json() as Promise<{ order_id: string }>);

    const res = await fetch(`${baseUrl}/orders/${created.order_id}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { order_id: string; restaurant_id: number };
    assert.equal(body.order_id, created.order_id);
    assert.equal(body.restaurant_id, 1);
  });

  it('T3: POST /orders returns 404 when the restaurant does not exist', async () => {
    restaurantStub.state.status = 404;
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 999, items: [{ menu_item_id: 101, quantity: 1 }] }),
    });
    restaurantStub.state.status = 200;
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'not_found');
  });

  it('T4: POST /orders returns 404 when a menu item does not exist for that restaurant', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 99999, quantity: 1 }] }),
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string; message: string };
    assert.equal(body.error, 'not_found');
    assert.match(body.message, /99999/);
  });

  it('T5: POST /orders returns 400 for a missing restaurant_id', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ menu_item_id: 101, quantity: 1 }] }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; field: string };
    assert.equal(body.error, 'bad_request');
    assert.equal(body.field, 'restaurant_id');
  });

  it('T6: POST /orders returns 400 for an invalid quantity', async () => {
    for (const quantity of [0, -3, 1.5, 1000]) {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity }] }),
      });
      assert.equal(res.status, 400, `expected 400 for quantity=${quantity}`);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'bad_request');
    }
  });

  it('T7: POST /orders returns 400 for a missing items array', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1 }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; field: string };
    assert.equal(body.field, 'items');
  });

  it('T8: POST /orders returns 400 for malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ this is not json',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'bad_request');
  });

  it('T9: GET /orders/:id returns 404 for an unknown order', async () => {
    const res = await fetch(`${baseUrl}/orders/ord_does_not_exist`);
    assert.equal(res.status, 404);
  });

  it('T10: GET /healthz reports service status', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; restaurant_service_url: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.restaurant_service_url, RESTAURANT_URL);
  });

  it('T11: every order gets a unique order_id and a correlation_id', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-correlation-id': `cor_batch_${i}` },
        body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 101, quantity: 1 }] }),
      });
      const body = (await res.json()) as { order_id: string; correlation_id: string };
      ids.add(body.order_id);
      assert.equal(body.correlation_id, `cor_batch_${i}`);
    }
    assert.equal(ids.size, 5, 'order ids must be unique');
  });

  it('T12: POST /orders returns 409 when a menu item is unavailable', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 103, quantity: 1 }] }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'item_unavailable');
  });
});

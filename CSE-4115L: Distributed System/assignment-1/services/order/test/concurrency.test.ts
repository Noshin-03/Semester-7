import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { OrderStore } from '../src/orderStore';
import { RestaurantClient } from '../src/restaurantClient';

const RESTAURANT_PORT = 9097;
const ORDER_PORT = 9096;

const RESTAURANT_URL = `http://127.0.0.1:${RESTAURANT_PORT}`;

const restaurantBody = {
  id: 1,
  name: 'Bella Pizza Napoli',
  cuisine: 'Italian',
  address: '12 Harbour Road, Dhaka',
  rating: 4.6,
  image_url: 'https://example.com/x.jpg',
  items: [
    { id: 101, name: 'Margherita', price_cents: 950, currency: 'BDT', description: 'd', available: true },
    { id: 102, name: 'Diavola', price_cents: 1250, currency: 'BDT', description: 'd', available: true },
  ],
};

describe('Order Service - concurrency', () => {
  let restaurantServer: Server;
  let orderServer: Server;
  let baseUrl: string;
  let store: OrderStore;

  before(async () => {
    const restaurantApp = require('express')();
    restaurantApp.get('/restaurants/:id', (_req: any, res: any) => {
      res.json(restaurantBody);
    });
    await new Promise<void>((resolve) => {
      restaurantServer = restaurantApp.listen(RESTAURANT_PORT, '127.0.0.1', () => resolve());
    });

    store = new OrderStore();
    const app = createApp({
      store,
      restaurantClient: new RestaurantClient({ baseUrl: RESTAURANT_URL, timeoutMs: 5000 }),
      serviceName: 'order-service-concurrency-test',
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

  it('T13: 20 concurrent POST /orders produce 20 unique order_ids with intact state', async () => {
    const CONCURRENCY = 20;

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_unused, index) =>
        fetch(`${baseUrl}/orders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: 1,
            items: [{ menu_item_id: 101, quantity: (index % 5) + 1 }],
          }),
        }),
      ),
    );

    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<{ order_id: string; total_cents: number }>));
    responses.forEach((r) => assert.equal(r.status, 201));

    const ids = new Set(bodies.map((b) => b.order_id));
    assert.equal(ids.size, CONCURRENCY, `expected ${CONCURRENCY} unique order ids, got ${ids.size}`);

    // The store must contain exactly those orders, each fully intact.
    const stored = await store.list();
    assert.equal(stored.length, CONCURRENCY);
    for (const order of stored) {
      assert.ok(order.order_id.startsWith('ord_'));
      assert.equal(order.status, 'CONFIRMED');
      assert.equal(order.items.length, 1);
      assert.equal(order.total_cents, order.items[0].unit_price_cents * order.items[0].quantity);
      assert.ok(!Number.isNaN(Date.parse(order.created_at)));
    }
    assert.equal(new Set(stored.map((o) => o.order_id)).size, CONCURRENCY);
  });

  it('T14: 20 concurrent GET /orders/:id after creation all return their own order', async () => {
    const created = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${baseUrl}/orders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ restaurant_id: 1, items: [{ menu_item_id: 102, quantity: 2 }] }),
        }).then((r) => r.json() as Promise<{ order_id: string }>),
      ),
    );

    const fetched = await Promise.all(
      created.map((c) =>
        fetch(`${baseUrl}/orders/${c.order_id}`).then((r) => r.json() as Promise<{ order_id: string; items: unknown[] }>),
      ),
    );

    fetched.forEach((f, i) => {
      assert.equal(f.order_id, created[i].order_id);
      assert.equal(f.items.length, 1);
    });
  });
});

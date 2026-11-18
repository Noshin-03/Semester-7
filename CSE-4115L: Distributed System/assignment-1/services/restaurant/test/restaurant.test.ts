import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { MemoryCatalogue } from '../src/catalogue';

describe('Restaurant Service API', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp({ catalogue: new MemoryCatalogue(), serviceName: 'restaurant-service-test' });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('T1: GET /restaurants returns the seeded catalogue', async () => {
    const res = await fetch(`${baseUrl}/restaurants`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { count: number; restaurants: Array<{ id: number; item_count: number }> };
    assert.ok(body.count >= 3, 'expected at least 3 seeded restaurants');
    assert.ok(
      body.restaurants.reduce((sum, r) => sum + r.item_count, 0) >= 6,
      'expected at least 6 seeded menu items',
    );
  });

  it('T2: GET /restaurants/:id returns a restaurant with its menu items', async () => {
    const res = await fetch(`${baseUrl}/restaurants/1`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { id: number; name: string; items: unknown[] };
    assert.equal(body.id, 1);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length > 0);
  });

  it('T3: GET /restaurants/:id returns 404 for an unknown restaurant', async () => {
    const res = await fetch(`${baseUrl}/restaurants/999999`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'not_found');
  });

  it('T4: GET /restaurants/:id returns 400 for a non-numeric id', async () => {
    const res = await fetch(`${baseUrl}/restaurants/abc`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'bad_request');
  });

  it('T5: GET /healthz reports service status and catalogue source', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; service: string; catalogue_source: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'restaurant-service-test');
    assert.ok(['memory', 'postgres'].includes(body.catalogue_source));
  });

  it('T6: responses carry a correlation id, and an inbound one is propagated', async () => {
    const generated = await fetch(`${baseUrl}/restaurants`);
    assert.ok(generated.headers.get('x-correlation-id'));

    const propagated = await fetch(`${baseUrl}/restaurants`, {
      headers: { 'x-correlation-id': 'cor_test_12345' },
    });
    assert.equal(propagated.headers.get('x-correlation-id'), 'cor_test_12345');
  });
});

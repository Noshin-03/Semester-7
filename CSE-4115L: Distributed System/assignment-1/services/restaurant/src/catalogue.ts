import { Pool, type PoolClient } from 'pg';
import { logger } from './logger';
import { cloneSeedRestaurants, type MenuItem, type Restaurant } from './seed';

export interface CatalogueSource {
  listRestaurants(): Promise<Restaurant[]>;
  getRestaurant(id: number): Promise<Restaurant | undefined>;
  readonly source: 'postgres' | 'memory';
  close(): Promise<void>;
}

export class MemoryCatalogue implements CatalogueSource {
  readonly source = 'memory' as const;
  private readonly restaurants: Restaurant[];

  constructor(restaurants: Restaurant[] = cloneSeedRestaurants()) {
    this.restaurants = restaurants;
  }

  async listRestaurants(): Promise<Restaurant[]> {
    return this.restaurants.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) }));
  }

  async getRestaurant(id: number): Promise<Restaurant | undefined> {
    const found = this.restaurants.find((r) => r.id === id);
    return found ? { ...found, items: found.items.map((i) => ({ ...i })) } : undefined;
  }

  async close(): Promise<void> {
  }
}

export class PostgresCatalogue implements CatalogueSource {
  readonly source = 'postgres' as const;
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', (err) => logger.error('postgres pool error', { error: err.message }));
  }

  async listRestaurants(): Promise<Restaurant[]> {
    const client: PoolClient = await this.pool.connect();
    try {
      const restaurants = await client.query<{
        id: number;
        name: string;
        cuisine: string;
        address: string;
        rating: string;
        image_url: string;
      }>('SELECT id, name, cuisine, address, rating, image_url FROM restaurants ORDER BY id');

      const items = await client.query<{
        id: number;
        restaurant_id: number;
        name: string;
        price_cents: number;
        currency: string;
        description: string;
        available: boolean;
      }>(
        `SELECT id, restaurant_id, name, price_cents, currency, description, available
         FROM menu_items ORDER BY restaurant_id, id`,
      );

      const byRestaurant = new Map<number, MenuItem[]>();
      for (const row of items.rows) {
        const list = byRestaurant.get(row.restaurant_id) ?? [];
        list.push({
          id: row.id,
          name: row.name,
          price_cents: row.price_cents,
          currency: row.currency,
          description: row.description,
          available: row.available,
        });
        byRestaurant.set(row.restaurant_id, list);
      }

      return restaurants.rows.map((r) => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        address: r.address,
        rating: Number(r.rating),
        image_url: r.image_url,
        items: byRestaurant.get(r.id) ?? [],
      }));
    } finally {
      client.release();
    }
  }

  async getRestaurant(id: number): Promise<Restaurant | undefined> {
    const all = await this.listRestaurants();
    return all.find((r) => r.id === id);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createCatalogue(): Promise<CatalogueSource> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn('DATABASE_URL not set - serving catalogue from in-memory seed');
    return new MemoryCatalogue();
  }

  const postgres = new PostgresCatalogue(connectionString);
  try {
    await postgres.listRestaurants();
    logger.info('catalogue source = postgres');
    return postgres;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('postgres unavailable, falling back to in-memory seed', { error: message });
    await postgres.close().catch(() => undefined);
    return new MemoryCatalogue();
  }
}

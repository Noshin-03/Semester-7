import { Mutex } from './mutex';
import type { Order } from './types';

/**
 * In-memory order store protected by a mutex.
 *
 * Every read and write goes through the mutex so that concurrent POST /orders
 * requests can never observe a partially-written order. A2 will swap this for
 * a PostgreSQL-backed repository with the same public interface.
 */
export class OrderStore {
  private readonly orders = new Map<string, Order>();
  private readonly mutex = new Mutex();

  /** Inserts the order and returns it. The id is the map key, so it is unique by construction. */
  async create(order: Order): Promise<Order> {
    return this.mutex.runExclusive(() => {
      this.orders.set(order.order_id, order);
      return order;
    });
  }

  async get(orderId: string): Promise<Order | undefined> {
    return this.mutex.runExclusive(() => this.orders.get(orderId));
  }

  async list(): Promise<Order[]> {
    return this.mutex.runExclusive(() => Array.from(this.orders.values()));
  }

  async count(): Promise<number> {
    return this.mutex.runExclusive(() => this.orders.size);
  }
}

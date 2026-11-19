import { Mutex } from './mutex';
import type { Order } from './types';

export class OrderStore {
  private readonly orders = new Map<string, Order>();
  private readonly mutex = new Mutex();

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

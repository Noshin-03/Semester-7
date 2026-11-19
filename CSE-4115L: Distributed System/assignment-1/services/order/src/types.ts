import { randomUUID } from 'node:crypto';

export interface OrderItem {
  menu_item_id: number;
  quantity: number;
  unit_price_cents: number;
  name: string;
}

export interface Order {
  order_id: string;
  correlation_id: string;
  restaurant_id: number;
  items: OrderItem[];
  status: 'PENDING' | 'CONFIRMED';
  total_cents: number;
  currency: string;
  created_at: string;
}

export function generateOrderId(): string {
  return `ord_${randomUUID()}`;
}

export function generateCorrelationId(): string {
  return `cor_${randomUUID()}`;
}

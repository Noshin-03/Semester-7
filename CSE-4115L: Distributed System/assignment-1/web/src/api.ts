/**
 * API layer for the admin console.
 *
 * In Docker the nginx reverse proxy forwards /api/restaurant/* to the
 * Restaurant Service and /api/order/* to the Order Service. During local
 * development (`npm run dev` in web/) the same paths are proxied by Vite to
 * localhost, so the frontend code is identical in both modes.
 */

const RESTAURANT_BASE = '/api/restaurant';
const ORDER_BASE = '/api/order';

export interface MenuItem {
  id: number;
  name: string;
  price_cents: number;
  currency: string;
  description: string;
  available: boolean;
}

export interface Restaurant {
  id: number;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  image_url: string;
  items: MenuItem[];
}

export interface RestaurantSummary {
  id: number;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  image_url: string;
  item_count: number;
}

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
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly correlationId?: string;

  constructor(status: number, message: string, correlationId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.correlationId = correlationId;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, `Network error: ${message}`);
  }

  const correlationId = response.headers.get('x-correlation-id') ?? undefined;
  const text = await response.text();

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const body = payload as { message?: string; error?: string } | string;
    const message =
      typeof body === 'object' && body && body.message
        ? body.message
        : `Request failed with HTTP ${response.status}`;
    throw new ApiError(response.status, message, correlationId);
  }

  return payload as T;
}

export const restaurantApi = {
  list: (): Promise<{ count: number; restaurants: RestaurantSummary[] }> =>
    request(`${RESTAURANT_BASE}/restaurants`),

  get: (id: number): Promise<Restaurant> => request(`${RESTAURANT_BASE}/restaurants/${id}`),

  health: (): Promise<{ status: string; catalogue_source?: string }> =>
    request(`${RESTAURANT_BASE}/healthz`),
};

export const orderApi = {
  create: (restaurantId: number, items: Array<{ menu_item_id: number; quantity: number }>): Promise<Order> =>
    request(`${ORDER_BASE}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, items }),
    }),

  get: (orderId: string): Promise<Order> => request(`${ORDER_BASE}/orders/${orderId}`),

  list: (): Promise<{ count: number; orders: Order[] }> => request(`${ORDER_BASE}/orders`),

  health: (): Promise<{ status: string }> => request(`${ORDER_BASE}/healthz`),
};

export function formatMoney(cents: number, currency = 'BDT'): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

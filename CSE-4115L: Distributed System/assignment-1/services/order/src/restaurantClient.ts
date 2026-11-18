import { logger } from './logger';

export interface RemoteMenuItem {
  id: number;
  name: string;
  price_cents: number;
  currency: string;
  description: string;
  available: boolean;
}

export interface RemoteRestaurant {
  id: number;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  image_url: string;
  items: RemoteMenuItem[];
}

/**
 * Result of a downstream lookup. `ok` distinguishes a *successful* lookup
 * from a *failed* one; `kind` tells the caller exactly why it failed so the
 * HTTP layer can map it to the right status code.
 */
export type LookupResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'not_found' | 'bad_request' | 'unavailable' | 'timeout' | 'invalid_response'; message: string };

export interface RestaurantClientOptions {
  baseUrl: string;
  timeoutMs: number;
  correlationId?: string;
}

/**
 * HTTP client for the Restaurant Service.
 *
 * This deliberately uses Node's built-in `fetch` (undici) with an
 * `AbortSignal.timeout` so that every call to the downstream service is
 * bounded: if Restaurant is stopped or slow, the request fails fast with a
 * 503 instead of hanging forever.
 */
export class RestaurantClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: RestaurantClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs;
  }

  get base(): string {
    return this.baseUrl;
  }

  get timeout(): number {
    return this.timeoutMs;
  }

  /** GET /restaurants/:id on the Restaurant Service. */
  async getRestaurant(restaurantId: number, correlationId: string): Promise<LookupResult<RemoteRestaurant>> {
    const url = `${this.baseUrl}/restaurants/${restaurantId}`;
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-correlation-id': correlationId,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      logger.error('restaurant_call_failed', {
        url,
        correlation_id: correlationId,
        reason: isTimeout ? 'timeout' : 'network_error',
        error: error.message,
        duration_ms: Date.now() - startedAt,
      });
      return {
        ok: false,
        kind: isTimeout ? 'timeout' : 'unavailable',
        message: isTimeout
          ? `Restaurant Service did not respond within ${this.timeoutMs}ms`
          : `Restaurant Service is unreachable: ${error.message}`,
      };
    }

    const duration = Date.now() - startedAt;

    if (response.status === 404) {
      logger.warn('restaurant_not_found', { url, correlation_id: correlationId, status: response.status });
      return { ok: false, kind: 'not_found', message: `Restaurant ${restaurantId} does not exist` };
    }

    if (response.status >= 400 && response.status < 500) {
      logger.warn('restaurant_client_error', {
        url,
        correlation_id: correlationId,
        status: response.status,
        duration_ms: duration,
      });
      return {
        ok: false,
        kind: 'bad_request',
        message: `Restaurant Service rejected the request (HTTP ${response.status})`,
      };
    }

    if (!response.ok) {
      logger.error('restaurant_server_error', {
        url,
        correlation_id: correlationId,
        status: response.status,
        duration_ms: duration,
      });
      return {
        ok: false,
        kind: 'unavailable',
        message: `Restaurant Service returned HTTP ${response.status}`,
      };
    }

    try {
      const body = (await response.json()) as RemoteRestaurant;
      if (typeof body?.id !== 'number' || !Array.isArray(body?.items)) {
        logger.error('restaurant_invalid_payload', { url, correlation_id: correlationId });
        return { ok: false, kind: 'invalid_response', message: 'Restaurant Service returned an unexpected payload' };
      }
      logger.info('restaurant_call_ok', {
        url,
        correlation_id: correlationId,
        status: response.status,
        duration_ms: duration,
      });
      return { ok: true, value: body };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('restaurant_parse_failed', { url, correlation_id: correlationId, error: error.message });
      return { ok: false, kind: 'invalid_response', message: 'Restaurant Service returned a malformed payload' };
    }
  }

  /** Lightweight liveness probe against the Restaurant Service. */
  async health(correlationId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        method: 'GET',
        headers: { 'x-correlation-id': correlationId },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

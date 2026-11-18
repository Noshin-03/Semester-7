import express, { type NextFunction, type Request, type Response } from 'express';
import { logger } from './logger';
import { OrderStore } from './orderStore';
import { RestaurantClient } from './restaurantClient';
import { generateCorrelationId, generateOrderId, type Order } from './types';
import { validateOrderRequest } from './validation';

export const CORRELATION_HEADER = 'x-correlation-id';

export interface AppOptions {
  store: OrderStore;
  restaurantClient: RestaurantClient;
  serviceName?: string;
}

export function createApp({ store, restaurantClient, serviceName = 'order-service' }: AppOptions): express.Express {
  const app = express();
  process.env.SERVICE_NAME = serviceName;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Correlation id: propagate the inbound one or mint a fresh one.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId = incoming && incoming.trim().length > 0 ? incoming.trim() : generateCorrelationId();
    res.locals.correlationId = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('http_request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
        correlation_id: res.locals.correlationId,
      });
    });
    next();
  });

  // JSON body parser error -> 400 instead of the default HTML 400.
  app.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({
        error: 'bad_request',
        message: 'Request body is not valid JSON',
        correlation_id: res.locals.correlationId,
      });
      return;
    }
    next(err);
  });

  // GET /healthz - liveness of the Order Service itself.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: serviceName,
      restaurant_service_url: restaurantClient.base,
      restaurant_timeout_ms: restaurantClient.timeout,
      uptime_s: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // GET /orders - convenience endpoint used by the admin UI (not part of the strict A1 contract).
  app.get('/orders', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await store.list();
      res.json({ count: orders.length, orders });
    } catch (err) {
      next(err);
    }
  });

  // POST /orders - create an order.
  app.post('/orders', async (req: Request, res: Response, next: NextFunction) => {
    const correlationId: string = res.locals.correlationId;

    // 1) Shape validation -> 400
    const validation = validateOrderRequest(req.body);
    if (!validation.valid) {
      logger.warn('order_rejected_validation', {
        correlation_id: correlationId,
        reason: validation.message,
        field: validation.field,
      });
      res.status(400).json({
        error: 'bad_request',
        message: validation.message,
        field: validation.field,
        correlation_id: correlationId,
      });
      return;
    }

    const { restaurant_id: restaurantId, items: requestedItems } = validation.value;

    // 2) Downstream validation against the Restaurant Service (real HTTP call).
    const lookup = await restaurantClient.getRestaurant(restaurantId, correlationId);

    if (!lookup.ok) {
      const status = mapLookupFailureToStatus(lookup.kind);
      logger.warn('order_rejected_dependency', {
        correlation_id: correlationId,
        restaurant_id: restaurantId,
        reason: lookup.message,
        kind: lookup.kind,
        mapped_status: status,
      });
      res.status(status).json({
        error: lookup.kind === 'not_found' ? 'not_found' : 'service_unavailable',
        message: lookup.message,
        correlation_id: correlationId,
      });
      return;
    }

    const restaurant = lookup.value;
    const menuById = new Map(restaurant.items.map((item) => [item.id, item]));

    // 3) Every menu item must exist and be orderable -> 404
    const unknownItem = requestedItems.find((item) => !menuById.has(item.menu_item_id));
    if (unknownItem) {
      logger.warn('order_rejected_unknown_item', {
        correlation_id: correlationId,
        restaurant_id: restaurantId,
        menu_item_id: unknownItem.menu_item_id,
      });
      res.status(404).json({
        error: 'not_found',
        message: `Menu item ${unknownItem.menu_item_id} does not exist for restaurant ${restaurantId}`,
        correlation_id: correlationId,
      });
      return;
    }

    const unavailableItem = requestedItems.find((item) => !menuById.get(item.menu_item_id)!.available);
    if (unavailableItem) {
      logger.warn('order_rejected_unavailable_item', {
        correlation_id: correlationId,
        restaurant_id: restaurantId,
        menu_item_id: unavailableItem.menu_item_id,
      });
      res.status(409).json({
        error: 'item_unavailable',
        message: `Menu item ${unavailableItem.menu_item_id} is currently unavailable`,
        correlation_id: correlationId,
      });
      return;
    }

    // 4) Build and persist the order (mutex-protected store).
    const orderItems = requestedItems.map((item) => {
      const menuItem = menuById.get(item.menu_item_id)!;
      return {
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price_cents: menuItem.price_cents,
        name: menuItem.name,
      };
    });

    const totalCents = orderItems.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
    const order: Order = {
      order_id: generateOrderId(),
      correlation_id: correlationId,
      restaurant_id: restaurantId,
      items: orderItems,
      status: 'CONFIRMED',
      total_cents: totalCents,
      currency: restaurant.items[0]?.currency ?? 'BDT',
      created_at: new Date().toISOString(),
    };

    await store.create(order);

    logger.info('order_created', {
      order_id: order.order_id,
      correlation_id: correlationId,
      restaurant_id: restaurantId,
      item_count: orderItems.length,
      total_cents: totalCents,
    });

    res.status(201).json({
      order_id: order.order_id,
      status: order.status,
      created_at: order.created_at,
      correlation_id: order.correlation_id,
      restaurant_id: order.restaurant_id,
      items: order.items,
      total_cents: order.total_cents,
      currency: order.currency,
    });
  });

  // GET /orders/:id - fetch a single order.
  app.get('/orders/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await store.get(req.params.id);
      if (!order) {
        res.status(404).json({
          error: 'not_found',
          message: `Order ${req.params.id} does not exist`,
          correlation_id: res.locals.correlationId,
        });
        return;
      }
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'not_found',
      message: `No route for ${req.method} ${req.originalUrl}`,
      correlation_id: res.locals.correlationId,
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled_error', { error: err.message, stack: err.stack });
    res.status(500).json({
      error: 'internal_error',
      message: 'Unexpected server error',
      correlation_id: res.locals.correlationId,
    });
  });

  return app;
}

/**
 * Maps a downstream failure to the HTTP status the Order Service should return.
 *  - restaurant missing       -> 404
 *  - downstream 4xx          -> 400
 *  - downstream down / 5xx    -> 503
 *  - timeout / bad payload    -> 503
 */
export function mapLookupFailureToStatus(kind: string): number {
  switch (kind) {
    case 'not_found':
      return 404;
    case 'bad_request':
      return 400;
    case 'unavailable':
    case 'timeout':
    case 'invalid_response':
      return 503;
    default:
      return 503;
  }
}

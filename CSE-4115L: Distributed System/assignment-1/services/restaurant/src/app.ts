import express, { type NextFunction, type Request, type Response } from 'express';
import { logger } from './logger';
import { toSummary } from './types';
import type { CatalogueSource } from './catalogue';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Middleware that assigns (or propagates) a correlation id for every request.
 * The same id is echoed back in the `x-correlation-id` response header so a
 * client can trace its call across services.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  const correlationId = incoming && incoming.trim().length > 0 ? incoming.trim() : generateCorrelationId();
  res.locals.correlationId = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);
  next();
}

export function generateCorrelationId(): string {
  return `cor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface AppOptions {
  catalogue: CatalogueSource;
  serviceName?: string;
}

export function createApp({ catalogue, serviceName = 'restaurant-service' }: AppOptions): express.Express {
  const app = express();
  process.env.SERVICE_NAME = serviceName;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(correlationMiddleware);

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

  // GET /healthz - liveness + readiness of the service itself.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: serviceName,
      catalogue_source: catalogue.source,
      uptime_s: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // GET /restaurants - list of restaurants (summary view).
  app.get('/restaurants', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurants = await catalogue.listRestaurants();
      res.json({
        count: restaurants.length,
        restaurants: restaurants.map(toSummary),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /restaurants/:id - single restaurant including its menu items.
  app.get('/restaurants/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params.id;
      if (!/^\d+$/.test(raw)) {
        res.status(400).json({
          error: 'bad_request',
          message: 'Restaurant id must be a positive integer',
          correlation_id: res.locals.correlationId,
        });
        return;
      }
      const id = Number(raw);
      const restaurant = await catalogue.getRestaurant(id);
      if (!restaurant) {
        res.status(404).json({
          error: 'not_found',
          message: `Restaurant ${id} does not exist`,
          correlation_id: res.locals.correlationId,
        });
        return;
      }
      res.json(restaurant);
    } catch (err) {
      next(err);
    }
  });

  // GET /restaurants/:id/items - convenience endpoint used by the admin UI.
  app.get('/restaurants/:id/items', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params.id;
      if (!/^\d+$/.test(raw)) {
        res.status(400).json({
          error: 'bad_request',
          message: 'Restaurant id must be a positive integer',
          correlation_id: res.locals.correlationId,
        });
        return;
      }
      const restaurant = await catalogue.getRestaurant(Number(raw));
      if (!restaurant) {
        res.status(404).json({
          error: 'not_found',
          message: `Restaurant ${Number(raw)} does not exist`,
          correlation_id: res.locals.correlationId,
        });
        return;
      }
      res.json({ restaurant_id: restaurant.id, count: restaurant.items.length, items: restaurant.items });
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

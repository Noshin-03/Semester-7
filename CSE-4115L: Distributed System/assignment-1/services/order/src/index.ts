import { createApp } from './app';
import { logger } from './logger';
import { OrderStore } from './orderStore';
import { RestaurantClient } from './restaurantClient';

const PORT = Number(process.env.PORT ?? process.env.ORDER_PORT ?? 8082);
const HOST = process.env.HOST ?? '0.0.0.0';
const TIMEOUT_MS = Number(process.env.RESTAURANT_TIMEOUT_MS ?? 2000);

const RESTAURANT_URL = process.env.RESTAURANT_URL ?? 'http://localhost:8081';

async function main(): Promise<void> {
  const store = new OrderStore();
  const restaurantClient = new RestaurantClient({ baseUrl: RESTAURANT_URL, timeoutMs: TIMEOUT_MS });
  const app = createApp({ store, restaurantClient, serviceName: 'order-service' });

  const server = app.listen(PORT, HOST, () => {
    logger.info('order_service_started', {
      port: PORT,
      host: HOST,
      restaurant_service_url: restaurantClient.base,
      restaurant_timeout_ms: restaurantClient.timeout,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutdown_signal', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  logger.error('fatal_startup_error', { error: err.message, stack: err.stack });
  process.exit(1);
});

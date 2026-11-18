import { createApp } from './app';
import { createCatalogue } from './catalogue';
import { logger } from './logger';

const PORT = Number(process.env.PORT ?? process.env.RESTAURANT_PORT ?? 8081);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const catalogue = await createCatalogue();
  const app = createApp({ catalogue, serviceName: 'restaurant-service' });

  const server = app.listen(PORT, HOST, () => {
    logger.info('restaurant_service_started', {
      port: PORT,
      host: HOST,
      catalogue_source: catalogue.source,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutdown_signal', { signal });
    server.close(() => {
      void catalogue.close().finally(() => process.exit(0));
    });
    // Hard stop if connections hang.
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  logger.error('fatal_startup_error', { error: err.message, stack: err.stack });
  process.exit(1);
});

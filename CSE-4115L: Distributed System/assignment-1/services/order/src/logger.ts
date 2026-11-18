/**
 * Minimal structured logger with correlation-id aware fields.
 * Mirrors the Restaurant Service logger so both services emit the same JSON
 * envelope shape, which makes cross-service log tracing trivial.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (raw in LEVEL_ORDER ? raw : 'info') as LogLevel;
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME ?? 'unknown',
    message,
    ...(meta ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

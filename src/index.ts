import { loadAfkStore, saveAfkStore } from './core/afk/afkManager.js';
import { loadSyncStore, saveSyncStore } from './core/sync/syncManager.js';
import { createLogger } from './core/logger.js';
import { startDiscordGateway, stopDiscordGateway } from './platforms/discord/client.js';
import { startFluxerGateway, stopFluxerGateway } from './platforms/fluxer/client.js';
import { config } from './config.js';

const log = createLogger('Bootstrap');

let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  log.info('Starting Otharion Bot Engine...');
  log.info(`Configured command prefix: "${config.prefix}"`);
  log.info(`Connecting to shared data directory: "${config.dataDir}"`);

  // 1. Initialize shared data stores
  loadSyncStore();
  loadAfkStore();

  // 2. Start Gateway clients
  await startDiscordGateway();
  await startFluxerGateway();

  log.info('Otharion Bot Engine successfully initialized and operational.');
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info(`Received ${signal}. Shutting down Otharion gracefully...`);

  try {
    saveSyncStore();
    saveAfkStore();
  } catch (error) {
    log.error('Error saving state during shutdown:', error);
  }

  await Promise.allSettled([stopDiscordGateway(), stopFluxerGateway()]);

  log.info('Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch((error) => {
  log.error('Fatal initialization error:', error);
  process.exit(1);
});

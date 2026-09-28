import { Client, Events } from '@fluxerjs/core';
import { createLogger } from '../../core/logger.js';
import { config } from '../../config.js';
import { handleFluxerMessage } from './messageCreate.js';

const log = createLogger('FluxerGateway');

let fluxerClient: Client | null = null;

export function getFluxerClient(): Client | null {
  return fluxerClient;
}

export async function startFluxerGateway(): Promise<Client | null> {
  if (!config.fluxerToken) {
    log.info('No Fluxer bot token provided (OTHARION_FLUXER_TOKEN). Skipping Fluxer gateway.');
    return null;
  }

  const client = new Client();

  client.once(Events.Ready, () => {
    log.info(`Fluxer gateway connected as ${client.user?.username} (${client.user?.id})`);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleFluxerMessage(message);
    } catch (error) {
      log.error('Unhandled error in Fluxer message pipeline:', error);
    }
  });

  try {
    await client.login(config.fluxerToken);
    fluxerClient = client;
    return client;
  } catch (error) {
    log.error('Failed to log in to Fluxer gateway:', error);
    return null;
  }
}

export async function stopFluxerGateway(): Promise<void> {
  if (fluxerClient) {
    await fluxerClient.destroy();
    fluxerClient = null;
    log.info('Fluxer gateway disconnected cleanly.');
  }
}

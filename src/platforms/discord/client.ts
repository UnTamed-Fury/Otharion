import { Client, GatewayIntentBits, Options, Events } from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../config.js';
import { handleDiscordMessage } from './messageCreate.js';

const log = createLogger('DiscordGateway');

let discordClient: Client | null = null;

export function getDiscordClient(): Client | null {
  return discordClient;
}

export async function startDiscordGateway(): Promise<Client | null> {
  if (!config.discordToken) {
    log.info('No Discord bot token provided (OTHARION_DISCORD_TOKEN). Skipping Discord gateway.');
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    makeCache: Options.cacheWithLimits({
      MessageManager: 50,
      GuildMemberManager: 100,
      UserManager: 100,
    }),
  });

  client.once(Events.ClientReady, (readyClient) => {
    log.info(`Discord gateway connected as ${readyClient.user.tag} (${readyClient.user.id})`);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleDiscordMessage(message);
    } catch (error) {
      log.error('Unhandled error in Discord message pipeline:', error);
    }
  });

  try {
    await client.login(config.discordToken);
    discordClient = client;
    return client;
  } catch (error) {
    log.error('Failed to log in to Discord gateway:', error);
    return null;
  }
}

export async function stopDiscordGateway(): Promise<void> {
  if (discordClient) {
    await discordClient.destroy();
    discordClient = null;
    log.info('Discord gateway disconnected cleanly.');
  }
}

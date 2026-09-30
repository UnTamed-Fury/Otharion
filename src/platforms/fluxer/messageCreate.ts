import { EmbedBuilder, type Message } from '@fluxerjs/core';
import { canNotifyAfk, clearAfk, formatDuration, getAfk, recordAfkNotification } from '../../core/afk/afkManager.js';
import { createLogger } from '../../core/logger.js';
import { parseCommand } from '../../core/pipeline.js';
import { getCommand } from '../../commands/registry.js';
import type { CommandContext } from '../../commands/types.js';
import { config } from '../../config.js';
import {
  findDiscordPairForFluxer,
  isEcho,
  recordBridgeRelayEvent,
  recordSentRelay,
  shouldRelayMessage,
} from '../../modules/bridge/bridgeEngine.js';
import { getDiscordClient } from '../discord/client.js';

const log = createLogger('FluxerPipeline');

export async function handleFluxerMessage(message: Message): Promise<void> {
  if (message.author.bot || message.webhookId) return;

  const content = message.content ?? '';
  const channelId = message.channelId;

  // 1. CROSS-PLATFORM BRIDGE RELAY TO DISCORD
  const bridgePair = findDiscordPairForFluxer(channelId);
  if (bridgePair && shouldRelayMessage(bridgePair, content, message.author.bot) && !isEcho(message.author.id, content)) {
    const dcClient = getDiscordClient();
    if (dcClient) {
      try {
        const dcChan = dcClient.channels.cache.get(bridgePair.discordChannelId);
        if (dcChan && 'send' in dcChan) {
          recordSentRelay(message.author.id, content);
          recordBridgeRelayEvent(bridgePair.id, 'fx_to_dc');
          const authorName = message.author.username || 'User';
          await (dcChan as any).send({
            content: `**[Fluxer | ${authorName}]**: ${content}`,
            allowedMentions: { parse: [] },
          });
        }
      } catch (err) {
        log.error(`Failed to relay message to Discord channel ${bridgePair.discordChannelId}:`, err);
      }
    }
  }

  // 2. AFK CLEARING
  const botId = message.client.user?.id;
  const botMentions = botId ? [`<@${botId}>`, `<@!${botId}>`] : [];
  const parsed = parseCommand(content, config.prefix, botMentions);

  const isAfkCommand = parsed ? parsed.commandName === 'afk' || parsed.commandName === 'brb' || parsed.commandName === 'away' : false;
  if (!isAfkCommand) {
    const cleared = clearAfk(message.author.id, 'fluxer', message.guildId);
    if (cleared) {
      const durationMs = Date.now() - cleared.timestamp;
      const durationText = formatDuration(durationMs);
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('Welcome Back')
        .setDescription(
          `Welcome back <@${message.author.id}>, your AFK status has been removed.\n\n` +
          `• **Duration**: ${durationText}\n` +
          `• **Reason**: ${cleared.reason}`
        );
      if (message.channel && typeof message.channel.send === 'function') {
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  // 3. MENTION NOTIFICATIONS
  const targetsToCheck = new Set<string>();
  const mentionRegex = /<@!?(\d+)>/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    const id = match[1];
    if (id && id !== message.author.id) {
      targetsToCheck.add(id);
    }
  }

  for (const targetId of targetsToCheck) {
    const afkEntry = getAfk(targetId, 'fluxer', message.guildId);
    if (afkEntry && canNotifyAfk(targetId, message.channelId)) {
      recordAfkNotification(targetId, message.channelId);
      const duration = formatDuration(Date.now() - afkEntry.timestamp);

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('User is AFK')
        .setDescription(`<@${targetId}> is currently AFK: **${afkEntry.reason}** (${duration} ago)`);

      const options = { embeds: [embed], allowedMentions: { parse: [] } };
      if (message.channel && typeof message.channel.send === 'function') {
        await message.channel.send(options).catch(() => {});
      } else {
        await message.reply(options).catch(() => {});
      }
    }
  }

  // 4. COMMAND DISPATCH
  if (!parsed) return;

  const command = getCommand(parsed.commandName);
  if (!command) return;

  const ctx: CommandContext = {
    authorId: message.author.id,
    authorTag: message.author.username || message.author.id,
    channelId,
    guildId: message.guildId || null,
    guildName: message.guild?.name || null,
    platform: 'fluxer',
    getPing(): number {
      return 50;
    },
    async reply(response): Promise<void> {
      if (typeof response === 'string') {
        if (message.channel && typeof message.channel.send === 'function') {
          await message.channel.send({ content: response });
        } else {
          await message.reply({ content: response });
        }
        return;
      }

      const embed = new EmbedBuilder().setColor(config.embedColor);
      if (response.title) embed.setTitle(response.title);
      if (response.description) embed.setDescription(response.description);
      if (response.fields && response.fields.length > 0) embed.addFields(...response.fields);

      const options = { embeds: [embed] };
      if (message.channel && typeof message.channel.send === 'function') {
        await message.channel.send(options);
      } else {
        await message.reply(options);
      }
    },
  };

  try {
    await command.execute(ctx, parsed.args, parsed.rawArgs);
    log.info(`Executed command '${command.name}' by ${message.author.username} (${message.author.id}) on Fluxer`);
  } catch (error) {
    log.error(`Error executing command '${command.name}' on Fluxer:`, error);
    await ctx.reply({
      title: 'Execution Error',
      description: 'An internal error occurred while executing the command.',
    });
  }
}

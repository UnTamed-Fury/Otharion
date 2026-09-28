import { EmbedBuilder, type Message } from '@fluxerjs/core';
import { canNotifyAfk, clearAfk, formatDuration, getAfk, recordAfkNotification } from '../../core/afk/afkManager.js';
import { createLogger } from '../../core/logger.js';
import { parseCommand } from '../../core/pipeline.js';
import { getCommand } from '../../commands/registry.js';
import type { CommandContext } from '../../commands/types.js';
import { config } from '../../config.js';
import { findDiscordChannelForFluxer, isEcho, recordSentRelay } from '../../modules/bridge/bridgeEngine.js';
import { getDiscordClient } from '../discord/client.js';

const log = createLogger('FluxerPipeline');

export async function handleFluxerMessage(message: Message): Promise<void> {
  if (message.author.bot || message.webhookId) return;

  const content = message.content ?? '';
  const channelId = message.channelId;

  // 1. CROSS-PLATFORM BRIDGE RELAY TO DISCORD
  const discordTargetChanId = findDiscordChannelForFluxer(channelId);
  if (discordTargetChanId && !isEcho(message.author.id, content)) {
    const dcClient = getDiscordClient();
    if (dcClient) {
      try {
        const dcChan = dcClient.channels.cache.get(discordTargetChanId);
        if (dcChan && 'send' in dcChan) {
          recordSentRelay(message.author.id, content);
          const authorName = message.author.username || 'User';
          await (dcChan as any).send({
            content: `**[Fluxer | ${authorName}]**: ${content}`,
            allowedMentions: { parse: [] },
          });
        }
      } catch (err) {
        log.error(`Failed to relay message to Discord channel ${discordTargetChanId}:`, err);
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
    authorTag: message.author.username || 'User',
    channelId: message.channelId,
    guildId: message.guildId,
    guildName: message.guild?.name || null,
    platform: 'fluxer',
    getPing(): number {
      return (message.client.ws as any)?.ping ?? 0;
    },
    async reply(response): Promise<void> {
      if (typeof response === 'string') {
        await message.reply({ content: response, allowedMentions: { repliedUser: false } });
        return;
      }
      const embed = new EmbedBuilder().setColor(config.embedColor);
      if (response.title) embed.setTitle(response.title);
      if (response.description) embed.setDescription(response.description);
      if (response.fields) {
        for (const f of response.fields) {
          embed.addFields(f);
        }
      }

      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    },
  };

  try {
    await command.execute(ctx, parsed.args, parsed.rawArgs);
    log.info(`Executed command '${command.name}' by ${ctx.authorTag} (${ctx.authorId}) on Fluxer`);
  } catch (error) {
    log.error(`Error executing command '${command.name}':`, error);
    await ctx.reply({
      title: 'Execution Error',
      description: 'An internal error occurred while executing the command.',
    });
  }
}

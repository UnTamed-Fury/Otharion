import { EmbedBuilder, type Message, PermissionFlagsBits } from 'discord.js';
import { canNotifyAfk, clearAfk, formatDuration, getAfk, recordAfkNotification } from '../../core/afk/afkManager.js';
import { createLogger } from '../../core/logger.js';
import { parseCommand } from '../../core/pipeline.js';
import { getCommand } from '../../commands/registry.js';
import type { CommandContext } from '../../commands/types.js';
import { config } from '../../config.js';
import { evaluateHoneypotTrigger } from '../../modules/honeypot/honeypotEngine.js';
import { handleCountingMessage } from '../../modules/counting/countingEngine.js';
import { handleStickyMessage, updateStickyLastMessageId } from '../../modules/sticky/stickyEngine.js';
import { findFluxerChannelForDiscord, isEcho, recordSentRelay } from '../../modules/bridge/bridgeEngine.js';
import { getFluxerClient } from '../fluxer/client.js';

const log = createLogger('DiscordPipeline');

export async function handleDiscordMessage(message: Message): Promise<void> {
  if (message.author.bot || message.webhookId) return;

  const content = message.content ?? '';
  const guildId = message.guildId;
  const channelId = message.channelId;

  // 1. HONEYPOT TRAP EVALUATION
  if (guildId) {
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
    const userRoles = message.member?.roles.cache ? Array.from(message.member.roles.cache.keys()) : [];

    const verdict = evaluateHoneypotTrigger({
      guildId,
      channelId,
      userId: message.author.id,
      userTag: message.author.tag,
      memberJoinedTimestamp: message.member?.joinedTimestamp ?? null,
      accountCreatedTimestamp: message.author.createdTimestamp,
      userRoles,
      isAdmin,
      content,
    });

    if (verdict.triggered) {
      // Delete violating message immediately
      await message.delete().catch(() => {});

      // Apply penalty
      try {
        if (verdict.action === 'ban' && message.member?.bannable) {
          await message.member.ban({
            deleteMessageSeconds: verdict.purgeMessageDays * 86400,
            reason: verdict.reason,
          });
        } else if (verdict.action === 'kick' && message.member?.kickable) {
          await message.member.kick(verdict.reason);
        } else if (verdict.action === 'timeout' && message.member?.moderatable) {
          await message.member.timeout(verdict.timeoutDurationMin * 60 * 1000, verdict.reason);
        }
      } catch (err) {
        log.error(`Failed to enforce honeypot action '${verdict.action}' on ${message.author.id}:`, err);
      }

      // Dispatch security audit alert
      if (verdict.alertChannelId) {
        const alertChannel = message.client.channels.cache.get(verdict.alertChannelId);
        if (alertChannel && 'send' in alertChannel) {
          const alertEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Honeypot Security Violation Detected')
            .setDescription(
              `An unauthorized account posted inside honeypot trap <#${channelId}>.\n\n` +
              `• **Offender**: <@${message.author.id}> (\`${message.author.tag}\` - \`${message.author.id}\`)\n` +
              `• **Account Created**: <t:${Math.floor(message.author.createdTimestamp / 1000)}:R>\n` +
              `• **Enforced Action**: **${verdict.action.toUpperCase()}**\n` +
              `• **Message Snippet**: \`${content.slice(0, 150)}\``
            )
            .setTimestamp();

          await (alertChannel as any).send({ embeds: [alertEmbed] }).catch(() => {});
        }
      }
      return;
    }
  }

  // 2. COUNTING CHANNEL EVALUATION
  if (guildId) {
    const countResult = handleCountingMessage(guildId, channelId, message.author.id, content);
    if (!countResult.ignored) {
      if (countResult.valid) {
        await message.react('✅').catch(() => {});
        return;
      } else if (countResult.ruined) {
        await message.react('❌').catch(() => {});
        const reasonText = countResult.reason === 'double_count'
          ? 'You cannot count twice in a row!'
          : `Expected **${countResult.expectedNumber}**, but you sent **${countResult.receivedNumber}**!`;

        let timeoutNotice = '';
        if (countResult.timeoutMinutes > 0 && message.member?.moderatable) {
          await message.member.timeout(countResult.timeoutMinutes * 60 * 1000, 'Ruined sequential count').catch(() => {});
          timeoutNotice = `\n*Hardcore penalty applied: ${countResult.timeoutMinutes}m timeout.*`;
        }

        const embed = new EmbedBuilder()
          .setColor(0xcc0000)
          .setTitle('Count Ruined!')
          .setDescription(
            `<@${message.author.id}> ruined the count at **${countResult.receivedNumber}**.\n` +
            `${reasonText}\n\n` +
            `• **Next Valid Number**: **1**\n` +
            `• **Server High Score**: **${countResult.highScore}**` +
            timeoutNotice
          );

        if (message.channel && 'send' in message.channel) {
          await (message.channel as any).send({ embeds: [embed] }).catch(() => {});
        }
        return;
      }
    }
  }

  // 3. CROSS-PLATFORM BRIDGE RELAY
  const fluxerTargetChanId = findFluxerChannelForDiscord(channelId);
  if (fluxerTargetChanId && !isEcho(message.author.id, content, message.attachments.size)) {
    const fluxerClient = getFluxerClient();
    if (fluxerClient) {
      try {
        const fxChan = fluxerClient.channels.cache.get(fluxerTargetChanId);
        if (fxChan && typeof (fxChan as any).send === 'function') {
          recordSentRelay(message.author.id, content, message.attachments.size);
          const authorName = message.member?.displayName || message.author.username;
          await (fxChan as any).send({
            content: `**[Discord | ${authorName}]**: ${content}`,
          });
        }
      } catch (err) {
        log.error(`Failed to relay message to Fluxer channel ${fluxerTargetChanId}:`, err);
      }
    }
  }

  // 4. AFK STATUS REMOVAL (if author was AFK)
  const botId = message.client.user?.id;
  const botMentions = botId ? [`<@${botId}>`, `<@!${botId}>`] : [];
  const parsed = parseCommand(content, config.prefix, botMentions);

  const isAfkCommand = parsed ? parsed.commandName === 'afk' || parsed.commandName === 'brb' || parsed.commandName === 'away' : false;
  if (!isAfkCommand) {
    const cleared = clearAfk(message.author.id, 'discord', guildId);
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
      if (message.channel && 'send' in message.channel) {
        await (message.channel as any).send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  // 5. MENTION SUPPRESSION & AFK NOTIFICATIONS
  const targetsToCheck = new Set<string>();
  for (const [userId, user] of message.mentions.users) {
    if (userId !== message.author.id && !user.bot) {
      targetsToCheck.add(userId);
    }
  }

  const mentionRegex = /<@!?(\d+)>/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    const id = match[1];
    if (id && id !== message.author.id) {
      targetsToCheck.add(id);
    }
  }

  for (const targetId of targetsToCheck) {
    const afkEntry = getAfk(targetId, 'discord', guildId);
    if (afkEntry && canNotifyAfk(targetId, channelId)) {
      recordAfkNotification(targetId, channelId);
      const targetUser = message.mentions.users.get(targetId);
      const displayName = targetUser?.displayName || targetUser?.username || 'User';
      const duration = formatDuration(Date.now() - afkEntry.timestamp);

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${displayName} is AFK`)
        .setDescription(`<@${targetId}> is currently AFK: **${afkEntry.reason}** (${duration} ago)`);

      if (message.channel && 'send' in message.channel) {
        await (message.channel as any).send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
      }
    }
  }

  // 6. STICKY MESSAGE EVALUATION
  if (guildId) {
    const stickyEval = handleStickyMessage(guildId, channelId);
    if (stickyEval.shouldPost && stickyEval.messageToPost) {
      // Delete previous message if cached
      if (stickyEval.previousMessageId && message.channel && 'messages' in message.channel) {
        try {
          const oldMsg = await (message.channel as any).messages.fetch(stickyEval.previousMessageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        } catch {
          // Ignored
        }
      }

      // Post refreshed sticky message
      if (message.channel && 'send' in message.channel) {
        const stickyEmbed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setDescription(`📌 ${stickyEval.messageToPost}`);

        const sent = await (message.channel as any).send({ embeds: [stickyEmbed] }).catch(() => null);
        if (sent) {
          updateStickyLastMessageId(guildId, channelId, sent.id);
        }
      }
    }
  }

  // 7. COMMAND DISPATCH
  if (!parsed) return;

  const command = getCommand(parsed.commandName);
  if (!command) return;

  const ctx: CommandContext = {
    authorId: message.author.id,
    authorTag: message.author.tag,
    channelId,
    guildId,
    guildName: message.guild?.name || null,
    platform: 'discord',
    getPing(): number {
      return message.client.ws.ping;
    },
    async reply(response): Promise<void> {
      if (typeof response === 'string') {
        await message.reply({ content: response, allowedMentions: { repliedUser: false } });
        return;
      }
      const embed = new EmbedBuilder().setColor(config.embedColor);
      if (response.title) embed.setTitle(response.title);
      if (response.description) embed.setDescription(response.description);
      if (response.fields) embed.addFields(response.fields);

      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    },
  };

  try {
    await command.execute(ctx, parsed.args, parsed.rawArgs);
    log.info(`Executed command '${command.name}' by ${message.author.tag} (${message.author.id}) on Discord`);
  } catch (error) {
    log.error(`Error executing command '${command.name}':`, error);
    await ctx.reply({
      title: 'Execution Error',
      description: 'An internal error occurred while executing the command.',
    });
  }
}

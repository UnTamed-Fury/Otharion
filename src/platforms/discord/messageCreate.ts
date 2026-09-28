import { EmbedBuilder, type Message } from 'discord.js';
import { canNotifyAfk, clearAfk, formatDuration, getAfk, recordAfkNotification } from '../../core/afk/afkManager.js';
import { createLogger } from '../../core/logger.js';
import { parseCommand } from '../../core/pipeline.js';
import { getCommand } from '../../commands/registry.js';
import type { CommandContext } from '../../commands/types.js';
import { config } from '../../config.js';

const log = createLogger('DiscordPipeline');

export async function handleDiscordMessage(message: Message): Promise<void> {
  if (message.author.bot || message.webhookId) return;

  const content = message.content ?? '';
  const botId = message.client.user?.id;
  const botMentions = botId ? [`<@${botId}>`, `<@!${botId}>`] : [];
  const parsed = parseCommand(content, config.prefix, botMentions);

  // 1. If author was AFK, clear their AFK (unless setting AFK)
  const isAfkCommand = parsed ? parsed.commandName === 'afk' || parsed.commandName === 'brb' || parsed.commandName === 'away' : false;
  if (!isAfkCommand) {
    const cleared = clearAfk(message.author.id, 'discord', message.guildId);
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

  // 2. Mention notifications
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
    const afkEntry = getAfk(targetId, 'discord', message.guildId);
    if (afkEntry && canNotifyAfk(targetId, message.channelId)) {
      recordAfkNotification(targetId, message.channelId);
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

  // 3. Command execution
  if (!parsed) return;

  const command = getCommand(parsed.commandName);
  if (!command) return;

  const ctx: CommandContext = {
    authorId: message.author.id,
    authorTag: message.author.tag,
    channelId: message.channelId,
    guildId: message.guildId,
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

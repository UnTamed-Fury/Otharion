import {
  clearAllStickyMessages,
  configureStickyChannel,
  getAllStickyRecords,
  getStickyMessage,
  removeStickyMessage,
  setStickyEmbed,
  setStickyMessage,
} from '../modules/sticky/stickyEngine.js';
import type { Command, CommandContext } from './types.js';

export const stickyCommand: Command = {
  name: 'sticky',
  aliases: ['stick', 'pin'],
  description: 'Manage debounced sticky messages pinned to the bottom of channels with embed and auto-delete support',
  usage: 'o.sticky [set #channel <message> | embed #channel <title> | <desc> | config #channel [args] | remove #channel | clear | list | preview #channel]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply('Sticky messages can only be managed inside a server.');
      return;
    }

    const sub = (args[0] || 'list').toLowerCase();
    const guildId = ctx.guildId;

    if (sub === 'set' || sub === 'add') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const message = args.slice(2).join(' ').trim();

      if (!message) {
        await ctx.reply('Please specify the message content to stick. Example: `o.sticky set #chat Keep it civil!`');
        return;
      }

      const record = setStickyMessage(guildId, channelId, message, 10, 5, { isEmbed: false, deletePrevious: true });
      await ctx.reply({
        title: 'Sticky Message Configured',
        description:
          `Configured debounced sticky message for <#${channelId}>:\n\n` +
          `> ${message}\n\n` +
          `• **Debounce Interval**: **${record.debounceSeconds}s**\n` +
          `• **Min Messages**: **${record.minMessages}**\n` +
          `• **Auto-Delete Previous**: \`${record.deletePrevious ? 'ENABLED' : 'DISABLED'}\`\n\n` +
          `*The message will automatically refresh at the bottom after chat activity.*`,
      });
      return;
    }

    if (sub === 'embed') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const fullText = args.slice(2).join(' ').trim();

      if (!fullText) {
        await ctx.reply('Usage: `o.sticky embed #channel <Title> | <Description>`\nExample: `o.sticky embed #announcements Server Rules | Please read and follow all server rules.`');
        return;
      }

      const parts = fullText.split('|');
      const title = parts[0]?.trim() || 'Notice';
      const desc = parts.slice(1).join('|').trim() || title;

      const record = setStickyEmbed(guildId, channelId, title, desc, null, { deletePrevious: true });
      await ctx.reply({
        title: 'Sticky Embed Configured',
        description:
          `Configured sticky embed card for <#${channelId}>:\n\n` +
          `__**${title}**__\n> ${desc}\n\n` +
          `• **Debounce Interval**: **${record.debounceSeconds}s**\n` +
          `• **Min Messages**: **${record.minMessages}**\n` +
          `• **Auto-Delete Previous**: \`${record.deletePrevious ? 'ENABLED' : 'DISABLED'}\``,
      });
      return;
    }

    if (sub === 'config') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const key = (args[2] || '').toLowerCase();
      const val = (args[3] || '').toLowerCase();

      if (!key || !val) {
        await ctx.reply('Usage: `o.sticky config #channel <cooldown|minmsgs|deleteprev|mode> <value>`\nExample: `o.sticky config #chat cooldown 15`');
        return;
      }

      const updated = configureStickyChannel(guildId, channelId, (r) => {
        if (key === 'cooldown' || key === 'debounce') {
          r.debounceSeconds = Math.max(5, parseInt(val, 10) || 10);
        } else if (key === 'minmsgs' || key === 'msgs') {
          r.minMessages = Math.max(1, parseInt(val, 10) || 5);
        } else if (key === 'deleteprev' || key === 'autodelete') {
          r.deletePrevious = val === 'on' || val === 'true';
        } else if (key === 'mode') {
          if (['either', 'both', 'messages', 'time'].includes(val)) {
            r.cooldownMode = val as any;
          }
        }
      });

      if (!updated) {
        await ctx.reply(`No active sticky message was found for <#${channelId}>. Create one first with \`o.sticky set\`.`);
        return;
      }

      await ctx.reply({
        title: 'Sticky Settings Updated',
        description:
          `Updated configuration for <#${channelId}>:\n\n` +
          `• **Debounce Cooldown**: **${updated.debounceSeconds}s**\n` +
          `• **Min Chat Messages**: **${updated.minMessages}**\n` +
          `• **Cooldown Mode**: \`${updated.cooldownMode}\`\n` +
          `• **Auto-Delete Previous**: \`${updated.deletePrevious ? 'ENABLED' : 'DISABLED'}\``,
      });
      return;
    }

    if (sub === 'remove' || sub === 'delete') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const removed = removeStickyMessage(guildId, channelId);

      if (removed) {
        await ctx.reply({
          title: 'Sticky Message Removed',
          description: `Removed sticky message for <#${channelId}>.`,
        });
      } else {
        await ctx.reply({
          title: 'Sticky Message Not Found',
          description: `No active sticky message was found for <#${channelId}>.`,
        });
      }
      return;
    }

    if (sub === 'clear') {
      const count = clearAllStickyMessages(guildId);
      await ctx.reply({
        title: 'All Sticky Messages Cleared',
        description: `Cleared all **${count}** sticky messages configured across this server.`,
      });
      return;
    }

    if (sub === 'preview') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const record = getStickyMessage(guildId, channelId);
      if (!record) {
        await ctx.reply(`No sticky message configured for <#${channelId}>.`);
        return;
      }

      await ctx.reply({
        title: record.isEmbed ? (record.embedTitle || 'Sticky Preview') : 'Sticky Message Preview',
        description: record.content,
      });
      return;
    }

    // Default: list
    const all = getAllStickyRecords(guildId);
    const keys = Object.keys(all);

    if (keys.length === 0) {
      await ctx.reply({
        title: 'Active Sticky Messages',
        description: 'No active sticky messages configured in this server. Use `o.sticky set #chan <msg>` or `o.sticky embed #chan <title> | <desc>` to create one.',
      });
      return;
    }

    const list = keys
      .map((chId) => {
        const item = all[chId]!;
        const typeLabel = item.isEmbed ? 'Embed' : 'Text';
        return `• <#${chId}> [${typeLabel} | ${item.cooldownMode}]: "${item.content.slice(0, 60)}${item.content.length > 60 ? '...' : ''}" (Cooldown: ${item.debounceSeconds}s, Min: ${item.minMessages})`;
      })
      .join('\n');

    await ctx.reply({
      title: 'Active Sticky Messages',
      description: list,
    });
  },
};

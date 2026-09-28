import {
  getAllStickyMessages,
  removeStickyMessage,
  setStickyMessage,
} from '../modules/sticky/stickyEngine.js';
import type { Command, CommandContext } from './types.js';

export const stickyCommand: Command = {
  name: 'sticky',
  aliases: ['stick', 'pin'],
  description: 'Manage debounced sticky messages pinned to the bottom of channels',
  usage: 'o.sticky [set #channel <message> | remove #channel | list]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply('Sticky messages can only be managed inside a server.');
      return;
    }

    const sub = (args[0] || 'list').toLowerCase();

    if (sub === 'set' || sub === 'add') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const message = args.slice(2).join(' ').trim();

      if (!message) {
        await ctx.reply('Please specify the message content to stick. Example: `o.sticky set #chat Keep it civil!`');
        return;
      }

      setStickyMessage(ctx.guildId, channelId, message);
      await ctx.reply({
        title: 'Sticky Message Configured',
        description:
          `Configured debounced sticky message for <#${channelId}>:\n\n` +
          `> ${message}\n\n` +
          `*The message will automatically refresh at the bottom after 5 chat messages or 10s cooldown.*`,
      });
      return;
    }

    if (sub === 'remove' || sub === 'delete') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const removed = removeStickyMessage(ctx.guildId, channelId);

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

    // Default: list
    const all = getAllStickyMessages(ctx.guildId);
    const keys = Object.keys(all);

    if (keys.length === 0) {
      await ctx.reply({
        title: 'Active Sticky Messages',
        description: 'No active sticky messages configured in this server. Use `o.sticky set #chan <msg>` to create one.',
      });
      return;
    }

    const list = keys
      .map((chId) => `• <#${chId}>: "${all[chId]!.message.slice(0, 80)}${all[chId]!.message.length > 80 ? '...' : ''}"`)
      .join('\n');

    await ctx.reply({
      title: 'Active Sticky Messages',
      description: list,
    });
  },
};

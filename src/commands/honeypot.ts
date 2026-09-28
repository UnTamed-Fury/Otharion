import { getGuildSettings } from '../core/selfHostConfig.js';
import {
  addHoneypotChannel,
  removeHoneypotChannel,
  setHoneypotAction,
  setHoneypotAlertChannel,
  setHoneypotJoinWindow,
  toggleHoneypotDm,
} from '../modules/honeypot/honeypotEngine.js';
import type { Command, CommandContext } from './types.js';

export const honeypotCommand: Command = {
  name: 'honeypot',
  aliases: ['trap', 'security'],
  description: 'Ultra-configurable Honeypot security and anti-raid trap system',
  usage: 'o.honeypot [add #chan | remove #chan | action <ban|kick|timeout|quarantine> | log #chan | status]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply('Honeypot security can only be configured inside a server.');
      return;
    }

    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'add' || sub === 'set') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const honeypot = addHoneypotChannel(ctx.guildId, channelId);

      await ctx.reply({
        title: 'Honeypot Channel Armed',
        description:
          `Channel <#${channelId}> has been armed as a **Honeypot Security Trap**.\n\n` +
          `• **Action on Trigger**: **${honeypot.action.toUpperCase()}**\n` +
          `• **Message Purge**: ${honeypot.purgeMessageDays} day(s)\n` +
          `• **Total Trap Channels**: ${honeypot.channels.length}\n\n` +
          `*Any unauthorized account posting in this channel will be immediately penalized.*`,
      });
      return;
    }

    if (sub === 'remove' || sub === 'delete') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const honeypot = removeHoneypotChannel(ctx.guildId, channelId);

      await ctx.reply({
        title: 'Honeypot Channel Disarmed',
        description: `Channel <#${channelId}> removed from honeypot monitoring. Remaining active traps: ${honeypot.channels.length}`,
      });
      return;
    }

    if (sub === 'action') {
      const act = (args[1] || '').toLowerCase() as 'ban' | 'kick' | 'timeout' | 'quarantine';
      if (!['ban', 'kick', 'timeout', 'quarantine'].includes(act)) {
        await ctx.reply('Invalid action. Choose from: `ban`, `kick`, `timeout`, `quarantine`.');
        return;
      }
      const timeoutMin = parseInt(args[2] || '1440', 10);
      const purgeDays = parseInt(args[3] || '1', 10);

      const honeypot = setHoneypotAction(ctx.guildId, act, timeoutMin, purgeDays);
      await ctx.reply({
        title: 'Honeypot Action Updated',
        description:
          `Default punishment updated to: **${honeypot.action.toUpperCase()}**\n` +
          `• **Timeout Duration**: ${honeypot.timeoutDurationMin} minutes\n` +
          `• **Message Purge History**: ${honeypot.purgeMessageDays} day(s)`,
      });
      return;
    }

    if (sub === 'log' || sub === 'alert') {
      const channelId = args[1] ? args[1].replace(/[<#>]/g, '') : null;
      const honeypot = setHoneypotAlertChannel(ctx.guildId, channelId);

      await ctx.reply({
        title: 'Honeypot Log Channel Set',
        description: channelId
          ? `Honeypot audit alerts will be dispatched to <#${channelId}>.`
          : 'Honeypot audit alerts disabled.',
      });
      return;
    }

    if (sub === 'dm') {
      const enabled = (args[1] || 'on').toLowerCase() === 'on';
      toggleHoneypotDm(ctx.guildId, enabled);
      await ctx.reply({
        title: 'Honeypot DM Notice Updated',
        description: `Pre-action DM notification: **${enabled ? 'ENABLED' : 'DISABLED'}**.`,
      });
      return;
    }

    // Default: status
    const honeypot = getGuildSettings(ctx.guildId).honeypot;
    const trapChannels = honeypot.channels.length > 0 ? honeypot.channels.map((c: string) => `<#${c}>`).join(', ') : 'None';
    const logChannel = honeypot.alertChannelId ? `<#${honeypot.alertChannelId}>` : 'None';

    await ctx.reply({
      title: 'Honeypot Security Matrix Status',
      description:
        `• **Module Status**: ${honeypot.enabled ? 'ACTIVE' : 'STANDBY'}\n` +
        `• **Active Trap Channels**: ${trapChannels}\n` +
        `• **Enforcement Action**: **${honeypot.action.toUpperCase()}**\n` +
        `• **Timeout Length**: ${honeypot.timeoutDurationMin} minutes\n` +
        `• **Message Purge Days**: ${honeypot.purgeMessageDays} day(s)\n` +
        `• **Incident Alert Log**: ${logChannel}\n` +
        `• **DM Notice**: ${honeypot.dmNotice ? 'Yes' : 'No'}\n` +
        `• **Join Window Filter**: ${honeypot.triggerOnJoinSeconds > 0 ? `${honeypot.triggerOnJoinSeconds}s` : 'All accounts'}`,
    });
  },
};

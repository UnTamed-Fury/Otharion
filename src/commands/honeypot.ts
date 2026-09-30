import { getOtharionDb } from '../core/db/database.js';
import {
  addHoneypotChannel,
  addHoneypotImmuneRole,
  addHoneypotImmuneUser,
  getHoneypotIncidents,
  getHoneypotStats,
  removeHoneypotChannel,
  removeHoneypotImmuneRole,
  removeHoneypotImmuneUser,
  setHoneypotAccountAge,
  setHoneypotAction,
  setHoneypotAlertChannel,
  setHoneypotJoinWindow,
  setHoneypotQuarantineRole,
  toggleHoneypotDm,
} from '../modules/honeypot/honeypotEngine.js';
import type { Command, CommandContext } from './types.js';

export const honeypotCommand: Command = {
  name: 'honeypot',
  aliases: ['trap', 'security'],
  description: 'Ultra-configurable Honeypot anti-raid security matrix and audit system',
  usage: 'o.honeypot [add #chan | remove #chan | action <ban|kick|timeout|quarantine|warn> | timeout <min> | purge <days> | role <@role> | immune <@role|@user> | log #chan | dm <on|off> | age <days> | history | stats | status]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply('Honeypot security can only be configured inside a server.');
      return;
    }

    const sub = (args[0] || 'status').toLowerCase();
    const guildId = ctx.guildId;
    const db = getOtharionDb();

    if (sub === 'add' || sub === 'set') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const honeypot = addHoneypotChannel(guildId, channelId);

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
      const honeypot = removeHoneypotChannel(guildId, channelId);

      await ctx.reply({
        title: 'Honeypot Channel Disarmed',
        description: `Channel <#${channelId}> removed from honeypot monitoring. Remaining active traps: ${honeypot.channels.length}`,
      });
      return;
    }

    if (sub === 'action') {
      const act = (args[1] || '').toLowerCase() as any;
      if (!['ban', 'kick', 'timeout', 'quarantine', 'warn'].includes(act)) {
        await ctx.reply('Invalid action. Choose from: `ban`, `kick`, `timeout`, `quarantine`, `warn`.');
        return;
      }
      const timeoutMin = parseInt(args[2] || '1440', 10);
      const purgeDays = parseInt(args[3] || '1', 10);

      const honeypot = setHoneypotAction(guildId, act, timeoutMin, purgeDays);
      await ctx.reply({
        title: 'Honeypot Action Updated',
        description:
          `Default punishment updated to: **${honeypot.action.toUpperCase()}**\n` +
          `• **Timeout Duration**: ${honeypot.timeoutDurationMin} minutes\n` +
          `• **Message Purge History**: ${honeypot.purgeMessageDays} day(s)`,
      });
      return;
    }

    if (sub === 'timeout') {
      const min = parseInt(args[1] || '1440', 10);
      db.updateHoneypotConfig(guildId, (h) => { h.timeoutDurationMin = Math.max(1, min); });
      await ctx.reply(`Honeypot timeout duration set to **${min}** minutes.`);
      return;
    }

    if (sub === 'purge') {
      const days = parseInt(args[1] || '1', 10);
      db.updateHoneypotConfig(guildId, (h) => { h.purgeMessageDays = Math.max(0, days); });
      await ctx.reply(`Honeypot message purge history set to **${days}** day(s).`);
      return;
    }

    if (sub === 'role' || sub === 'quarantinerole') {
      const roleId = args[1]?.replace(/[<@&>]/g, '') || null;
      setHoneypotQuarantineRole(guildId, roleId);
      await ctx.reply({
        title: 'Honeypot Quarantine Role Configured',
        description: roleId
          ? `Quarantine penalty will assign <@&${roleId}> to isolate offenders.`
          : 'Quarantine role cleared.',
      });
      return;
    }

    if (sub === 'immune') {
      const rawTarget = args[1] || '';
      const cleanId = rawTarget.replace(/[<@!&>]/g, '');
      if (!cleanId) {
        await ctx.reply('Usage: `o.honeypot immune <@role|@user>`');
        return;
      }

      if (rawTarget.includes('&')) {
        addHoneypotImmuneRole(guildId, cleanId);
        await ctx.reply(`Added role <@&${cleanId}> to honeypot immunity whitelist.`);
      } else {
        addHoneypotImmuneUser(guildId, cleanId);
        await ctx.reply(`Added user <@${cleanId}> to honeypot immunity whitelist.`);
      }
      return;
    }

    if (sub === 'removeimmune') {
      const rawTarget = args[1] || '';
      const cleanId = rawTarget.replace(/[<@!&>]/g, '');
      if (!cleanId) {
        await ctx.reply('Usage: `o.honeypot removeimmune <@role|@user>`');
        return;
      }

      if (rawTarget.includes('&')) {
        removeHoneypotImmuneRole(guildId, cleanId);
        await ctx.reply(`Removed role <@&${cleanId}> from honeypot immunity whitelist.`);
      } else {
        removeHoneypotImmuneUser(guildId, cleanId);
        await ctx.reply(`Removed user <@${cleanId}> from honeypot immunity whitelist.`);
      }
      return;
    }

    if (sub === 'log' || sub === 'alert') {
      const channelId = args[1] ? args[1].replace(/[<#>]/g, '') : null;
      const honeypot = setHoneypotAlertChannel(guildId, channelId);

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
      toggleHoneypotDm(guildId, enabled);
      await ctx.reply({
        title: 'Honeypot DM Notice Updated',
        description: `Pre-action DM notification: **${enabled ? 'ENABLED' : 'DISABLED'}**.`,
      });
      return;
    }

    if (sub === 'window' || sub === 'joinwindow') {
      const sec = parseInt(args[1] || '0', 10);
      setHoneypotJoinWindow(guildId, sec);
      await ctx.reply({
        title: 'Honeypot Join Window Filter',
        description: sec > 0
          ? `Only accounts joining within the last **${sec} seconds** will trigger the trap.`
          : 'Join window disabled (all members without immunity trigger the trap).',
      });
      return;
    }

    if (sub === 'age') {
      const days = parseInt(args[1] || '0', 10);
      setHoneypotAccountAge(guildId, days);
      await ctx.reply({
        title: 'Honeypot Account Age Filter',
        description: days > 0
          ? `Only accounts created less than **${days} days ago** will be penalized.`
          : 'Account age filter disabled (accounts of any age can trigger).',
      });
      return;
    }

    if (sub === 'history') {
      const history = getHoneypotIncidents(guildId);
      if (history.length === 0) {
        await ctx.reply({
          title: 'Honeypot Security Audit Log',
          description: 'No security incidents recorded in this server.',
        });
        return;
      }

      const list = history.slice(0, 10).map((inc) => {
        return `• <t:${Math.floor(inc.timestamp / 1000)}:R>: **${inc.actionTaken.toUpperCase()}** on <@${inc.userId}> (\`${inc.userTag}\`) in <#${inc.channelId}> — \`${inc.messageContentSnippet.slice(0, 40)}\``;
      }).join('\n');

      await ctx.reply({
        title: 'Honeypot Security Audit Log (Last 10 Incidents)',
        description: list,
      });
      return;
    }

    if (sub === 'stats') {
      const h = getHoneypotStats(guildId);
      const acts = h.stats.actionsTaken;
      await ctx.reply({
        title: 'Honeypot Security Matrix Analytics',
        description:
          `• **Total Traps Armed**: **${h.channels.length}**\n` +
          `• **Total Violations Detected**: **${h.stats.totalTriggers}**\n\n` +
          `__**Enforced Punishments Breakdown**__\n` +
          `• **Bans**: ${acts.ban || 0}\n` +
          `• **Kicks**: ${acts.kick || 0}\n` +
          `• **Timeouts**: ${acts.timeout || 0}\n` +
          `• **Quarantines**: ${acts.quarantine || 0}\n` +
          `• **Warnings**: ${acts.warn || 0}`,
      });
      return;
    }

    // Default: status
    const h = getHoneypotStats(guildId);
    const trapChannels = h.channels.length > 0 ? h.channels.map((c) => `<#${c}>`).join(', ') : 'None';
    const logChannel = h.alertChannelId ? `<#${h.alertChannelId}>` : 'None';
    const quarantineRole = h.quarantineRoleId ? `<@&${h.quarantineRoleId}>` : 'None';
    const immuneRoles = h.immuneRoleIds.length > 0 ? h.immuneRoleIds.map((r) => `<@&${r}>`).join(', ') : 'None';

    await ctx.reply({
      title: 'Honeypot Security Matrix Status',
      description:
        `• **Status**: \`${h.enabled ? 'ACTIVE & ARMED' : 'STANDBY'}\`\n` +
        `• **Trap Channels**: ${trapChannels}\n` +
        `• **Punishment Action**: **${h.action.toUpperCase()}**\n` +
        `• **Timeout Duration**: ${h.timeoutDurationMin} min | **Purge**: ${h.purgeMessageDays} day(s)\n` +
        `• **Quarantine Role**: ${quarantineRole}\n` +
        `• **Audit Alert Channel**: ${logChannel}\n` +
        `• **Immune Roles**: ${immuneRoles}\n` +
        `• **DM Notice**: \`${h.dmNotice ? 'ENABLED' : 'DISABLED'}\`\n` +
        `• **Join Window**: ${h.triggerOnJoinSeconds > 0 ? `${h.triggerOnJoinSeconds}s` : 'Disabled'}\n` +
        `• **Account Age Filter**: ${h.accountAgeThresholdDays > 0 ? `${h.accountAgeThresholdDays}d` : 'Disabled'}\n` +
        `• **Total Incidents Prevented**: **${h.stats.totalTriggers}**\n\n` +
        `*Commands*: \`o.honeypot add #chan\` | \`o.honeypot action <type>\` | \`o.honeypot role <@role>\` | \`o.honeypot log #chan\` | \`o.honeypot history\``,
    });
  },
};

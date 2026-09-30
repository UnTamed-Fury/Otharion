import { getOtharionDb } from '../core/db/database.js';
import {
  resetCounting,
  setCountingAutoDeleteFail,
  setCountingChannel,
  setCountingChatAllowed,
  setCountingCurrentCount,
  setCountingMathAllowed,
  setCountingReactions,
  setHardcoreTimeout,
} from '../modules/counting/countingEngine.js';
import type { Command, CommandContext } from './types.js';

export const countingCommand: Command = {
  name: 'counting',
  aliases: ['count'],
  description: 'Configure and monitor sequential counting channel with hardcore penalties and math',
  usage: 'o.counting [setup #channel | hardcore <min|off> | math <on|off> | chat <allow|deny> | autodelete <on|off> | reactions <ok> <err> <star> | setcount <num> | reset | leaderboard | status]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply('Counting channel settings can only be managed inside a server.');
      return;
    }

    const sub = (args[0] || 'status').toLowerCase();
    const guildId = ctx.guildId;
    const db = getOtharionDb();

    if (sub === 'setup' || sub === 'set') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const counting = setCountingChannel(guildId, channelId);

      await ctx.reply({
        title: 'Counting Channel Configured',
        description:
          `Counting channel set to <#${channelId}>.\n\n` +
          `• **Current Count**: **${counting.currentCount}**\n` +
          `• **Server High Score**: **${counting.highScore}**\n` +
          `• **Hardcore Mode**: ${counting.hardcoreTimeoutMin > 0 ? `**${counting.hardcoreTimeoutMin}m timeout**` : 'Off'}\n\n` +
          `Members must count consecutively from **1**. Double counting by the same user will ruin the count.`,
      });
      return;
    }

    if (sub === 'hardcore') {
      const val = (args[1] || '').toLowerCase();
      let minutes = 0;
      if (val === 'off' || val === '0') {
        minutes = 0;
      } else {
        minutes = parseInt(val, 10) || 5;
      }

      setHardcoreTimeout(guildId, minutes);
      await ctx.reply({
        title: 'Counting Hardcore Mode Updated',
        description: minutes > 0
          ? `Hardcore mode **ENABLED**: Users who break the count will receive a **${minutes}-minute timeout**.`
          : 'Hardcore mode **DISABLED**: Users who break the count will not be timed out.',
      });
      return;
    }

    if (sub === 'math') {
      const val = (args[1] || 'on').toLowerCase();
      const enabled = val === 'on' || val === 'true' || val === 'enable';
      setCountingMathAllowed(guildId, enabled);

      await ctx.reply({
        title: 'Counting Math Expressions Updated',
        description: enabled
          ? 'Math expressions **ENABLED**: Members can count using valid arithmetic (e.g. `2+2`, `5*5`, `100/2`).'
          : 'Math expressions **DISABLED**: Members must type raw integer numbers only.',
      });
      return;
    }

    if (sub === 'chat') {
      const val = (args[1] || 'deny').toLowerCase();
      const allow = val === 'allow' || val === 'on' || val === 'true';
      setCountingChatAllowed(guildId, allow);

      await ctx.reply({
        title: 'Counting Channel Chat Tolerance',
        description: allow
          ? 'Chat messages are now **ALLOWED** between numbers without ruining the count.'
          : 'Chat messages are now **DISALLOWED**. Only valid counts or math expressions are accepted.',
      });
      return;
    }

    if (sub === 'autodelete') {
      const val = (args[1] || 'on').toLowerCase();
      const enabled = val === 'on' || val === 'true';
      setCountingAutoDeleteFail(guildId, enabled);

      await ctx.reply({
        title: 'Counting Auto-Delete Failures',
        description: enabled
          ? 'Auto-delete **ENABLED**: Non-number and breaking messages will be deleted automatically.'
          : 'Auto-delete **DISABLED**: Breaking messages will remain in chat with a fail reaction/notice.',
      });
      return;
    }

    if (sub === 'reactions') {
      const success = args[1] || '✅';
      const fail = args[2] || '❌';
      const milestone = args[3] || '🎉';
      setCountingReactions(guildId, { success, fail, milestone });

      await ctx.reply({
        title: 'Counting Reactions Updated',
        description: `• **Success Reaction**: ${success}\n• **Fail Reaction**: ${fail}\n• **Milestone Reaction**: ${milestone}`,
      });
      return;
    }

    if (sub === 'setcount' || sub === 'correct') {
      const num = parseInt(args[1] || '0', 10);
      if (Number.isNaN(num) || num < 0) {
        await ctx.reply('Please specify a valid positive number: `o.counting setcount <number>`');
        return;
      }

      setCountingCurrentCount(guildId, num);
      await ctx.reply({
        title: 'Counting Count Corrected',
        description: `The current count for this server has been manually adjusted to **${num}**. Next valid number is **${num + 1}**.`,
      });
      return;
    }

    if (sub === 'reset') {
      resetCounting(guildId);
      await ctx.reply({
        title: 'Counting Reset',
        description: `The count for this server has been reset to **0**. Next valid number is **1**.`,
      });
      return;
    }

    if (sub === 'leaderboard' || sub === 'lb') {
      const counting = db.getCountingConfig(guildId);
      const ruins = counting.stats.ruinsByUser;
      const sortedRuins = Object.entries(ruins).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const ruinsText = sortedRuins.length > 0
        ? sortedRuins.map(([uid, count], idx) => `${idx + 1}. <@${uid}>: **${count}** ruin(s)`).join('\n')
        : 'Nobody has ruined the count yet!';

      await ctx.reply({
        title: 'Counting Hall of Shame & Stats',
        description:
          `• **Current Count**: **${counting.currentCount}**\n` +
          `• **Server Record**: **${counting.highScore}** (Holder: ${counting.highScoreHolder ? `<@${counting.highScoreHolder}>` : 'None'})\n` +
          `• **Total Counts Recorded**: **${counting.stats.totalCounts}**\n` +
          `• **Total Ruins**: **${counting.stats.totalFails}**\n\n` +
          `__**Top Count Ruiners**__\n${ruinsText}`,
      });
      return;
    }

    // Default: status
    const counting = db.getCountingConfig(guildId);
    const channelDisplay = counting.channelId ? `<#${counting.channelId}>` : 'None';
    const hardcoreDisplay = counting.hardcoreTimeoutMin > 0 ? `${counting.hardcoreTimeoutMin} minutes` : 'Disabled';

    await ctx.reply({
      title: 'Counting Module Status',
      description:
        `• **Designated Channel**: ${channelDisplay}\n` +
        `• **Current Count**: **${counting.currentCount}**\n` +
        `• **Server High Score**: **${counting.highScore}** (Holder: ${counting.highScoreHolder ? `<@${counting.highScoreHolder}>` : 'None'})\n` +
        `• **Last Counter**: ${counting.lastUserId ? `<@${counting.lastUserId}>` : 'None'}\n` +
        `• **Hardcore Penalty**: ${hardcoreDisplay}\n` +
        `• **Math Expressions**: \`${counting.mathExpressions ? 'ENABLED' : 'DISABLED'}\`\n` +
        `• **Chat Tolerance**: \`${counting.allowChat ? 'ALLOWED' : 'DENIED'}\`\n` +
        `• **Auto-Delete Violations**: \`${counting.autoDeleteFail ? 'ENABLED' : 'DISABLED'}\`\n` +
        `• **Reactions**: ${counting.reactions.success} / ${counting.reactions.fail} / ${counting.reactions.milestone}\n\n` +
        `*Commands*: \`o.counting setup #channel\` | \`o.counting hardcore <min>\` | \`o.counting math <on|off>\` | \`o.counting chat <allow|deny>\` | \`o.counting leaderboard\``,
    });
  },
};

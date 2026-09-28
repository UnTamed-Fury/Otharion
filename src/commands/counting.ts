import { getGuildSettings } from '../core/selfHostConfig.js';
import { resetCounting, setCountingChannel, setHardcoreTimeout } from '../modules/counting/countingEngine.js';
import type { Command, CommandContext } from './types.js';

export const countingCommand: Command = {
  name: 'counting',
  aliases: ['count'],
  description: 'Configure and monitor sequential counting channel with hardcore penalties',
  usage: 'o.counting [setup #channel | hardcore <min|off> | reset | status]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    if (!ctx.guildId) {
      await ctx.reply('Counting channel settings can only be managed inside a server.');
      return;
    }

    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'setup' || sub === 'set') {
      const channelId = args[1]?.replace(/[<#>]/g, '') || ctx.channelId;
      const counting = setCountingChannel(ctx.guildId, channelId);

      await ctx.reply({
        title: 'Counting Channel Configured',
        description:
          `Counting channel set to <#${channelId}>.\n\n` +
          `• **Current Count**: ${counting.currentCount}\n` +
          `• **High Score**: ${counting.highScore}\n` +
          `• **Hardcore Mode**: ${counting.hardcoreTimeoutMin > 0 ? `${counting.hardcoreTimeoutMin}m timeout` : 'Off'}\n\n` +
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

      const counting = setHardcoreTimeout(ctx.guildId, minutes);
      await ctx.reply({
        title: 'Counting Hardcore Mode Updated',
        description: minutes > 0
          ? `Hardcore mode **ENABLED**: Users who break the count will receive a **${minutes}-minute timeout**.`
          : 'Hardcore mode **DISABLED**: Users who break the count will not be timed out.',
      });
      return;
    }

    if (sub === 'reset') {
      const counting = resetCounting(ctx.guildId);
      await ctx.reply({
        title: 'Counting Reset',
        description: `The count for this server has been reset to **0**. Next valid number is **1**.`,
      });
      return;
    }

    // Default: status
    const counting = getGuildSettings(ctx.guildId).counting;
    const channelDisplay = counting.channelId ? `<#${counting.channelId}>` : 'None';
    const hardcoreDisplay = counting.hardcoreTimeoutMin > 0 ? `${counting.hardcoreTimeoutMin} minutes` : 'Disabled';

    await ctx.reply({
      title: 'Counting Module Status',
      description:
        `• **Designated Channel**: ${channelDisplay}\n` +
        `• **Current Count**: ${counting.currentCount}\n` +
        `• **Server High Score**: ${counting.highScore}\n` +
        `• **Last Counter**: ${counting.lastUserId ? `<@${counting.lastUserId}>` : 'None'}\n` +
        `• **Hardcore Penalty**: ${hardcoreDisplay}\n\n` +
        `Use \`o.counting setup #channel\` or \`o.counting hardcore <min>\` to modify settings.`,
    });
  },
};

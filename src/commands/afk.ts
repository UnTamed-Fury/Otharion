import { setAfk } from '../core/afk/afkManager.js';
import type { AfkScope } from '../core/types.js';
import type { Command, CommandContext } from './types.js';

export const afkCommand: Command = {
  name: 'afk',
  aliases: ['brb', 'away'],
  description: 'Set your AFK status across global, server, or platform scope',
  usage: 'o.afk [global|server|platform] [reason]',
  async execute(ctx: CommandContext, args: string[], rawArgs: string): Promise<void> {
    let scope: AfkScope = 'global';
    let reason = rawArgs;

    if (args.length > 0) {
      const first = args[0].toLowerCase();
      if (first === 'global' || first === 'server' || first === 'platform') {
        scope = first as AfkScope;
        reason = args.slice(1).join(' ').trim();
      }
    }

    if (!reason) {
      reason = 'AFK';
    }

    const entry = setAfk(
      ctx.authorId,
      scope,
      ctx.platform,
      ctx.guildId,
      ctx.guildName,
      reason
    );

    let scopeDesc = 'globally across all servers and platforms';
    if (scope === 'platform') {
      scopeDesc = `across all **${ctx.platform.toUpperCase()}** servers`;
    } else if (scope === 'server') {
      scopeDesc = `in **${ctx.guildName || 'this server'}** only`;
    }

    await ctx.reply({
      title: `${ctx.authorTag} is now AFK`,
      description: `Your status has been set ${scopeDesc}.\n\n• **Reason**: ${entry.reason}`,
    });
  },
};

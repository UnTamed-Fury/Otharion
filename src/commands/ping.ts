import type { Command, CommandContext } from './types.js';

export const pingCommand: Command = {
  name: 'ping',
  aliases: ['latency'],
  description: 'Check bot gateway latency and responsiveness',
  usage: 'o.ping',
  async execute(ctx: CommandContext): Promise<void> {
    const ping = ctx.getPing();
    await ctx.reply({
      title: 'Otharion Gateway Latency',
      description: `Gateway WebSocket Latency: **${ping}ms**\nPlatform: **${ctx.platform.toUpperCase()}**`,
    });
  },
};

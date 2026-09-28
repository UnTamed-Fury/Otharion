import { getAllActiveAfks } from '../core/afk/afkManager.js';
import { getAllLinks } from '../core/sync/syncManager.js';
import { config } from '../config.js';
import type { Command, CommandContext } from './types.js';

export const statusCommand: Command = {
  name: 'status',
  aliases: ['middleman', 'info'],
  description: 'View Otharion middleman system status and shared data connectivity',
  usage: 'o.status',
  async execute(ctx: CommandContext): Promise<void> {
    const activeAfks = getAllActiveAfks();
    const links = getAllLinks();
    const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const ping = ctx.getPing();

    await ctx.reply({
      title: 'Otharion Middleman Status',
      description:
        `**Otharion Core Engine v1.0.0**\n` +
        `Middleman Architecture connected to Mark persistent state.\n\n` +
        `• **Current Platform**: ${ctx.platform.toUpperCase()}\n` +
        `• **Gateway Latency**: ${ping}ms\n` +
        `• **Heap Memory**: ${memMb} MB\n` +
        `• **Shared Data Directory**: \`${config.dataDir}\`\n` +
        `• **Active AFK Sessions**: ${activeAfks.length}\n` +
        `• **Active Synced Accounts**: ${links.length}\n` +
        `• **Storage Architecture**: JSON v2.1.0 Partitioned Engine`,
    });
  },
};

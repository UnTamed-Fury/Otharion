import {
  addBridgePair,
  getBridgePairs,
  removeBridgePair,
} from '../modules/bridge/bridgeEngine.js';
import type { BridgePair } from '../core/selfHostConfig.js';
import type { Command, CommandContext } from './types.js';

export const bridgeCommand: Command = {
  name: 'bridge',
  aliases: ['relay'],
  description: 'Manage cross-platform channel relays between Discord and Fluxer',
  usage: 'o.bridge [pair <discordChannelId> <fluxerChannelId> | remove <channelId> | list]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    const sub = (args[0] || 'list').toLowerCase();

    if (sub === 'pair' || sub === 'add') {
      const dcId = args[1]?.replace(/[<#>]/g, '');
      const fxId = args[2]?.replace(/[<#>]/g, '');

      if (!dcId || !fxId) {
        await ctx.reply('Usage: `o.bridge pair <discordChannelId> <fluxerChannelId>`');
        return;
      }

      const pair = addBridgePair(dcId, fxId);
      await ctx.reply({
        title: 'Cross-Platform Bridge Established',
        description:
          `Configured bidirectional relay:\n\n` +
          `• **Discord Channel**: \`${pair.discordChannelId}\`\n` +
          `• **Fluxer Channel**: \`${pair.fluxerChannelId}\`\n` +
          `• **Status**: Active (Anti-Echo TTL Protected)`,
      });
      return;
    }

    if (sub === 'remove' || sub === 'delete') {
      const id = args[1]?.replace(/[<#>]/g, '');
      if (!id) {
        await ctx.reply('Usage: `o.bridge remove <channelId>`');
        return;
      }

      const removed = removeBridgePair(id);
      if (removed) {
        await ctx.reply({
          title: 'Bridge Removed',
          description: `Disconnected bridge relay associated with \`${id}\`.`,
        });
      } else {
        await ctx.reply({
          title: 'Bridge Not Found',
          description: `No active bridge found for channel ID \`${id}\`.`,
        });
      }
      return;
    }

    // Default: list
    const pairs = getBridgePairs();
    if (pairs.length === 0) {
      await ctx.reply({
        title: 'Active Bridge Relays',
        description: 'No active cross-platform bridge pairs. Use `o.bridge pair <dcId> <fxId>` to create one.',
      });
      return;
    }

    const lines = pairs
      .map((p: BridgePair) => `• Discord: \`${p.discordChannelId}\` <—> Fluxer: \`${p.fluxerChannelId}\` (${p.enabled ? 'ACTIVE' : 'OFF'})`)
      .join('\n');

    await ctx.reply({
      title: 'Active Bridge Relays',
      description: lines,
    });
  },
};

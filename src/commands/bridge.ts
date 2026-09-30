import {
  addBridgePair,
  getBridgePairs,
  removeBridgePair,
  setBridgeFilteredPrefixes,
  setBridgeMode,
  toggleBridgeBots,
  toggleBridgePair,
} from '../modules/bridge/bridgeEngine.js';
import type { Command, CommandContext } from './types.js';

export const bridgeCommand: Command = {
  name: 'bridge',
  aliases: ['relay', 'crosslink'],
  description: 'Manage bidirectional cross-platform messaging bridge between Discord and Fluxer',
  usage: 'o.bridge [add <dcChanId> <fxChanId> [name] | remove <pairId|chanId> | toggle <pairId> | mode <pairId> <twoway|discord-only|fluxer-only> | filter <pairId> <add|remove> <prefix> | bots <pairId> <allow|deny> | list | stats]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    const sub = (args[0] || 'list').toLowerCase();

    if (sub === 'add' || sub === 'link') {
      const dcChannelId = args[1]?.replace(/[<#>]/g, '');
      const fxChannelId = args[2]?.replace(/[<#>]/g, '');
      const name = args.slice(3).join(' ').trim() || undefined;

      if (!dcChannelId || !fxChannelId) {
        await ctx.reply('Usage: `o.bridge add <discordChannelId> <fluxerChannelId> [name]`\nExample: `o.bridge add 1320161905402318853 1475654458820477346 General Relay`');
        return;
      }

      const pair = addBridgePair(dcChannelId, fxChannelId, name, 'twoway');
      await ctx.reply({
        title: 'Cross-Platform Bridge Established',
        description:
          `Created active bridge pair **"${pair.name}"** (\`${pair.id}\`):\n\n` +
          `• **Discord Channel**: <#${dcChannelId}> (\`${dcChannelId}\`)\n` +
          `• **Fluxer Channel**: \`${fxChannelId}\`\n` +
          `• **Relay Mode**: \`${pair.mode}\`\n` +
          `• **Bot Relay**: \`${pair.relayBots ? 'ALLOWED' : 'BLOCKED'}\`\n` +
          `• **Command Filtering**: \`${pair.filteredPrefixes.join(' ')}\`\n\n` +
          `*Messages sent in either channel will automatically bridge to the other.*`,
      });
      return;
    }

    if (sub === 'remove' || sub === 'unlink' || sub === 'delete') {
      const identifier = args[1]?.replace(/[<#>]/g, '');
      if (!identifier) {
        await ctx.reply('Usage: `o.bridge remove <pairId | channelId>`');
        return;
      }

      const removed = removeBridgePair(identifier);
      if (removed) {
        await ctx.reply({
          title: 'Bridge Pair Removed',
          description: `Successfully disengaged bridge associated with identifier \`${identifier}\`.`,
        });
      } else {
        await ctx.reply({
          title: 'Bridge Pair Not Found',
          description: `No active bridge pair found matching \`${identifier}\`. Use \`o.bridge list\` to view active pairs.`,
        });
      }
      return;
    }

    if (sub === 'toggle') {
      const pairId = args[1];
      if (!pairId) {
        await ctx.reply('Usage: `o.bridge toggle <pairId>`');
        return;
      }

      const updated = toggleBridgePair(pairId);
      if (!updated) {
        await ctx.reply(`Bridge pair \`${pairId}\` not found.`);
        return;
      }

      await ctx.reply({
        title: 'Bridge Pair Status Toggled',
        description: `Bridge pair **"${updated.name}"** (\`${updated.id}\`) is now **${updated.enabled ? 'ACTIVE' : 'MUTED'}**.`,
      });
      return;
    }

    if (sub === 'mode') {
      const pairId = args[1];
      const rawMode = (args[2] || '').toLowerCase();
      let mode: 'twoway' | 'discord-to-fluxer' | 'fluxer-to-discord' = 'twoway';

      if (rawMode === 'twoway' || rawMode === 'bidirectional') mode = 'twoway';
      else if (rawMode === 'discord-only' || rawMode === 'discord-to-fluxer') mode = 'discord-to-fluxer';
      else if (rawMode === 'fluxer-only' || rawMode === 'fluxer-to-discord') mode = 'fluxer-to-discord';
      else {
        await ctx.reply('Invalid mode. Choose from: `twoway`, `discord-only`, `fluxer-only`.');
        return;
      }

      const updated = setBridgeMode(pairId, mode);
      if (!updated) {
        await ctx.reply(`Bridge pair \`${pairId}\` not found.`);
        return;
      }

      await ctx.reply({
        title: 'Bridge Relay Mode Updated',
        description: `Bridge **"${updated.name}"** mode set to **${mode}**.`,
      });
      return;
    }

    if (sub === 'filter') {
      const pairId = args[1];
      const action = (args[2] || '').toLowerCase();
      const prefix = args[3];

      if (!pairId || !action || !prefix) {
        await ctx.reply('Usage: `o.bridge filter <pairId> <add|remove> <prefix>`\nExample: `o.bridge filter pair_123 add %`');
        return;
      }

      const pairs = getBridgePairs();
      const pair = pairs.find((p) => p.id === pairId);
      if (!pair) {
        await ctx.reply(`Bridge pair \`${pairId}\` not found.`);
        return;
      }

      let currentPrefixes = [...pair.filteredPrefixes];
      if (action === 'add') {
        if (!currentPrefixes.includes(prefix)) currentPrefixes.push(prefix);
      } else if (action === 'remove') {
        currentPrefixes = currentPrefixes.filter((p) => p !== prefix);
      }

      const updated = setBridgeFilteredPrefixes(pairId, currentPrefixes);
      await ctx.reply({
        title: 'Bridge Filtered Prefixes Updated',
        description: `Bridge **"${updated?.name}"** filtered prefixes: \`${currentPrefixes.join(' ')}\``,
      });
      return;
    }

    if (sub === 'bots') {
      const pairId = args[1];
      const allow = (args[2] || 'deny').toLowerCase() === 'allow';

      if (!pairId) {
        await ctx.reply('Usage: `o.bridge bots <pairId> <allow|deny>`');
        return;
      }

      const updated = toggleBridgeBots(pairId, allow);
      if (!updated) {
        await ctx.reply(`Bridge pair \`${pairId}\` not found.`);
        return;
      }

      await ctx.reply({
        title: 'Bridge Bot Relay Updated',
        description: `Bridge **"${updated.name}"** bot relaying is now **${allow ? 'ALLOWED' : 'BLOCKED'}**.`,
      });
      return;
    }

    if (sub === 'stats') {
      const pairs = getBridgePairs();
      if (pairs.length === 0) {
        await ctx.reply('No active bridges configured.');
        return;
      }

      const list = pairs.map((p) => {
        const lastRelay = p.stats.lastRelayedAt > 0 ? `<t:${Math.floor(p.stats.lastRelayedAt / 1000)}:R>` : 'Never';
        return `• **${p.name}** (\`${p.id}\`):\n  ↳ Discord -> Fluxer: **${p.stats.relayedDiscordToFluxer}** messages\n  ↳ Fluxer -> Discord: **${p.stats.relayedFluxerToDiscord}** messages\n  ↳ Last Relayed: ${lastRelay}`;
      }).join('\n\n');

      await ctx.reply({
        title: 'Cross-Platform Bridge Relay Analytics',
        description: list,
      });
      return;
    }

    // Default: list
    const pairs = getBridgePairs();
    if (pairs.length === 0) {
      await ctx.reply({
        title: 'Cross-Platform Bridge Pairs',
        description: 'No active bridges configured. Use `o.bridge add <dcChanId> <fxChanId> [name]` to connect channels.',
      });
      return;
    }

    const list = pairs
      .map((p) => {
        const status = p.enabled ? 'ACTIVE' : 'MUTED';
        return `• **${p.name}** (\`${p.id}\`) [**${status}** | \`${p.mode}\`]\n  Discord: <#${p.discordChannelId}> (\`${p.discordChannelId}\`) <---> Fluxer: \`${p.fluxerChannelId}\`\n  Bot Relay: \`${p.relayBots ? 'YES' : 'NO'}\` | Filters: \`${p.filteredPrefixes.join(' ')}\``;
      })
      .join('\n\n');

    await ctx.reply({
      title: 'Active Cross-Platform Bridges',
      description: list,
    });
  },
};

import { getGuildSettings, getOtharionConfig } from '../core/selfHostConfig.js';
import type { Command, CommandContext } from './types.js';

export const configCommand: Command = {
  name: 'config',
  aliases: ['settings', 'setup'],
  description: 'View and manage Otharion modules and server settings directly from chat',
  usage: 'o.config [module] [setting] [value]',
  async execute(ctx: CommandContext): Promise<void> {
    const globalCfg = getOtharionConfig();
    const guildSettings = ctx.guildId ? getGuildSettings(ctx.guildId) : null;

    const moduleStatus = [
      `• **Counting**: ${globalCfg.modules.counting ? 'ENABLED' : 'DISABLED'}`,
      `• **Sticky Messages**: ${globalCfg.modules.sticky ? 'ENABLED' : 'DISABLED'}`,
      `• **Honeypot Security**: ${globalCfg.modules.honeypot ? 'ENABLED' : 'DISABLED'}`,
      `• **Cross-Platform Bridge**: ${globalCfg.modules.bridge ? 'ENABLED' : 'DISABLED'}`,
      `• **AFK System**: ${globalCfg.modules.afk ? 'ENABLED' : 'DISABLED'}`,
      `• **Account Sync**: ${globalCfg.modules.sync ? 'ENABLED' : 'DISABLED'}`,
      `• **Mark AnimeX Plugin**: ${globalCfg.modules.markPlugin ? 'ENABLED (Proxy)' : 'DISABLED (Sole)'}`,
    ].join('\n');

    let guildStatus = 'Execute in a server to view guild-specific configurations.';
    if (guildSettings) {
      const countChan = guildSettings.counting.channelId ? `<#${guildSettings.counting.channelId}>` : 'Not set';
      const stickyCount = Object.keys(guildSettings.sticky).length;
      const trapCount = guildSettings.honeypot.channels.length;
      const honeypotStatus = guildSettings.honeypot.enabled ? `Active (${guildSettings.honeypot.action.toUpperCase()})` : 'Standby';

      guildStatus = [
        `• **Counting Channel**: ${countChan} (Score: ${guildSettings.counting.currentCount}, High: ${guildSettings.counting.highScore})`,
        `• **Sticky Messages**: ${stickyCount} active channel(s)`,
        `• **Honeypot Traps**: ${trapCount} channel(s) armed [${honeypotStatus}]`,
      ].join('\n');
    }

    await ctx.reply({
      title: 'Otharion Unified Configuration Matrix',
      description:
        `**Global Runtime Mode**: \`${globalCfg.mode.toUpperCase()}\` | **Prefix**: \`${globalCfg.prefix}\`\n\n` +
        `__**Active Modules**__\n${moduleStatus}\n\n` +
        `__**Current Server Settings**__\n${guildStatus}\n\n` +
        `*To configure individual features, use \`o.counting\`, \`o.sticky\`, \`o.honeypot\`, or \`o.bridge\`.*`,
    });
  },
};

import { createLogger } from '../../core/logger.js';
import { getOtharionConfig } from '../../core/selfHostConfig.js';
import type { Command, CommandContext } from '../../commands/types.js';

const log = createLogger('MarkPlugin');

export const ANIMEX_PRIMARY_GUILD_ID = '1320161905267970079';

export const markProxyCommands: Command[] = [
  {
    name: 'website',
    aliases: ['site'],
    description: 'AnimeX official website and mirror links [Mark Proxy]',
    usage: 'o.website / +website',
    async execute(ctx: CommandContext): Promise<void> {
      await ctx.reply({
        title: 'AnimeX Official Website',
        description:
          `Access official streaming portals and mirrors:\n\n` +
          `• **Main Portal**: [animex.ninja](https://animex.ninja)\n` +
          `• **Status Page**: [status.animex.ninja](https://status.animex.ninja)`,
      });
    },
  },
  {
    name: 'drama',
    aliases: ['kissasian'],
    description: 'Asian drama portal links [Mark Proxy]',
    usage: 'o.drama / +drama',
    async execute(ctx: CommandContext): Promise<void> {
      await ctx.reply({
        title: 'Drama Streaming Portal',
        description: 'Watch Asian dramas and live-action series at [drama.animex.ninja](https://drama.animex.ninja).',
      });
    },
  },
  {
    name: 'boost',
    aliases: ['perks'],
    description: 'Server boosting perks and supporter tiers [Mark Proxy]',
    usage: 'o.boost / +boost',
    async execute(ctx: CommandContext): Promise<void> {
      await ctx.reply({
        title: 'AnimeX Server Booster Perks',
        description:
          `Thank you for supporting AnimeX!\n\n` +
          `• Custom Booster Role & Hex Color\n` +
          `• Private Booster Lounge & Voice Bitrate Access\n` +
          `• Priority Support and Exclusive Emojis`,
      });
    },
  },
];

export function isMarkPluginEnabled(): boolean {
  const cfg = getOtharionConfig();
  return cfg.mode === 'mark' || cfg.modules.markPlugin === true;
}

export function initializeMarkPlugin(): Command[] {
  if (!isMarkPluginEnabled()) {
    log.info('Mark plugin disabled (Mode: sole runner). Running pure Otharion.');
    return [];
  }

  log.info('Mark plugin enabled (Mode: mark proxy). Mounted AnimeX modules.');
  return markProxyCommands;
}

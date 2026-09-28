import { createSyncCode, getLinkedDiscordId, getLinkedFluxerId, verifySyncCode } from '../core/sync/syncManager.js';
import type { Command, CommandContext } from './types.js';

export const syncCommand: Command = {
  name: 'sync',
  aliases: ['link'],
  description: 'Link your Discord and Fluxer accounts for unified cross-platform state',
  usage: 'o.sync [code]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    const isDiscord = ctx.platform === 'discord';
    const linkedPeer = isDiscord ? getLinkedFluxerId(ctx.authorId) : getLinkedDiscordId(ctx.authorId);

    // If an argument is provided, attempt to verify it as a linking token
    if (args.length > 0) {
      const code = args[0].trim();
      const result = verifySyncCode(ctx.authorId, ctx.platform, code);

      if (result.success) {
        await ctx.reply({
          title: 'Account Sync Successful',
          description: `Successfully linked your **${ctx.platform.toUpperCase()}** account with **${result.pairedUserId}**.\n\nYour AFK and settings will now mirror seamlessly across platforms.`,
        });
      } else {
        await ctx.reply({
          title: 'Account Sync Failed',
          description: result.message,
        });
      }
      return;
    }

    // If already linked, display current link
    if (linkedPeer) {
      await ctx.reply({
        title: 'Account Already Synced',
        description: `Your **${ctx.platform.toUpperCase()}** account is actively linked with:\n• Peer Snowflake: \`${linkedPeer}\``,
      });
      return;
    }

    // Generate a 30s token
    const code = createSyncCode(ctx.authorId, ctx.platform);
    await ctx.reply({
      title: 'One-Time Sync Token Generated',
      description:
        `Your verification code is: **\`${code}\`**\n\n` +
        `To link your account, run:\n` +
        `\`o.sync ${code}\` on the **${isDiscord ? 'Fluxer' : 'Discord'}** platform.\n\n` +
        `*Note: This code expires strictly in 30 seconds.*`,
    });
  },
};

import { getOtharionConfig, getGuildSettings } from '../core/selfHostConfig.js';
import { getOtharionDb } from '../core/db/database.js';
import type { Command, CommandContext } from './types.js';

export const configCommand: Command = {
  name: 'config',
  aliases: ['settings', 'setup', 'cfg'],
  description: 'View and manage Otharion modules and server settings directly from chat',
  usage: 'o.config [get <module> | set <module> <key> <value> | toggle <module> | reset <module> | db]',
  async execute(ctx: CommandContext, args: string[]): Promise<void> {
    const sub = (args[0] || 'dashboard').toLowerCase();
    const db = getOtharionDb();
    const globalCfg = getOtharionConfig();

    if (sub === 'db') {
      const doc = db.getDocument();
      await ctx.reply({
        title: 'Otharion Bot Database Engine',
        description:
          `• **Schema Version**: \`${doc.version}\`\n` +
          `• **Database File**: \`${db.getFilePath()}\`\n` +
          `• **Last Persistent Sync**: <t:${Math.floor(new Date(doc.updatedAt).getTime() / 1000)}:R>\n` +
          `• **Monitored Guilds**: **${doc.stats.totalGuilds}**\n` +
          `• **Recorded Security Incidents**: **${doc.stats.totalIncidents}**\n` +
          `• **Global Cross-Platform Bridges**: **${doc.stats.totalBridges}**\n\n` +
          `*Database operates with atomic write-ahead replacements and zero-latency in-memory query caching.*`,
      });
      return;
    }

    if (!ctx.guildId) {
      await ctx.reply('Server module configurations can only be managed inside a server.');
      return;
    }

    const guildId = ctx.guildId;

    if (sub === 'get') {
      const mod = (args[1] || '').toLowerCase();
      if (!mod) {
        await ctx.reply('Please specify a module to inspect: `counting`, `sticky`, `honeypot`, `bridge`, `afk`, or `sync`.');
        return;
      }

      if (mod === 'counting') {
        const c = db.getCountingConfig(guildId);
        await ctx.reply({
          title: 'Counting Module Configuration',
          description:
            `• **Channel**: ${c.channelId ? `<#${c.channelId}>` : 'Not configured'}\n` +
            `• **Current Count**: **${c.currentCount}**\n` +
            `• **Server High Score**: **${c.highScore}** (Holder: ${c.highScoreHolder ? `<@${c.highScoreHolder}>` : 'None'})\n` +
            `• **Hardcore Timeout**: **${c.hardcoreTimeoutMin}** min\n` +
            `• **Allow Double Count**: \`${c.allowDoubleCount ? 'YES' : 'NO'}\`\n` +
            `• **Allow Chat in Channel**: \`${c.allowChat ? 'YES' : 'NO'}\`\n` +
            `• **Math Expressions**: \`${c.mathExpressions ? 'ENABLED' : 'DISABLED'}\`\n` +
            `• **Auto-Delete Failures**: \`${c.autoDeleteFail ? 'ENABLED' : 'DISABLED'}\`\n` +
            `• **Reactions**: Success: ${c.reactions.success} | Fail: ${c.reactions.fail} | Milestone: ${c.reactions.milestone}\n` +
            `• **Stats**: Total counts: ${c.stats.totalCounts} | Failures: ${c.stats.totalFails}`,
        });
        return;
      }

      if (mod === 'sticky') {
        const s = db.getStickyConfig(guildId);
        const count = Object.keys(s.channels).length;
        const details = count > 0
          ? Object.values(s.channels).map((ch) => `• <#${ch.channelId}>: "${ch.content.slice(0, 50)}..." [Mode: ${ch.cooldownMode}, Debounce: ${ch.debounceSeconds}s, MinMsgs: ${ch.minMessages}, Embed: ${ch.isEmbed}]`).join('\n')
          : 'No sticky messages configured.';

        await ctx.reply({
          title: 'Sticky Messages Configuration',
          description: `**Active Sticky Channels**: ${count}\n\n${details}`,
        });
        return;
      }

      if (mod === 'honeypot') {
        const h = db.getHoneypotConfig(guildId);
        await ctx.reply({
          title: 'Honeypot Security Configuration',
          description:
            `• **Status**: \`${h.enabled ? 'ACTIVE' : 'STANDBY'}\`\n` +
            `• **Armed Trap Channels**: ${h.channels.length > 0 ? h.channels.map((c) => `<#${c}>`).join(', ') : 'None'}\n` +
            `• **Default Action**: **${h.action.toUpperCase()}**\n` +
            `• **Timeout Duration**: **${h.timeoutDurationMin}** min\n` +
            `• **Message Purge History**: **${h.purgeMessageDays}** day(s)\n` +
            `• **Audit Alert Channel**: ${h.alertChannelId ? `<#${h.alertChannelId}>` : 'None'}\n` +
            `• **Quarantine Role**: ${h.quarantineRoleId ? `<@&${h.quarantineRoleId}>` : 'None'}\n` +
            `• **Join Window Filter**: ${h.triggerOnJoinSeconds > 0 ? `${h.triggerOnJoinSeconds}s` : 'Disabled (All members)'}\n` +
            `• **Account Age Filter**: ${h.accountAgeThresholdDays > 0 ? `${h.accountAgeThresholdDays} days` : 'Disabled'}\n` +
            `• **DM Pre-Notice**: \`${h.dmNotice ? 'ENABLED' : 'DISABLED'}\`\n` +
            `• **Recorded Incidents**: **${h.stats.totalTriggers}**`,
        });
        return;
      }

      if (mod === 'bridge') {
        const pairs = db.getBridgeConfig(guildId);
        const list = pairs.length > 0
          ? pairs.map((p) => `• **${p.name}** (\`${p.id}\`): <#${p.discordChannelId}> <-> \`${p.fluxerChannelId}\` [${p.enabled ? 'ACTIVE' : 'MUTED'} | ${p.mode}]`).join('\n')
          : 'No active bridges configured.';

        await ctx.reply({
          title: 'Cross-Platform Bridge Configuration',
          description: list,
        });
        return;
      }

      await ctx.reply(`Unknown module \`${mod}\`. Supported modules: \`counting\`, \`sticky\`, \`honeypot\`, \`bridge\`, \`afk\`, \`sync\`.`);
      return;
    }

    if (sub === 'set') {
      const mod = (args[1] || '').toLowerCase();
      const key = (args[2] || '').toLowerCase();
      const val = args.slice(3).join(' ').trim();

      if (!mod || !key || !val) {
        await ctx.reply('Usage: `o.config set <module> <key> <value>`\nExample: `o.config set counting hardcore 10`');
        return;
      }

      if (mod === 'counting') {
        if (key === 'hardcore') {
          const min = parseInt(val, 10);
          db.updateCountingConfig(guildId, (c) => { c.hardcoreTimeoutMin = Math.max(0, min); });
          await ctx.reply(`Counting hardcore timeout updated to **${min}** minutes.`);
          return;
        }
        if (key === 'math') {
          const enabled = val.toLowerCase() === 'on' || val.toLowerCase() === 'true';
          db.updateCountingConfig(guildId, (c) => { c.mathExpressions = enabled; });
          await ctx.reply(`Counting math expressions are now **${enabled ? 'ENABLED' : 'DISABLED'}**.`);
          return;
        }
        if (key === 'chat') {
          const allowed = val.toLowerCase() === 'allow' || val.toLowerCase() === 'true' || val.toLowerCase() === 'on';
          db.updateCountingConfig(guildId, (c) => { c.allowChat = allowed; });
          await ctx.reply(`Chat in counting channel is now **${allowed ? 'ALLOWED' : 'PROHIBITED'}**.`);
          return;
        }
        if (key === 'autodelete') {
          const enabled = val.toLowerCase() === 'on' || val.toLowerCase() === 'true';
          db.updateCountingConfig(guildId, (c) => { c.autoDeleteFail = enabled; });
          await ctx.reply(`Auto-deletion of invalid count messages is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`);
          return;
        }
      }

      if (mod === 'honeypot') {
        if (key === 'action') {
          const act = val.toLowerCase() as any;
          if (['ban', 'kick', 'timeout', 'quarantine', 'warn'].includes(act)) {
            db.updateHoneypotConfig(guildId, (h) => { h.action = act; });
            await ctx.reply(`Honeypot default action updated to **${act.toUpperCase()}**.`);
            return;
          }
          await ctx.reply('Invalid action. Choose from: `ban`, `kick`, `timeout`, `quarantine`, `warn`.');
          return;
        }
        if (key === 'timeout') {
          const min = parseInt(val, 10);
          db.updateHoneypotConfig(guildId, (h) => { h.timeoutDurationMin = Math.max(1, min); });
          await ctx.reply(`Honeypot timeout duration set to **${min}** minutes.`);
          return;
        }
        if (key === 'purge') {
          const days = parseInt(val, 10);
          db.updateHoneypotConfig(guildId, (h) => { h.purgeMessageDays = Math.max(0, days); });
          await ctx.reply(`Honeypot purge history set to **${days}** days.`);
          return;
        }
        if (key === 'dm') {
          const enabled = val.toLowerCase() === 'on' || val.toLowerCase() === 'true';
          db.updateHoneypotConfig(guildId, (h) => { h.dmNotice = enabled; });
          await ctx.reply(`Honeypot DM notification is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`);
          return;
        }
      }

      await ctx.reply(`Could not update setting \`${key}\` on module \`${mod}\`. Please verify key syntax.`);
      return;
    }

    if (sub === 'toggle') {
      const mod = (args[1] || '').toLowerCase();
      if (mod === 'honeypot') {
        let nowEnabled = false;
        db.updateHoneypotConfig(guildId, (h) => {
          h.enabled = !h.enabled;
          nowEnabled = h.enabled;
        });
        await ctx.reply(`Honeypot security matrix is now **${nowEnabled ? 'ENABLED' : 'DISABLED'}**.`);
        return;
      }
      await ctx.reply(`Toggle is currently supported for: \`honeypot\`.`);
      return;
    }

    // Default: Dashboard Matrix
    const counting = db.getCountingConfig(guildId);
    const sticky = db.getStickyConfig(guildId);
    const honeypot = db.getHoneypotConfig(guildId);
    const bridges = db.getBridgeConfig(guildId);

    const countChan = counting.channelId ? `<#${counting.channelId}>` : 'Not set';
    const stickyCount = Object.keys(sticky.channels).length;
    const trapCount = honeypot.channels.length;
    const honeypotStatus = honeypot.enabled ? `Active (${honeypot.action.toUpperCase()})` : 'Standby';

    await ctx.reply({
      title: 'Otharion Unified Configuration Matrix',
      description:
        `**Global Runtime Mode**: \`${globalCfg.mode.toUpperCase()}\` | **Prefix**: \`${globalCfg.prefix}\`\n\n` +
        `__**Active Modules**__\n` +
        `• **Counting Engine**: ${globalCfg.modules.counting ? 'ENABLED' : 'DISABLED'}\n` +
        `• **Sticky Messages**: ${globalCfg.modules.sticky ? 'ENABLED' : 'DISABLED'}\n` +
        `• **Honeypot Security**: ${globalCfg.modules.honeypot ? 'ENABLED' : 'DISABLED'}\n` +
        `• **Cross-Platform Bridge**: ${globalCfg.modules.bridge ? 'ENABLED' : 'DISABLED'}\n` +
        `• **AFK System**: ${globalCfg.modules.afk ? 'ENABLED' : 'DISABLED'}\n` +
        `• **Account Sync**: ${globalCfg.modules.sync ? 'ENABLED' : 'DISABLED'}\n` +
        `• **Mark Plugin**: ${globalCfg.modules.markPlugin ? 'ENABLED (Proxy)' : 'DISABLED (Sole)'}\n\n` +
        `__**Current Server Settings**__\n` +
        `• **Counting**: ${countChan} (Score: **${counting.currentCount}**, High: **${counting.highScore}**, Math: \`${counting.mathExpressions ? 'ON' : 'OFF'}\`)\n` +
        `• **Sticky**: **${stickyCount}** active channel(s)\n` +
        `• **Honeypot Traps**: **${trapCount}** channel(s) armed [${honeypotStatus}]\n` +
        `• **Bridges**: **${bridges.length}** active pair(s)\n\n` +
        `*Quick Commands*: \`o.config get <mod>\` | \`o.config set <mod> <k> <v>\` | \`o.config db\` | \`o.counting\` | \`o.sticky\` | \`o.honeypot\` | \`o.bridge\``,
    });
  },
};

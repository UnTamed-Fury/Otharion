import { getGuildSettings, updateGuildSettings, type HoneypotGuildConfig } from '../../core/selfHostConfig.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../config.js';

const log = createLogger('HoneypotEngine');

export interface HoneypotTriggerContext {
  guildId: string;
  channelId: string;
  userId: string;
  userTag: string;
  memberJoinedTimestamp: number | null;
  accountCreatedTimestamp: number;
  userRoles: string[];
  isAdmin: boolean;
  content: string;
}

export interface HoneypotVerdict {
  triggered: boolean;
  ignored: boolean;
  action: 'ban' | 'kick' | 'timeout' | 'quarantine' | 'none';
  timeoutDurationMin: number;
  purgeMessageDays: number;
  alertChannelId: string | null;
  dmNotice: boolean;
  reason: string;
}

export function evaluateHoneypotTrigger(ctx: HoneypotTriggerContext): HoneypotVerdict {
  const settings = getGuildSettings(ctx.guildId);
  const honeypot = settings.honeypot;

  // 1. Check if module is enabled
  if (!honeypot.enabled) {
    return {
      triggered: false,
      ignored: true,
      action: 'none',
      timeoutDurationMin: 0,
      purgeMessageDays: 0,
      alertChannelId: null,
      dmNotice: false,
      reason: 'Honeypot module disabled',
    };
  }

  // 2. Check if channel is an active honeypot trap
  if (!honeypot.channels.includes(ctx.channelId)) {
    return {
      triggered: false,
      ignored: true,
      action: 'none',
      timeoutDurationMin: 0,
      purgeMessageDays: 0,
      alertChannelId: null,
      dmNotice: false,
      reason: 'Channel is not a honeypot trap',
    };
  }

  // 3. Bypass checks (Owner, Admins, Immune Roles)
  if (ctx.userId === config.ownerId || ctx.isAdmin) {
    log.info(`Honeypot trigger bypassed by administrator/owner ${ctx.userTag} (${ctx.userId})`);
    return {
      triggered: false,
      ignored: true,
      action: 'none',
      timeoutDurationMin: 0,
      purgeMessageDays: 0,
      alertChannelId: honeypot.alertChannelId,
      dmNotice: false,
      reason: 'User has administrative immunity',
    };
  }

  for (const roleId of ctx.userRoles) {
    if (honeypot.immuneRoleIds.includes(roleId)) {
      log.info(`Honeypot trigger bypassed by immune role member ${ctx.userTag} (${ctx.userId})`);
      return {
        triggered: false,
        ignored: true,
        action: 'none',
        timeoutDurationMin: 0,
        purgeMessageDays: 0,
        alertChannelId: honeypot.alertChannelId,
        dmNotice: false,
        reason: 'User has immune role',
      };
    }
  }

  // 4. Join-Window Filter (if configured)
  if (honeypot.triggerOnJoinSeconds > 0 && ctx.memberJoinedTimestamp) {
    const elapsedSeconds = (Date.now() - ctx.memberJoinedTimestamp) / 1000;
    if (elapsedSeconds > honeypot.triggerOnJoinSeconds) {
      log.debug(`User ${ctx.userId} posted in honeypot but joined ${elapsedSeconds}s ago (window: ${honeypot.triggerOnJoinSeconds}s).`);
      return {
        triggered: false,
        ignored: true,
        action: 'none',
        timeoutDurationMin: 0,
        purgeMessageDays: 0,
        alertChannelId: honeypot.alertChannelId,
        dmNotice: false,
        reason: 'Account age in server exceeds join-trigger window',
      };
    }
  }

  // 5. Triggered!
  log.warn(
    `HONEYPOT TRIGGERED in guild ${ctx.guildId} by ${ctx.userTag} (${ctx.userId}) in channel ${ctx.channelId}. Executing action: ${honeypot.action}`
  );

  return {
    triggered: true,
    ignored: false,
    action: honeypot.action,
    timeoutDurationMin: honeypot.timeoutDurationMin,
    purgeMessageDays: honeypot.purgeMessageDays,
    alertChannelId: honeypot.alertChannelId,
    dmNotice: honeypot.dmNotice,
    reason: `Automated Honeypot Security Violation (Posted in trap channel <#${ctx.channelId}>)`,
  };
}

export function addHoneypotChannel(guildId: string, channelId: string): HoneypotGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.honeypot.enabled = true;
    if (!s.honeypot.channels.includes(channelId)) {
      s.honeypot.channels.push(channelId);
    }
  });
  return getGuildSettings(guildId).honeypot;
}

export function removeHoneypotChannel(guildId: string, channelId: string): HoneypotGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.honeypot.channels = s.honeypot.channels.filter((id) => id !== channelId);
  });
  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotAction(
  guildId: string,
  action: 'ban' | 'kick' | 'timeout' | 'quarantine',
  timeoutMin = 1440,
  purgeDays = 1
): HoneypotGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.honeypot.action = action;
    s.honeypot.timeoutDurationMin = timeoutMin;
    s.honeypot.purgeMessageDays = Math.min(7, Math.max(0, purgeDays));
  });
  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotAlertChannel(guildId: string, channelId: string | null): HoneypotGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.honeypot.alertChannelId = channelId;
  });
  return getGuildSettings(guildId).honeypot;
}

export function toggleHoneypotDm(guildId: string, enabled: boolean): HoneypotGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.honeypot.dmNotice = enabled;
  });
  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotJoinWindow(guildId: string, seconds: number): HoneypotGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.honeypot.triggerOnJoinSeconds = Math.max(0, seconds);
  });
  return getGuildSettings(guildId).honeypot;
}

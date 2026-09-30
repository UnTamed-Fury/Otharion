import { getGuildSettings, updateGuildSettings, type HoneypotGuildConfig } from '../../core/selfHostConfig.js';
import { getOtharionDb } from '../../core/db/database.js';
import { createLogger } from '../../core/logger.js';
import { config } from '../../config.js';
import type { HoneypotAction, HoneypotDbConfig, HoneypotIncidentRecord } from '../../core/db/types.js';

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
  action: HoneypotAction | 'none';
  timeoutDurationMin: number;
  purgeMessageDays: number;
  alertChannelId: string | null;
  quarantineRoleId: string | null;
  dmNotice: boolean;
  customDmMessage: string | null;
  reason: string;
  autoDeleteTriggerMessage: boolean;
}

export function evaluateHoneypotTrigger(ctx: HoneypotTriggerContext): HoneypotVerdict {
  const db = getOtharionDb();
  const dbHoneypot = db.getHoneypotConfig(ctx.guildId);
  const yamlHoneypot = getGuildSettings(ctx.guildId).honeypot;

  // Harmonize settings
  const enabled = dbHoneypot.enabled ?? yamlHoneypot.enabled ?? false;
  const channels = dbHoneypot.channels.length > 0 ? dbHoneypot.channels : yamlHoneypot.channels;
  const action = dbHoneypot.action || yamlHoneypot.action || 'ban';
  const timeoutDurationMin = dbHoneypot.timeoutDurationMin ?? yamlHoneypot.timeoutDurationMin ?? 1440;
  const purgeMessageDays = dbHoneypot.purgeMessageDays ?? yamlHoneypot.purgeMessageDays ?? 1;
  const alertChannelId = dbHoneypot.alertChannelId || yamlHoneypot.alertChannelId || null;
  const quarantineRoleId = dbHoneypot.quarantineRoleId || null;
  const immuneRoleIds = [...(dbHoneypot.immuneRoleIds || []), ...(yamlHoneypot.immuneRoleIds || [])];
  const immuneUserIds = dbHoneypot.immuneUserIds || [];
  const dmNotice = dbHoneypot.dmNotice ?? yamlHoneypot.dmNotice ?? true;
  const triggerOnJoinSeconds = dbHoneypot.triggerOnJoinSeconds ?? yamlHoneypot.triggerOnJoinSeconds ?? 0;
  const accountAgeThresholdDays = dbHoneypot.accountAgeThresholdDays ?? 0;
  const autoDeleteTriggerMessage = dbHoneypot.autoDeleteTriggerMessage ?? true;

  // 1. Check if module is enabled
  if (!enabled) {
    return {
      triggered: false,
      ignored: true,
      action: 'none',
      timeoutDurationMin: 0,
      purgeMessageDays: 0,
      alertChannelId: null,
      quarantineRoleId: null,
      dmNotice: false,
      customDmMessage: null,
      reason: 'Honeypot module disabled',
      autoDeleteTriggerMessage: false,
    };
  }

  // 2. Check if channel is an active honeypot trap
  if (!channels.includes(ctx.channelId)) {
    return {
      triggered: false,
      ignored: true,
      action: 'none',
      timeoutDurationMin: 0,
      purgeMessageDays: 0,
      alertChannelId: null,
      quarantineRoleId: null,
      dmNotice: false,
      customDmMessage: null,
      reason: 'Channel is not a honeypot trap',
      autoDeleteTriggerMessage: false,
    };
  }

  // 3. Bypass checks (Owner, Fury, Admins, Immune Roles & Users)
  const isPrivilegedUser =
    ctx.userId === config.ownerId ||
    ctx.userId === '1130510553266278501' || // Fury
    ctx.userId === '1344082654852550788' || // Fang Yuan
    ctx.isAdmin ||
    immuneUserIds.includes(ctx.userId);

  if (isPrivilegedUser) {
    log.info(`Honeypot trigger bypassed by administrator/owner/immune user ${ctx.userTag} (${ctx.userId})`);
    return {
      triggered: false,
      ignored: true,
      action: 'none',
      timeoutDurationMin: 0,
      purgeMessageDays: 0,
      alertChannelId,
      quarantineRoleId: null,
      dmNotice: false,
      customDmMessage: null,
      reason: 'User has administrative or explicit immunity',
      autoDeleteTriggerMessage: false,
    };
  }

  for (const roleId of ctx.userRoles) {
    if (immuneRoleIds.includes(roleId)) {
      log.info(`Honeypot trigger bypassed by immune role member ${ctx.userTag} (${ctx.userId})`);
      return {
        triggered: false,
        ignored: true,
        action: 'none',
        timeoutDurationMin: 0,
        purgeMessageDays: 0,
        alertChannelId,
        quarantineRoleId: null,
        dmNotice: false,
        customDmMessage: null,
        reason: 'User has immune role',
        autoDeleteTriggerMessage: false,
      };
    }
  }

  // 4. Join-Window Filter (if configured)
  if (triggerOnJoinSeconds > 0 && ctx.memberJoinedTimestamp) {
    const elapsedSeconds = (Date.now() - ctx.memberJoinedTimestamp) / 1000;
    if (elapsedSeconds > triggerOnJoinSeconds) {
      log.debug(`User ${ctx.userId} posted in honeypot but joined ${elapsedSeconds}s ago (window: ${triggerOnJoinSeconds}s).`);
      return {
        triggered: false,
        ignored: true,
        action: 'none',
        timeoutDurationMin: 0,
        purgeMessageDays: 0,
        alertChannelId,
        quarantineRoleId: null,
        dmNotice: false,
        customDmMessage: null,
        reason: 'User joined outside trigger window',
        autoDeleteTriggerMessage: false,
      };
    }
  }

  // 5. Account Age Filter (if configured)
  if (accountAgeThresholdDays > 0) {
    const accountAgeDays = (Date.now() - ctx.accountCreatedTimestamp) / (1000 * 86400);
    if (accountAgeDays > accountAgeThresholdDays) {
      log.debug(`User ${ctx.userId} posted in honeypot but account is ${accountAgeDays.toFixed(1)} days old (threshold: ${accountAgeThresholdDays}d).`);
      return {
        triggered: false,
        ignored: true,
        action: 'none',
        timeoutDurationMin: 0,
        purgeMessageDays: 0,
        alertChannelId,
        quarantineRoleId: null,
        dmNotice: false,
        customDmMessage: null,
        reason: 'Account age exceeds honeypot threshold',
        autoDeleteTriggerMessage: false,
      };
    }
  }

  // VIOLATION CONFIRMED: Record incident in Database
  const reason = dbHoneypot.customAlertReason || `Automated anti-raid trap trigger in channel ${ctx.channelId}`;
  const snippet = ctx.content.slice(0, 200);

  db.recordHoneypotIncident(ctx.guildId, {
    userId: ctx.userId,
    userTag: ctx.userTag,
    channelId: ctx.channelId,
    actionTaken: action,
    reason,
    messageContentSnippet: snippet,
  });

  log.warn(
    `HONEYPOT TRIGGERED in guild ${ctx.guildId} by ${ctx.userTag} (${ctx.userId}) in channel ${ctx.channelId}. Executing action: ${action}`
  );

  return {
    triggered: true,
    ignored: false,
    action,
    timeoutDurationMin,
    purgeMessageDays,
    alertChannelId,
    quarantineRoleId,
    dmNotice,
    customDmMessage: dbHoneypot.customDmMessage || null,
    reason,
    autoDeleteTriggerMessage,
  };
}

export function addHoneypotChannel(guildId: string, channelId: string): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    if (!h.channels.includes(channelId)) {
      h.channels.push(channelId);
      h.enabled = true;
    }
  });

  updateGuildSettings(guildId, (s) => {
    if (!s.honeypot.channels.includes(channelId)) {
      s.honeypot.channels.push(channelId);
      s.honeypot.enabled = true;
    }
  });

  return getGuildSettings(guildId).honeypot;
}

export function removeHoneypotChannel(guildId: string, channelId: string): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.channels = h.channels.filter((c) => c !== channelId);
  });

  updateGuildSettings(guildId, (s) => {
    s.honeypot.channels = s.honeypot.channels.filter((c) => c !== channelId);
  });

  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotAction(
  guildId: string,
  action: HoneypotAction,
  timeoutDurationMin = 1440,
  purgeMessageDays = 1,
  quarantineRoleId: string | null = null
): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.action = action;
    h.timeoutDurationMin = Math.max(1, timeoutDurationMin);
    h.purgeMessageDays = Math.max(0, purgeMessageDays);
    if (quarantineRoleId !== null) {
      h.quarantineRoleId = quarantineRoleId;
    }
  });

  updateGuildSettings(guildId, (s) => {
    s.honeypot.action = action === 'warn' ? 'kick' : action;
    s.honeypot.timeoutDurationMin = Math.max(1, timeoutDurationMin);
    s.honeypot.purgeMessageDays = Math.max(0, purgeMessageDays);
  });

  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotAlertChannel(guildId: string, alertChannelId: string | null): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.alertChannelId = alertChannelId;
  });

  updateGuildSettings(guildId, (s) => {
    s.honeypot.alertChannelId = alertChannelId;
  });

  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotQuarantineRole(guildId: string, roleId: string | null): HoneypotDbConfig {
  return getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.quarantineRoleId = roleId;
  });
}

export function addHoneypotImmuneRole(guildId: string, roleId: string): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    if (!h.immuneRoleIds.includes(roleId)) h.immuneRoleIds.push(roleId);
  });

  updateGuildSettings(guildId, (s) => {
    if (!s.honeypot.immuneRoleIds.includes(roleId)) s.honeypot.immuneRoleIds.push(roleId);
  });

  return getGuildSettings(guildId).honeypot;
}

export function removeHoneypotImmuneRole(guildId: string, roleId: string): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.immuneRoleIds = h.immuneRoleIds.filter((r) => r !== roleId);
  });

  updateGuildSettings(guildId, (s) => {
    s.honeypot.immuneRoleIds = s.honeypot.immuneRoleIds.filter((r) => r !== roleId);
  });

  return getGuildSettings(guildId).honeypot;
}

export function addHoneypotImmuneUser(guildId: string, userId: string): HoneypotDbConfig {
  return getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    if (!h.immuneUserIds.includes(userId)) h.immuneUserIds.push(userId);
  });
}

export function removeHoneypotImmuneUser(guildId: string, userId: string): HoneypotDbConfig {
  return getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.immuneUserIds = h.immuneUserIds.filter((u) => u !== userId);
  });
}

export function setHoneypotJoinWindow(guildId: string, seconds: number): HoneypotGuildConfig {
  const cleanSec = Math.max(0, seconds);
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.triggerOnJoinSeconds = cleanSec;
  });

  updateGuildSettings(guildId, (s) => {
    s.honeypot.triggerOnJoinSeconds = cleanSec;
  });

  return getGuildSettings(guildId).honeypot;
}

export function setHoneypotAccountAge(guildId: string, days: number): HoneypotDbConfig {
  return getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.accountAgeThresholdDays = Math.max(0, days);
  });
}

export function toggleHoneypotDm(guildId: string, enabled: boolean): HoneypotGuildConfig {
  getOtharionDb().updateHoneypotConfig(guildId, (h) => {
    h.dmNotice = enabled;
  });

  updateGuildSettings(guildId, (s) => {
    s.honeypot.dmNotice = enabled;
  });

  return getGuildSettings(guildId).honeypot;
}

export function getHoneypotStats(guildId: string): HoneypotDbConfig {
  return getOtharionDb().getHoneypotConfig(guildId);
}

export function getHoneypotIncidents(guildId: string): HoneypotIncidentRecord[] {
  return getOtharionDb().getHoneypotConfig(guildId).stats.history;
}

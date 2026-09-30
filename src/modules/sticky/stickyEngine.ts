import { getGuildSettings, updateGuildSettings, type StickyMessageEntry } from '../../core/selfHostConfig.js';
import { getOtharionDb } from '../../core/db/database.js';
import { createLogger } from '../../core/logger.js';
import type { StickyChannelRecord, StickyCooldownMode } from '../../core/db/types.js';

const log = createLogger('StickyEngine');

export interface StickyEvaluation {
  shouldPost: boolean;
  messageToPost: string | null;
  previousMessageId: string | null;
  isEmbed: boolean;
  embedTitle: string | null;
  embedColor: number | null;
  deletePrevious: boolean;
}

export interface StickyOptions {
  debounceSeconds?: number;
  minMessages?: number;
  isEmbed?: boolean;
  embedTitle?: string | null;
  embedColor?: number | null;
  deletePrevious?: boolean;
  cooldownMode?: StickyCooldownMode;
  exemptRoleIds?: string[];
  exemptUserIds?: string[];
}

export function handleStickyMessage(
  guildId: string,
  channelId: string,
  authorId?: string,
  authorRoles: string[] = []
): StickyEvaluation {
  const db = getOtharionDb();
  const dbConfig = db.getStickyConfig(guildId);
  const yamlSticky = getGuildSettings(guildId).sticky;

  const stickyEntry = dbConfig.channels[channelId] || (yamlSticky[channelId] ? {
    channelId,
    content: yamlSticky[channelId]!.message,
    embedTitle: null,
    embedColor: null,
    isEmbed: false,
    enabled: true,
    debounceSeconds: yamlSticky[channelId]!.debounceSeconds || 10,
    minMessages: yamlSticky[channelId]!.minMessages || 5,
    deletePrevious: true,
    cooldownMode: 'either' as StickyCooldownMode,
    exemptRoleIds: [],
    exemptUserIds: [],
    lastMessageId: yamlSticky[channelId]!.lastMessageId || null,
    lastPostedAt: yamlSticky[channelId]!.lastPostedAt || 0,
    messageCountSinceLast: yamlSticky[channelId]!.messageCountSinceLast || 0,
    stats: { totalPosts: 0, lastRefreshedAt: 0 },
  } : null);

  if (!stickyEntry || !stickyEntry.enabled || !stickyEntry.content) {
    return {
      shouldPost: false,
      messageToPost: null,
      previousMessageId: null,
      isEmbed: false,
      embedTitle: null,
      embedColor: null,
      deletePrevious: false,
    };
  }

  // Check exemptions: if author is exempt, do not increment count
  if (authorId && stickyEntry.exemptUserIds?.includes(authorId)) {
    return {
      shouldPost: false,
      messageToPost: null,
      previousMessageId: null,
      isEmbed: false,
      embedTitle: null,
      embedColor: null,
      deletePrevious: false,
    };
  }

  for (const roleId of authorRoles) {
    if (stickyEntry.exemptRoleIds?.includes(roleId)) {
      return {
        shouldPost: false,
        messageToPost: null,
        previousMessageId: null,
        isEmbed: false,
        embedTitle: null,
        embedColor: null,
        deletePrevious: false,
      };
    }
  }

  const now = Date.now();
  const elapsedSec = (now - (stickyEntry.lastPostedAt || 0)) / 1000;
  const newCount = (stickyEntry.messageCountSinceLast || 0) + 1;

  const countThresholdMet = newCount >= (stickyEntry.minMessages || 5);
  const timeThresholdMet = stickyEntry.lastPostedAt > 0 && elapsedSec >= (stickyEntry.debounceSeconds || 10);

  let shouldTrigger = false;
  const mode = stickyEntry.cooldownMode || 'either';

  if (mode === 'messages') {
    shouldTrigger = countThresholdMet;
  } else if (mode === 'time') {
    shouldTrigger = timeThresholdMet && newCount >= 2;
  } else if (mode === 'both') {
    shouldTrigger = countThresholdMet && timeThresholdMet;
  } else {
    // 'either'
    shouldTrigger = countThresholdMet || (timeThresholdMet && newCount >= 2);
  }

  if (shouldTrigger) {
    const prevId = stickyEntry.lastMessageId;

    // Reset counters and mark timestamp
    db.updateStickyConfig(guildId, (s) => {
      const entry = s.channels[channelId];
      if (entry) {
        entry.messageCountSinceLast = 0;
        entry.lastPostedAt = now;
        entry.stats.totalPosts += 1;
        entry.stats.lastRefreshedAt = now;
      }
    });

    updateGuildSettings(guildId, (s) => {
      const entry = s.sticky[channelId];
      if (entry) {
        entry.messageCountSinceLast = 0;
        entry.lastPostedAt = now;
      }
    });

    log.debug(`Sticky refresh triggered in channel ${channelId} (count: ${newCount}, elapsed: ${elapsedSec.toFixed(1)}s, mode: ${mode})`);

    return {
      shouldPost: true,
      messageToPost: stickyEntry.content,
      previousMessageId: prevId,
      isEmbed: stickyEntry.isEmbed || false,
      embedTitle: stickyEntry.embedTitle || null,
      embedColor: stickyEntry.embedColor || null,
      deletePrevious: stickyEntry.deletePrevious ?? true,
    };
  }

  // Otherwise, increment counter
  db.updateStickyConfig(guildId, (s) => {
    const entry = s.channels[channelId];
    if (entry) {
      entry.messageCountSinceLast = newCount;
    }
  });

  updateGuildSettings(guildId, (s) => {
    const entry = s.sticky[channelId];
    if (entry) {
      entry.messageCountSinceLast = newCount;
    }
  });

  return {
    shouldPost: false,
    messageToPost: null,
    previousMessageId: null,
    isEmbed: false,
    embedTitle: null,
    embedColor: null,
    deletePrevious: false,
  };
}

export function updateStickyLastMessageId(guildId: string, channelId: string, messageId: string | null): void {
  getOtharionDb().updateStickyConfig(guildId, (s) => {
    const entry = s.channels[channelId];
    if (entry) {
      entry.lastMessageId = messageId;
    }
  });

  updateGuildSettings(guildId, (s) => {
    const entry = s.sticky[channelId];
    if (entry) {
      entry.lastMessageId = messageId;
    }
  });
}

export function setStickyMessage(
  guildId: string,
  channelId: string,
  message: string,
  debounceSeconds = 10,
  minMessages = 5,
  options?: StickyOptions
): StickyChannelRecord {
  const db = getOtharionDb();

  const record: StickyChannelRecord = {
    channelId,
    content: message.trim(),
    embedTitle: options?.embedTitle ?? null,
    embedColor: options?.embedColor ?? null,
    isEmbed: options?.isEmbed ?? false,
    enabled: true,
    debounceSeconds: Math.max(5, debounceSeconds),
    minMessages: Math.max(1, minMessages),
    deletePrevious: options?.deletePrevious ?? true,
    cooldownMode: options?.cooldownMode ?? 'either',
    exemptRoleIds: options?.exemptRoleIds ?? [],
    exemptUserIds: options?.exemptUserIds ?? [],
    lastMessageId: null,
    lastPostedAt: 0,
    messageCountSinceLast: 0,
    stats: {
      totalPosts: 0,
      lastRefreshedAt: 0,
    },
  };

  db.updateStickyConfig(guildId, (s) => {
    s.channels[channelId] = record;
  });

  const yamlEntry: StickyMessageEntry = {
    message: record.content,
    lastMessageId: null,
    messageCountSinceLast: 0,
    lastPostedAt: 0,
    debounceSeconds: record.debounceSeconds,
    minMessages: record.minMessages,
  };

  updateGuildSettings(guildId, (s) => {
    s.sticky[channelId] = yamlEntry;
  });

  log.info(`Configured sticky message in guild ${guildId} channel ${channelId} (Embed: ${record.isEmbed}).`);
  return record;
}

export function setStickyEmbed(
  guildId: string,
  channelId: string,
  title: string,
  content: string,
  color?: number | null,
  options?: StickyOptions
): StickyChannelRecord {
  return setStickyMessage(guildId, channelId, content, options?.debounceSeconds ?? 10, options?.minMessages ?? 5, {
    ...options,
    isEmbed: true,
    embedTitle: title.trim(),
    embedColor: color ?? null,
  });
}

export function configureStickyChannel(
  guildId: string,
  channelId: string,
  mutator: (record: StickyChannelRecord) => void
): StickyChannelRecord | null {
  const db = getOtharionDb();
  let updatedRecord: StickyChannelRecord | null = null;

  db.updateStickyConfig(guildId, (s) => {
    const entry = s.channels[channelId];
    if (entry) {
      mutator(entry);
      updatedRecord = entry;
    }
  });

  if (updatedRecord) {
    updateGuildSettings(guildId, (s) => {
      const entry = s.sticky[channelId];
      if (entry && updatedRecord) {
        entry.debounceSeconds = updatedRecord.debounceSeconds;
        entry.minMessages = updatedRecord.minMessages;
        entry.message = updatedRecord.content;
      }
    });
  }

  return updatedRecord;
}

export function removeStickyMessage(guildId: string, channelId: string): boolean {
  const db = getOtharionDb();
  let found = false;

  db.updateStickyConfig(guildId, (s) => {
    if (s.channels[channelId]) {
      delete s.channels[channelId];
      found = true;
    }
  });

  updateGuildSettings(guildId, (s) => {
    if (s.sticky[channelId]) {
      delete s.sticky[channelId];
      found = true;
    }
  });

  if (found) {
    log.info(`Removed sticky message from guild ${guildId} channel ${channelId}.`);
  }
  return found;
}

export function clearAllStickyMessages(guildId: string): number {
  const db = getOtharionDb();
  const count = Object.keys(db.getStickyConfig(guildId).channels).length;

  db.updateStickyConfig(guildId, (s) => {
    s.channels = {};
  });

  updateGuildSettings(guildId, (s) => {
    s.sticky = {};
  });

  log.info(`Cleared all (${count}) sticky messages from guild ${guildId}.`);
  return count;
}

export function getStickyMessage(guildId: string, channelId: string): StickyChannelRecord | null {
  return getOtharionDb().getStickyConfig(guildId).channels[channelId] || null;
}

export function getAllStickyMessages(guildId: string): Record<string, StickyMessageEntry> {
  const dbConfig = getOtharionDb().getStickyConfig(guildId);
  const result: Record<string, StickyMessageEntry> = {};

  for (const [chanId, record] of Object.entries(dbConfig.channels)) {
    result[chanId] = {
      message: record.content,
      lastMessageId: record.lastMessageId,
      messageCountSinceLast: record.messageCountSinceLast,
      lastPostedAt: record.lastPostedAt,
      debounceSeconds: record.debounceSeconds,
      minMessages: record.minMessages,
    };
  }

  // Merge any YAML fallback entries
  const yamlSettings = getGuildSettings(guildId).sticky;
  for (const [chanId, entry] of Object.entries(yamlSettings)) {
    if (!result[chanId]) {
      result[chanId] = entry;
    }
  }

  return result;
}

export function getAllStickyRecords(guildId: string): Record<string, StickyChannelRecord> {
  return getOtharionDb().getStickyConfig(guildId).channels;
}

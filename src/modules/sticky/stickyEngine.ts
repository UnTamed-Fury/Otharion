import { getGuildSettings, updateGuildSettings, type StickyMessageEntry } from '../../core/selfHostConfig.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('StickyEngine');

export interface StickyEvaluation {
  shouldPost: boolean;
  messageToPost: string | null;
  previousMessageId: string | null;
}

export function handleStickyMessage(guildId: string, channelId: string): StickyEvaluation {
  const settings = getGuildSettings(guildId);
  const stickyEntry = settings.sticky[channelId];

  if (!stickyEntry || !stickyEntry.message) {
    return { shouldPost: false, messageToPost: null, previousMessageId: null };
  }

  const now = Date.now();
  const elapsedSec = (now - (stickyEntry.lastPostedAt || 0)) / 1000;
  const newCount = (stickyEntry.messageCountSinceLast || 0) + 1;

  // Debounced check: re-post if message count threshold reached (>= minMessages)
  // OR if elapsed cooldown time passed (>= debounceSeconds)
  const countThresholdMet = newCount >= (stickyEntry.minMessages || 5);
  const timeThresholdMet = stickyEntry.lastPostedAt > 0 && elapsedSec >= (stickyEntry.debounceSeconds || 10);

  if (countThresholdMet || (timeThresholdMet && newCount >= 2)) {
    const prevId = stickyEntry.lastMessageId;

    updateGuildSettings(guildId, (s) => {
      const entry = s.sticky[channelId];
      if (entry) {
        entry.messageCountSinceLast = 0;
        entry.lastPostedAt = now;
      }
    });

    log.debug(`Sticky refresh triggered in channel ${channelId} (count: ${newCount}, elapsed: ${elapsedSec.toFixed(1)}s)`);

    return {
      shouldPost: true,
      messageToPost: stickyEntry.message,
      previousMessageId: prevId,
    };
  }

  // Otherwise, simply increment counter
  updateGuildSettings(guildId, (s) => {
    const entry = s.sticky[channelId];
    if (entry) {
      entry.messageCountSinceLast = newCount;
    }
  });

  return { shouldPost: false, messageToPost: null, previousMessageId: null };
}

export function updateStickyLastMessageId(guildId: string, channelId: string, messageId: string | null): void {
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
  minMessages = 5
): StickyMessageEntry {
  const entry: StickyMessageEntry = {
    message,
    lastMessageId: null,
    messageCountSinceLast: 0,
    lastPostedAt: 0,
    debounceSeconds: Math.max(5, debounceSeconds),
    minMessages: Math.max(1, minMessages),
  };

  updateGuildSettings(guildId, (s) => {
    s.sticky[channelId] = entry;
  });

  log.info(`Configured sticky message in guild ${guildId} channel ${channelId}.`);
  return entry;
}

export function removeStickyMessage(guildId: string, channelId: string): boolean {
  const settings = getGuildSettings(guildId);
  if (!settings.sticky[channelId]) return false;

  updateGuildSettings(guildId, (s) => {
    delete s.sticky[channelId];
  });

  log.info(`Removed sticky message from guild ${guildId} channel ${channelId}.`);
  return true;
}

export function getAllStickyMessages(guildId: string): Record<string, StickyMessageEntry> {
  return getGuildSettings(guildId).sticky;
}

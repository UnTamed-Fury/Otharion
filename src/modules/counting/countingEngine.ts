import { getGuildSettings, updateGuildSettings, type CountingGuildConfig } from '../../core/selfHostConfig.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('CountingEngine');

export interface CountingResult {
  valid: boolean;
  ignored: boolean;
  expectedNumber: number;
  receivedNumber: number;
  newCount: number;
  highScore: number;
  ruined: boolean;
  reason?: 'wrong_number' | 'double_count';
  timeoutMinutes: number;
}

export function handleCountingMessage(
  guildId: string,
  channelId: string,
  userId: string,
  content: string
): CountingResult {
  const settings = getGuildSettings(guildId);
  const counting = settings.counting;

  if (!counting.channelId || counting.channelId !== channelId) {
    return {
      valid: false,
      ignored: true,
      expectedNumber: 0,
      receivedNumber: 0,
      newCount: 0,
      highScore: 0,
      ruined: false,
      timeoutMinutes: 0,
    };
  }

  // Parse pure integer or first token if numeric
  const match = content.trim().match(/^(\d+)/);
  if (!match) {
    return {
      valid: false,
      ignored: true,
      expectedNumber: counting.currentCount + 1,
      receivedNumber: 0,
      newCount: counting.currentCount,
      highScore: counting.highScore,
      ruined: false,
      timeoutMinutes: 0,
    };
  }

  const number = parseInt(match[1]!, 10);
  const expected = counting.currentCount + 1;

  // 1. Check double counting by same user
  if (counting.lastUserId === userId && counting.currentCount > 0) {
    const ruinedAt = counting.currentCount;
    updateGuildSettings(guildId, (s) => {
      s.counting.currentCount = 0;
      s.counting.lastUserId = null;
    });

    log.info(`User ${userId} ruined count in guild ${guildId} by counting twice in a row at ${ruinedAt}.`);

    return {
      valid: false,
      ignored: false,
      expectedNumber: expected,
      receivedNumber: number,
      newCount: 0,
      highScore: counting.highScore,
      ruined: true,
      reason: 'double_count',
      timeoutMinutes: counting.hardcoreTimeoutMin,
    };
  }

  // 2. Check sequential integrity
  if (number !== expected) {
    const ruinedAt = counting.currentCount;
    updateGuildSettings(guildId, (s) => {
      s.counting.currentCount = 0;
      s.counting.lastUserId = null;
    });

    log.info(`User ${userId} ruined count in guild ${guildId}: expected ${expected}, got ${number}.`);

    return {
      valid: false,
      ignored: false,
      expectedNumber: expected,
      receivedNumber: number,
      newCount: 0,
      highScore: counting.highScore,
      ruined: true,
      reason: 'wrong_number',
      timeoutMinutes: counting.hardcoreTimeoutMin,
    };
  }

  // 3. Valid increment
  let newHigh = counting.highScore;
  updateGuildSettings(guildId, (s) => {
    s.counting.currentCount = number;
    s.counting.lastUserId = userId;
    if (number > s.counting.highScore) {
      s.counting.highScore = number;
      newHigh = number;
    }
  });

  return {
    valid: true,
    ignored: false,
    expectedNumber: expected,
    receivedNumber: number,
    newCount: number,
    highScore: newHigh,
    ruined: false,
    timeoutMinutes: 0,
  };
}

export function setCountingChannel(guildId: string, channelId: string | null): CountingGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.counting.channelId = channelId;
  });
  return getGuildSettings(guildId).counting;
}

export function setHardcoreTimeout(guildId: string, minutes: number): CountingGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.counting.hardcoreTimeoutMin = Math.max(0, minutes);
  });
  return getGuildSettings(guildId).counting;
}

export function resetCounting(guildId: string): CountingGuildConfig {
  updateGuildSettings(guildId, (s) => {
    s.counting.currentCount = 0;
    s.counting.lastUserId = null;
  });
  return getGuildSettings(guildId).counting;
}

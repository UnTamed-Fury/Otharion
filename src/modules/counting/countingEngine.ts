import { getGuildSettings, updateGuildSettings, type CountingGuildConfig } from '../../core/selfHostConfig.js';
import { getOtharionDb } from '../../core/db/database.js';
import { createLogger } from '../../core/logger.js';
import type { CountingDbConfig } from '../../core/db/types.js';

const log = createLogger('CountingEngine');

export interface CountingResult {
  valid: boolean;
  ignored: boolean;
  expectedNumber: number;
  receivedNumber: number;
  newCount: number;
  highScore: number;
  ruined: boolean;
  reason?: 'wrong_number' | 'double_count' | 'invalid_format';
  timeoutMinutes: number;
  isMilestone?: boolean;
  milestoneNumber?: number;
  successEmoji: string;
  failEmoji: string;
  milestoneEmoji: string;
  autoDeleteFail: boolean;
}

export function evaluateMathExpression(raw: string): number | null {
  const clean = raw.trim();
  if (!clean) return null;

  // 1. Direct integer check
  if (/^\d+$/.test(clean)) {
    const parsed = parseInt(clean, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  // 2. Strict character whitelist: digits, +, -, *, /, %, (, ), spaces
  if (!/^[\d\s+\-*/%()]+$/.test(clean)) {
    return null;
  }

  // Tokenize safely
  const tokenRegex = /\d+|[+\-*/%()]/g;
  const tokens = clean.match(tokenRegex);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;

  function peek(): string | null {
    return pos < tokens!.length ? tokens![pos]! : null;
  }

  function consume(): string {
    return tokens![pos++]!;
  }

  function parseExpression(): number {
    let result = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const next = parseTerm();
      result = op === '+' ? result + next : result - next;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const next = parseFactor();
      if (op === '*') {
        result *= next;
      } else if (op === '/') {
        if (next === 0) throw new Error('Division by zero');
        result = Math.floor(result / next);
      } else if (op === '%') {
        if (next === 0) throw new Error('Modulo by zero');
        result = result % next;
      }
    }
    return result;
  }

  function parseFactor(): number {
    const next = peek();
    if (next === '+') {
      consume();
      return parseFactor();
    }
    if (next === '-') {
      consume();
      return -parseFactor();
    }
    if (next === '(') {
      consume();
      const result = parseExpression();
      if (consume() !== ')') throw new Error('Mismatched parenthesis');
      return result;
    }
    if (next && /^\d+$/.test(next)) {
      return parseInt(consume(), 10);
    }
    throw new Error('Unexpected token');
  }

  try {
    const evaluated = parseExpression();
    if (pos !== tokens.length) return null;
    if (Number.isSafeInteger(evaluated) && evaluated > 0) {
      return evaluated;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseCountNumber(content: string, allowMath = true): number | null {
  const trimmed = content.trim();

  // If math is allowed, test full or bracketed expression
  if (allowMath) {
    const mathResult = evaluateMathExpression(trimmed);
    if (mathResult !== null) return mathResult;
  }

  // Pure integer token at start
  const match = trimmed.match(/^(\d+)/);
  if (match) {
    const num = parseInt(match[1]!, 10);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  }

  return null;
}

export function handleCountingMessage(
  guildId: string,
  channelId: string,
  userId: string,
  content: string
): CountingResult {
  const db = getOtharionDb();
  const dbConfig = db.getCountingConfig(guildId);
  const yamlSettings = getGuildSettings(guildId).counting;

  // Harmonize channel ID
  const effectiveChannelId = dbConfig.channelId || yamlSettings.channelId;
  const currentCount = dbConfig.currentCount || yamlSettings.currentCount || 0;
  const highScore = Math.max(dbConfig.highScore || 0, yamlSettings.highScore || 0);
  const lastUserId = dbConfig.lastUserId || yamlSettings.lastUserId;
  const timeoutMinutes = dbConfig.hardcoreTimeoutMin ?? yamlSettings.hardcoreTimeoutMin ?? 5;
  const allowDoubleCount = dbConfig.allowDoubleCount ?? false;
  const allowChat = dbConfig.allowChat ?? false;
  const mathExpressions = dbConfig.mathExpressions ?? true;
  const autoDeleteFail = dbConfig.autoDeleteFail ?? false;
  const reactions = dbConfig.reactions || { success: '✅', fail: '❌', milestone: '🎉' };

  if (!effectiveChannelId || effectiveChannelId !== channelId) {
    return {
      valid: false,
      ignored: true,
      expectedNumber: 0,
      receivedNumber: 0,
      newCount: 0,
      highScore: 0,
      ruined: false,
      timeoutMinutes: 0,
      successEmoji: reactions.success,
      failEmoji: reactions.fail,
      milestoneEmoji: reactions.milestone,
      autoDeleteFail: false,
    };
  }

  const parsedNum = parseCountNumber(content, mathExpressions);

  // If message contains no valid number:
  if (parsedNum === null) {
    // If chat is permitted, ignore cleanly without breaking count
    if (allowChat) {
      return {
        valid: false,
        ignored: true,
        expectedNumber: currentCount + 1,
        receivedNumber: 0,
        newCount: currentCount,
        highScore,
        ruined: false,
        timeoutMinutes: 0,
        successEmoji: reactions.success,
        failEmoji: reactions.fail,
        milestoneEmoji: reactions.milestone,
        autoDeleteFail: false,
      };
    }

    // If chat is NOT permitted, ignore so casual messages don't break count, but flag autoDeleteFail if desired
    return {
      valid: false,
      ignored: true,
      expectedNumber: currentCount + 1,
      receivedNumber: 0,
      newCount: currentCount,
      highScore,
      ruined: false,
      timeoutMinutes: 0,
      successEmoji: reactions.success,
      failEmoji: reactions.fail,
      milestoneEmoji: reactions.milestone,
      autoDeleteFail,
    };
  }

  const expected = currentCount + 1;

  // 1. Check double counting by same user
  if (!allowDoubleCount && lastUserId === userId && currentCount > 0) {
    const ruinedAt = currentCount;

    // Persist to DB and YAML
    db.updateCountingConfig(guildId, (c) => {
      c.currentCount = 0;
      c.lastUserId = null;
      c.stats.totalFails += 1;
      c.stats.ruinsByUser[userId] = (c.stats.ruinsByUser[userId] || 0) + 1;
    });

    updateGuildSettings(guildId, (s) => {
      s.counting.currentCount = 0;
      s.counting.lastUserId = null;
    });

    log.info(`User ${userId} ruined count in guild ${guildId} by counting twice in a row at ${ruinedAt}.`);

    return {
      valid: false,
      ignored: false,
      expectedNumber: expected,
      receivedNumber: parsedNum,
      newCount: 0,
      highScore,
      ruined: true,
      reason: 'double_count',
      timeoutMinutes,
      successEmoji: reactions.success,
      failEmoji: reactions.fail,
      milestoneEmoji: reactions.milestone,
      autoDeleteFail,
    };
  }

  // 2. Check sequential integrity
  if (parsedNum !== expected) {
    db.updateCountingConfig(guildId, (c) => {
      c.currentCount = 0;
      c.lastUserId = null;
      c.stats.totalFails += 1;
      c.stats.ruinsByUser[userId] = (c.stats.ruinsByUser[userId] || 0) + 1;
    });

    updateGuildSettings(guildId, (s) => {
      s.counting.currentCount = 0;
      s.counting.lastUserId = null;
    });

    log.info(`User ${userId} ruined count in guild ${guildId}: expected ${expected}, got ${parsedNum}.`);

    return {
      valid: false,
      ignored: false,
      expectedNumber: expected,
      receivedNumber: parsedNum,
      newCount: 0,
      highScore,
      ruined: true,
      reason: 'wrong_number',
      timeoutMinutes,
      successEmoji: reactions.success,
      failEmoji: reactions.fail,
      milestoneEmoji: reactions.milestone,
      autoDeleteFail,
    };
  }

  // 3. Valid sequential increment
  let newHigh = highScore;
  const isHigh = parsedNum > highScore;
  if (isHigh) newHigh = parsedNum;

  const milestones = dbConfig.milestones || [50, 100, 250, 500, 1000, 5000];
  const isMilestone = milestones.includes(parsedNum);

  db.updateCountingConfig(guildId, (c) => {
    c.currentCount = parsedNum;
    c.lastUserId = userId;
    c.stats.totalCounts += 1;
    if (parsedNum > c.highScore) {
      c.highScore = parsedNum;
      c.highScoreHolder = userId;
      c.highScoreTimestamp = Date.now();
    }
  });

  updateGuildSettings(guildId, (s) => {
    s.counting.currentCount = parsedNum;
    s.counting.lastUserId = userId;
    if (parsedNum > s.counting.highScore) {
      s.counting.highScore = parsedNum;
    }
  });

  log.debug(`Valid count ${parsedNum} in guild ${guildId} by ${userId} (High: ${newHigh})`);

  return {
    valid: true,
    ignored: false,
    expectedNumber: expected,
    receivedNumber: parsedNum,
    newCount: parsedNum,
    highScore: newHigh,
    ruined: false,
    timeoutMinutes: 0,
    isMilestone,
    milestoneNumber: isMilestone ? parsedNum : undefined,
    successEmoji: reactions.success,
    failEmoji: reactions.fail,
    milestoneEmoji: reactions.milestone,
    autoDeleteFail: false,
  };
}

export function setCountingChannel(guildId: string, channelId: string | null): CountingGuildConfig {
  getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.channelId = channelId;
  });
  updateGuildSettings(guildId, (s) => {
    s.counting.channelId = channelId;
  });
  return getGuildSettings(guildId).counting;
}

export function setHardcoreTimeout(guildId: string, minutes: number): CountingGuildConfig {
  const cleanMin = Math.max(0, minutes);
  getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.hardcoreTimeoutMin = cleanMin;
  });
  updateGuildSettings(guildId, (s) => {
    s.counting.hardcoreTimeoutMin = cleanMin;
  });
  return getGuildSettings(guildId).counting;
}

export function setCountingMathAllowed(guildId: string, allowed: boolean): CountingDbConfig {
  return getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.mathExpressions = allowed;
  });
}

export function setCountingChatAllowed(guildId: string, allowed: boolean): CountingDbConfig {
  return getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.allowChat = allowed;
  });
}

export function setCountingAutoDeleteFail(guildId: string, enabled: boolean): CountingDbConfig {
  return getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.autoDeleteFail = enabled;
  });
}

export function setCountingReactions(
  guildId: string,
  reactions: { success?: string; fail?: string; milestone?: string }
): CountingDbConfig {
  return getOtharionDb().updateCountingConfig(guildId, (c) => {
    if (reactions.success) c.reactions.success = reactions.success;
    if (reactions.fail) c.reactions.fail = reactions.fail;
    if (reactions.milestone) c.reactions.milestone = reactions.milestone;
  });
}

export function setCountingCurrentCount(guildId: string, count: number, userId: string | null = null): CountingDbConfig {
  const cleanCount = Math.max(0, count);
  getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.currentCount = cleanCount;
    c.lastUserId = userId;
    if (cleanCount > c.highScore) {
      c.highScore = cleanCount;
      c.highScoreHolder = userId;
      c.highScoreTimestamp = Date.now();
    }
  });

  updateGuildSettings(guildId, (s) => {
    s.counting.currentCount = cleanCount;
    s.counting.lastUserId = userId;
    if (cleanCount > s.counting.highScore) {
      s.counting.highScore = cleanCount;
    }
  });

  return getOtharionDb().getCountingConfig(guildId);
}

export function resetCounting(guildId: string): CountingGuildConfig {
  getOtharionDb().updateCountingConfig(guildId, (c) => {
    c.currentCount = 0;
    c.lastUserId = null;
  });
  updateGuildSettings(guildId, (s) => {
    s.counting.currentCount = 0;
    s.counting.lastUserId = null;
  });
  return getGuildSettings(guildId).counting;
}

export function getCountingStats(guildId: string): CountingDbConfig {
  return getOtharionDb().getCountingConfig(guildId);
}

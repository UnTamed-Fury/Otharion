import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleCountingMessage,
  resetCounting,
  setCountingChannel,
  setHardcoreTimeout,
} from '../src/modules/counting/countingEngine.js';
import { updateGuildSettings } from '../src/core/selfHostConfig.js';

describe('Counting Engine & Hardcore Penalties', () => {
  const guildId = 'counting_guild_test';
  const channelId = 'counting_channel_101';

  beforeEach(() => {
    updateGuildSettings(guildId, (s) => {
      s.counting.channelId = channelId;
      s.counting.currentCount = 0;
      s.counting.highScore = 0;
      s.counting.lastUserId = null;
      s.counting.hardcoreTimeoutMin = 5;
    });
  });

  it('ignores messages from non-counting channels', () => {
    const res = handleCountingMessage(guildId, 'other_chan', 'user_1', '1');
    expect(res.ignored).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('ignores non-numeric messages in counting channel', () => {
    const res = handleCountingMessage(guildId, channelId, 'user_1', 'Hello guys');
    expect(res.ignored).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('accepts correct sequential count from alternating users', () => {
    const r1 = handleCountingMessage(guildId, channelId, 'user_1', '1');
    expect(r1.valid).toBe(true);
    expect(r1.newCount).toBe(1);
    expect(r1.highScore).toBe(1);

    const r2 = handleCountingMessage(guildId, channelId, 'user_2', '2');
    expect(r2.valid).toBe(true);
    expect(r2.newCount).toBe(2);
    expect(r2.highScore).toBe(2);
  });

  it('ruins the count if the same user counts twice in a row', () => {
    handleCountingMessage(guildId, channelId, 'user_1', '1');

    const doubleCount = handleCountingMessage(guildId, channelId, 'user_1', '2');
    expect(doubleCount.ruined).toBe(true);
    expect(doubleCount.valid).toBe(false);
    expect(doubleCount.reason).toBe('double_count');
    expect(doubleCount.newCount).toBe(0);
    expect(doubleCount.timeoutMinutes).toBe(5);
  });

  it('ruins the count if user provides incorrect number', () => {
    handleCountingMessage(guildId, channelId, 'user_1', '1');

    const wrongNum = handleCountingMessage(guildId, channelId, 'user_2', '5');
    expect(wrongNum.ruined).toBe(true);
    expect(wrongNum.valid).toBe(false);
    expect(wrongNum.reason).toBe('wrong_number');
    expect(wrongNum.newCount).toBe(0);
    expect(wrongNum.timeoutMinutes).toBe(5);
  });

  it('updates configuration via helper functions', () => {
    setHardcoreTimeout(guildId, 15);
    const res = handleCountingMessage(guildId, channelId, 'user_1', '99');
    expect(res.timeoutMinutes).toBe(15);

    resetCounting(guildId);
    const r1 = handleCountingMessage(guildId, channelId, 'user_1', '1');
    expect(r1.valid).toBe(true);
  });
});

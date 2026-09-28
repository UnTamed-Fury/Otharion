import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllStickyMessages,
  handleStickyMessage,
  removeStickyMessage,
  setStickyMessage,
  updateStickyLastMessageId,
} from '../src/modules/sticky/stickyEngine.js';
import { updateGuildSettings } from '../src/core/selfHostConfig.js';

describe('Debounced Sticky Message Engine', () => {
  const guildId = 'sticky_guild_test';
  const channelId = 'sticky_channel_101';

  beforeEach(() => {
    updateGuildSettings(guildId, (s) => {
      s.sticky = {};
    });
  });

  it('sets and retrieves sticky messages', () => {
    setStickyMessage(guildId, channelId, 'Important rules: be respectful!', 10, 5);

    const all = getAllStickyMessages(guildId);
    expect(all[channelId]).toBeDefined();
    expect(all[channelId]!.message).toBe('Important rules: be respectful!');
    expect(all[channelId]!.debounceSeconds).toBe(10);
    expect(all[channelId]!.minMessages).toBe(5);
  });

  it('debounces sticky re-posting until message count threshold is met', () => {
    setStickyMessage(guildId, channelId, 'Sticky Test', 10, 3);

    // Message 1
    const r1 = handleStickyMessage(guildId, channelId);
    expect(r1.shouldPost).toBe(false);

    // Message 2
    const r2 = handleStickyMessage(guildId, channelId);
    expect(r2.shouldPost).toBe(false);

    // Message 3: threshold reached!
    const r3 = handleStickyMessage(guildId, channelId);
    expect(r3.shouldPost).toBe(true);
    expect(r3.messageToPost).toBe('Sticky Test');

    updateStickyLastMessageId(guildId, channelId, 'msg_id_123');

    // Message 4: counter reset
    const r4 = handleStickyMessage(guildId, channelId);
    expect(r4.shouldPost).toBe(false);
  });

  it('removes sticky message cleanly', () => {
    setStickyMessage(guildId, channelId, 'To be removed');
    expect(removeStickyMessage(guildId, channelId)).toBe(true);
    expect(getAllStickyMessages(guildId)[channelId]).toBeUndefined();
    expect(removeStickyMessage(guildId, channelId)).toBe(false);
  });
});

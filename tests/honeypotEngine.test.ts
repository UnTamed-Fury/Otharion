import { describe, it, expect, beforeEach } from 'vitest';
import {
  addHoneypotChannel,
  evaluateHoneypotTrigger,
  removeHoneypotChannel,
  setHoneypotAction,
  setHoneypotAlertChannel,
  setHoneypotJoinWindow,
} from '../src/modules/honeypot/honeypotEngine.js';
import { updateGuildSettings } from '../src/core/selfHostConfig.js';
import { config } from '../src/config.js';

describe('Ultra-Configurable Honeypot Security Matrix', () => {
  const guildId = 'honeypot_guild_test';
  const trapChannelId = 'honeypot_trap_channel';

  beforeEach(() => {
    updateGuildSettings(guildId, (s) => {
      s.honeypot.enabled = true;
      s.honeypot.channels = [trapChannelId];
      s.honeypot.action = 'ban';
      s.honeypot.timeoutDurationMin = 1440;
      s.honeypot.purgeMessageDays = 1;
      s.honeypot.alertChannelId = 'alert_log_chan';
      s.honeypot.immuneRoleIds = ['immune_role_mod'];
      s.honeypot.dmNotice = true;
      s.honeypot.triggerOnJoinSeconds = 0;
    });
  });

  it('triggers when an unauthorized member posts in the trap channel', () => {
    const verdict = evaluateHoneypotTrigger({
      guildId,
      channelId: trapChannelId,
      userId: 'spambot_123',
      userTag: 'SpamBot#9999',
      memberJoinedTimestamp: Date.now() - 5000,
      accountCreatedTimestamp: Date.now() - 86400000,
      userRoles: ['member_role'],
      isAdmin: false,
      content: 'Free nitro http://discord.gift/fake',
    });

    expect(verdict.triggered).toBe(true);
    expect(verdict.ignored).toBe(false);
    expect(verdict.action).toBe('ban');
    expect(verdict.purgeMessageDays).toBe(1);
    expect(verdict.alertChannelId).toBe('alert_log_chan');
    expect(verdict.reason).toContain(trapChannelId);
  });

  it('bypasses administrator and bot owner', () => {
    const adminVerdict = evaluateHoneypotTrigger({
      guildId,
      channelId: trapChannelId,
      userId: 'admin_user',
      userTag: 'Admin#0001',
      memberJoinedTimestamp: Date.now() - 100000,
      accountCreatedTimestamp: Date.now() - 5000000,
      userRoles: [],
      isAdmin: true,
      content: 'Testing trap channel',
    });
    expect(adminVerdict.triggered).toBe(false);
    expect(adminVerdict.ignored).toBe(true);

    const ownerVerdict = evaluateHoneypotTrigger({
      guildId,
      channelId: trapChannelId,
      userId: config.ownerId,
      userTag: 'Fury#0001',
      memberJoinedTimestamp: null,
      accountCreatedTimestamp: 0,
      userRoles: [],
      isAdmin: false,
      content: 'Owner command',
    });
    expect(ownerVerdict.triggered).toBe(false);
    expect(ownerVerdict.ignored).toBe(true);
  });

  it('bypasses members holding an immune role', () => {
    const verdict = evaluateHoneypotTrigger({
      guildId,
      channelId: trapChannelId,
      userId: 'moderator_user',
      userTag: 'Mod#1234',
      memberJoinedTimestamp: Date.now() - 50000,
      accountCreatedTimestamp: Date.now() - 500000,
      userRoles: ['immune_role_mod'],
      isAdmin: false,
      content: 'Mod cleanup message',
    });

    expect(verdict.triggered).toBe(false);
    expect(verdict.ignored).toBe(true);
  });

  it('enforces action matrix customization: kick, timeout, quarantine', () => {
    setHoneypotAction(guildId, 'timeout', 60, 0);

    const verdict = evaluateHoneypotTrigger({
      guildId,
      channelId: trapChannelId,
      userId: 'spambot_timeout',
      userTag: 'SpamTimeout#1111',
      memberJoinedTimestamp: null,
      accountCreatedTimestamp: 0,
      userRoles: [],
      isAdmin: false,
      content: 'spamming',
    });

    expect(verdict.triggered).toBe(true);
    expect(verdict.action).toBe('timeout');
    expect(verdict.timeoutDurationMin).toBe(60);
    expect(verdict.purgeMessageDays).toBe(0);
  });

  it('respects join-window threshold', () => {
    setHoneypotJoinWindow(guildId, 30); // Only accounts joined within 30s trigger

    const olderMember = evaluateHoneypotTrigger({
      guildId,
      channelId: trapChannelId,
      userId: 'older_member',
      userTag: 'Old#0001',
      memberJoinedTimestamp: Date.now() - 120_000, // joined 2 minutes ago
      accountCreatedTimestamp: 0,
      userRoles: [],
      isAdmin: false,
      content: 'hello',
    });

    expect(olderMember.triggered).toBe(false);
  });

  it('adds and removes trap channels dynamically', () => {
    addHoneypotChannel(guildId, 'second_trap');
    expect(evaluateHoneypotTrigger({
      guildId,
      channelId: 'second_trap',
      userId: 'spammer',
      userTag: 'Spam#1',
      memberJoinedTimestamp: null,
      accountCreatedTimestamp: 0,
      userRoles: [],
      isAdmin: false,
      content: 'spam',
    }).triggered).toBe(true);

    removeHoneypotChannel(guildId, 'second_trap');
    expect(evaluateHoneypotTrigger({
      guildId,
      channelId: 'second_trap',
      userId: 'spammer',
      userTag: 'Spam#1',
      memberJoinedTimestamp: null,
      accountCreatedTimestamp: 0,
      userRoles: [],
      isAdmin: false,
      content: 'spam',
    }).triggered).toBe(false);
  });
});

import fs from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  canNotifyAfk,
  clearAfk,
  clearAfkMemory,
  formatDuration,
  getAfk,
  getAllActiveAfks,
  isAfk,
  loadAfkStore,
  recordAfkNotification,
  saveAfkStore,
  setAfk,
} from '../src/core/afk/afkManager.js';
import { clearSyncMemory, linkUsersManually } from '../src/core/sync/syncManager.js';
import { getAfkFilePath } from '../src/core/sharedStore.js';

describe('AFK Manager & Multi-Scope Partitioning', () => {
  const afkFile = getAfkFilePath();
  let originalContent: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(afkFile)) {
      originalContent = fs.readFileSync(afkFile, 'utf-8');
    }
    clearAfkMemory();
    clearSyncMemory();
  });

  afterEach(() => {
    clearAfkMemory();
    clearSyncMemory();
    if (originalContent !== null) {
      fs.writeFileSync(afkFile, originalContent, 'utf-8');
    }
  });

  it('sets and retrieves global AFK status across guilds', () => {
    const entry = setAfk('user1', 'global', 'discord', 'guild_a', 'Guild A', 'Sleeping');
    expect(entry.userId).toBe('user1');
    expect(entry.scope).toBe('global');
    expect(entry.reason).toBe('Sleeping');

    expect(isAfk('user1', 'discord', 'guild_a')).toBe(true);
    expect(isAfk('user1', 'discord', 'guild_b')).toBe(true);
    expect(getAfk('user1', 'discord', 'guild_b')?.reason).toBe('Sleeping');
  });

  it('syncs global AFK status to peer platform if account is linked', () => {
    linkUsersManually('dc_user_99', 'fx_user_99');

    setAfk('dc_user_99', 'global', 'discord', 'guild_a', 'Guild A', 'Out of town');

    // Active on Discord
    expect(isAfk('dc_user_99', 'discord')).toBe(true);
    // Automatically active on Fluxer for paired ID
    expect(isAfk('fx_user_99', 'fluxer')).toBe(true);
    expect(getAfk('fx_user_99', 'fluxer')?.reason).toBe('Out of town');

    // Clearing on either platform clears both
    clearAfk('fx_user_99', 'fluxer');
    expect(isAfk('fx_user_99', 'fluxer')).toBe(false);
    expect(isAfk('dc_user_99', 'discord')).toBe(false);
  });

  it('supports platform-only scope and isolates triggers to that platform', () => {
    setAfk('user_platform', 'platform', 'discord', null, null, 'Discord only');

    expect(isAfk('user_platform', 'discord', 'guild_1')).toBe(true);
    expect(isAfk('user_platform', 'discord', 'guild_2')).toBe(true);
    expect(isAfk('user_platform', 'fluxer', 'guild_1')).toBe(false);

    // Clearing on fluxer does nothing to discord entry
    expect(clearAfk('user_platform', 'fluxer')).toBeNull();
    expect(isAfk('user_platform', 'discord')).toBe(true);

    // Clearing on discord clears it
    expect(clearAfk('user_platform', 'discord')).not.toBeNull();
    expect(isAfk('user_platform', 'discord')).toBe(false);
  });

  it('supports server-only scope and isolates triggers to specified guild', () => {
    setAfk('user_server', 'server', 'discord', 'guild_main', 'Main Guild', 'Server AFK');

    expect(isAfk('user_server', 'discord', 'guild_main')).toBe(true);
    expect(isAfk('user_server', 'discord', 'guild_other')).toBe(false);
  });

  it('throttles notifications per user per channel with 10-second suppression', () => {
    expect(canNotifyAfk('target_1', 'chan_1')).toBe(true);
    recordAfkNotification('target_1', 'chan_1');

    // Suppressed in same channel
    expect(canNotifyAfk('target_1', 'chan_1')).toBe(false);

    // Allowed in different channel
    expect(canNotifyAfk('target_1', 'chan_2')).toBe(true);

    // Allowed for different target
    expect(canNotifyAfk('target_2', 'chan_1')).toBe(true);
  });

  it('formats durations correctly into human-readable strings', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(120_000)).toBe('2m');
    expect(formatDuration(3_700_000)).toBe('1h 1m 40s');
  });

  it('saves and reloads state from disk matching v2.1.0 schema with partitions', () => {
    setAfk('persisted_global', 'global', 'discord', null, null, 'Global Persisted');
    setAfk('persisted_platform', 'platform', 'fluxer', null, null, 'Platform Persisted');
    setAfk('persisted_server', 'server', 'discord', 'guild_z', 'Guild Z', 'Server Persisted');

    saveAfkStore();
    clearAfkMemory();

    loadAfkStore();
    expect(getAllActiveAfks().length).toBeGreaterThanOrEqual(3);
    expect(isAfk('persisted_global', 'discord')).toBe(true);
    expect(isAfk('persisted_platform', 'fluxer')).toBe(true);
    expect(isAfk('persisted_server', 'discord', 'guild_z')).toBe(true);
  });
});

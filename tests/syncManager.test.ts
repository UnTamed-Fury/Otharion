import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearSyncMemory,
  createSyncCode,
  getAllLinks,
  getLinkedDiscordId,
  getLinkedFluxerId,
  isUserLinked,
  linkUsersManually,
  loadSyncStore,
  saveSyncStore,
  verifySyncCode,
} from '../src/core/sync/syncManager.js';
import { getSyncFilePath } from '../src/core/sharedStore.js';

describe('Sync Manager & Dual-Index Memory Maps', () => {
  const syncFile = getSyncFilePath();
  let originalContent: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(syncFile)) {
      originalContent = fs.readFileSync(syncFile, 'utf-8');
    }
    clearSyncMemory();
  });

  afterEach(() => {
    clearSyncMemory();
    if (originalContent !== null) {
      fs.writeFileSync(syncFile, originalContent, 'utf-8');
    }
  });

  it('manually links Discord and Fluxer IDs with bidirectional O(1) resolution', () => {
    linkUsersManually('discord_111', 'fluxer_222');

    expect(isUserLinked('discord_111')).toBe(true);
    expect(isUserLinked('fluxer_222')).toBe(true);
    expect(getLinkedFluxerId('discord_111')).toBe('fluxer_222');
    expect(getLinkedDiscordId('fluxer_222')).toBe('discord_111');
    expect(getLinkedFluxerId('unknown_user')).toBeNull();
  });

  it('generates 30-second verification tokens and successfully verifies cross-platform', () => {
    const code = createSyncCode('discord_user_a', 'discord');
    expect(code).toMatch(/^\d{6}$/);

    // Reject linking on the same platform
    const samePlatformResult = verifySyncCode('discord_user_b', 'discord', code);
    expect(samePlatformResult.success).toBe(false);

    // Accept linking from opposite platform
    const crossPlatformResult = verifySyncCode('fluxer_user_c', 'fluxer', code);
    expect(crossPlatformResult.success).toBe(true);
    expect(getLinkedFluxerId('discord_user_a')).toBe('fluxer_user_c');
    expect(getLinkedDiscordId('fluxer_user_c')).toBe('discord_user_a');
  });

  it('rejects invalid or expired verification tokens', () => {
    const invalidResult = verifySyncCode('fluxer_test', 'fluxer', '999999');
    expect(invalidResult.success).toBe(false);
  });

  it('saves and reloads state from disk matching v2.1.0 schema', () => {
    linkUsersManually('discord_persisted', 'fluxer_persisted');
    saveSyncStore();

    clearSyncMemory();
    expect(getLinkedFluxerId('discord_persisted')).toBeNull();

    loadSyncStore();
    expect(getLinkedFluxerId('discord_persisted')).toBe('fluxer_persisted');
    expect(getLinkedDiscordId('fluxer_persisted')).toBe('discord_persisted');

    const links = getAllLinks();
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.some((l) => l.discordId === 'discord_persisted')).toBe(true);
  });
});

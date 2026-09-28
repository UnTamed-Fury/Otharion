import { getAfkFilePath, readJsonFile, writeJsonFileAtomic } from '../sharedStore.js';
import { getLinkedDiscordId, getLinkedFluxerId } from '../sync/syncManager.js';
import type {
  ActiveAfkEntry,
  AfkScope,
  AfkStoreDocumentV2,
  GlobalAfkRecordV2,
  Platform,
  PlatformAfkRecordV2,
  ServerAfkRecordV2,
} from '../types.js';
import { createLogger } from '../logger.js';

const log = createLogger('AfkManager');

const activeAfks = new Map<string, ActiveAfkEntry>();
const notificationCooldowns = new Map<string, number>();

function getStorageKey(scope: AfkScope, platform: Platform, userId: string, guildId: string | null): string {
  if (scope === 'global') return `global:${userId}`;
  if (scope === 'platform') return `platform:${platform}:${userId}`;
  return `server:${platform}:${guildId || 'unknown'}:${userId}`;
}

export function clearAfkMemory(): void {
  activeAfks.clear();
  notificationCooldowns.clear();
}

export function getAllActiveAfks(): ActiveAfkEntry[] {
  return Array.from(activeAfks.values());
}

export function loadAfkStore(): void {
  const filePath = getAfkFilePath();
  const document = readJsonFile<AfkStoreDocumentV2>(filePath);

  clearAfkMemory();

  if (!document || typeof document !== 'object') {
    log.info(`AFK store not found at ${filePath}. Initialized empty store.`);
    return;
  }

  // 1. Load global
  if (Array.isArray(document.global)) {
    for (const record of document.global) {
      const primaryId = record.accounts?.discordId || record.accounts?.fluxerId;
      if (!primaryId) continue;

      const entry: ActiveAfkEntry = {
        userId: primaryId,
        scope: 'global',
        platform: record.origin?.platform || 'discord',
        guildId: record.origin?.guildId || null,
        guildName: record.origin?.guildName || null,
        reason: record.reason || 'AFK',
        timestamp: record.startedAt || Date.now(),
      };

      if (record.accounts?.discordId) {
        activeAfks.set(getStorageKey('global', 'discord', record.accounts.discordId, null), {
          ...entry,
          userId: record.accounts.discordId,
        });
      }
      if (record.accounts?.fluxerId) {
        activeAfks.set(getStorageKey('global', 'fluxer', record.accounts.fluxerId, null), {
          ...entry,
          userId: record.accounts.fluxerId,
        });
      }
    }
  }

  // 2. Load platform
  if (Array.isArray(document.platform)) {
    for (const record of document.platform) {
      const userId = record.platform === 'discord' ? record.accounts?.discordId : record.accounts?.fluxerId;
      if (!userId) continue;

      activeAfks.set(getStorageKey('platform', record.platform, userId, null), {
        userId,
        scope: 'platform',
        platform: record.platform,
        guildId: null,
        guildName: null,
        reason: record.reason || 'AFK',
        timestamp: record.startedAt || Date.now(),
      });
    }
  }

  // 3. Load server
  if (Array.isArray(document.server)) {
    for (const record of document.server) {
      const userId = record.platform === 'discord' ? record.accounts?.discordId : record.accounts?.fluxerId;
      if (!userId || !record.guildId) continue;

      activeAfks.set(getStorageKey('server', record.platform, userId, record.guildId), {
        userId,
        scope: 'server',
        platform: record.platform,
        guildId: record.guildId,
        guildName: record.guildName || 'Unknown',
        reason: record.reason || 'AFK',
        timestamp: record.startedAt || Date.now(),
      });
    }
  }

  log.info(`Loaded ${activeAfks.size} active AFK lookup keys from shared AFK store.`);
}

export function saveAfkStore(): void {
  const filePath = getAfkFilePath();
  const globalRecords: GlobalAfkRecordV2[] = [];
  const platformRecords: PlatformAfkRecordV2[] = [];
  const serverRecords: ServerAfkRecordV2[] = [];

  const processedGlobalUsers = new Set<string>();

  for (const entry of activeAfks.values()) {
    const isDiscord = entry.platform === 'discord';
    const discordId = isDiscord ? entry.userId : getLinkedDiscordId(entry.userId);
    const fluxerId = !isDiscord ? entry.userId : getLinkedFluxerId(entry.userId);
    const syncStatus = discordId && fluxerId ? 'synced' : 'unlinked';

    if (entry.scope === 'global') {
      const dedupeKey = discordId || fluxerId || entry.userId;
      if (processedGlobalUsers.has(dedupeKey)) continue;
      processedGlobalUsers.add(dedupeKey);

      globalRecords.push({
        id: `afk_global_${entry.userId}`,
        syncStatus,
        accounts: { discordId, fluxerId },
        reason: entry.reason,
        origin: {
          platform: entry.platform,
          guildId: entry.guildId,
          guildName: entry.guildName,
        },
        startedAt: entry.timestamp,
        startedAtIso: new Date(entry.timestamp).toISOString(),
      });
    } else if (entry.scope === 'platform') {
      platformRecords.push({
        id: `afk_platform_${entry.platform}_${entry.userId}`,
        syncStatus,
        accounts: { discordId, fluxerId },
        platform: entry.platform,
        reason: entry.reason,
        startedAt: entry.timestamp,
        startedAtIso: new Date(entry.timestamp).toISOString(),
      });
    } else {
      serverRecords.push({
        id: `afk_server_${entry.userId}_${entry.guildId}`,
        syncStatus,
        accounts: { discordId, fluxerId },
        platform: entry.platform,
        guildId: entry.guildId || 'unknown',
        guildName: entry.guildName || 'unknown',
        reason: entry.reason,
        startedAt: entry.timestamp,
        startedAtIso: new Date(entry.timestamp).toISOString(),
      });
    }
  }

  const document: AfkStoreDocumentV2 = {
    version: '2.1.0',
    updatedAt: new Date().toISOString(),
    stats: {
      totalActive: globalRecords.length + platformRecords.length + serverRecords.length,
      globalCount: globalRecords.length,
      platformCount: platformRecords.length,
      serverCount: serverRecords.length,
    },
    global: globalRecords,
    platform: platformRecords,
    server: serverRecords,
  };

  writeJsonFileAtomic(filePath, document);
  log.debug(`Saved AFK store (${document.stats.totalActive} active) to ${filePath}.`);
}

export function setAfk(
  userId: string,
  scope: AfkScope,
  platform: Platform,
  guildId: string | null,
  guildName: string | null,
  reason: string = 'AFK'
): ActiveAfkEntry {
  // Clear any existing AFK
  clearAfk(userId, platform, guildId);

  const timestamp = Date.now();
  const entry: ActiveAfkEntry = {
    userId,
    scope,
    platform,
    guildId: scope === 'server' ? guildId : null,
    guildName: scope === 'server' ? guildName : null,
    reason: reason.trim() || 'AFK',
    timestamp,
  };

  const key = getStorageKey(scope, platform, userId, guildId);
  activeAfks.set(key, entry);

  // If global and linked, duplicate lookup key for peer platform
  if (scope === 'global') {
    const linkedPeer = platform === 'discord' ? getLinkedFluxerId(userId) : getLinkedDiscordId(userId);
    if (linkedPeer) {
      const peerPlatform: Platform = platform === 'discord' ? 'fluxer' : 'discord';
      activeAfks.set(getStorageKey('global', peerPlatform, linkedPeer, null), {
        ...entry,
        userId: linkedPeer,
        platform: peerPlatform,
      });
    }
  }

  saveAfkStore();
  log.info(`Set ${scope} AFK for ${userId} on ${platform}: "${entry.reason}"`);
  return entry;
}

export function getAfk(userId: string, platform: Platform, guildId: string | null = null): ActiveAfkEntry | null {
  // 1. Check global
  const globalKey = getStorageKey('global', platform, userId, null);
  const globalEntry = activeAfks.get(globalKey);
  if (globalEntry) return globalEntry;

  // 2. Check platform
  const platformKey = getStorageKey('platform', platform, userId, null);
  const platformEntry = activeAfks.get(platformKey);
  if (platformEntry) return platformEntry;

  // 3. Check server
  if (guildId) {
    const serverKey = getStorageKey('server', platform, userId, guildId);
    const serverEntry = activeAfks.get(serverKey);
    if (serverEntry) return serverEntry;
  }

  return null;
}

export function isAfk(userId: string, platform: Platform, guildId: string | null = null): boolean {
  return getAfk(userId, platform, guildId) !== null;
}

export function clearAfk(userId: string, platform: Platform, guildId: string | null = null): ActiveAfkEntry | null {
  let clearedEntry: ActiveAfkEntry | null = null;

  // 1. Clear global
  const globalKey = getStorageKey('global', platform, userId, null);
  if (activeAfks.has(globalKey)) {
    clearedEntry = activeAfks.get(globalKey)!;
    activeAfks.delete(globalKey);

    const linkedPeer = platform === 'discord' ? getLinkedFluxerId(userId) : getLinkedDiscordId(userId);
    if (linkedPeer) {
      const peerPlatform: Platform = platform === 'discord' ? 'fluxer' : 'discord';
      activeAfks.delete(getStorageKey('global', peerPlatform, linkedPeer, null));
    }
  }

  // 2. Clear platform (only on the active platform)
  const platformKey = getStorageKey('platform', platform, userId, null);
  if (activeAfks.has(platformKey)) {
    clearedEntry = clearedEntry || activeAfks.get(platformKey)!;
    activeAfks.delete(platformKey);
  }

  // 3. Clear server
  if (guildId) {
    const serverKey = getStorageKey('server', platform, userId, guildId);
    if (activeAfks.has(serverKey)) {
      clearedEntry = clearedEntry || activeAfks.get(serverKey)!;
      activeAfks.delete(serverKey);
    }
  }

  if (clearedEntry) {
    saveAfkStore();
    log.info(`Cleared AFK for ${userId} on ${platform}`);
  }

  return clearedEntry;
}

export function canNotifyAfk(userId: string, channelId: string): boolean {
  const key = `${userId}:${channelId}`;
  const now = Date.now();
  const lastTime = notificationCooldowns.get(key) || 0;
  return now - lastTime >= 10_000;
}

export function recordAfkNotification(userId: string, channelId: string): void {
  notificationCooldowns.set(`${userId}:${channelId}`, Date.now());
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

import { getSyncFilePath, readJsonFile, writeJsonFileAtomic } from '../sharedStore.js';
import type { Platform, SyncLinkV2, SyncStoreDocumentV2 } from '../types.js';
import { createLogger } from '../logger.js';

const log = createLogger('SyncManager');

const discordToFluxerMap = new Map<string, string>();
const fluxerToDiscordMap = new Map<string, string>();
const linksList: SyncLinkV2[] = [];

interface PendingCode {
  userId: string;
  platform: Platform;
  code: string;
  expiresAt: number;
}

const pendingCodes = new Map<string, PendingCode>();

export function getLinkedFluxerId(discordId: string): string | null {
  return discordToFluxerMap.get(discordId) || null;
}

export function getLinkedDiscordId(fluxerId: string): string | null {
  return fluxerToDiscordMap.get(fluxerId) || null;
}

export function isUserLinked(userId: string): boolean {
  return discordToFluxerMap.has(userId) || fluxerToDiscordMap.has(userId);
}

export function getAllLinks(): SyncLinkV2[] {
  return [...linksList];
}

export function clearSyncMemory(): void {
  discordToFluxerMap.clear();
  fluxerToDiscordMap.clear();
  linksList.length = 0;
  pendingCodes.clear();
}

export function loadSyncStore(): void {
  const filePath = getSyncFilePath();
  const document = readJsonFile<SyncStoreDocumentV2>(filePath);

  clearSyncMemory();

  if (!document || !Array.isArray(document.links)) {
    log.info(`Sync store not found or empty at ${filePath}. Initialized empty map.`);
    return;
  }

  for (const link of document.links) {
    if (link.discordId && link.fluxerId) {
      discordToFluxerMap.set(link.discordId, link.fluxerId);
      fluxerToDiscordMap.set(link.fluxerId, link.discordId);
      linksList.push(link);
    }
  }

  log.info(`Loaded ${linksList.length} linked accounts from shared sync store.`);
}

export function saveSyncStore(): void {
  const filePath = getSyncFilePath();
  const document: SyncStoreDocumentV2 = {
    version: '2.1.0',
    updatedAt: new Date().toISOString(),
    stats: {
      totalLinked: linksList.length,
    },
    links: linksList,
  };

  const success = writeJsonFileAtomic(filePath, document);
  if (success) {
    log.debug(`Saved ${linksList.length} linked accounts to ${filePath}.`);
  }
}

export function linkUsersManually(discordId: string, fluxerId: string): void {
  // Remove any conflicting links
  const existingFluxer = discordToFluxerMap.get(discordId);
  if (existingFluxer) fluxerToDiscordMap.delete(existingFluxer);

  const existingDiscord = fluxerToDiscordMap.get(fluxerId);
  if (existingDiscord) discordToFluxerMap.delete(existingDiscord);

  const index = linksList.findIndex((l) => l.discordId === discordId || l.fluxerId === fluxerId);
  if (index !== -1) {
    linksList.splice(index, 1);
  }

  discordToFluxerMap.set(discordId, fluxerId);
  fluxerToDiscordMap.set(fluxerId, discordId);

  const now = Date.now();
  linksList.push({
    discordId,
    fluxerId,
    linkedAt: now,
    linkedAtIso: new Date(now).toISOString(),
  });

  saveSyncStore();
  log.info(`Manually linked Discord (${discordId}) with Fluxer (${fluxerId}).`);
}

export function createSyncCode(userId: string, platform: Platform): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 30_000;

  for (const [existingCode, pending] of pendingCodes.entries()) {
    if (pending.userId === userId && pending.platform === platform) {
      pendingCodes.delete(existingCode);
    }
  }

  pendingCodes.set(code, {
    userId,
    platform,
    code,
    expiresAt,
  });

  return code;
}

export function verifySyncCode(
  targetUserId: string,
  targetPlatform: Platform,
  code: string
): { success: boolean; message: string; pairedUserId?: string } {
  const pending = pendingCodes.get(code);

  if (!pending) {
    return { success: false, message: 'Invalid or expired sync code.' };
  }

  if (Date.now() > pending.expiresAt) {
    pendingCodes.delete(code);
    return { success: false, message: 'Sync code has expired (30-second window exceeded).' };
  }

  if (pending.platform === targetPlatform) {
    return {
      success: false,
      message: 'Cannot link an account on the same platform. Enter code on the opposite platform.',
    };
  }

  const discordId = pending.platform === 'discord' ? pending.userId : targetUserId;
  const fluxerId = pending.platform === 'fluxer' ? pending.userId : targetUserId;

  linkUsersManually(discordId, fluxerId);
  pendingCodes.delete(code);

  return {
    success: true,
    message: 'Accounts successfully linked across Discord and Fluxer.',
    pairedUserId: pending.userId,
  };
}

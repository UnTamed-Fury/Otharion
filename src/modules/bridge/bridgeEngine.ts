import { getOtharionConfig, saveOtharionConfig, type BridgePair } from '../../core/selfHostConfig.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('BridgeEngine');

// In-memory anti-echo TTL cache (hash -> expireTimestamp)
const antiEchoCache = new Map<string, number>();

function cleanExpiredEchoCache(): void {
  const now = Date.now();
  for (const [key, expiresAt] of antiEchoCache.entries()) {
    if (now > expiresAt) {
      antiEchoCache.delete(key);
    }
  }
}

export function computeMessageSignature(authorId: string, content: string, attachmentCount: number): string {
  return `${authorId}:${content.trim()}:${attachmentCount}`;
}

export function isEcho(authorId: string, content: string, attachmentCount = 0): boolean {
  cleanExpiredEchoCache();
  const sig = computeMessageSignature(authorId, content, attachmentCount);
  return antiEchoCache.has(sig);
}

export function recordSentRelay(authorId: string, content: string, attachmentCount = 0, ttlMs = 15_000): void {
  cleanExpiredEchoCache();
  const sig = computeMessageSignature(authorId, content, attachmentCount);
  antiEchoCache.set(sig, Date.now() + ttlMs);
}

export function getBridgePairs(): BridgePair[] {
  return getOtharionConfig().bridge.pairs;
}

export function findFluxerChannelForDiscord(discordChannelId: string): string | null {
  const pair = getBridgePairs().find((p) => p.enabled && p.discordChannelId === discordChannelId);
  return pair?.fluxerChannelId || null;
}

export function findDiscordChannelForFluxer(fluxerChannelId: string): string | null {
  const pair = getBridgePairs().find((p) => p.enabled && p.fluxerChannelId === fluxerChannelId);
  return pair?.discordChannelId || null;
}

export function addBridgePair(discordChannelId: string, fluxerChannelId: string): BridgePair {
  const config = getOtharionConfig();
  const existingIndex = config.bridge.pairs.findIndex(
    (p) => p.discordChannelId === discordChannelId || p.fluxerChannelId === fluxerChannelId
  );

  const pair: BridgePair = {
    id: `pair_${Date.now()}`,
    discordChannelId,
    fluxerChannelId,
    enabled: true,
  };

  if (existingIndex !== -1) {
    config.bridge.pairs[existingIndex] = pair;
  } else {
    config.bridge.pairs.push(pair);
  }

  saveOtharionConfig();
  log.info(`Configured cross-platform bridge: Discord (${discordChannelId}) <-> Fluxer (${fluxerChannelId})`);
  return pair;
}

export function removeBridgePair(channelId: string): boolean {
  const config = getOtharionConfig();
  const initialLength = config.bridge.pairs.length;
  config.bridge.pairs = config.bridge.pairs.filter(
    (p) => p.discordChannelId !== channelId && p.fluxerChannelId !== channelId
  );

  if (config.bridge.pairs.length !== initialLength) {
    saveOtharionConfig();
    log.info(`Removed bridge pair associated with channel ${channelId}`);
    return true;
  }

  return false;
}

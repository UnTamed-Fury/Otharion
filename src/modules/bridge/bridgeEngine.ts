import { getOtharionConfig, saveOtharionConfig, type BridgePair } from '../../core/selfHostConfig.js';
import { getOtharionDb } from '../../core/db/database.js';
import { createLogger } from '../../core/logger.js';
import type { BridgeMode, BridgePairRecord } from '../../core/db/types.js';

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

export function getBridgePairs(): BridgePairRecord[] {
  const db = getOtharionDb();
  const dbPairs = db.getDocument().globalBridge;
  const yamlPairs = getOtharionConfig().bridge.pairs;

  if (dbPairs.length > 0) return dbPairs;

  // Fallback to YAML configuration
  return yamlPairs.map((p) => ({
    id: p.id,
    name: `Bridge ${p.discordChannelId.slice(-4)}`,
    discordChannelId: p.discordChannelId,
    fluxerChannelId: p.fluxerChannelId,
    enabled: p.enabled,
    mode: 'twoway' as BridgeMode,
    relayBots: false,
    relayAttachments: true,
    filteredPrefixes: ['+', 'o.', '!', '/', '?'],
    stats: {
      relayedDiscordToFluxer: 0,
      relayedFluxerToDiscord: 0,
      lastRelayedAt: 0,
    },
  }));
}

export function findFluxerPairForDiscord(discordChannelId: string): BridgePairRecord | null {
  const pairs = getBridgePairs();
  const match = pairs.find((p) => p.enabled && p.discordChannelId === discordChannelId);
  if (!match) return null;
  if (match.mode === 'fluxer-to-discord') return null; // unidirectional block
  return match;
}

export function findDiscordPairForFluxer(fluxerChannelId: string): BridgePairRecord | null {
  const pairs = getBridgePairs();
  const match = pairs.find((p) => p.enabled && p.fluxerChannelId === fluxerChannelId);
  if (!match) return null;
  if (match.mode === 'discord-to-fluxer') return null; // unidirectional block
  return match;
}

export function findFluxerChannelForDiscord(discordChannelId: string): string | null {
  const pair = findFluxerPairForDiscord(discordChannelId);
  return pair?.fluxerChannelId || null;
}

export function findDiscordChannelForFluxer(fluxerChannelId: string): string | null {
  const pair = findDiscordPairForFluxer(fluxerChannelId);
  return pair?.discordChannelId || null;
}

export function shouldRelayMessage(pair: BridgePairRecord, content: string, isBot: boolean): boolean {
  if (isBot && !pair.relayBots) return false;

  const trimmed = content.trim();
  for (const prefix of pair.filteredPrefixes || ['+', 'o.', '!', '/']) {
    if (trimmed.startsWith(prefix)) {
      return false; // Skip bot command relay
    }
  }

  return true;
}

export function recordBridgeRelayEvent(pairId: string, direction: 'dc_to_fx' | 'fx_to_dc'): void {
  const db = getOtharionDb();
  db.updateGlobalBridge((pairs) => {
    const p = pairs.find((x) => x.id === pairId);
    if (p) {
      if (direction === 'dc_to_fx') p.stats.relayedDiscordToFluxer += 1;
      else p.stats.relayedFluxerToDiscord += 1;
      p.stats.lastRelayedAt = Date.now();
    }
  });
}

export function addBridgePair(
  discordChannelId: string,
  fluxerChannelId: string,
  name?: string,
  mode: BridgeMode = 'twoway'
): BridgePairRecord {
  const db = getOtharionDb();
  const id = `pair_${Date.now()}`;
  const pairName = name || `Bridge ${discordChannelId.slice(-4)}-${fluxerChannelId.slice(-4)}`;

  const pairRecord: BridgePairRecord = {
    id,
    name: pairName,
    discordChannelId,
    fluxerChannelId,
    enabled: true,
    mode,
    relayBots: false,
    relayAttachments: true,
    filteredPrefixes: ['+', 'o.', '!', '/', '?'],
    stats: {
      relayedDiscordToFluxer: 0,
      relayedFluxerToDiscord: 0,
      lastRelayedAt: 0,
    },
  };

  db.updateGlobalBridge((pairs) => {
    const existingIndex = pairs.findIndex(
      (p) => p.discordChannelId === discordChannelId || p.fluxerChannelId === fluxerChannelId
    );
    if (existingIndex !== -1) {
      pairs[existingIndex] = pairRecord;
    } else {
      pairs.push(pairRecord);
    }
  });

  // Mirror to YAML
  const yamlCfg = getOtharionConfig();
  const existingYamlIndex = yamlCfg.bridge.pairs.findIndex(
    (p) => p.discordChannelId === discordChannelId || p.fluxerChannelId === fluxerChannelId
  );
  const yamlPair: BridgePair = {
    id,
    discordChannelId,
    fluxerChannelId,
    enabled: true,
  };
  if (existingYamlIndex !== -1) {
    yamlCfg.bridge.pairs[existingYamlIndex] = yamlPair;
  } else {
    yamlCfg.bridge.pairs.push(yamlPair);
  }
  saveOtharionConfig();

  log.info(`Configured cross-platform bridge "${pairName}": Discord (${discordChannelId}) <-> Fluxer (${fluxerChannelId}) [${mode}]`);
  return pairRecord;
}

export function removeBridgePair(identifier: string): boolean {
  const db = getOtharionDb();
  let removed = false;

  db.updateGlobalBridge((pairs) => {
    const initialLen = pairs.length;
    const filtered = pairs.filter(
      (p) => p.id !== identifier && p.discordChannelId !== identifier && p.fluxerChannelId !== identifier
    );
    if (filtered.length !== initialLen) {
      removed = true;
      pairs.length = 0;
      pairs.push(...filtered);
    }
  });

  const yamlCfg = getOtharionConfig();
  const initialYamlLen = yamlCfg.bridge.pairs.length;
  yamlCfg.bridge.pairs = yamlCfg.bridge.pairs.filter(
    (p) => p.id !== identifier && p.discordChannelId !== identifier && p.fluxerChannelId !== identifier
  );
  if (yamlCfg.bridge.pairs.length !== initialYamlLen) {
    saveOtharionConfig();
    removed = true;
  }

  if (removed) {
    log.info(`Removed bridge pair associated with ${identifier}`);
  }
  return removed;
}

export function toggleBridgePair(pairId: string, enabled?: boolean): BridgePairRecord | null {
  const db = getOtharionDb();
  let updatedPair: BridgePairRecord | null = null;

  db.updateGlobalBridge((pairs) => {
    const p = pairs.find((x) => x.id === pairId);
    if (p) {
      p.enabled = enabled !== undefined ? enabled : !p.enabled;
      updatedPair = p;
    }
  });

  if (updatedPair) {
    const yamlCfg = getOtharionConfig();
    const yp = yamlCfg.bridge.pairs.find((x) => x.id === pairId);
    if (yp && updatedPair) {
      yp.enabled = (updatedPair as BridgePairRecord).enabled;
      saveOtharionConfig();
    }
  }

  return updatedPair;
}

export function setBridgeMode(pairId: string, mode: BridgeMode): BridgePairRecord | null {
  const db = getOtharionDb();
  let updatedPair: BridgePairRecord | null = null;

  db.updateGlobalBridge((pairs) => {
    const p = pairs.find((x) => x.id === pairId);
    if (p) {
      p.mode = mode;
      updatedPair = p;
    }
  });

  return updatedPair;
}

export function setBridgeFilteredPrefixes(pairId: string, prefixes: string[]): BridgePairRecord | null {
  const db = getOtharionDb();
  let updatedPair: BridgePairRecord | null = null;

  db.updateGlobalBridge((pairs) => {
    const p = pairs.find((x) => x.id === pairId);
    if (p) {
      p.filteredPrefixes = prefixes;
      updatedPair = p;
    }
  });

  return updatedPair;
}

export function toggleBridgeBots(pairId: string, allowBots: boolean): BridgePairRecord | null {
  const db = getOtharionDb();
  let updatedPair: BridgePairRecord | null = null;

  db.updateGlobalBridge((pairs) => {
    const p = pairs.find((x) => x.id === pairId);
    if (p) {
      p.relayBots = allowBots;
      updatedPair = p;
    }
  });

  return updatedPair;
}

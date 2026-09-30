import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { createLogger } from '../logger.js';
import { readJsonFile, writeJsonFileAtomic } from '../sharedStore.js';
import type {
  AfkDbConfig,
  BridgeDbConfig,
  BridgePairRecord,
  CountingDbConfig,
  GuildDbRecord,
  HoneypotDbConfig,
  HoneypotIncidentRecord,
  OtharionDbDocument,
  StickyChannelRecord,
  StickyDbConfig,
  SyncDbConfig,
} from './types.js';

const log = createLogger('OtharionDatabase');

export function createDefaultCountingConfig(): CountingDbConfig {
  return {
    channelId: null,
    currentCount: 0,
    highScore: 0,
    highScoreHolder: null,
    highScoreTimestamp: null,
    lastUserId: null,
    lastMessageId: null,
    hardcoreTimeoutMin: 5,
    allowDoubleCount: false,
    allowChat: false,
    resetOnFail: true,
    autoDeleteFail: false,
    mathExpressions: true,
    milestones: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    reactions: {
      success: '✅',
      fail: '❌',
      milestone: '🎉',
    },
    stats: {
      totalCounts: 0,
      totalFails: 0,
      ruinsByUser: {},
    },
  };
}

export function createDefaultStickyConfig(): StickyDbConfig {
  return {
    channels: {},
  };
}

export function createDefaultHoneypotConfig(): HoneypotDbConfig {
  return {
    enabled: false,
    channels: [],
    action: 'ban',
    timeoutDurationMin: 1440,
    purgeMessageDays: 1,
    alertChannelId: null,
    quarantineRoleId: null,
    immuneRoleIds: [],
    immuneUserIds: [],
    dmNotice: true,
    customDmMessage: null,
    customAlertReason: null,
    triggerOnJoinSeconds: 0,
    accountAgeThresholdDays: 0,
    autoDeleteTriggerMessage: true,
    stats: {
      totalTriggers: 0,
      actionsTaken: {
        ban: 0,
        kick: 0,
        timeout: 0,
        quarantine: 0,
        warn: 0,
      },
      history: [],
    },
  };
}

export function createDefaultBridgeConfig(): BridgeDbConfig {
  return {
    enabled: true,
    pairs: [],
  };
}

export function createDefaultAfkConfig(): AfkDbConfig {
  return {
    enabled: true,
    cooldownSec: 10,
    roastsEnabled: true,
    allowPlatformOnly: true,
    ignoredChannels: [],
  };
}

export function createDefaultSyncConfig(): SyncDbConfig {
  return {
    enabled: true,
    logChannelId: null,
    tokenExpirySec: 30,
  };
}

export function createDefaultGuildRecord(guildId: string, guildName: string | null = null): GuildDbRecord {
  const now = new Date().toISOString();
  return {
    guildId,
    guildName,
    counting: createDefaultCountingConfig(),
    sticky: createDefaultStickyConfig(),
    honeypot: createDefaultHoneypotConfig(),
    bridge: createDefaultBridgeConfig(),
    afk: createDefaultAfkConfig(),
    sync: createDefaultSyncConfig(),
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultDbDocument(): OtharionDbDocument {
  return {
    version: '2.2.0',
    updatedAt: new Date().toISOString(),
    stats: {
      totalGuilds: 0,
      totalIncidents: 0,
      totalBridges: 0,
    },
    guilds: {},
    globalBridge: [],
  };
}

export class OtharionDatabase {
  private document: OtharionDbDocument;
  private readonly dbFilePath: string;
  private isDirty = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(customPath?: string) {
    this.dbFilePath = customPath || path.join(config.dataDir, 'otharion.db.json');
    this.document = createDefaultDbDocument();
    this.load();
  }

  public getFilePath(): string {
    return this.dbFilePath;
  }

  public getDocument(): OtharionDbDocument {
    return this.document;
  }

  public load(): void {
    const raw = readJsonFile<Partial<OtharionDbDocument>>(this.dbFilePath);
    if (!raw) {
      log.info(`No existing DB found at ${this.dbFilePath}. Initialized blank document.`);
      this.document = createDefaultDbDocument();
      this.saveImmediate();
      return;
    }

    this.document = {
      version: raw.version || '2.2.0',
      updatedAt: raw.updatedAt || new Date().toISOString(),
      stats: {
        totalGuilds: raw.stats?.totalGuilds ?? Object.keys(raw.guilds || {}).length,
        totalIncidents: raw.stats?.totalIncidents ?? 0,
        totalBridges: raw.stats?.totalBridges ?? (raw.globalBridge?.length ?? 0),
      },
      guilds: raw.guilds || {},
      globalBridge: raw.globalBridge || [],
    };

    log.info(`Loaded Otharion DB from ${this.dbFilePath} (Guilds: ${Object.keys(this.document.guilds).length})`);
  }

  public saveImmediate(): boolean {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    this.document.updatedAt = new Date().toISOString();
    this.document.stats.totalGuilds = Object.keys(this.document.guilds).length;
    this.document.stats.totalBridges = this.document.globalBridge.length;

    let totalIncidents = 0;
    for (const g of Object.values(this.document.guilds)) {
      totalIncidents += g.honeypot?.stats?.totalTriggers ?? 0;
    }
    this.document.stats.totalIncidents = totalIncidents;

    const success = writeJsonFileAtomic(this.dbFilePath, this.document);
    if (success) {
      this.isDirty = false;
    }
    return success;
  }

  public scheduleSave(): void {
    this.isDirty = true;
    if (this.saveTimeout) return;

    this.saveTimeout = setTimeout(() => {
      this.saveImmediate();
    }, 200);
  }

  public getGuild(guildId: string, guildName?: string | null): GuildDbRecord {
    if (!this.document.guilds[guildId]) {
      this.document.guilds[guildId] = createDefaultGuildRecord(guildId, guildName);
      this.scheduleSave();
    } else if (guildName && this.document.guilds[guildId].guildName !== guildName) {
      this.document.guilds[guildId].guildName = guildName;
      this.scheduleSave();
    }
    return this.document.guilds[guildId]!;
  }

  public updateGuild(guildId: string, mutator: (guild: GuildDbRecord) => void): GuildDbRecord {
    const guild = this.getGuild(guildId);
    mutator(guild);
    guild.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return guild;
  }

  // Counting Helpers
  public getCountingConfig(guildId: string): CountingDbConfig {
    return this.getGuild(guildId).counting;
  }

  public updateCountingConfig(guildId: string, mutator: (c: CountingDbConfig) => void): CountingDbConfig {
    const guild = this.getGuild(guildId);
    mutator(guild.counting);
    guild.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return guild.counting;
  }

  // Sticky Helpers
  public getStickyConfig(guildId: string): StickyDbConfig {
    return this.getGuild(guildId).sticky;
  }

  public updateStickyConfig(guildId: string, mutator: (s: StickyDbConfig) => void): StickyDbConfig {
    const guild = this.getGuild(guildId);
    mutator(guild.sticky);
    guild.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return guild.sticky;
  }

  // Honeypot Helpers
  public getHoneypotConfig(guildId: string): HoneypotDbConfig {
    return this.getGuild(guildId).honeypot;
  }

  public updateHoneypotConfig(guildId: string, mutator: (h: HoneypotDbConfig) => void): HoneypotDbConfig {
    const guild = this.getGuild(guildId);
    mutator(guild.honeypot);
    guild.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return guild.honeypot;
  }

  public recordHoneypotIncident(guildId: string, incident: Omit<HoneypotIncidentRecord, 'id' | 'timestamp' | 'timestampIso'>): HoneypotIncidentRecord {
    const record: HoneypotIncidentRecord = {
      ...incident,
      id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      timestampIso: new Date().toISOString(),
    };

    this.updateHoneypotConfig(guildId, (h) => {
      h.stats.totalTriggers += 1;
      const act = record.actionTaken;
      h.stats.actionsTaken[act] = (h.stats.actionsTaken[act] || 0) + 1;
      h.stats.history.unshift(record);
      if (h.stats.history.length > 50) {
        h.stats.history = h.stats.history.slice(0, 50);
      }
    });

    return record;
  }

  // Bridge Helpers
  public getBridgeConfig(guildId?: string | null): BridgePairRecord[] {
    if (guildId && this.document.guilds[guildId]) {
      return [...this.document.globalBridge, ...this.document.guilds[guildId].bridge.pairs];
    }
    return this.document.globalBridge;
  }

  public updateGlobalBridge(mutator: (pairs: BridgePairRecord[]) => void): BridgePairRecord[] {
    mutator(this.document.globalBridge);
    this.scheduleSave();
    return this.document.globalBridge;
  }

  // Afk & Sync Helpers
  public getAfkConfig(guildId: string): AfkDbConfig {
    return this.getGuild(guildId).afk;
  }

  public updateAfkConfig(guildId: string, mutator: (a: AfkDbConfig) => void): AfkDbConfig {
    const guild = this.getGuild(guildId);
    mutator(guild.afk);
    guild.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return guild.afk;
  }

  public getSyncConfig(guildId: string): SyncDbConfig {
    return this.getGuild(guildId).sync;
  }

  public updateSyncConfig(guildId: string, mutator: (s: SyncDbConfig) => void): SyncDbConfig {
    const guild = this.getGuild(guildId);
    mutator(guild.sync);
    guild.updatedAt = new Date().toISOString();
    this.scheduleSave();
    return guild.sync;
  }

  public clearMemory(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.document = createDefaultDbDocument();
  }
}

let dbInstance: OtharionDatabase | null = null;

export function getOtharionDb(): OtharionDatabase {
  if (!dbInstance) {
    dbInstance = new OtharionDatabase();
  }
  return dbInstance;
}

export function setOtharionDbInstance(instance: OtharionDatabase | null): void {
  dbInstance = instance;
}

export type Platform = 'discord' | 'fluxer';
export type AfkScope = 'global' | 'platform' | 'server';

export interface GlobalAfkRecordV2 {
  id: string;
  syncStatus: 'synced' | 'unlinked';
  accounts: {
    discordId: string | null;
    fluxerId: string | null;
  };
  reason: string;
  origin: {
    platform: Platform;
    guildId: string | null;
    guildName: string | null;
  };
  startedAt: number;
  startedAtIso: string;
}

export interface PlatformAfkRecordV2 {
  id: string;
  syncStatus: 'synced' | 'unlinked';
  accounts: {
    discordId: string | null;
    fluxerId: string | null;
  };
  platform: Platform;
  reason: string;
  startedAt: number;
  startedAtIso: string;
}

export interface ServerAfkRecordV2 {
  id: string;
  syncStatus: 'synced' | 'unlinked';
  accounts: {
    discordId: string | null;
    fluxerId: string | null;
  };
  platform: Platform;
  guildId: string;
  guildName: string;
  reason: string;
  startedAt: number;
  startedAtIso: string;
}

export interface AfkStoreDocumentV2 {
  version: '2.1.0';
  updatedAt: string;
  stats: {
    totalActive: number;
    globalCount: number;
    platformCount: number;
    serverCount: number;
  };
  global: GlobalAfkRecordV2[];
  platform: PlatformAfkRecordV2[];
  server: ServerAfkRecordV2[];
}

export interface SyncLinkV2 {
  discordId: string;
  fluxerId: string;
  linkedAt: number;
  linkedAtIso: string;
}

export interface SyncStoreDocumentV2 {
  version: '2.1.0';
  updatedAt: string;
  stats: {
    totalLinked: number;
  };
  links: SyncLinkV2[];
}

export interface ActiveAfkEntry {
  userId: string;
  scope: AfkScope;
  platform: Platform;
  guildId: string | null;
  guildName: string | null;
  reason: string;
  timestamp: number;
}

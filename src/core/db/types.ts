export interface CountingDbConfig {
  channelId: string | null;
  currentCount: number;
  highScore: number;
  highScoreHolder: string | null;
  highScoreTimestamp: number | null;
  lastUserId: string | null;
  lastMessageId: string | null;
  hardcoreTimeoutMin: number;
  allowDoubleCount: boolean;
  allowChat: boolean;
  resetOnFail: boolean;
  autoDeleteFail: boolean;
  mathExpressions: boolean;
  milestones: number[];
  reactions: {
    success: string;
    fail: string;
    milestone: string;
  };
  stats: {
    totalCounts: number;
    totalFails: number;
    ruinsByUser: Record<string, number>;
  };
}

export type StickyCooldownMode = 'messages' | 'time' | 'both' | 'either';

export interface StickyChannelRecord {
  channelId: string;
  content: string;
  embedTitle: string | null;
  embedColor: number | null;
  isEmbed: boolean;
  enabled: boolean;
  debounceSeconds: number;
  minMessages: number;
  deletePrevious: boolean;
  cooldownMode: StickyCooldownMode;
  exemptRoleIds: string[];
  exemptUserIds: string[];
  lastMessageId: string | null;
  lastPostedAt: number;
  messageCountSinceLast: number;
  stats: {
    totalPosts: number;
    lastRefreshedAt: number;
  };
}

export interface StickyDbConfig {
  channels: Record<string, StickyChannelRecord>;
}

export type HoneypotAction = 'ban' | 'kick' | 'timeout' | 'quarantine' | 'warn';

export interface HoneypotIncidentRecord {
  id: string;
  userId: string;
  userTag: string;
  channelId: string;
  actionTaken: HoneypotAction;
  timestamp: number;
  timestampIso: string;
  reason: string;
  messageContentSnippet: string;
}

export interface HoneypotDbConfig {
  enabled: boolean;
  channels: string[];
  action: HoneypotAction;
  timeoutDurationMin: number;
  purgeMessageDays: number;
  alertChannelId: string | null;
  quarantineRoleId: string | null;
  immuneRoleIds: string[];
  immuneUserIds: string[];
  dmNotice: boolean;
  customDmMessage: string | null;
  customAlertReason: string | null;
  triggerOnJoinSeconds: number;
  accountAgeThresholdDays: number;
  autoDeleteTriggerMessage: boolean;
  stats: {
    totalTriggers: number;
    actionsTaken: Record<string, number>;
    history: HoneypotIncidentRecord[];
  };
}

export type BridgeMode = 'twoway' | 'discord-to-fluxer' | 'fluxer-to-discord';

export interface BridgePairRecord {
  id: string;
  name: string;
  discordChannelId: string;
  fluxerChannelId: string;
  enabled: boolean;
  mode: BridgeMode;
  relayBots: boolean;
  relayAttachments: boolean;
  filteredPrefixes: string[];
  stats: {
    relayedDiscordToFluxer: number;
    relayedFluxerToDiscord: number;
    lastRelayedAt: number;
  };
}

export interface BridgeDbConfig {
  enabled: boolean;
  pairs: BridgePairRecord[];
}

export interface AfkDbConfig {
  enabled: boolean;
  cooldownSec: number;
  roastsEnabled: boolean;
  allowPlatformOnly: boolean;
  ignoredChannels: string[];
}

export interface SyncDbConfig {
  enabled: boolean;
  logChannelId: string | null;
  tokenExpirySec: number;
}

export interface GuildDbRecord {
  guildId: string;
  guildName: string | null;
  counting: CountingDbConfig;
  sticky: StickyDbConfig;
  honeypot: HoneypotDbConfig;
  bridge: BridgeDbConfig;
  afk: AfkDbConfig;
  sync: SyncDbConfig;
  createdAt: string;
  updatedAt: string;
}

export interface OtharionDbDocument {
  version: string;
  updatedAt: string;
  stats: {
    totalGuilds: number;
    totalIncidents: number;
    totalBridges: number;
  };
  guilds: Record<string, GuildDbRecord>;
  globalBridge: BridgePairRecord[];
}

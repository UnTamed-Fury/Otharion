import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { createLogger } from './logger.js';
import { config as envConfig } from '../config.js';

const log = createLogger('SelfHostConfig');

export interface CountingGuildConfig {
  channelId: string | null;
  currentCount: number;
  highScore: number;
  lastUserId: string | null;
  hardcoreTimeoutMin: number;
}

export interface StickyMessageEntry {
  message: string;
  lastMessageId: string | null;
  messageCountSinceLast: number;
  lastPostedAt: number;
  debounceSeconds: number;
  minMessages: number;
}

export interface HoneypotGuildConfig {
  enabled: boolean;
  channels: string[];
  action: 'ban' | 'kick' | 'timeout' | 'quarantine';
  timeoutDurationMin: number;
  purgeMessageDays: number;
  alertChannelId: string | null;
  immuneRoleIds: string[];
  dmNotice: boolean;
  triggerOnJoinSeconds: number;
}

export interface GuildSettings {
  counting: CountingGuildConfig;
  sticky: Record<string, StickyMessageEntry>;
  honeypot: HoneypotGuildConfig;
}

export interface BridgePair {
  id: string;
  discordChannelId: string;
  fluxerChannelId: string;
  enabled: boolean;
}

export interface OtharionConfigFile {
  version: string;
  botName: string;
  prefix: string;
  mode: 'sole' | 'mark';
  modules: {
    counting: boolean;
    sticky: boolean;
    honeypot: boolean;
    bridge: boolean;
    afk: boolean;
    sync: boolean;
    markPlugin: boolean;
  };
  guilds: Record<string, GuildSettings>;
  bridge: {
    pairs: BridgePair[];
  };
}

const DEFAULT_CONFIG: OtharionConfigFile = {
  version: '1.0.0',
  botName: 'Otharion',
  prefix: envConfig.prefix || 'o.',
  mode: (process.env.MODE as 'sole' | 'mark') || 'sole',
  modules: {
    counting: true,
    sticky: true,
    honeypot: true,
    bridge: true,
    afk: true,
    sync: true,
    markPlugin: process.env.MODE === 'mark',
  },
  guilds: {},
  bridge: {
    pairs: [],
  },
};

let currentConfig: OtharionConfigFile = { ...DEFAULT_CONFIG };

export function getConfigFilePath(): string {
  const customPath = process.env.OTHARION_CONFIG_PATH;
  if (customPath) return path.resolve(customPath);
  return path.resolve(process.cwd(), '.config.otharion');
}

export function getDefaultGuildSettings(): GuildSettings {
  return {
    counting: {
      channelId: null,
      currentCount: 0,
      highScore: 0,
      lastUserId: null,
      hardcoreTimeoutMin: 5,
    },
    sticky: {},
    honeypot: {
      enabled: false,
      channels: [],
      action: 'ban',
      timeoutDurationMin: 1440,
      purgeMessageDays: 1,
      alertChannelId: null,
      immuneRoleIds: [],
      dmNotice: true,
      triggerOnJoinSeconds: 0,
    },
  };
}

export function loadOtharionConfig(): OtharionConfigFile {
  const filePath = getConfigFilePath();

  if (!fs.existsSync(filePath)) {
    log.info(`No .config.otharion found at ${filePath}. Creating initial self-hostable config.`);
    saveOtharionConfig(DEFAULT_CONFIG);
    currentConfig = { ...DEFAULT_CONFIG };
    return currentConfig;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = YAML.parse(raw) as Partial<OtharionConfigFile>;

    currentConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      modules: { ...DEFAULT_CONFIG.modules, ...(parsed.modules || {}) },
      guilds: parsed.guilds || {},
      bridge: { pairs: parsed.bridge?.pairs || [] },
    };

    log.info(`Loaded self-hostable config from ${filePath} (Mode: ${currentConfig.mode}).`);
    return currentConfig;
  } catch (error) {
    log.error(`Failed to parse .config.otharion at ${filePath}, using defaults:`, error);
    currentConfig = { ...DEFAULT_CONFIG };
    return currentConfig;
  }
}

export function saveOtharionConfig(cfg: OtharionConfigFile = currentConfig): boolean {
  const filePath = getConfigFilePath();
  try {
    const yamlStr = YAML.stringify(cfg);
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, yamlStr, 'utf-8');
    fs.renameSync(tempFile, filePath);
    currentConfig = cfg;
    log.debug(`Saved .config.otharion successfully to ${filePath}`);
    return true;
  } catch (error) {
    log.error(`Failed to save .config.otharion to ${filePath}:`, error);
    return false;
  }
}

export function getOtharionConfig(): OtharionConfigFile {
  return currentConfig;
}

export function getGuildSettings(guildId: string): GuildSettings {
  if (!currentConfig.guilds[guildId]) {
    currentConfig.guilds[guildId] = getDefaultGuildSettings();
  }
  return currentConfig.guilds[guildId]!;
}

export function updateGuildSettings(guildId: string, mutator: (settings: GuildSettings) => void): boolean {
  const settings = getGuildSettings(guildId);
  mutator(settings);
  return saveOtharionConfig();
}

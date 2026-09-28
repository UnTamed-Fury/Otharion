import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getConfigFilePath,
  getDefaultGuildSettings,
  getGuildSettings,
  loadOtharionConfig,
  saveOtharionConfig,
  updateGuildSettings,
} from '../src/core/selfHostConfig.js';

describe('Self-Hostable Configuration Engine (.config.otharion)', () => {
  const configFile = getConfigFilePath();
  let originalContent: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(configFile)) {
      originalContent = fs.readFileSync(configFile, 'utf-8');
    }
  });

  afterEach(() => {
    if (originalContent !== null) {
      fs.writeFileSync(configFile, originalContent, 'utf-8');
    } else if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
  });

  it('loads and saves YAML configuration cleanly', () => {
    const config = loadOtharionConfig();
    expect(config.version).toBe('1.0.0');
    expect(config.botName).toBe('Otharion');
    expect(config.modules.counting).toBe(true);
    expect(config.modules.honeypot).toBe(true);

    const saved = saveOtharionConfig(config);
    expect(saved).toBe(true);
    expect(fs.existsSync(configFile)).toBe(true);
  });

  it('retrieves default guild settings for unconfigured guilds', () => {
    const defaults = getDefaultGuildSettings();
    expect(defaults.counting.currentCount).toBe(0);
    expect(defaults.counting.hardcoreTimeoutMin).toBe(5);
    expect(defaults.honeypot.enabled).toBe(false);
    expect(defaults.honeypot.action).toBe('ban');

    const guild = getGuildSettings('guild_test_123');
    expect(guild.counting.currentCount).toBe(0);
  });

  it('mutates and persists guild settings reactively', () => {
    updateGuildSettings('guild_test_mutate', (s) => {
      s.counting.channelId = 'chan_counting_99';
      s.counting.highScore = 42;
      s.honeypot.channels.push('chan_trap_88');
    });

    const updated = getGuildSettings('guild_test_mutate');
    expect(updated.counting.channelId).toBe('chan_counting_99');
    expect(updated.counting.highScore).toBe(42);
    expect(updated.honeypot.channels).toContain('chan_trap_88');
  });
});

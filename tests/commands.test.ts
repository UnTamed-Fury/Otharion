import { describe, it, expect, vi } from 'vitest';
import { getCommand } from '../src/commands/registry.js';
import type { CommandContext } from '../src/commands/types.js';
import { clearAfkMemory, isAfk } from '../src/core/afk/afkManager.js';
import { parseCommand } from '../src/core/pipeline.js';

function createMockContext(authorId = 'test_author', platform: 'discord' | 'fluxer' = 'discord'): {
  ctx: CommandContext;
  replies: any[];
} {
  const replies: any[] = [];
  const ctx: CommandContext = {
    authorId,
    authorTag: 'TestUser#0001',
    channelId: 'chan_123',
    guildId: 'guild_123',
    guildName: 'Test Guild',
    platform,
    async reply(response) {
      replies.push(response);
    },
    getPing() {
      return 35;
    },
  };
  return { ctx, replies };
}

describe('Otharion Command Engine & Execution', () => {
  it('parses command prefix and arguments correctly', () => {
    const parsed = parseCommand('o.afk global Coding a bot', 'o.');
    expect(parsed).not.toBeNull();
    expect(parsed?.commandName).toBe('afk');
    expect(parsed?.args).toEqual(['global', 'Coding', 'a', 'bot']);
    expect(parsed?.rawArgs).toBe('global Coding a bot');
  });

  it('parses bot mention as prefix', () => {
    const parsed = parseCommand('<@123456789> ping', 'o.', ['<@123456789>']);
    expect(parsed).not.toBeNull();
    expect(parsed?.commandName).toBe('ping');
  });

  it('executes ping command and reports latency', async () => {
    const { ctx, replies } = createMockContext();
    const cmd = getCommand('ping');
    expect(cmd).not.toBeNull();

    await cmd!.execute(ctx, [], '');
    expect(replies.length).toBe(1);
    expect(replies[0].title).toBe('Otharion Gateway Latency');
    expect(replies[0].description).toContain('35ms');
  });

  it('executes status command and reports middleman telemetry', async () => {
    const { ctx, replies } = createMockContext();
    const cmd = getCommand('status');
    expect(cmd).not.toBeNull();

    await cmd!.execute(ctx, [], '');
    expect(replies.length).toBe(1);
    expect(replies[0].title).toBe('Otharion Middleman Status');
    expect(replies[0].description).toContain('v1.0.0');
    expect(replies[0].description).toContain('v2.1.0');
  });

  it('executes afk command and updates in-memory status', async () => {
    clearAfkMemory();
    const { ctx, replies } = createMockContext('afk_exec_user');
    const cmd = getCommand('afk');
    expect(cmd).not.toBeNull();

    await cmd!.execute(ctx, ['Working', 'on', 'tests'], 'Working on tests');
    expect(replies.length).toBe(1);
    expect(replies[0].title).toContain('is now AFK');
    expect(isAfk('afk_exec_user', 'discord')).toBe(true);
  });

  it('resolves aliases correctly', () => {
    expect(getCommand('latency')?.name).toBe('ping');
    expect(getCommand('brb')?.name).toBe('afk');
    expect(getCommand('away')?.name).toBe('afk');
    expect(getCommand('link')?.name).toBe('sync');
    expect(getCommand('info')?.name).toBe('status');
    expect(getCommand('middleman')?.name).toBe('status');
  });

  it('executes help command index and command details', async () => {
    const { ctx, replies } = createMockContext();
    const cmd = getCommand('help');
    expect(cmd).not.toBeNull();

    // General help
    await cmd!.execute(ctx, [], '');
    expect(replies[0].title).toBe('Otharion Commands');

    // Specific command help
    await cmd!.execute(ctx, ['afk'], 'afk');
    expect(replies[1].title).toBe('Help • o.afk');
  });
});

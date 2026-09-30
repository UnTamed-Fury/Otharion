import { describe, it, expect, beforeEach } from 'vitest';
import { getOtharionDb, OtharionDatabase, setOtharionDbInstance } from '../src/core/db/database.js';
import {
  evaluateMathExpression,
  handleCountingMessage,
  parseCountNumber,
  setCountingAutoDeleteFail,
  setCountingChannel,
  setCountingChatAllowed,
  setCountingCurrentCount,
  setCountingMathAllowed,
  setCountingReactions,
  setHardcoreTimeout,
} from '../src/modules/counting/countingEngine.js';
import {
  clearAllStickyMessages,
  configureStickyChannel,
  handleStickyMessage,
  setStickyEmbed,
  setStickyMessage,
} from '../src/modules/sticky/stickyEngine.js';
import {
  addHoneypotChannel,
  addHoneypotImmuneUser,
  evaluateHoneypotTrigger,
  getHoneypotIncidents,
  getHoneypotStats,
  setHoneypotAccountAge,
  setHoneypotAction,
  setHoneypotQuarantineRole,
} from '../src/modules/honeypot/honeypotEngine.js';
import {
  addBridgePair,
  findDiscordPairForFluxer,
  findFluxerPairForDiscord,
  getBridgePairs,
  recordBridgeRelayEvent,
  removeBridgePair,
  setBridgeFilteredPrefixes,
  setBridgeMode,
  shouldRelayMessage,
  toggleBridgeBots,
} from '../src/modules/bridge/bridgeEngine.js';
import { configCommand } from '../src/commands/config.js';
import { countingCommand } from '../src/commands/counting.js';
import { stickyCommand } from '../src/commands/sticky.js';
import { honeypotCommand } from '../src/commands/honeypot.js';
import { bridgeCommand } from '../src/commands/bridge.js';
import type { CommandContext } from '../src/commands/types.js';

function createMockContext(authorId = 'boss_fury', guildId = 'test_guild_suite'): {
  ctx: CommandContext;
  replies: any[];
} {
  const replies: any[] = [];
  const ctx: CommandContext = {
    authorId,
    authorTag: 'Fury#0001',
    channelId: 'cmd_chan_1',
    guildId,
    guildName: 'Test Guild Suite',
    platform: 'discord',
    async reply(response) {
      replies.push(response);
    },
    getPing() {
      return 25;
    },
  };
  return { ctx, replies };
}

describe('Otharion Database & Super-Configurable Modules', () => {
  const guildId = 'test_guild_suite';
  const chanId = 'test_count_chan';

  beforeEach(() => {
    const db = new OtharionDatabase();
    db.clearMemory();
    setOtharionDbInstance(db);
  });

  describe('Database Document & Storage Integrity', () => {
    it('initializes clean v2.2.0 document with all module schemas', () => {
      const db = getOtharionDb();
      const doc = db.getDocument();
      expect(doc.version).toBe('2.2.0');
      expect(doc.stats).toBeDefined();

      const guild = db.getGuild(guildId);
      expect(guild.counting).toBeDefined();
      expect(guild.sticky).toBeDefined();
      expect(guild.honeypot).toBeDefined();
      expect(guild.bridge).toBeDefined();
      expect(guild.afk).toBeDefined();
      expect(guild.sync).toBeDefined();
    });

    it('persists and retrieves module configurations reactively', () => {
      const db = getOtharionDb();
      db.updateCountingConfig(guildId, (c) => {
        c.highScore = 999;
        c.highScoreHolder = 'fury_user';
      });

      const cfg = db.getCountingConfig(guildId);
      expect(cfg.highScore).toBe(999);
      expect(cfg.highScoreHolder).toBe('fury_user');
    });
  });

  describe('Counting Engine: Math Parser, Milestones, and Chat Tolerance', () => {
    it('evaluates safe math expressions correctly', () => {
      expect(evaluateMathExpression('5')).toBe(5);
      expect(evaluateMathExpression('2 + 3')).toBe(5);
      expect(evaluateMathExpression('10 - 4')).toBe(6);
      expect(evaluateMathExpression('2 * 3')).toBe(6);
      expect(evaluateMathExpression('20 / 4')).toBe(5);
      expect(evaluateMathExpression('(2 + 3) * 2')).toBe(10);
      expect(evaluateMathExpression('10 % 3')).toBe(1);

      // Invalid or unsafe inputs
      expect(evaluateMathExpression('-5')).toBeNull();
      expect(evaluateMathExpression('0')).toBeNull();
      expect(evaluateMathExpression('console.log(1)')).toBeNull();
      expect(evaluateMathExpression('hello')).toBeNull();
      expect(evaluateMathExpression('5 / 0')).toBeNull();
    });

    it('processes math counts in counting channel', () => {
      setCountingChannel(guildId, chanId);
      setCountingMathAllowed(guildId, true);

      const r1 = handleCountingMessage(guildId, chanId, 'user_a', '1');
      expect(r1.valid).toBe(true);
      expect(r1.newCount).toBe(1);

      const r2 = handleCountingMessage(guildId, chanId, 'user_b', '1 + 1');
      expect(r2.valid).toBe(true);
      expect(r2.newCount).toBe(2);

      const r3 = handleCountingMessage(guildId, chanId, 'user_a', '3 * 1');
      expect(r3.valid).toBe(true);
      expect(r3.newCount).toBe(3);
    });

    it('detects milestone counts and customizable reactions', () => {
      setCountingChannel(guildId, chanId);
      setCountingCurrentCount(guildId, 49);
      setCountingReactions(guildId, { milestone: '🏆' });

      const res = handleCountingMessage(guildId, chanId, 'user_c', '50');
      expect(res.valid).toBe(true);
      expect(res.isMilestone).toBe(true);
      expect(res.milestoneNumber).toBe(50);
      expect(res.milestoneEmoji).toBe('🏆');
    });

    it('respects chat tolerance and auto-delete settings', () => {
      setCountingChannel(guildId, chanId);
      setCountingChatAllowed(guildId, true);

      const chatRes = handleCountingMessage(guildId, chanId, 'user_a', 'Hey guys what number are we on?');
      expect(chatRes.ignored).toBe(true);
      expect(chatRes.ruined).toBe(false);

      setCountingChatAllowed(guildId, false);
      setCountingAutoDeleteFail(guildId, true);

      const strictChat = handleCountingMessage(guildId, chanId, 'user_a', 'Random chatter');
      expect(strictChat.ignored).toBe(true);
      expect(strictChat.autoDeleteFail).toBe(true);
    });
  });

  describe('Sticky Messages: Embeds, Modes, and Exemptions', () => {
    it('configures rich embed sticky messages with auto-delete previous', () => {
      const record = setStickyEmbed(guildId, 'chan_stick', 'Server Guidelines', 'No spamming allowed.', 0x000001);
      expect(record.isEmbed).toBe(true);
      expect(record.embedTitle).toBe('Server Guidelines');
      expect(record.deletePrevious).toBe(true);
    });

    it('handles multi-cooldown modes: messages vs time', () => {
      setStickyMessage(guildId, 'chan_stick', 'Sticky Notice', 10, 2, { cooldownMode: 'messages' });

      // Msg 1
      expect(handleStickyMessage(guildId, 'chan_stick').shouldPost).toBe(false);
      // Msg 2: threshold reached
      const r2 = handleStickyMessage(guildId, 'chan_stick');
      expect(r2.shouldPost).toBe(true);
      expect(r2.messageToPost).toBe('Sticky Notice');
    });

    it('exempts specified users and roles from advancing sticky count', () => {
      setStickyMessage(guildId, 'chan_stick', 'Sticky Notice', 10, 2, {
        exemptUserIds: ['bot_user_123'],
        exemptRoleIds: ['role_mod_456'],
      });

      // Exempt user: should not count
      const r1 = handleStickyMessage(guildId, 'chan_stick', 'bot_user_123');
      expect(r1.shouldPost).toBe(false);

      // Exempt role: should not count
      const r2 = handleStickyMessage(guildId, 'chan_stick', 'user_789', ['role_mod_456']);
      expect(r2.shouldPost).toBe(false);
    });

    it('clears all sticky messages cleanly', () => {
      clearAllStickyMessages(guildId);
      setStickyMessage(guildId, 'chan_1', 'Msg 1');
      setStickyMessage(guildId, 'chan_2', 'Msg 2');
      expect(clearAllStickyMessages(guildId)).toBe(2);
    });
  });

  describe('Honeypot Security: Quarantine, Incidents, and Age Filter', () => {
    it('supports quarantine action and logs incident history', () => {
      addHoneypotChannel(guildId, 'trap_chan');
      setHoneypotAction(guildId, 'quarantine', 1440, 1, 'quarantine_role_999');

      const verdict = evaluateHoneypotTrigger({
        guildId,
        channelId: 'trap_chan',
        userId: 'spammer_victim',
        userTag: 'Spammer#0001',
        memberJoinedTimestamp: Date.now() - 5000,
        accountCreatedTimestamp: Date.now() - 100000,
        userRoles: [],
        isAdmin: false,
        content: 'Scam link here',
      });

      expect(verdict.triggered).toBe(true);
      expect(verdict.action).toBe('quarantine');
      expect(verdict.quarantineRoleId).toBe('quarantine_role_999');

      const history = getHoneypotIncidents(guildId);
      expect(history.length).toBe(1);
      expect(history[0]?.userId).toBe('spammer_victim');
      expect(history[0]?.actionTaken).toBe('quarantine');

      const stats = getHoneypotStats(guildId);
      expect(stats.stats.actionsTaken.quarantine).toBe(1);
    });

    it('bypasses whitelisted immune users', () => {
      addHoneypotChannel(guildId, 'trap_chan');
      addHoneypotImmuneUser(guildId, 'safe_user_777');

      const verdict = evaluateHoneypotTrigger({
        guildId,
        channelId: 'trap_chan',
        userId: 'safe_user_777',
        userTag: 'SafeUser#0001',
        memberJoinedTimestamp: Date.now() - 5000,
        accountCreatedTimestamp: Date.now() - 100000,
        userRoles: [],
        isAdmin: false,
        content: 'Testing safe user',
      });

      expect(verdict.triggered).toBe(false);
      expect(verdict.ignored).toBe(true);
    });

    it('enforces account age threshold filter', () => {
      addHoneypotChannel(guildId, 'trap_chan');
      setHoneypotAccountAge(guildId, 7); // 7 days

      // Old account (30 days old): should be bypassed by age threshold
      const oldVerdict = evaluateHoneypotTrigger({
        guildId,
        channelId: 'trap_chan',
        userId: 'veteran_user',
        userTag: 'Vet#0001',
        memberJoinedTimestamp: Date.now() - 1000,
        accountCreatedTimestamp: Date.now() - 30 * 86400 * 1000,
        userRoles: [],
        isAdmin: false,
        content: 'Oops posted in wrong channel',
      });
      expect(oldVerdict.triggered).toBe(false);

      // Fresh account (1 day old): should trigger!
      const freshVerdict = evaluateHoneypotTrigger({
        guildId,
        channelId: 'trap_chan',
        userId: 'raid_bot',
        userTag: 'RaidBot#0001',
        memberJoinedTimestamp: Date.now() - 1000,
        accountCreatedTimestamp: Date.now() - 1 * 86400 * 1000,
        userRoles: [],
        isAdmin: false,
        content: 'Raid message',
      });
      expect(freshVerdict.triggered).toBe(true);
    });
  });

  describe('Cross-Platform Bridge: Modes, Bot Toggles, and Prefix Filters', () => {
    it('manages bridge modes and directional relays', () => {
      const pair = addBridgePair('dc_101', 'fx_202', 'General Relay', 'twoway');
      expect(pair.mode).toBe('twoway');

      expect(findFluxerPairForDiscord('dc_101')?.fluxerChannelId).toBe('fx_202');
      expect(findDiscordPairForFluxer('fx_202')?.discordChannelId).toBe('dc_101');

      // Change to discord-to-fluxer unidirectional
      setBridgeMode(pair.id, 'discord-to-fluxer');
      expect(findFluxerPairForDiscord('dc_101')).not.toBeNull();
      expect(findDiscordPairForFluxer('fx_202')).toBeNull(); // Blocked!
    });

    it('filters bot commands from relaying across bridge', () => {
      const pair = addBridgePair('dc_101', 'fx_202', 'Test Relay');
      setBridgeFilteredPrefixes(pair.id, ['+', 'o.', '!']);

      expect(shouldRelayMessage(pair, 'Hello world', false)).toBe(true);
      expect(shouldRelayMessage(pair, '+afk studying', false)).toBe(false);
      expect(shouldRelayMessage(pair, 'o.config', false)).toBe(false);
      expect(shouldRelayMessage(pair, '!help', false)).toBe(false);
    });

    it('tracks bridge relay telemetry statistics', () => {
      const pair = addBridgePair('dc_101', 'fx_202', 'Stats Relay');
      recordBridgeRelayEvent(pair.id, 'dc_to_fx');
      recordBridgeRelayEvent(pair.id, 'dc_to_fx');
      recordBridgeRelayEvent(pair.id, 'fx_to_dc');

      const pairs = getBridgePairs();
      const updated = pairs.find((p) => p.id === pair.id);
      expect(updated?.stats.relayedDiscordToFluxer).toBe(2);
      expect(updated?.stats.relayedFluxerToDiscord).toBe(1);
    });
  });

  describe('Chat Command Execution & In-Server Management', () => {
    it('executes o.config db and shows database telemetry', async () => {
      const { ctx, replies } = createMockContext();
      await configCommand.execute(ctx, ['db'], 'db');
      expect(replies.length).toBe(1);
      expect(replies[0].title).toContain('Otharion Bot Database Engine');
      expect(replies[0].description).toContain('2.2.0');
    });

    it('executes o.config get and set commands dynamically', async () => {
      const { ctx, replies } = createMockContext();
      await configCommand.execute(ctx, ['set', 'counting', 'hardcore', '12'], 'set counting hardcore 12');
      expect(replies[0]).toContain('12');

      const { ctx: ctxGet, replies: repliesGet } = createMockContext();
      await configCommand.execute(ctxGet, ['get', 'counting'], 'get counting');
      expect(repliesGet[0].title).toBe('Counting Module Configuration');
      expect(repliesGet[0].description).toContain('**12** min');
    });

    it('executes o.counting subcommands: setup, math, leaderboard', async () => {
      const { ctx, replies } = createMockContext();
      await countingCommand.execute(ctx, ['setup', '#count-room'], 'setup #count-room');
      expect(replies[0].title).toContain('Counting Channel Configured');

      const { ctx: ctxMath, replies: repliesMath } = createMockContext();
      await countingCommand.execute(ctxMath, ['math', 'on'], 'math on');
      expect(repliesMath[0].description).toContain('**ENABLED**');

      const { ctx: ctxLb, replies: repliesLb } = createMockContext();
      await countingCommand.execute(ctxLb, ['leaderboard'], 'leaderboard');
      expect(repliesLb[0].title).toContain('Counting Hall of Shame');
    });

    it('executes o.sticky embed and preview commands', async () => {
      const { ctx, replies } = createMockContext();
      await stickyCommand.execute(ctx, ['embed', '#rules', 'Discord Rules | Be friendly'], 'embed #rules Discord Rules | Be friendly');
      expect(replies[0].title).toContain('Sticky Embed Configured');

      const { ctx: ctxPrev, replies: repliesPrev } = createMockContext();
      await stickyCommand.execute(ctxPrev, ['preview', '#rules'], 'preview #rules');
      expect(repliesPrev[0].title).toBe('Discord Rules');
      expect(repliesPrev[0].description).toBe('Be friendly');
    });

    it('executes o.honeypot age, quarantine role, and history commands', async () => {
      const { ctx, replies } = createMockContext();
      await honeypotCommand.execute(ctx, ['role', '<@&98765>'], 'role <@&98765>');
      expect(replies[0].title).toContain('Quarantine Role Configured');

      const { ctx: ctxAge, replies: repliesAge } = createMockContext();
      await honeypotCommand.execute(ctxAge, ['age', '14'], 'age 14');
      expect(repliesAge[0].description).toContain('14 days ago');
    });

    it('executes o.bridge mode, filter, and stats commands', async () => {
      const { ctx, replies } = createMockContext();
      await bridgeCommand.execute(ctx, ['add', '111', '222', 'HQ Bridge'], 'add 111 222 HQ Bridge');
      expect(replies[0].title).toContain('Cross-Platform Bridge Established');

      const pairs = getBridgePairs();
      const pairId = pairs[0]!.id;

      const { ctx: ctxMode, replies: repliesMode } = createMockContext();
      await bridgeCommand.execute(ctxMode, ['mode', pairId, 'discord-only'], `mode ${pairId} discord-only`);
      expect(repliesMode[0].description).toContain('discord-to-fluxer');

      const { ctx: ctxStats, replies: repliesStats } = createMockContext();
      await bridgeCommand.execute(ctxStats, ['stats'], 'stats');
      expect(repliesStats[0].title).toContain('Bridge Relay Analytics');
    });
  });
});

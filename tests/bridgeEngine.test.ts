import { describe, it, expect, beforeEach } from 'vitest';
import {
  addBridgePair,
  computeMessageSignature,
  findDiscordChannelForFluxer,
  findFluxerChannelForDiscord,
  getBridgePairs,
  isEcho,
  recordSentRelay,
  removeBridgePair,
} from '../src/modules/bridge/bridgeEngine.js';
import { getOtharionConfig } from '../src/core/selfHostConfig.js';

describe('Cross-Platform Bridge & Anti-Echo Protocol', () => {
  beforeEach(() => {
    getOtharionConfig().bridge.pairs = [];
  });

  it('computes unique message signatures for anti-echo detection', () => {
    const sig1 = computeMessageSignature('user_1', 'Hello world', 0);
    const sig2 = computeMessageSignature('user_1', 'Hello world', 0);
    const sig3 = computeMessageSignature('user_2', 'Hello world', 0);

    expect(sig1).toBe(sig2);
    expect(sig1).not.toBe(sig3);
  });

  it('detects message echoes based on recorded relays', () => {
    expect(isEcho('user_echo', 'Testing relay', 1)).toBe(false);

    recordSentRelay('user_echo', 'Testing relay', 1, 5000);
    expect(isEcho('user_echo', 'Testing relay', 1)).toBe(true);
    expect(isEcho('other_user', 'Testing relay', 1)).toBe(false);
  });

  it('manages channel pairing across Discord and Fluxer', () => {
    const pair = addBridgePair('dc_chan_1', 'fx_chan_1');
    expect(pair.discordChannelId).toBe('dc_chan_1');
    expect(pair.fluxerChannelId).toBe('fx_chan_1');

    expect(findFluxerChannelForDiscord('dc_chan_1')).toBe('fx_chan_1');
    expect(findDiscordChannelForFluxer('fx_chan_1')).toBe('dc_chan_1');
    expect(findFluxerChannelForDiscord('unknown_dc')).toBeNull();

    expect(removeBridgePair('dc_chan_1')).toBe(true);
    expect(findFluxerChannelForDiscord('dc_chan_1')).toBeNull();
  });
});

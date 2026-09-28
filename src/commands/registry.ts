import { afkCommand } from './afk.js';
import { bridgeCommand } from './bridge.js';
import { configCommand } from './config.js';
import { countingCommand } from './counting.js';
import { createHelpCommand } from './help.js';
import { honeypotCommand } from './honeypot.js';
import { pingCommand } from './ping.js';
import { statusCommand } from './status.js';
import { stickyCommand } from './sticky.js';
import { syncCommand } from './sync.js';
import { initializeMarkPlugin } from '../plugins/mark/markPlugin.js';
import type { Command } from './types.js';

const baseCommands: Command[] = [
  pingCommand,
  afkCommand,
  syncCommand,
  statusCommand,
  countingCommand,
  honeypotCommand,
  stickyCommand,
  bridgeCommand,
  configCommand,
  ...initializeMarkPlugin(),
];

export const allCommands: Command[] = [
  ...baseCommands,
  createHelpCommand(() => allCommands),
];

const commandMap = new Map<string, Command>();

for (const cmd of allCommands) {
  commandMap.set(cmd.name.toLowerCase(), cmd);
  for (const alias of cmd.aliases) {
    commandMap.set(alias.toLowerCase(), cmd);
  }
}

export function getCommand(name: string): Command | null {
  return commandMap.get(name.toLowerCase()) || null;
}

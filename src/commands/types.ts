import type { Platform } from '../core/types.js';

export interface CommandContext {
  authorId: string;
  authorTag: string;
  channelId: string;
  guildId: string | null;
  guildName: string | null;
  platform: Platform;
  reply(response: string | { title?: string; description?: string; fields?: Array<{ name: string; value: string }> }): Promise<void>;
  getPing(): number;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  execute(ctx: CommandContext, args: string[], rawArgs: string): Promise<void>;
}

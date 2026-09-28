import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function resolveDataDir(): string {
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return path.resolve(process.env.DATA_DIR);
  }
  if (fs.existsSync('/data')) {
    return '/data';
  }
  const markBotData = path.resolve(process.cwd(), '../mark-bot/data');
  if (fs.existsSync(markBotData)) {
    return markBotData;
  }
  const localData = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(localData)) {
    fs.mkdirSync(localData, { recursive: true });
  }
  return localData;
}

export interface OtharionConfig {
  readonly discordToken: string | null;
  readonly fluxerToken: string | null;
  readonly prefix: string;
  readonly ownerId: string;
  readonly dataDir: string;
  readonly embedColor: number;
}

const dataDir = resolveDataDir();

export const config: OtharionConfig = {
  discordToken: process.env.OTHARION_DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || null,
  fluxerToken: process.env.OTHARION_FLUXER_TOKEN || process.env.FLUXER_BOT_TOKEN || null,
  prefix: process.env.PREFIX || 'o.',
  ownerId: process.env.OWNER_ID || '1130510553266278501',
  dataDir,
  embedColor: 0x000001,
};

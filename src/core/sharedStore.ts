import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('SharedStore');

export function getAfkFilePath(): string {
  return path.join(config.dataDir, 'afk.json');
}

export function getSyncFilePath(): string {
  return path.join(config.dataDir, 'sync.json');
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    log.error(`Failed to read JSON file at ${filePath}:`, error);
    return null;
  }
}

export function writeJsonFileAtomic<T>(filePath: string, data: T): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
    return true;
  } catch (error) {
    log.error(`Failed to atomically write JSON file at ${filePath}:`, error);
    return false;
  }
}

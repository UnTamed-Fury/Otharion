import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAfkFilePath, getSyncFilePath, readJsonFile, writeJsonFileAtomic } from '../src/core/sharedStore.js';
import { config } from '../src/config.js';

describe('Shared Store Persistence & Atomic I/O', () => {
  const testDir = path.resolve(process.cwd(), 'tests_tmp_store');
  const testFile = path.join(testDir, 'test.json');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('resolves afk and sync file paths within configured data directory', () => {
    expect(getAfkFilePath()).toContain('afk.json');
    expect(getSyncFilePath()).toContain('sync.json');
    expect(getAfkFilePath().startsWith(config.dataDir)).toBe(true);
  });

  it('atomically writes and reads valid JSON data', () => {
    const payload = {
      version: '2.1.0',
      timestamp: Date.now(),
      records: ['a', 'b', 'c'],
    };

    const success = writeJsonFileAtomic(testFile, payload);
    expect(success).toBe(true);
    expect(fs.existsSync(testFile)).toBe(true);

    const loaded = readJsonFile<typeof payload>(testFile);
    expect(loaded).toEqual(payload);
  });

  it('returns null when reading non-existent file', () => {
    const nonExistent = path.join(testDir, 'does-not-exist.json');
    expect(readJsonFile(nonExistent)).toBeNull();
  });

  it('returns null and does not throw when reading malformed JSON', () => {
    fs.writeFileSync(testFile, '{invalid json---', 'utf-8');
    expect(readJsonFile(testFile)).toBeNull();
  });
});

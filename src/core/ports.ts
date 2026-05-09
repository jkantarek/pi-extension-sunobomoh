import {
  readFile as fsReadFile,
  appendFile as fsAppendFile,
  writeFile as fsWriteFile,
  rename as fsRename,
  mkdir as fsMkdir,
  access,
} from 'node:fs/promises';
import type { IsoTimestamp } from './brands.js';
import { toIsoTimestamp } from './brands.js';

/**
 * @example
 * ```ts @import.meta.vitest
 * const { tmpdir } = await import('node:os');
 * const { join } = await import('node:path');
 * const fs = createNodeFileSystem();
 * const path = join(tmpdir(), `test-ports-${Date.now().toString()}.txt`);
 * const dir = join(tmpdir(), `test-ports-dir-${Date.now().toString()}`);
 * await fs.mkdir(dir);
 * expect(await fs.exists(dir)).toBe(true);
 * await fs.appendFile(path, 'hello');
 * expect(await fs.exists(path)).toBe(true);
 * expect(await fs.readFile(path)).toBe('hello');
 * expect(await fs.exists('/non/existent/__sunobomoh_test__')).toBe(false);
 *
 * const path2 = join(tmpdir(), `test-write-${Date.now().toString()}.txt`);
 * await fs.writeFile(path2, 'world');
 * expect(await fs.readFile(path2)).toBe('world');
 *
 * const path3 = join(tmpdir(), `test-rename-${Date.now().toString()}.txt`);
 * await fs.writeFile(path2, 'renamed');
 * await fs.rename(path2, path3);
 * expect(await fs.exists(path3)).toBe(true);
 * ```
 */
export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface Clock {
  now(): IsoTimestamp;
}

/* eslint-disable max-lines-per-function -- Factory with multiple methods */
export const createNodeFileSystem = (): FileSystem => ({
  readFile: (path: string) => fsReadFile(path, 'utf8'),
  writeFile: (path: string, data: string) => fsWriteFile(path, data, 'utf8'),
  appendFile: (path: string, data: string) => fsAppendFile(path, data, 'utf8'),
  rename: (oldPath: string, newPath: string) => fsRename(oldPath, newPath),
  mkdir: (path: string) => fsMkdir(path, { recursive: true }).then(() => undefined),
  exists: (path: string): Promise<boolean> =>
    access(path).then(
      () => true,
      () => false,
    ),
});

/**
 * @example
 * ```ts @import.meta.vitest
 * const clock = createSystemClock();
 * expect(typeof clock.now()).toBe('string');
 * expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
 * ```
 */
export const createSystemClock = (): Clock => ({
  now: (): IsoTimestamp => toIsoTimestamp(new Date()),
});

import { describe, it, expect } from 'vitest';
import {
  buildConfigCommand,
  buildWatchCommand,
  buildStateCommand,
  buildSteerCommand,
} from './commands.js';

/* eslint-disable @typescript-eslint/no-unsafe-argument */
describe('buildConfigCommand', () => {
  it('returns a CommandDefinition with correct name and handler function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildConfigCommand({} as any, {} as any, {});
    expect(cmd.name).toBe('sunobomoh:config');
    expect(typeof cmd.handler).toBe('function');
  });

  it('handler executes without error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildConfigCommand({} as any, {} as any, {});
    await expect(cmd.handler('', {})).resolves.toBeUndefined();
  });
});

describe('buildWatchCommand', () => {
  it('returns a CommandDefinition with correct name and handler function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildWatchCommand({} as any);
    expect(cmd.name).toBe('watch');
    expect(typeof cmd.handler).toBe('function');
  });

  it('handler executes without error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildWatchCommand({} as any);
    await expect(cmd.handler('', {})).resolves.toBeUndefined();
  });
});

describe('buildStateCommand', () => {
  it('returns a CommandDefinition with correct name and handler function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildStateCommand({} as any);
    expect(cmd.name).toBe('state');
    expect(typeof cmd.handler).toBe('function');
  });

  it('handler executes without error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildStateCommand({} as any);
    await expect(cmd.handler('', {})).resolves.toBeUndefined();
  });
});

describe('buildSteerCommand', () => {
  it('returns a CommandDefinition with correct name and handler function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildSteerCommand({} as any);
    expect(cmd.name).toBe('steer');
    expect(typeof cmd.handler).toBe('function');
  });

  it('handler executes without error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd = buildSteerCommand({} as any);
    await expect(cmd.handler('', {})).resolves.toBeUndefined();
  });
});
/* eslint-enable @typescript-eslint/no-unsafe-argument */

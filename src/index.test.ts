import { describe, it, expect } from 'vitest';

describe('Public package exports', () => {
  it('should export getSunobomoh', async () => {
    const mod = await import('./index.js');
    expect(mod.getSunobomoh).toBeDefined();
  });

  it('should export UNKNOWN_OUTCOME_SCHEMA', async () => {
    const mod = await import('./index.js');
    expect(mod.UNKNOWN_OUTCOME_SCHEMA).toBeDefined();
  });

  it('should export unsafeWatcherId', async () => {
    const mod = await import('./index.js');
    expect(mod.unsafeWatcherId).toBeDefined();
  });

  it('should export ok', async () => {
    const mod = await import('./index.js');
    expect(mod.ok).toBeDefined();
  });

  it('should export err', async () => {
    const mod = await import('./index.js');
    expect(mod.err).toBeDefined();
  });
});

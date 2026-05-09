import { describe, it, expect } from 'vitest';
import { collectSchemaValues } from './schema-form.js';

describe('collectSchemaValues (stub)', () => {
  it('throws not implemented error', async () => {
    let err: Error | undefined;
    try {
      await collectSchemaValues({}, {});
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).toBe('Not implemented');
  });
});

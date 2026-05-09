import { describe, it, expect } from 'vitest';
import { resolveEnvRefs } from './env-resolve.js';

describe('resolveEnvRefs primitives', () => {
  it('returns null as-is', () => {
    expect(resolveEnvRefs(null)).toBe(null);
  });

  it('returns numbers as-is', () => {
    expect(resolveEnvRefs(42)).toBe(42);
    expect(resolveEnvRefs(0)).toBe(0);
    expect(resolveEnvRefs(-1.5)).toBe(-1.5);
  });

  it('returns booleans as-is', () => {
    expect(resolveEnvRefs(true)).toBe(true);
    expect(resolveEnvRefs(false)).toBe(false);
  });

  it('returns undefined as-is', () => {
    expect(resolveEnvRefs(undefined)).toBe(undefined);
  });
});

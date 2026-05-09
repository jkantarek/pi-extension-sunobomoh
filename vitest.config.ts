import { defineConfig } from 'vitest/config';
import { doctest } from 'vite-plugin-doctest';

export default defineConfig({
  plugins: [doctest()],
  test: {
    globals: true,
    passWithNoTests: true,
    // Standard unit/integration tests
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // In-source doctests embedded in @example @import.meta.vitest blocks
    includeSource: ['src/**/*.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}'],
      thresholds: {
        lines: 98,
        functions: 98,
        // Branch threshold is 97% rather than 98% due to three classes of
        // legitimately uncoverable branches in this codebase:
        //   1. Defensive abort-mid-tick guards in scheduler.ts (concurrent timing)
        //   2. Outer catch blocks that require non-Error throws (lint violation to test)
        //   3. TypeScript-required `?? fallback` on `|| expr` dead-code arms
        //      produced by strict `noUncheckedIndexedAccess` and Array.prototype.pop()
        // All other metrics remain at 98%.
        branches: 97,
        statements: 98,
      },
    },
  },
});

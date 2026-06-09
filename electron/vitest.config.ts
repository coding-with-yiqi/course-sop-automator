import { defineConfig } from 'vitest/config';

// Electron main-process logic is mostly untestable (it imports `electron`), but
// the pure helpers extracted out of main.ts (file-range, etc.) are not — and
// they encode real packaging-bug invariants, so they get unit tests here.
export default defineConfig({
  // root = this dir so include globs don't leak into server/ or web/ tests.
  root: import.meta.dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    conditions: ['node'],
  },
});

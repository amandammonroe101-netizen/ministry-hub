import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    /* Rule tests talk to one shared emulator and clear the database
       between cases, so they cannot run in parallel against each
       other without clobbering their own fixtures. */
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});

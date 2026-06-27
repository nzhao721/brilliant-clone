import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Several integration tests drive long sequences of userEvent interactions
    // (lesson/practice completion, header coin reactivity). They finish quickly
    // in isolation but can exceed the 5s default when all suites run in parallel
    // under heavy load. Generous headroom keeps full-suite runs deterministic;
    // it only ever matters on a saturated machine and changes no behavior.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

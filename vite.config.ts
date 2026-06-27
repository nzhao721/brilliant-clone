import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Integration tests drive long userEvent sequences that can exceed the 5s
    // default when all suites run in parallel under load. Headroom keeps
    // full-suite runs deterministic and changes no behavior.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

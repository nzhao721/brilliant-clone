import { defineConfig } from 'vitest/config';

// Dedicated config for the audio pre-generation "test" (`npm run audio:gen`).
// Kept separate from vite.config.ts so the normal `vitest run` never executes
// the generator: this config targets only the generator file and runs it in a
// Node environment (it writes WAV assets to disk via node:fs).
export default defineConfig({
  test: {
    include: ['scripts/generate-audio.ts'],
    environment: 'node',
  },
});

import { defineConfig } from 'vitest/config';

// Dedicated config for the audio pre-generation "test" (`npm run audio:gen`).
// Kept separate from vite.config.ts so a normal `vitest run` never executes the
// generator: it targets only the generator file and runs in a Node environment
// (it writes audio assets to disk via node:fs).
export default defineConfig({
  test: {
    include: ['scripts/generate-audio.ts'],
    environment: 'node',
  },
});

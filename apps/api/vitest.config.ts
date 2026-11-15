import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { UPLOADS_DIR: './.data/test-uploads' },
    testTimeout: 30_000,
  },
});

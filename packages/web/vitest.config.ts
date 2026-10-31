import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // authkit-nextjs imports `next/cache` without an extension, which Node's
    // ESM resolver rejects; bundling it lets Vite resolve the import.
    server: { deps: { inline: ['@workos-inc/authkit-nextjs'] } },
    coverage: {
      include: ['src/app/**', 'src/lib/**', 'src/components/*.tsx'],
      exclude: ['src/components/ui/**'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});

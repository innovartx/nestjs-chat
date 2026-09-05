import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors the "src/*" path alias used by tsconfig.
  resolve: {
    alias: { src: resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    root: './src',
    environment: 'node',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage',
      reporter: ['text', 'lcov'],
      exclude: ['**/generated/**', '**/*.module.ts', '**/testing/**', '**/index.ts'],
    },
  },
  // SWC keeps the emitDecoratorMetadata output NestJS DI relies on.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest + React Testing Library + jsdom.
 *
 * Chosen over Jest because the project already builds with Vite-compatible
 * tooling and Vitest needs no Babel pipeline; the newest @vitejs/plugin-react
 * requires Babel 8 while this project is on Babel 7, and the plugin is not
 * needed anyway — esbuild handles TS and JSX, with the automatic runtime set
 * below because the Next tsconfig uses `jsx: "preserve"`.
 *
 * No Playwright: every required test is component- or module-level. Visual
 * breakpoint checking stays a manual 360/768/1280 pass in both directions,
 * which a headless browser would verify no better.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  css: {
    // Tests never assert on styles, and Vite would otherwise try to load the
    // project's Tailwind v4 postcss.config.mjs, whose plugin format its
    // PostCSS loader rejects. An empty plugin list skips discovery entirely.
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The Next build output and node_modules contain no tests and are slow to scan.
    exclude: ['node_modules', '.next', 'dist'],
    restoreMocks: true,
  },
});

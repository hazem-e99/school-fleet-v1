import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Global test setup.
 *
 * Unmounts between tests so a component's effects cannot leak into the next
 * one, and stubs the browser APIs jsdom does not implement but the app's
 * components touch on mount.
 */
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; several UI components read it on mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Neither does it implement ResizeObserver, which headless UI primitives use.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

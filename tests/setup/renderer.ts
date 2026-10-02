import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom doesn't implement scrolling or pointer capture.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.setPointerCapture = vi.fn();

afterEach(() => {
  cleanup();
  // Panel sizes are remembered in localStorage; each test starts from the defaults.
  localStorage.clear();
});

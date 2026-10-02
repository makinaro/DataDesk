import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../src/renderer/src/api';
import {
  AppearanceProvider,
  useAppearance,
} from '../../../src/renderer/src/appearance/AppearanceProvider';
import type { Appearance } from '../../../src/shared/appearance';
import type { IpcResult } from '../../../src/shared/ipc/result';
import { createFakeApi } from '../fakeApi';

function Probe() {
  const { appearance, resolvedTheme } = useAppearance();
  return <p>{`${appearance.theme} → ${resolvedTheme}`}</p>;
}

/** A controllable `(prefers-color-scheme: dark)` media query. */
function stubSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal('matchMedia', () => query);
  return (next: boolean) => {
    dark = next;
    for (const l of listeners) l();
  };
}

function renderProvider(api = createFakeApi()) {
  render(
    <ApiProvider api={api}>
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>
    </ApiProvider>,
  );
  return api;
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('AppearanceProvider', () => {
  it('leaves <html> unthemed until the saved theme arrives, then applies it', async () => {
    stubSystemTheme(true);
    const api = createFakeApi();
    let resolve!: (r: IpcResult<Appearance>) => void;
    api.settings.getAppearance.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderProvider(api);
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await act(async () => {
      resolve({ ok: true, data: { theme: 'light', layout: 'chat-first' } });
      await Promise.resolve();
    });

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByText('light → light')).toBeInTheDocument();
  });

  it('falls back to the dark default if loading fails', async () => {
    stubSystemTheme(false);
    const api = createFakeApi();
    api.settings.getAppearance.mockRejectedValueOnce(new Error('no handler'));
    renderProvider(api);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  it('resolves "system" from the OS and follows it when it changes', async () => {
    const setSystemDark = stubSystemTheme(false);
    const api = createFakeApi();
    api.settings.getAppearance.mockResolvedValueOnce({
      ok: true,
      data: { theme: 'system', layout: 'results-first' },
    });
    renderProvider(api);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    act(() => {
      setSystemDark(true);
    });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByText('system → dark')).toBeInTheDocument();
  });
});

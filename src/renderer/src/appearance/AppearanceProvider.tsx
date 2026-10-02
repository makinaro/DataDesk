import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  DEFAULT_APPEARANCE,
  resolveTheme,
  type Appearance,
  type ResolvedTheme,
} from '../../../shared/appearance';
import { useApi } from '../api';

interface AppearanceContextValue {
  appearance: Appearance;
  resolvedTheme: ResolvedTheme;
  /** Applies at once and saves; resolves to an error message, or null when saved. */
  update: (next: Partial<Appearance>) => Promise<string | null>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Main sets nativeTheme.themeSource, which drives this media query, so `system` follows the OS.
function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia(DARK_QUERY).matches;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  // Until the saved theme arrives, <html> has no data-theme and the window background (which
  // main already painted in the saved theme) shows through, so a light theme never flashes dark.
  const [loaded, setLoaded] = useState(false);
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const resolvedTheme = resolveTheme(appearance.theme, prefersDark);

  useEffect(() => {
    let cancelled = false;
    api.settings
      .getAppearance()
      .then(
        (result) => {
          if (!cancelled && result.ok) setAppearance(result.data);
        },
        () => undefined,
      )
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (loaded) document.documentElement.dataset.theme = resolvedTheme;
  }, [loaded, resolvedTheme]);

  const update = useCallback(
    async (next: Partial<Appearance>) => {
      const previous = appearance;
      const merged = { ...appearance, ...next };
      setAppearance(merged);
      try {
        const result = await api.settings.setAppearance(merged);
        if (result.ok) return null;
        setAppearance(previous);
        return result.error.message;
      } catch {
        setAppearance(previous);
        return 'Could not reach the app backend.';
      }
    },
    [api, appearance],
  );

  const value = useMemo(
    () => ({ appearance, resolvedTheme, update }),
    [appearance, resolvedTheme, update],
  );
  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return value;
}

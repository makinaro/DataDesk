import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { LayoutSchema, type Layout } from '../../../shared/appearance';

/**
 * Panel sizes in px, remembered per layout in localStorage. They are a per-machine convenience
 * (not a setting main needs before first paint), so they don't go through IPC. Stored values are
 * re-validated and clamped on read: a bad or stale entry falls back to the defaults.
 */
export const PANEL_LIMITS = {
  sidebar: { min: 180, max: 480 },
  /** The side column: Results in Chat-first, the docked chat in Results-first. */
  side: { min: 300, max: 960 },
  timeline: { min: 96, max: 640 },
} as const;

export type PanelKey = keyof typeof PANEL_LIMITS;

const SizesSchema = z.object({
  sidebar: z.number(),
  side: z.number(),
  timeline: z.number(),
});
export type PanelSizes = z.infer<typeof SizesSchema>;

const StoredSchema = z.partialRecord(LayoutSchema, SizesSchema);

export const STORAGE_KEY = 'datadesk.panelSizes.v1';

export const DEFAULT_SIZES: Record<Layout, PanelSizes> = {
  'chat-first': { sidebar: 260, side: 480, timeline: 200 },
  'results-first': { sidebar: 240, side: 400, timeline: 200 },
};

export function clampSize(key: PanelKey, px: number): number {
  const { min, max } = PANEL_LIMITS[key];
  return Math.round(Math.min(max, Math.max(min, px)));
}

function readAll(storage: Storage): z.infer<typeof StoredSchema> {
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function loadSizes(storage: Storage, layout: Layout): PanelSizes {
  const stored = readAll(storage)[layout] ?? DEFAULT_SIZES[layout];
  return {
    sidebar: clampSize('sidebar', stored.sidebar),
    side: clampSize('side', stored.side),
    timeline: clampSize('timeline', stored.timeline),
  };
}

export function saveSizes(storage: Storage, layout: Layout, sizes: PanelSizes): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(storage), [layout]: sizes }));
  } catch {
    // Storage full or unavailable: sizes just aren't remembered.
  }
}

export function usePanelSizes(layout: Layout) {
  const [state, setState] = useState(() => ({
    layout,
    sizes: loadSizes(localStorage, layout),
  }));
  // Switching layout swaps in that layout's sizes (adjusting state during render, not in an effect).
  let current = state;
  if (state.layout !== layout) {
    current = { layout, sizes: loadSizes(localStorage, layout) };
    setState(current);
  }

  useEffect(() => {
    saveSizes(localStorage, state.layout, state.sizes);
  }, [state]);

  const setSize = useCallback((key: PanelKey, px: number) => {
    setState((s) => ({ ...s, sizes: { ...s.sizes, [key]: clampSize(key, px) } }));
  }, []);

  return [current.sizes, setSize] as const;
}

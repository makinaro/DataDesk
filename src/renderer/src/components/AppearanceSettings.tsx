import { useState } from 'react';
import type { Layout, Theme } from '../../../shared/appearance';
import { useAppearance } from '../appearance/AppearanceProvider';

const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Black and white' },
  { id: 'light', label: 'Light', hint: 'White and black' },
  { id: 'slate', label: 'Slate', hint: 'The classic blue-grey' },
  { id: 'system', label: 'System', hint: 'Follows Windows' },
];

const LAYOUTS: { id: Layout; label: string; hint: string }[] = [
  { id: 'results-first', label: 'Results-first', hint: 'Charts in the middle, chat docked right' },
  { id: 'chat-first', label: 'Chat-first', hint: 'Chat in the middle, charts on the right' },
];

export function AppearanceSettings() {
  const { appearance, update } = useAppearance();
  const [error, setError] = useState<string | null>(null);

  async function choose(theme: Theme) {
    setError(await update({ theme }));
  }

  async function chooseLayout(layout: Layout) {
    setError(await update({ layout }));
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Theme</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-lg border p-2 has-focus-visible:outline-2 has-focus-visible:outline-focus ${
                appearance.theme === t.id ? 'border-fg' : 'border-line hover:border-faint'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={t.id}
                checked={appearance.theme === t.id}
                onChange={() => void choose(t.id)}
                className="sr-only"
              />
              <ThemePreview theme={t.id} />
              <span className="mt-2 block text-sm">{t.label}</span>
              <span className="block text-xs text-faint">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Layout</legend>
        <div className="grid grid-cols-2 gap-3">
          {LAYOUTS.map((l) => (
            <label
              key={l.id}
              className={`cursor-pointer rounded-lg border p-2 has-focus-visible:outline-2 has-focus-visible:outline-focus ${
                appearance.layout === l.id ? 'border-fg' : 'border-line hover:border-faint'
              }`}
            >
              <input
                type="radio"
                name="layout"
                value={l.id}
                checked={appearance.layout === l.id}
                onChange={() => void chooseLayout(l.id)}
                className="sr-only"
              />
              <LayoutPreview layout={l.id} />
              <span className="mt-2 block text-sm">{l.label}</span>
              <span className="block text-xs text-faint">{l.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Datasets, the main area and the side column, with the chat drawn as message lines. */
function LayoutPreview({ layout }: { layout: Layout }) {
  const chat = (
    <span className="flex flex-col justify-end gap-1 p-1.5">
      <span className="ml-auto h-1.5 w-1/2 rounded-full bg-bubble" />
      <span className="h-1 w-3/4 rounded-full bg-faint" />
      <span className="mt-0.5 h-2 rounded-sm border border-line" />
    </span>
  );
  const results = (
    <span className="flex items-end gap-1 p-2">
      <span className="h-1/3 flex-1 rounded-sm bg-faint" />
      <span className="h-2/3 flex-1 rounded-sm bg-muted" />
      <span className="h-1/2 flex-1 rounded-sm bg-faint" />
    </span>
  );
  return (
    <span
      aria-hidden="true"
      className="grid h-14 grid-cols-[1fr_3fr_2fr] overflow-hidden rounded border border-line bg-canvas"
    >
      <span className="bg-surface" />
      {layout === 'results-first' ? results : chat}
      <span className="border-l border-line">{layout === 'results-first' ? chat : results}</span>
    </span>
  );
}

/** A miniature window drawn with the theme's own tokens (themes apply to any element). */
function ThemePreview({ theme }: { theme: Theme }) {
  if (theme === 'system') {
    return (
      <span aria-hidden="true" className="grid h-14 grid-cols-2 overflow-hidden rounded">
        <MiniWindow theme="light" />
        <MiniWindow theme="dark" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="block h-14 overflow-hidden rounded">
      <MiniWindow theme={theme} />
    </span>
  );
}

function MiniWindow({ theme }: { theme: Exclude<Theme, 'system'> }) {
  return (
    <span data-theme={theme} className="flex h-full border border-line bg-canvas">
      <span className="w-1/4 bg-surface" />
      <span className="flex flex-1 flex-col justify-end gap-1 p-1.5">
        <span className="ml-auto h-1.5 w-1/2 rounded-full bg-bubble" />
        <span className="h-1 w-3/4 rounded-full bg-muted" />
        <span className="h-1 w-1/2 rounded-full bg-faint" />
        <span className="ml-auto h-2 w-2 rounded-sm bg-accent" />
      </span>
    </span>
  );
}

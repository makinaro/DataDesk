import { useState } from 'react';
import type { Theme } from '../../../shared/appearance';
import { useAppearance } from '../appearance/AppearanceProvider';

const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Black and white' },
  { id: 'light', label: 'Light', hint: 'White and black' },
  { id: 'slate', label: 'Slate', hint: 'The classic blue-grey' },
  { id: 'system', label: 'System', hint: 'Follows Windows' },
];

export function AppearanceSettings() {
  const { appearance, update } = useAppearance();
  const [error, setError] = useState<string | null>(null);

  async function choose(theme: Theme) {
    setError(await update({ theme }));
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
      {error && (
        <p role="alert" className="rounded bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
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

/**
 * Keyboard shortcuts the default application menu used to provide. With no menu (the title bar
 * is drawn by the page), main handles them in `before-input-event`. Copy, paste, cut, select-all
 * and undo don't need a menu on Windows: the page's text fields handle them natively.
 */
export type ShortcutAction = 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'devtools' | 'reload';

interface KeyInput {
  type: string;
  key: string;
  code: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function shortcutFor(input: KeyInput, { dev }: { dev: boolean }): ShortcutAction | null {
  if (input.type !== 'keyDown' || input.alt || input.meta) return null;
  if (input.control) {
    if (input.key === '=' || input.key === '+') return 'zoom-in';
    if (input.key === '-' || input.key === '_') return 'zoom-out';
    if (input.key === '0') return 'zoom-reset';
  }
  if (!dev) return null;
  if (input.key === 'F12' || (input.control && input.shift && input.code === 'KeyI')) {
    return 'devtools';
  }
  if (input.key === 'F5' || (input.control && !input.shift && input.code === 'KeyR')) {
    return 'reload';
  }
  return null;
}

const ZOOM_STEP = 0.5;
const ZOOM_LIMIT = 3;

export interface ShortcutTarget {
  getZoomLevel(): number;
  setZoomLevel(level: number): void;
  toggleDevTools(): void;
  reload(): void;
}

export function runShortcut(action: ShortcutAction, target: ShortcutTarget): void {
  const zoom = target.getZoomLevel();
  switch (action) {
    case 'zoom-in':
      target.setZoomLevel(Math.min(zoom + ZOOM_STEP, ZOOM_LIMIT));
      break;
    case 'zoom-out':
      target.setZoomLevel(Math.max(zoom - ZOOM_STEP, -ZOOM_LIMIT));
      break;
    case 'zoom-reset':
      target.setZoomLevel(0);
      break;
    case 'devtools':
      target.toggleDevTools();
      break;
    case 'reload':
      target.reload();
      break;
  }
}

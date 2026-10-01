import { describe, expect, it, vi } from 'vitest';
import { runShortcut, shortcutFor } from '../../src/main/shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'control' | 'shift' | 'alt' | 'meta', boolean>> = {},
) => ({
  type: 'keyDown',
  key: k,
  code: /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k,
  control: false,
  shift: false,
  alt: false,
  meta: false,
  ...mods,
});

describe('shortcutFor', () => {
  it('keeps zoom in every build', () => {
    for (const dev of [true, false]) {
      expect(shortcutFor(key('=', { control: true }), { dev })).toBe('zoom-in');
      expect(shortcutFor(key('+', { control: true, shift: true }), { dev })).toBe('zoom-in');
      expect(shortcutFor(key('-', { control: true }), { dev })).toBe('zoom-out');
      expect(shortcutFor(key('0', { control: true }), { dev })).toBe('zoom-reset');
    }
  });

  it('offers DevTools and reload only in development', () => {
    const devtools = [key('F12'), key('I', { control: true, shift: true })];
    const reload = [key('F5'), key('R', { control: true })];
    for (const input of devtools) {
      expect(shortcutFor(input, { dev: true })).toBe('devtools');
      expect(shortcutFor(input, { dev: false })).toBeNull();
    }
    for (const input of reload) {
      expect(shortcutFor(input, { dev: true })).toBe('reload');
      expect(shortcutFor(input, { dev: false })).toBeNull();
    }
  });

  it('leaves editing keys, key-ups and modified variants to the page', () => {
    for (const k of ['c', 'v', 'x', 'a', 'z']) {
      expect(shortcutFor(key(k, { control: true }), { dev: true })).toBeNull();
    }
    expect(shortcutFor({ ...key('F12'), type: 'keyUp' }, { dev: true })).toBeNull();
    expect(shortcutFor(key('0', { control: true, alt: true }), { dev: true })).toBeNull();
    expect(shortcutFor(key('0'), { dev: true })).toBeNull();
  });
});

describe('runShortcut', () => {
  function target(level = 0) {
    return {
      level,
      getZoomLevel() {
        return this.level;
      },
      setZoomLevel(next: number) {
        this.level = next;
      },
      toggleDevTools: vi.fn(),
      reload: vi.fn(),
    };
  }

  it('zooms in half steps within limits and resets to 0', () => {
    const t = target();
    runShortcut('zoom-in', t);
    expect(t.level).toBe(0.5);
    t.level = 3;
    runShortcut('zoom-in', t);
    expect(t.level).toBe(3);
    t.level = -3;
    runShortcut('zoom-out', t);
    expect(t.level).toBe(-3);
    runShortcut('zoom-reset', t);
    expect(t.level).toBe(0);
  });

  it('toggles DevTools and reloads', () => {
    const t = target();
    runShortcut('devtools', t);
    runShortcut('reload', t);
    expect(t.toggleDevTools).toHaveBeenCalledOnce();
    expect(t.reload).toHaveBeenCalledOnce();
  });
});

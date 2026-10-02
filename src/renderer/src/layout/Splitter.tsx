import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

const STEP = 24;

interface SplitterProps {
  /** Accessible name, e.g. "Resize datasets". */
  label: string;
  /** `vertical` sits between columns and changes a width; `horizontal` changes a height. */
  orientation: 'vertical' | 'horizontal';
  /** Size of the panel this splitter resizes, in px. */
  value: number;
  min: number;
  max: number;
  /**
   * Where the panel is relative to the splitter. `before`: dragging right/down grows it.
   * `after` (a right-hand column or a bottom drawer): dragging right/down shrinks it.
   */
  panel: 'before' | 'after';
  onChange: (px: number) => void;
}

/**
 * A WAI-ARIA window splitter: focusable, with arrow keys (24 px), Home/End (min/max) and
 * pointer drag. The pointer is captured, so a fast drag that leaves the 1 px line keeps going.
 */
export function Splitter({ label, orientation, value, min, max, panel, onChange }: SplitterProps) {
  const drag = useRef<{ start: number; size: number } | null>(null);
  const vertical = orientation === 'vertical';
  const sign = panel === 'before' ? 1 : -1;
  const coord = (e: PointerEvent) => (vertical ? e.clientX : e.clientY);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { start: coord(e), size: value };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onChange(drag.current.size + sign * (coord(e) - drag.current.start));
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = vertical
      ? { ArrowRight: STEP * sign, ArrowLeft: -STEP * sign }
      : { ArrowDown: STEP * sign, ArrowUp: -STEP * sign };
    const delta = keys[e.key];
    let next: number | null = delta === undefined ? null : value + delta;
    if (e.key === 'Home') next = min;
    if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={`splitter ${vertical ? 'splitter-v' : 'splitter-h'}`}
    />
  );
}

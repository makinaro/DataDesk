import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Splitter } from '../../../src/renderer/src/layout/Splitter';

function Harness({ panel, start = 300 }: { panel: 'before' | 'after'; start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <Splitter
      label="Resize results"
      orientation="vertical"
      value={value}
      min={200}
      max={600}
      panel={panel}
      onChange={(px) => {
        setValue(Math.min(600, Math.max(200, px)));
      }}
    />
  );
}

const size = () => Number(screen.getByRole('separator').getAttribute('aria-valuenow'));

describe('Splitter', () => {
  it('is a focusable, labelled window splitter with its current size', () => {
    render(<Harness panel="before" />);
    const sep = screen.getByRole('separator', { name: 'Resize results' });
    expect(sep).toHaveAttribute('tabindex', '0');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuemin', '200');
    expect(sep).toHaveAttribute('aria-valuemax', '600');
    expect(size()).toBe(300);
  });

  it('resizes with arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness panel="before" />);
    screen.getByRole('separator').focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(size()).toBe(348);
    await user.keyboard('{ArrowLeft}');
    expect(size()).toBe(324);
    await user.keyboard('{Home}');
    expect(size()).toBe(200);
    await user.keyboard('{End}');
    expect(size()).toBe(600);
  });

  it('moves the line the way the arrow points for a panel after it', async () => {
    const user = userEvent.setup();
    render(<Harness panel="after" />);
    screen.getByRole('separator').focus();
    await user.keyboard('{ArrowLeft}');
    expect(size()).toBe(324);
  });

  it('resizes by pointer drag, relative to where the drag started', () => {
    render(<Harness panel="after" />);
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 450 });
    expect(size()).toBe(350);
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 520 });
    expect(size()).toBe(280);
    fireEvent.pointerUp(sep, { pointerId: 1 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 0 });
    expect(size()).toBe(280);
  });
});

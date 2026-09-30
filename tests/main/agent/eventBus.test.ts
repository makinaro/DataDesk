import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/main/agent/eventBus';
import type { AgentEvent, AgentEventInput } from '../../../src/shared/agent';
import { preview } from '../../../src/shared/agent';

describe('createEventBus', () => {
  it('stamps monotonic seq and timestamps, then delivers', () => {
    const delivered: AgentEvent[] = [];
    let t = 1000;
    const emit = createEventBus(
      (e) => delivered.push(e),
      undefined,
      () => t++,
    );
    emit({ kind: 'status', status: 'running' });
    emit({ kind: 'error', message: 'x' });
    expect(delivered).toEqual([
      { kind: 'status', status: 'running', seq: 0, at: 1000 },
      { kind: 'error', message: 'x', seq: 1, at: 1001 },
    ]);
  });

  it('drops events that fail validation instead of forwarding them', () => {
    const deliver = vi.fn();
    const logError = vi.fn();
    const emit = createEventBus(deliver, logError);
    emit({ kind: 'status', status: 'bogus' } as unknown as AgentEventInput);
    emit({ kind: 'tool_result', toolUseId: 't', isError: false, output: 'x'.repeat(10_000) });
    expect(deliver).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(2);
  });
});

describe('preview', () => {
  it('truncates long values and stringifies non-strings', () => {
    expect(preview('short')).toBe('short');
    expect(preview({ a: 1 })).toBe('{"a":1}');
    expect(preview(undefined)).toBe('undefined');
    const long = preview('x'.repeat(10_000), 100);
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long).toMatch(/… \[\+\d+\]$/);
  });
});

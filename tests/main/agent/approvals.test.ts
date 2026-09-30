import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalBroker } from '../../../src/main/agent/approvals';
import type { AgentEventInput } from '../../../src/shared/agent';

function setup(timeoutMs = 1_000) {
  const events: AgentEventInput[] = [];
  const broker = new ApprovalBroker((e) => events.push(e), timeoutMs);
  const lastRequestId = () => {
    const req = [...events].reverse().find((e) => e.kind === 'approval_request');
    if (req?.kind !== 'approval_request') throw new Error('no request emitted');
    return req.requestId;
  };
  return { broker, events, lastRequestId };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ApprovalBroker', () => {
  it('emits a request and resolves true only on explicit approval', async () => {
    const { broker, events, lastRequestId } = setup();
    const pending = broker.request({
      toolName: 'mcp__datadesk__register_dataset',
      title: 'Add?',
      detail: 'C:/x.csv',
    });
    expect(events[0]).toMatchObject({ kind: 'approval_request', title: 'Add?' });
    expect(broker.respond(lastRequestId(), true)).toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(events[1]).toMatchObject({ kind: 'approval_resolved', approved: true });
  });

  it('denies on user rejection', async () => {
    const { broker, lastRequestId } = setup();
    const pending = broker.request({ toolName: 't', title: 't', detail: '' });
    broker.respond(lastRequestId(), false);
    await expect(pending).resolves.toBe(false);
  });

  it('denies on timeout', async () => {
    vi.useFakeTimers();
    const { broker } = setup(50);
    const pending = broker.request({ toolName: 't', title: 't', detail: '' });
    vi.advanceTimersByTime(60);
    await expect(pending).resolves.toBe(false);
  });

  it('denies when the tool call is aborted, including already-aborted signals', async () => {
    const { broker } = setup();
    const controller = new AbortController();
    const pending = broker.request({
      toolName: 't',
      title: 't',
      detail: '',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toBe(false);
    await expect(
      broker.request({ toolName: 't', title: 't', detail: '', signal: AbortSignal.abort() }),
    ).resolves.toBe(false);
  });

  it('ignores unknown or repeated responses (no double resolution)', async () => {
    const { broker, lastRequestId, events } = setup();
    expect(broker.respond('nope', true)).toBe(false);
    const pending = broker.request({ toolName: 't', title: 't', detail: '' });
    const id = lastRequestId();
    broker.respond(id, false);
    expect(broker.respond(id, true)).toBe(false);
    await expect(pending).resolves.toBe(false);
    expect(events.filter((e) => e.kind === 'approval_resolved')).toHaveLength(1);
  });

  it('denyAll rejects everything pending (e.g. on reset or shutdown)', async () => {
    const { broker } = setup();
    const a = broker.request({ toolName: 'a', title: 'a', detail: '' });
    const b = broker.request({ toolName: 'b', title: 'b', detail: '' });
    broker.denyAll();
    await expect(Promise.all([a, b])).resolves.toEqual([false, false]);
  });
});

import { describe, expect, it } from 'vitest';
import { InputQueue } from '../../../../src/main/agent/claude/inputQueue';

describe('InputQueue', () => {
  it('neutralizes slash commands in what the SDK actually receives', async () => {
    const queue = new InputQueue();
    queue.push('/cost');
    queue.push('Which region sold most?');
    queue.close();
    const sent: unknown[] = [];
    for await (const m of queue) sent.push(m.message.content);
    // A leading space stops Claude Code from dispatching a command (probe, D-015). "!" and "#"
    // prefixes reach the model as plain text in SDK mode, so they are left alone.
    expect(sent).toEqual([' /cost', 'Which region sold most?']);
  });

  it('delivers a message pushed while the SDK is already waiting', async () => {
    const queue = new InputQueue();
    const iterator = queue[Symbol.asyncIterator]();
    const next = iterator.next();
    queue.push('/compact');
    await expect(next).resolves.toMatchObject({
      done: false,
      value: { message: { content: ' /compact' } },
    });
    queue.close();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });
});

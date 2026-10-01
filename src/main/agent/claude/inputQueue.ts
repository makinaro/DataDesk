import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Skills need Claude Code's slash commands enabled (`--disable-slash-commands` also removes
 * skills and the Skill tool; verified by probe, D-015). So a chat message like "/cost" would run
 * a Claude Code command. A leading space stops dispatch (probe) while the model still sees the
 * text, so DataDesk's chat box never acts as a CLI.
 */
export function neutralizeSlashCommand(text: string): string {
  return text.startsWith('/') ? ` ${text}` : text;
}

/**
 * The prompt stream for a long-lived session (the SDK's "streaming input mode"). The SDK pulls
 * from this async iterable; each `push` becomes a user turn. While it stays open the session
 * (and its datadesk-mcp process) stays alive between messages; `close` ends the session.
 */
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private readonly buffer: SDKUserMessage[] = [];
  private waiting: ((result: IteratorResult<SDKUserMessage>) => void) | undefined;
  private closed = false;

  push(text: string): void {
    if (this.closed) throw new Error('Session is closed.');
    const message: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: neutralizeSlashCommand(text) },
      parent_tool_use_id: null,
    };
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ value: message, done: false });
    } else {
      this.buffer.push(message);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const queued = this.buffer.shift();
        if (queued) return Promise.resolve({ value: queued, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

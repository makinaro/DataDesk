import { RunContext } from '@openai/agents-core';
import { describe, expect, it, vi } from 'vitest';
import {
  datadeskFunctionTool,
  type AnalystTreeInput,
  type Caller,
} from '../../../../src/main/agent/openai/analystAgents';
import { fakeServer, scriptedModel } from './fakeOpenAI';

const REGISTER = {
  name: 'register_dataset',
  description: 'register',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

function gate(caller: Caller, signal = new AbortController().signal) {
  const askUser = vi.fn(() => Promise.resolve(true));
  const markError = vi.fn();
  const server = fakeServer();
  const input: AnalystTreeInput = {
    listed: [REGISTER],
    server: server.server,
    model: scriptedModel({}).model,
    modelSettings: {},
    openaiTools: false,
    skills: [],
    askUser,
    markError,
    onSubagentEvent: () => undefined,
    signal,
  };
  const tool = datadeskFunctionTool(REGISTER, caller, input);
  const call = (args: unknown) =>
    tool.invoke(new RunContext(), JSON.stringify(args), {
      toolCall: {
        type: 'function_call',
        callId: 'c1',
        name: tool.name,
        arguments: JSON.stringify(args),
      },
    });
  return { tool, call, askUser, markError, server };
}

describe('datadeskFunctionTool approval gate', () => {
  it('keeps the neutral name and lets the analyst ask the user', async () => {
    const g = gate('analyst');
    expect(g.tool.name).toBe('mcp__datadesk__register_dataset');
    await g.call({ path: 'C:/a.csv' });
    expect(g.askUser).toHaveBeenCalledOnce();
    expect(g.server.calls).toEqual([{ name: 'register_dataset', args: { path: 'C:/a.csv' } }]);
  });

  it('refuses a sub-agent even if the tool were handed to it (belt and braces with the scope table)', async () => {
    const g = gate('profiler');
    await expect(g.call({ path: 'C:/a.csv' })).resolves.toMatch(/Only the main analyst/);
    expect(g.askUser).not.toHaveBeenCalled();
    expect(g.server.calls).toEqual([]);
    expect(g.markError).toHaveBeenCalledWith('c1');
  });

  it('never opens a dialog for a turn that was already stopped', async () => {
    const abort = new AbortController();
    abort.abort();
    const g = gate('analyst', abort.signal);
    await expect(g.call({ path: 'C:/a.csv' })).resolves.toMatch(/stopped/);
    expect(g.askUser).not.toHaveBeenCalled();
    expect(g.server.calls).toEqual([]);
  });

  it('rejects input that is not a JSON object', async () => {
    const g = gate('analyst');
    await expect(g.call([1, 2])).resolves.toMatch(/expected a JSON object/);
    expect(g.askUser).not.toHaveBeenCalled();
  });
});

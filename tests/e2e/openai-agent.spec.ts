import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MCPServerStdio } from '@openai/agents-core';
import electronPath from 'electron';
import { expect, test } from '@playwright/test';
import { ApprovalBroker } from '../../src/main/agent/approvals';
import { OpenAIOrchestrator } from '../../src/main/agent/openai/openaiOrchestrator';
import { createOpenAISession } from '../../src/main/agent/openai/openaiSession';
import type { AgentEventInput } from '../../src/shared/agent';
import { scriptedModel } from '../main/agent/openai/fakeOpenAI';

/**
 * The OpenAI analyst against the *built* datadesk-mcp over real stdio, through the SDK's own
 * MCPServerStdio (Phase 7). The model is scripted: no request leaves the machine. The dummy
 * key only makes datadesk-mcp list its OpenAI tools; they are never called.
 */
test('the OpenAI orchestrator drives the real datadesk-mcp over stdio', async () => {
  const root = mkdtempSync(join(tmpdir(), 'datadesk-openai-'));
  const workspaceDir = join(root, 'agent-workspace');
  mkdirSync(workspaceDir);
  const events: AgentEventInput[] = [];
  const emit = (e: AgentEventInput) => events.push(e);
  const { model, requests } = scriptedModel({
    analyst: [
      {
        calls: [
          { callId: 'c1', name: 'mcp__datadesk__list_datasets', args: {} },
          { callId: 'c2', name: 'mcp__datadesk__run_sql', args: { sql: 'SELECT 6 * 7 AS answer' } },
        ],
      },
      { text: 'The answer is 42.' },
    ],
  });
  const orchestrator = new OpenAIOrchestrator({
    emit,
    approvals: new ApprovalBroker(emit),
    createSession: () =>
      createOpenAISession({
        apiKey: 'sk-e2e-dummy-key-not-real',
        modelName: 'gpt-5.4-mini',
        settings: { maxTurns: 5, maxBudgetUsd: 1 },
        paths: {
          userData: root,
          mainDir: resolve('out/main'),
          extensionDir: undefined,
          agentPluginDir: resolve('resources/agent-plugin'),
        },
        workspaceDir,
        instance: 'e2e',
        // Tests run under Node, so point the spawn at the Electron binary like the app's execPath.
        createServer: (options) =>
          new MCPServerStdio({ ...options, command: electronPath as unknown as string }),
        createModel: () => model,
      }),
  });

  try {
    orchestrator.send('What is six times seven?');
    await expect
      .poll(() => events.some((e) => e.kind === 'turn_complete'), { timeout: 30_000 })
      .toBe(true);
    const results = events.filter((e) => e.kind === 'tool_result');
    expect(results.map((r) => [r.toolUseId, r.isError])).toEqual([
      ['c1', false],
      ['c2', false],
    ]);
    expect(results[1]?.output).toContain('42');
    expect(events.find((e) => e.kind === 'turn_complete')).toMatchObject({ ok: true });
    // The model saw datadesk-mcp's real schemas under the neutral names.
    const sent = requests[0]?.request.tools.find((t) => t.name === 'mcp__datadesk__run_sql');
    expect(JSON.stringify(sent)).toContain('sql');
  } finally {
    await orchestrator.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

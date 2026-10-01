import { describe, expect, it } from 'vitest';
import { createSdkMapper } from '../../../../src/main/agent/claude/sdkMapper';
import { sdk } from './fakeSdk';

describe('createSdkMapper', () => {
  it('maps init to a session event', () => {
    const map = createSdkMapper();
    expect(map(sdk.init())).toEqual([
      expect.objectContaining({
        kind: 'session',
        model: 'claude-sonnet-5-5',
        mcpServers: [{ name: 'datadesk', status: 'connected' }],
      }),
    ]);
  });

  it('reports each session once although the CLI re-sends init every turn', () => {
    const map = createSdkMapper();
    expect(map(sdk.init())).toHaveLength(1);
    expect(map(sdk.init())).toEqual([]);
    expect(map(sdk.init({ session_id: 'sess-2' }))).toHaveLength(1);
  });

  it('shows the result text when a turn produced no assistant message (e.g. disabled /command)', () => {
    const map = createSdkMapper();
    const events = map(
      sdk.result(0, {
        uuid: 'u1',
        num_turns: 0,
        result: "/cost isn't available in this environment.",
      }),
    );
    expect(events[0]).toEqual({
      kind: 'assistant_message',
      messageId: 'result-u1',
      text: "/cost isn't available in this environment.",
      parentToolUseId: null,
    });
    // A normal turn that already answered doesn't get the result duplicated.
    map(sdk.assistant('msg_1', [{ type: 'text', text: 'Answer.' }]));
    expect(map(sdk.result(0, { uuid: 'u2' })).map((e) => e.kind)).toEqual(['turn_complete']);
  });

  it('attributes streamed text deltas to the message that started', () => {
    const map = createSdkMapper();
    expect(map(sdk.textDelta('orphan'))).toEqual([]);
    map(sdk.messageStart('msg_1'));
    expect(map(sdk.textDelta('Hi'))).toEqual([
      { kind: 'text_delta', messageId: 'msg_1', delta: 'Hi', parentToolUseId: null },
    ]);
  });

  it('emits tool calls once and text blocks without duplicates, however the SDK repeats them', () => {
    const map = createSdkMapper();
    const first = map(
      sdk.assistant('msg_1', [
        { type: 'text', text: 'Let me check.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'mcp__datadesk__run_sql',
          input: { sql: 'SELECT 1' },
        },
      ]),
    );
    expect(first.map((e) => e.kind)).toEqual(['assistant_message', 'tool_call']);
    // Same message again (cumulative delivery) → nothing new.
    expect(
      map(
        sdk.assistant('msg_1', [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'toolu_1', name: 'mcp__datadesk__run_sql', input: {} },
        ]),
      ),
    ).toEqual([]);
    // A later block of the same message (per-block delivery) → accumulated text.
    expect(map(sdk.assistant('msg_1', [{ type: 'text', text: 'Found it.' }]))).toEqual([
      {
        kind: 'assistant_message',
        messageId: 'msg_1',
        text: 'Let me check.\n\nFound it.',
        parentToolUseId: null,
      },
    ]);
  });

  it('maps tool results, including errors', () => {
    const map = createSdkMapper();
    expect(map(sdk.toolResult('toolu_1', 'Only SELECT queries are allowed', true))).toEqual([
      {
        kind: 'tool_result',
        toolUseId: 'toolu_1',
        isError: true,
        output: 'Only SELECT queries are allowed',
      },
    ]);
  });

  it('reports per-turn cost from the cumulative total, and surfaces failed turns', () => {
    const map = createSdkMapper();
    const turn = (events: ReturnType<typeof map>) => events.find((e) => e.kind === 'turn_complete');
    expect(turn(map(sdk.result(0.02)))).toMatchObject({
      kind: 'turn_complete',
      ok: true,
      costUsd: 0.02,
    });
    const second = turn(map(sdk.result(0.05)));
    expect(second?.kind === 'turn_complete' && second.costUsd).toBeCloseTo(0.03);
    const failed = map(
      sdk.result(0.05, { subtype: 'error_max_budget_usd', errors: ['Budget exceeded'] }),
    );
    expect(failed).toEqual([
      expect.objectContaining({ kind: 'turn_complete', ok: false, reason: 'error_max_budget_usd' }),
      { kind: 'error', message: 'Budget exceeded' },
    ]);
    const auth = map(sdk.result(0.05, { is_error: true, result: 'Failed to authenticate. 401' }));
    expect(auth[1]).toEqual({ kind: 'error', message: 'Failed to authenticate. 401' });
  });

  it('announces charts and reports from successful create_chart/save_report results', () => {
    const map = createSdkMapper();
    const chartId = '11111111-1111-4111-8111-111111111111';
    map(
      sdk.assistant('msg_1', [
        { type: 'tool_use', id: 'toolu_c', name: 'mcp__datadesk__create_chart', input: {} },
        { type: 'tool_use', id: 'toolu_r', name: 'mcp__datadesk__save_report', input: {} },
        { type: 'tool_use', id: 'toolu_s', name: 'mcp__datadesk__run_sql', input: {} },
      ]),
    );
    const chart = map(
      sdk.toolResult('toolu_c', `Chart saved.\n${JSON.stringify({ chartId, title: 'Units' })}`),
    );
    expect(chart.map((e) => e.kind)).toEqual(['tool_result', 'artifact']);
    expect(chart[1]).toEqual({
      kind: 'artifact',
      artifactKind: 'chart',
      id: chartId,
      title: 'Units',
    });

    const report = map(
      sdk.toolResult(
        'toolu_r',
        `Report saved.\n${JSON.stringify({ reportId: chartId, title: 'R' })}`,
      ),
    );
    expect(report[1]).toMatchObject({ kind: 'artifact', artifactKind: 'report', title: 'R' });

    // Other tools, errors and unparseable text never produce an artifact.
    const sql = map(sdk.toolResult('toolu_s', `ok\n${JSON.stringify({ chartId, title: 'x' })}`));
    expect(sql.map((e) => e.kind)).toEqual(['tool_result']);
    expect(map(sdk.toolResult('toolu_c', 'Chart saved.\n{"chartId"', false))).toHaveLength(1);
    expect(
      map(sdk.toolResult('toolu_c', `x\n${JSON.stringify({ chartId, title: 'e' })}`, true)),
    ).toHaveLength(1);
  });

  it('still finds the artifact when the title in the summary line contains a newline', () => {
    const map = createSdkMapper();
    const chartId = '11111111-1111-4111-8111-111111111111';
    map(
      sdk.assistant('m', [
        { type: 'tool_use', id: 't', name: 'mcp__datadesk__create_chart', input: {} },
      ]),
    );
    const title = 'Sales\nby region';
    const events = map(
      sdk.toolResult('t', `Chart "${title}" created.\n${JSON.stringify({ chartId, title })}`),
    );
    expect(events[1]).toEqual({ kind: 'artifact', artifactKind: 'chart', id: chartId, title });
  });
});

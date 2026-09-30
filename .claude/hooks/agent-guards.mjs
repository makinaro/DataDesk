#!/usr/bin/env node
// PreToolUse hook entry point: `node agent-guards.mjs <policy>`.
// Reads the hook JSON from stdin; exit 2 + stderr blocks the tool call (Claude sees the reason),
// exit 0 lets the normal permission flow continue.

import { POLICIES } from './policies.mjs';

const policyName = process.argv[2];
const policy = POLICIES[policyName];
if (!policy) {
  process.stderr.write(`agent-guards: unknown policy "${String(policyName)}"\n`);
  process.exit(2);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('agent-guards: could not parse hook input; blocking to be safe.\n');
    process.exit(2);
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const reason = policy(input.tool_name, input.tool_input, projectDir);
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
});

import { describe, expect, it } from 'vitest';
import { scrubSecrets } from '../../src/mcp-server/scrubEnv';

describe('scrubSecrets', () => {
  it('removes inherited secrets (as passed down by the Claude Code CLI) but keeps the rest', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant-leak',
      CLAUDE_CODE_MESSAGING_TOKEN: 'tok',
      CLAUDE_CODE_MESSAGING_SOCKET: '\\\\.\\pipe\\x',
      OPENAI_API_KEY: 'sk-openai-leak',
      HF_TOKEN: 'hf_leak',
      GITHUB_TOKEN: 'ghp_leak',
      AWS_SECRET_ACCESS_KEY: 'aws',
      PATH: 'C:/Windows',
      SYSTEMROOT: 'C:/Windows',
      DATADESK_CATALOG_PATH: 'C:/x/catalog.json',
      DATADESK_OPENAI_API_KEY: 'intended-for-the-server',
    };
    const removed = scrubSecrets(env);
    expect(removed).toEqual([
      'ANTHROPIC_API_KEY',
      'AWS_SECRET_ACCESS_KEY',
      'CLAUDE_CODE_MESSAGING_SOCKET',
      'CLAUDE_CODE_MESSAGING_TOKEN',
      'GITHUB_TOKEN',
      'HF_TOKEN',
      'OPENAI_API_KEY',
    ]);
    expect(env).toEqual({
      PATH: 'C:/Windows',
      SYSTEMROOT: 'C:/Windows',
      DATADESK_CATALOG_PATH: 'C:/x/catalog.json',
      DATADESK_OPENAI_API_KEY: 'intended-for-the-server',
    });
  });
});

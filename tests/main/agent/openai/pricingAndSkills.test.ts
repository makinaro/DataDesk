import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPENAI_ANALYST_SKILLS } from '../../../../src/main/agent/openai/analystAgents';
import { OPENAI_PRICES, responseCostUsd } from '../../../../src/main/agent/openai/pricing';
import { loadSkills } from '../../../../src/main/agent/openai/skills';
import { OPENAI_MODELS } from '../../../../src/shared/agent';

describe('responseCostUsd', () => {
  it('has a price for every selectable model', () => {
    expect(Object.keys(OPENAI_PRICES).sort()).toEqual([...OPENAI_MODELS].sort());
  });

  it('bills cached input at the cached rate and the rest at the input rate', () => {
    // gpt-5.4: $2.50/M input, $0.25/M cached, $15/M output.
    const cost = responseCostUsd('gpt-5.4', {
      inputTokens: 2_000_000,
      outputTokens: 100_000,
      inputTokensDetails: { cached_tokens: 1_000_000 },
    });
    expect(cost).toBeCloseTo(2.5 + 0.25 + 1.5, 9);
  });

  it('accepts the SDK array form of the details, and never counts more cached than input', () => {
    expect(
      responseCostUsd('gpt-5.4-mini', {
        inputTokens: 100,
        outputTokens: 0,
        inputTokensDetails: [{ cached_tokens: 80 }, { cached_tokens: 80 }],
      }),
    ).toBeCloseTo((100 * 0.075) / 1e6, 12);
  });
});

describe('loadSkills', () => {
  it('reads the bundled plugin skills with their descriptions and bodies', async () => {
    const skills = await loadSkills(
      join(process.cwd(), 'resources', 'agent-plugin'),
      OPENAI_ANALYST_SKILLS,
    );
    expect(skills.map((s) => s.name)).toEqual([...OPENAI_ANALYST_SKILLS]);
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(20);
      expect(skill.body).not.toMatch(/^---/);
      expect(skill.body.length).toBeGreaterThan(100);
    }
  });

  it('refuses a skill without a description', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'datadesk-skills-'));
    mkdirSync(join(dir, 'skills', 'broken'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'broken', 'SKILL.md'), '---\nname: broken\n---\nbody');
    await expect(loadSkills(dir, ['datadesk:broken'])).rejects.toThrow(/no description/);
  });
});

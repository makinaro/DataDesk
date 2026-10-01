import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPENAI_ANALYST_SKILLS } from '../../../../src/main/agent/openai/analystAgents';
import { loadSkills } from '../../../../src/main/agent/openai/skills';

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

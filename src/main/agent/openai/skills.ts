import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A runtime skill from resources/agent-plugin, read from its SKILL.md. */
export interface LoadedSkill {
  /** Namespaced like the Claude plugin's (`datadesk:eda-checklist`). */
  name: string;
  description: string;
  /** The instructions after the frontmatter. */
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Reads the plugin's skills. The OpenAI Agents SDK has no Agent Skills, so DataDesk serves the
 * same files itself (D-021): sub-agents get theirs in their instructions (like the Claude
 * sub-agents' preloaded skills), the analyst loads one on demand through the Skill tool.
 */
export async function loadSkills(
  pluginDir: string,
  names: readonly string[],
): Promise<LoadedSkill[]> {
  return Promise.all(
    names.map(async (name) => {
      const folder = name.slice(name.indexOf(':') + 1);
      const text = await readFile(join(pluginDir, 'skills', folder, 'SKILL.md'), 'utf8');
      const match = FRONTMATTER.exec(text);
      const description = /^description:\s*(.+)$/m.exec(match?.[1] ?? '')?.[1]?.trim();
      if (!match || !description) throw new Error(`Skill ${name} has no description.`);
      return { name, description, body: text.slice(match[0].length).trim() };
    }),
  );
}

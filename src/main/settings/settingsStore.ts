import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { writeFileAtomic } from '../../node-shared/atomicFile';
import {
  AgentSettingsSchema,
  DEFAULT_AGENT_SETTINGS,
  type AgentSettings,
} from '../../shared/agent';

const SettingsFileSchema = z.object({
  version: z.literal(1),
  agent: AgentSettingsSchema,
});

/** Non-secret app settings (userData/settings.json). Keys live in KeyStore, never here. */
export class SettingsStore {
  private cache: AgentSettings | undefined;

  constructor(private readonly filePath: string) {}

  async getAgent(): Promise<AgentSettings> {
    if (this.cache) return this.cache;
    try {
      const parsed = SettingsFileSchema.safeParse(
        JSON.parse(await readFile(this.filePath, 'utf8')),
      );
      this.cache = parsed.success ? parsed.data.agent : { ...DEFAULT_AGENT_SETTINGS };
    } catch {
      this.cache = { ...DEFAULT_AGENT_SETTINGS };
    }
    return this.cache;
  }

  async setAgent(settings: AgentSettings): Promise<AgentSettings> {
    const valid = AgentSettingsSchema.parse(settings);
    await writeFileAtomic(this.filePath, JSON.stringify({ version: 1, agent: valid }, null, 2));
    this.cache = valid;
    return valid;
  }
}

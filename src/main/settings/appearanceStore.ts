import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { writeFileAtomic } from '../../node-shared/atomicFile';
import { AppearanceSchema, DEFAULT_APPEARANCE, type Appearance } from '../../shared/appearance';

const AppearanceFileSchema = z.object({
  version: z.literal(1),
  appearance: AppearanceSchema,
});

/**
 * UI preferences (userData/appearance.json). A separate file from settings.json because
 * saving agent settings restarts the conversation, and a theme change must not.
 */
export class AppearanceStore {
  private cache: Appearance | undefined;

  constructor(private readonly filePath: string) {}

  async get(): Promise<Appearance> {
    if (this.cache) return this.cache;
    try {
      const parsed = AppearanceFileSchema.safeParse(
        JSON.parse(await readFile(this.filePath, 'utf8')),
      );
      this.cache = parsed.success ? parsed.data.appearance : { ...DEFAULT_APPEARANCE };
    } catch {
      this.cache = { ...DEFAULT_APPEARANCE };
    }
    return this.cache;
  }

  async set(appearance: Appearance): Promise<Appearance> {
    const valid = AppearanceSchema.parse(appearance);
    await writeFileAtomic(
      this.filePath,
      JSON.stringify({ version: 1, appearance: valid }, null, 2),
    );
    this.cache = valid;
    return valid;
  }
}

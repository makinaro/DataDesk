import { z } from 'zod';
import { IpcChannels, type IpcChannel } from './channels';

export const ProviderSchema = z.enum(['anthropic', 'openai', 'huggingface']);
export type Provider = z.infer<typeof ProviderSchema>;

/** Only ever booleans: the renderer may learn *whether* a key is set, never the key. */
export const SecretsStatusSchema = z.strictObject({
  anthropic: z.boolean(),
  openai: z.boolean(),
  huggingface: z.boolean(),
});
export type SecretsStatus = z.infer<typeof SecretsStatusSchema>;

export const AppInfoSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  versions: z.strictObject({ electron: z.string(), chrome: z.string(), node: z.string() }),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

const NoPayload = z.undefined();

export const ipcContract = {
  [IpcChannels.appInfo]: { request: NoPayload, response: AppInfoSchema },
  [IpcChannels.secretsStatus]: { request: NoPayload, response: SecretsStatusSchema },
  [IpcChannels.secretsSet]: {
    request: z.strictObject({
      provider: ProviderSchema,
      key: z.string().trim().min(8).max(4096),
    }),
    response: SecretsStatusSchema,
  },
  [IpcChannels.secretsClear]: {
    request: z.strictObject({ provider: ProviderSchema }),
    response: SecretsStatusSchema,
  },
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>;

export type IpcContract = typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.input<IpcContract[C]['request']>;
export type IpcParsedRequest<C extends IpcChannel> = z.output<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.output<IpcContract[C]['response']>;

import { z } from 'zod';
import {
  ColumnInfoSchema,
  DatasetNameSchema,
  DatasetPreviewSchema,
  DatasetSummarySchema,
  RegisteredDatasetSchema,
} from '../datasets';
import { AgentSettingsSchema } from '../agent';
import { ArtifactIdSchema, ChartArtifactSchema, ReportArtifactSchema } from '../artifacts';
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
  [IpcChannels.datasetsList]: {
    request: NoPayload,
    response: z.array(DatasetSummarySchema).max(10_000),
  },
  [IpcChannels.datasetsRegister]: {
    // The preload resolves this path from a dropped File (webUtils.getPathForFile); the MCP
    // server's import policy validates it again (DECISIONS D-010).
    request: z.strictObject({
      path: z.string().min(1).max(4096),
      name: DatasetNameSchema.optional(),
    }),
    response: RegisteredDatasetSchema,
  },
  [IpcChannels.datasetsPick]: {
    // Main shows the OS file dialog, so the path never comes from the renderer.
    request: NoPayload,
    response: RegisteredDatasetSchema.nullable(),
  },
  [IpcChannels.datasetsSchema]: {
    request: z.strictObject({ name: DatasetNameSchema }),
    response: z.array(ColumnInfoSchema).max(10_000),
  },
  [IpcChannels.datasetsPreview]: {
    request: z.strictObject({
      name: DatasetNameSchema,
      limit: z.number().int().min(1).max(100),
    }),
    response: DatasetPreviewSchema,
  },
  [IpcChannels.agentSend]: {
    request: z.strictObject({ text: z.string().trim().min(1).max(20_000) }),
    response: z.strictObject({ accepted: z.literal(true) }),
  },
  [IpcChannels.agentStop]: {
    request: NoPayload,
    response: z.strictObject({ ok: z.literal(true) }),
  },
  [IpcChannels.agentReset]: {
    request: NoPayload,
    response: z.strictObject({ ok: z.literal(true) }),
  },
  [IpcChannels.agentApprove]: {
    request: z.strictObject({ requestId: z.uuid(), approved: z.boolean() }),
    /** false if the request already timed out or was resolved. */
    response: z.strictObject({ found: z.boolean() }),
  },
  [IpcChannels.compareRun]: {
    request: z.strictObject({ text: z.string().trim().min(1).max(20_000) }),
    response: z.strictObject({ accepted: z.literal(true) }),
  },
  [IpcChannels.compareStop]: {
    request: NoPayload,
    response: z.strictObject({ ok: z.literal(true) }),
  },
  [IpcChannels.compareReset]: {
    request: NoPayload,
    response: z.strictObject({ ok: z.literal(true) }),
  },
  [IpcChannels.settingsGetAgent]: { request: NoPayload, response: AgentSettingsSchema },
  [IpcChannels.settingsSetAgent]: { request: AgentSettingsSchema, response: AgentSettingsSchema },
  [IpcChannels.artifactsGetChart]: {
    request: z.strictObject({ id: ArtifactIdSchema }),
    response: ChartArtifactSchema,
  },
  [IpcChannels.artifactsGetReport]: {
    request: z.strictObject({ id: ArtifactIdSchema }),
    response: ReportArtifactSchema,
  },
  [IpcChannels.artifactsExportReport]: {
    request: z.strictObject({
      id: ArtifactIdSchema,
      format: z.enum(['md', 'pdf']),
      // No chart SVGs from the renderer: main renders them from the stored charts (D-016).
      /** PDF only: the report body as static HTML; main wraps it in its own locked-down page. */
      bodyHtml: z.string().max(20_000_000).optional(),
    }),
    /** saved=false when the user cancelled the save dialog. */
    response: z.strictObject({ saved: z.boolean(), path: z.string().nullable() }),
  },
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>;

export type IpcContract = typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.input<IpcContract[C]['request']>;
export type IpcParsedRequest<C extends IpcChannel> = z.output<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.output<IpcContract[C]['response']>;

import { IpcChannels } from '../../../shared/ipc/channels';
import { McpToolError, type UiMcpClient } from '../../mcp/uiClient';
import { IpcUserError } from '../errors';
import type { IpcHandle } from '../router';

export interface DatasetHandlerDeps {
  client: Pick<UiMcpClient, 'listDatasets' | 'register' | 'schema' | 'preview'>;
  /** Shows the OS open-file dialog (main process); resolves to a path or null if cancelled. */
  pickFile: () => Promise<string | null>;
}

/** Tool refusals (bad file type, missing dataset, …) are user-facing; everything else is INTERNAL. */
async function mapErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof McpToolError) throw new IpcUserError('REJECTED', error.message);
    throw error;
  }
}

export function registerDatasetHandlers(
  handle: IpcHandle,
  { client, pickFile }: DatasetHandlerDeps,
): void {
  handle(IpcChannels.datasetsList, () => mapErrors(() => client.listDatasets()));

  handle(IpcChannels.datasetsRegister, ({ path, name }) =>
    mapErrors(() => client.register(path, name)),
  );

  handle(IpcChannels.datasetsPick, async () => {
    const path = await pickFile();
    if (path === null) return null;
    return mapErrors(() => client.register(path));
  });

  handle(IpcChannels.datasetsSchema, ({ name }) => mapErrors(() => client.schema(name)));

  handle(IpcChannels.datasetsPreview, ({ name, limit }) =>
    mapErrors(() => client.preview(name, limit)),
  );
}

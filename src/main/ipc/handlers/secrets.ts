import { IpcChannels } from '../../../shared/ipc/channels';
import type { Provider } from '../../../shared/ipc/contract';
import { EncryptionUnavailableError, type KeyStore } from '../../secrets/keyStore';
import { IpcUserError } from '../errors';
import type { IpcHandle } from '../router';

async function mapErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof EncryptionUnavailableError) {
      throw new IpcUserError('UNAVAILABLE', error.message);
    }
    throw error;
  }
}

/** Status/set/clear only. KeyStore.getKey is intentionally never reachable from IPC. */
export function registerSecretsHandlers(
  handle: IpcHandle,
  keyStore: KeyStore,
  /** Called after a key is set or cleared (e.g. to restart the agent session). */
  onChanged: (provider: Provider) => Promise<void> = () => Promise.resolve(),
): void {
  handle(IpcChannels.secretsStatus, () => mapErrors(() => keyStore.status()));
  handle(IpcChannels.secretsSet, async ({ provider, key }) => {
    const status = await mapErrors(() => keyStore.set(provider, key));
    await onChanged(provider);
    return status;
  });
  handle(IpcChannels.secretsClear, async ({ provider }) => {
    const status = await mapErrors(() => keyStore.clear(provider));
    await onChanged(provider);
    return status;
  });
}

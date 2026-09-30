import { IpcChannels } from '../../../shared/ipc/channels';
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
export function registerSecretsHandlers(handle: IpcHandle, keyStore: KeyStore): void {
  handle(IpcChannels.secretsStatus, () => mapErrors(() => keyStore.status()));
  handle(IpcChannels.secretsSet, ({ provider, key }) =>
    mapErrors(() => keyStore.set(provider, key)),
  );
  handle(IpcChannels.secretsClear, ({ provider }) => mapErrors(() => keyStore.clear(provider)));
}

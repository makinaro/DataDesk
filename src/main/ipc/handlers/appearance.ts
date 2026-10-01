import type { Appearance } from '../../../shared/appearance';
import { IpcChannels } from '../../../shared/ipc/channels';
import type { AppearanceStore } from '../../settings/appearanceStore';
import type { IpcHandle } from '../router';

interface Deps {
  store: Pick<AppearanceStore, 'get' | 'set'>;
  /** Applies the saved appearance to what main draws (native theme, window colours). */
  onChanged: (appearance: Appearance) => void;
}

export function registerAppearanceHandlers(handle: IpcHandle, { store, onChanged }: Deps): void {
  handle(IpcChannels.settingsGetAppearance, () => store.get());

  handle(IpcChannels.settingsSetAppearance, async (next) => {
    const saved = await store.set(next);
    onChanged(saved);
    return saved;
  });
}

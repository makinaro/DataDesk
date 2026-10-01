import { IpcChannels } from '../../../shared/ipc/channels';
import type { CompareRuntime } from '../../agent/compareRuntime';
import type { IpcHandle } from '../router';

export function registerCompareHandlers(
  handle: IpcHandle,
  compare: Pick<CompareRuntime, 'run' | 'stop' | 'reset'>,
): void {
  handle(IpcChannels.compareRun, async ({ text }) => {
    await compare.run(text);
    return { accepted: true as const };
  });

  handle(IpcChannels.compareStop, async () => {
    await compare.stop();
    return { ok: true as const };
  });

  handle(IpcChannels.compareReset, async () => {
    await compare.reset();
    return { ok: true as const };
  });
}

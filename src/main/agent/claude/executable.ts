import { join } from 'node:path';

/**
 * Where the Claude Code binary lives. In dev the SDK resolves its per-platform optional
 * dependency itself. In a packaged app that resolution points *inside* app.asar, and
 * child_process.spawn can't execute from an asar archive, so we point at the
 * `app.asar.unpacked` copy (electron-builder `asarUnpack`, Phase 8).
 */
export function claudeExecutablePath(opts: {
  isPackaged: boolean;
  resourcesPath: string;
  platform: NodeJS.Platform;
  arch: string;
}): string | undefined {
  if (!opts.isPackaged) return undefined;
  const binary = opts.platform === 'win32' ? 'claude.exe' : 'claude';
  return join(
    opts.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@anthropic-ai',
    `claude-agent-sdk-${opts.platform}-${opts.arch}`,
    binary,
  );
}

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingRuntimeFiles, resolveServerPaths } from '../../src/main/resourcePaths';

const INSTALL = 'C:/Users/me/AppData/Local/Programs/DataDesk';
const packaged = {
  isPackaged: true,
  resourcesPath: join(INSTALL, 'resources'),
  appPath: join(INSTALL, 'resources', 'app.asar'),
  userData: 'C:/Users/me/AppData/Roaming/DataDesk',
  mainDir: join(INSTALL, 'resources', 'app.asar', 'out', 'main'),
};

describe('resolveServerPaths', () => {
  it('packaged: plugin and extensions from resources (outside app.asar), server in app.asar', () => {
    const paths = resolveServerPaths(packaged, () => true);
    expect(paths.agentPluginDir).toBe(join(INSTALL, 'resources', 'agent-plugin'));
    expect(paths.extensionDir).toBe(join(INSTALL, 'resources', 'duckdb-extensions'));
    expect(paths.agentPluginDir).not.toContain('app.asar');
    expect(paths.mainDir).toBe(packaged.mainDir);
    expect(paths.userData).toBe(packaged.userData);
  });

  it('dev: everything from the repo', () => {
    const paths = resolveServerPaths(
      { ...packaged, isPackaged: false, appPath: 'C:/repo' },
      () => true,
    );
    expect(paths.agentPluginDir).toBe(join('C:/repo', 'resources', 'agent-plugin'));
    expect(paths.extensionDir).toBe(join('C:/repo', 'resources', 'duckdb-extensions'));
  });

  it('runs without the DuckDB extensions (only Excel import is lost)', () => {
    expect(resolveServerPaths(packaged, () => false).extensionDir).toBeUndefined();
  });
});

describe('missingRuntimeFiles', () => {
  const plugin = join(INSTALL, 'resources', 'agent-plugin');
  const manifest = join(plugin, '.claude-plugin', 'plugin.json');
  const claude = join(INSTALL, 'resources', 'app.asar.unpacked', 'claude.exe');

  it('passes when the Claude binary and the plugin manifest exist', () => {
    const present = new Set([manifest, claude]);
    expect(
      missingRuntimeFiles({ claudeExecutable: claude, agentPluginDir: plugin }, (p) =>
        present.has(p),
      ),
    ).toBeUndefined();
  });

  it('names a quarantined Claude binary and says to reinstall', () => {
    expect(
      missingRuntimeFiles(
        { claudeExecutable: claude, agentPluginDir: plugin },
        (p) => p === manifest,
      ),
    ).toMatch(/Claude runtime is missing .*claude\.exe.*antivirus.*reinstall/);
  });

  it('names missing skills (dev builds have no packaged binary to check)', () => {
    expect(missingRuntimeFiles({ agentPluginDir: plugin }, () => false)).toMatch(
      /analyst skills are missing/,
    );
    expect(missingRuntimeFiles({ agentPluginDir: plugin }, (p) => p === manifest)).toBeUndefined();
  });

  it('the bundled plugin really has its manifest', () => {
    expect(
      missingRuntimeFiles({ agentPluginDir: join(process.cwd(), 'resources', 'agent-plugin') }),
    ).toBeUndefined();
  });
});

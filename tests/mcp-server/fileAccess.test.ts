import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportPathError, validateImportPath } from '../../src/mcp-server/fileAccess';
import { createWorkspace } from './fixtures';

let ws: ReturnType<typeof createWorkspace>;
let deniedDir: string;
const policy = () => ({ denyDirs: [deniedDir], maxFileBytes: 1_000_000 });

beforeEach(() => {
  ws = createWorkspace();
  deniedDir = join(ws.root, 'userData');
  mkdirSync(deniedDir);
  writeFileSync(join(deniedDir, 'settings.json'), '{"x":1}');
});
afterEach(() => {
  ws.cleanup();
});

describe('validateImportPath', () => {
  it.each([
    ['sales.csv', 'csv'],
    ['sales.parquet', 'parquet'],
    ['sales.json', 'json'],
    ['events.ndjson', 'json'],
  ])('accepts %s as %s', async (file, format) => {
    const result = await validateImportPath(join(ws.dataDir, file), policy());
    expect(result.format).toBe(format);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('accepts uppercase extensions', async () => {
    writeFileSync(join(ws.dataDir, 'UPPER.CSV'), 'a\n1\n');
    await expect(
      validateImportPath(join(ws.dataDir, 'UPPER.CSV'), policy()),
    ).resolves.toMatchObject({ format: 'csv' });
  });

  it.each([
    ['relative path', 'data/sales.csv'],
    ['UNC path', '\\\\server\\share\\sales.csv'],
    ['forward-slash UNC', '//server/share/sales.csv'],
  ])('rejects %s', async (_label, path) => {
    await expect(validateImportPath(path, policy())).rejects.toBeInstanceOf(ImportPathError);
  });

  it('rejects unsupported extensions (e.g. the secret .txt)', async () => {
    await expect(validateImportPath(ws.secretPath, policy())).rejects.toThrow(/Unsupported/);
  });

  it('rejects missing files and directories', async () => {
    await expect(validateImportPath(join(ws.dataDir, 'nope.csv'), policy())).rejects.toThrow(
      /not found/,
    );
    mkdirSync(join(ws.dataDir, 'folder.csv'));
    await expect(validateImportPath(join(ws.dataDir, 'folder.csv'), policy())).rejects.toThrow(
      /regular file/,
    );
  });

  it('rejects files over the size cap', async () => {
    await expect(
      validateImportPath(join(ws.dataDir, 'sales.csv'), { denyDirs: [], maxFileBytes: 10 }),
    ).rejects.toThrow(/too large/);
  });

  it('rejects files inside denied directories, including case variants on Windows', async () => {
    await expect(validateImportPath(join(deniedDir, 'settings.json'), policy())).rejects.toThrow(
      /not allowed/,
    );
    await expect(
      validateImportPath(join(deniedDir, 'settings.json'), {
        ...policy(),
        denyDirs: [deniedDir.toUpperCase()],
        platform: 'win32',
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it('rejects symlinks and junctions that point elsewhere', async (ctx) => {
    const link = join(ws.dataDir, 'link.json');
    const junction = join(ws.dataDir, 'junction');
    try {
      symlinkSync(join(deniedDir, 'settings.json'), link, 'file');
    } catch {
      // Creating file symlinks on Windows needs Developer Mode or admin rights.
      ctx.skip();
    }
    await expect(validateImportPath(link, policy())).rejects.toThrow(/Symbolic links/);
    symlinkSync(deniedDir, junction, 'junction');
    await expect(validateImportPath(join(junction, 'settings.json'), policy())).rejects.toThrow(
      /links or junctions/,
    );
  });

  // Regression: realpath() expands 8.3 short names, which once made every short path look like
  // a link. GitHub's Windows runners use one for the temp dir (C:\Users\RUNNER~1\…).
  it('accepts Windows 8.3 short paths and stores the long real path', async (ctx) => {
    if (process.platform !== 'win32') ctx.skip();
    const longDir = join(ws.root, 'A Long Folder Name For Short Paths');
    mkdirSync(longDir);
    const file = join(longDir, 'sales.csv');
    writeFileSync(file, 'a\n1\n');
    // cmd's %~sI prints the 8.3 form; verbatim args stop Node from escaping the inner quotes.
    const short = spawnSync(
      'cmd.exe',
      ['/d', '/s', '/c', `"for %I in ("${longDir}") do @echo %~sI"`],
      { encoding: 'utf8', windowsVerbatimArguments: true },
    ).stdout.trim();
    if (!short || short.toLowerCase() === longDir.toLowerCase()) {
      ctx.skip(); // 8.3 name generation is disabled on this volume.
    }
    const result = await validateImportPath(join(short, 'sales.csv'), policy());
    // realpathSync.native (like the code under test) expands 8.3 names; plain realpathSync does not.
    expect(result.path.toLowerCase()).toBe(realpathSync.native(file).toLowerCase());
  });

  it.each(['sales [v1].csv', 'sales*.csv', 'sales?.csv'])(
    'rejects glob characters DuckDB would expand: %s',
    async (name) => {
      await expect(validateImportPath(join(ws.dataDir, name), policy())).rejects.toThrow(
        /\*, \? or \[ \]/,
      );
    },
  );

  it('rejects paths through a directory junction (no admin rights needed)', async () => {
    const junction = join(ws.dataDir, 'jn');
    symlinkSync(deniedDir, junction, 'junction');
    await expect(validateImportPath(join(junction, 'settings.json'), policy())).rejects.toThrow(
      /links or junctions/,
    );
  });
});

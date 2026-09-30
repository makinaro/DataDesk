import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileAtomic } from '../../src/node-shared/atomicFile';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomic-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const errno = (code: string) => Object.assign(new Error(code), { code });

describe('writeFileAtomic', () => {
  it('creates missing directories and replaces existing files', async () => {
    const file = join(dir, 'a', 'b', 'data.json');
    await writeFileAtomic(file, 'one');
    await writeFileAtomic(file, 'two');
    expect(readFileSync(file, 'utf8')).toBe('two');
    expect(readdirSync(join(dir, 'a', 'b'))).toEqual(['data.json']);
  });

  it('retries transient Windows lock errors (EPERM/EACCES/EBUSY), then succeeds', async () => {
    const file = join(dir, 'data.json');
    const codes = ['EPERM', 'EBUSY'];
    const flaky = vi.fn(async (from: string, to: string) => {
      const code = codes.shift();
      if (code) throw errno(code);
      await rename(from, to);
    });
    await writeFileAtomic(file, 'ok', { renameFile: flaky });
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(readFileSync(file, 'utf8')).toBe('ok');
  });

  it('gives up after 5 attempts and removes the temp file', async () => {
    const file = join(dir, 'data.json');
    writeFileSync(file, 'original');
    const locked = vi.fn(() => Promise.reject(errno('EBUSY')));
    await expect(writeFileAtomic(file, 'new', { renameFile: locked })).rejects.toThrow('EBUSY');
    expect(locked).toHaveBeenCalledTimes(5);
    expect(readFileSync(file, 'utf8')).toBe('original');
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  it('does not retry non-transient errors', async () => {
    const failing = vi.fn(() => Promise.reject(errno('ENOSPC')));
    await expect(
      writeFileAtomic(join(dir, 'x.json'), 'x', { renameFile: failing }),
    ).rejects.toThrow('ENOSPC');
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

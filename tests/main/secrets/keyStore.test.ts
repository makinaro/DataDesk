import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EncryptionUnavailableError,
  KeyStore,
  type SafeStorageLike,
} from '../../../src/main/secrets/keyStore';

/** Reversible fake "encryption" that is visibly different from the plaintext. */
function fakeSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${Buffer.from(s, 'utf8').toString('hex')}`, 'utf8'),
    decryptString: (b) => Buffer.from(b.toString('utf8').slice(4), 'hex').toString('utf8'),
  };
}

const KEY = 'sk-ant-test-0123456789';
let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'keystore-'));
  file = join(dir, 'nested', 'secrets.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('KeyStore', () => {
  it('starts empty when no file exists', async () => {
    const store = new KeyStore(file, fakeSafeStorage());
    await expect(store.status()).resolves.toEqual({
      anthropic: false,
      openai: false,
      huggingface: false,
    });
  });

  it('set → status true, and the key never touches disk in plaintext', async () => {
    const store = new KeyStore(file, fakeSafeStorage());
    await expect(store.set('anthropic', KEY)).resolves.toMatchObject({ anthropic: true });
    const onDisk = readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(KEY);
    const parsed = JSON.parse(onDisk) as { version: number; keys: Record<string, unknown> };
    expect(parsed.version).toBe(1);
    expect(typeof parsed.keys.anthropic).toBe('string');
  });

  it('getKey decrypts for main-process use, and a fresh instance reads it back', async () => {
    await new KeyStore(file, fakeSafeStorage()).set('openai', KEY);
    const reopened = new KeyStore(file, fakeSafeStorage());
    await expect(reopened.getKey('openai')).resolves.toBe(KEY);
    await expect(reopened.getKey('huggingface')).resolves.toBeUndefined();
  });

  it('clear removes only that provider', async () => {
    const store = new KeyStore(file, fakeSafeStorage());
    await store.set('anthropic', KEY);
    await store.set('openai', KEY);
    await expect(store.clear('anthropic')).resolves.toEqual({
      anthropic: false,
      openai: true,
      huggingface: false,
    });
  });

  it('refuses to store when OS encryption is unavailable (no plaintext fallback)', async () => {
    const store = new KeyStore(file, fakeSafeStorage(false));
    await expect(store.set('anthropic', KEY)).rejects.toBeInstanceOf(EncryptionUnavailableError);
    expect(() => readFileSync(file)).toThrow();
  });

  it('treats a corrupt file as empty and reports it', async () => {
    const onCorrupt = vi.fn();
    const store = new KeyStore(join(dir, 'secrets.json'), fakeSafeStorage(), onCorrupt);
    writeFileSync(join(dir, 'secrets.json'), '{ not json');
    await expect(store.status()).resolves.toMatchObject({ anthropic: false });
    expect(onCorrupt).toHaveBeenCalledOnce();
  });

  it('serializes concurrent writes without losing updates', async () => {
    const store = new KeyStore(file, fakeSafeStorage());
    await Promise.all([
      store.set('anthropic', KEY),
      store.set('openai', KEY),
      store.set('huggingface', KEY),
    ]);
    await expect(new KeyStore(file, fakeSafeStorage()).status()).resolves.toEqual({
      anthropic: true,
      openai: true,
      huggingface: true,
    });
  });
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function loadHttpsModule(env: {
  HTTPS_ENABLED: boolean;
  HTTPS_CERT_FILE: string;
  HTTPS_KEY_FILE: string;
}) {
  vi.resetModules();
  vi.doMock('../env.js', () => ({ env }));
  return import('../https.js');
}

async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tcgplayer-https-test-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(async () => {
  vi.resetModules();
  vi.doUnmock('../env.js');

  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

describe('loadHttpsOptions', () => {
  it('returns undefined when HTTPS is disabled', async () => {
    const { loadHttpsOptions } = await loadHttpsModule({
      HTTPS_ENABLED: false,
      HTTPS_CERT_FILE: '',
      HTTPS_KEY_FILE: '',
    });

    await expect(loadHttpsOptions()).resolves.toBeUndefined();
  });

  it('ignores certificate paths when HTTPS is disabled', async () => {
    const tempDir = await makeTempDir();
    const certPath = path.join(tempDir, 'cert.pem');
    const keyPath = path.join(tempDir, 'key.pem');
    await writeFile(certPath, 'test-cert');
    await writeFile(keyPath, 'test-key');

    const { loadHttpsOptions } = await loadHttpsModule({
      HTTPS_ENABLED: false,
      HTTPS_CERT_FILE: certPath,
      HTTPS_KEY_FILE: keyPath,
    });

    await expect(loadHttpsOptions()).resolves.toBeUndefined();
  });

  it('requires certificate paths when HTTPS is enabled', async () => {
    const { loadHttpsOptions } = await loadHttpsModule({
      HTTPS_ENABLED: true,
      HTTPS_CERT_FILE: '',
      HTTPS_KEY_FILE: '',
    });

    await expect(loadHttpsOptions()).rejects.toThrow(
      'HTTPS_ENABLED=true requires HTTPS_CERT_FILE and HTTPS_KEY_FILE',
    );
  });

  it('requires readable certificate files when HTTPS is enabled', async () => {
    const { loadHttpsOptions } = await loadHttpsModule({
      HTTPS_ENABLED: true,
      HTTPS_CERT_FILE: '/missing/local-cert.pem',
      HTTPS_KEY_FILE: '/missing/local-key.pem',
    });

    await expect(loadHttpsOptions()).rejects.toThrow(
      'HTTPS certificate files are not readable',
    );
  });

  it('loads readable certificate files when HTTPS is enabled', async () => {
    const tempDir = await makeTempDir();
    const certPath = path.join(tempDir, 'cert.pem');
    const keyPath = path.join(tempDir, 'key.pem');
    await writeFile(certPath, 'test-cert');
    await writeFile(keyPath, 'test-key');

    const { loadHttpsOptions } = await loadHttpsModule({
      HTTPS_ENABLED: true,
      HTTPS_CERT_FILE: certPath,
      HTTPS_KEY_FILE: keyPath,
    });

    await expect(loadHttpsOptions()).resolves.toEqual({
      cert: Buffer.from('test-cert'),
      key: Buffer.from('test-key'),
    });
  });
});

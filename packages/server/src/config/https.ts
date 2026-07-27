import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env.js';

export type HttpsServerOptions = {
  cert: Buffer;
  key: Buffer;
};

async function canRead(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadHttpsOptions(): Promise<
  HttpsServerOptions | undefined
> {
  if (!env.HTTPS_ENABLED) {
    return undefined;
  }

  const certFile = env.HTTPS_CERT_FILE.trim();
  const keyFile = env.HTTPS_KEY_FILE.trim();

  if (!certFile || !keyFile) {
    throw new Error(
      'HTTPS_ENABLED=true requires HTTPS_CERT_FILE and HTTPS_KEY_FILE to be set',
    );
  }

  const certPath = path.resolve(certFile);
  const keyPath = path.resolve(keyFile);
  const certExists = await canRead(certPath);
  const keyExists = await canRead(keyPath);

  if (!certExists || !keyExists) {
    throw new Error(
      `HTTPS certificate files are not readable: ${certPath}, ${keyPath}`,
    );
  }

  return {
    cert: await readFile(certPath),
    key: await readFile(keyPath),
  };
}

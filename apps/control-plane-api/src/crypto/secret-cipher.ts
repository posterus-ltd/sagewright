import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export const createSecretCipher = (key: string) => {
  const keyBuf = Buffer.from(key, 'utf8');
  return {
    encrypt: (plain: string): string => {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, keyBuf, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
    },
    decrypt: (blob: string): string => {
      const [ivHex, tagHex, dataHex] = blob.split(':');
      if (!ivHex || !tagHex || !dataHex) throw new Error('malformed encrypted blob');
      const decipher = createDecipheriv(ALGORITHM, keyBuf, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    },
  };
};

export type SecretCipher = ReturnType<typeof createSecretCipher>;

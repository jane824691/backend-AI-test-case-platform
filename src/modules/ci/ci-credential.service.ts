import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export interface EncryptedCiCredential { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: string; fingerprint: string; }

@Injectable()
export class CiCredentialService {
  encrypt(token: string): EncryptedCiCredential {
    const key = this.key(); const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: process.env.CI_CREDENTIAL_KEY_VERSION ?? 'v1', fingerprint: createHash('sha256').update(token).digest('hex') };
  }

  decrypt(value: Pick<EncryptedCiCredential, 'ciphertext' | 'nonce' | 'authTag'>): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key(), value.nonce);
    decipher.setAuthTag(value.authTag);
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8');
  }

  private key(): Buffer {
    const encoded = process.env.CI_CREDENTIAL_ENCRYPTION_KEY;
    if (!encoded) throw new Error('CI_CREDENTIAL_ENCRYPTION_KEY is required for PAT storage.');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('CI_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    return key;
  }
}

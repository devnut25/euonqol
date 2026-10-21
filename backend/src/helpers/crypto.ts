import crypto from 'crypto';

// Same key/algorithm as helpers/session.ts's temp-session password encryption — kept as a
// separate copy (rather than importing from session.ts) since that module's encrypt/decrypt
// are private implementation details of an unrelated in-memory flow.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32);

if (ENCRYPTION_KEY.length !== 32) {
  throw new Error(`ENCRYPTION_KEY deve essere 32 bytes, ricevuto: ${ENCRYPTION_KEY.length} bytes`);
}

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a secret for storage (e.g. in `app_settings.value`). Returns a single
 * "iv:authTag:ciphertext" hex string so callers only ever handle one opaque column value.
 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plain, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/** Decrypts a value produced by {@link encryptSecret}. */
export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, encrypted] = stored.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

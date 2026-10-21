import crypto from 'crypto';

// ✅ MODO CORRETTO - Converti la stringa hex in Buffer di 32 bytes
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32);

// Verifica che sia esattamente 32 bytes
if (ENCRYPTION_KEY.length !== 32) {
  throw new Error(`ENCRYPTION_KEY deve essere 32 bytes, ricevuto: ${ENCRYPTION_KEY.length} bytes`);
}

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

interface TempSession {
  userId: string;
  email: string;
  encryptedPassword: string;
  iv: string;
  authTag: string;
  expiresAt: number;
}

const tempSessions = new Map<string, TempSession>();

/**
 * Cripta la password
 */
function encryptPassword(password: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decripta la password
 */
function decryptPassword(
  encrypted: string,
  iv: string,
  authTag: string
): string {
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Crea token di sessione temporaneo con password criptata
 */
export function createTempSessionToken(
  userId: string,
  email: string,
  password: string
): string {
  const token = crypto.randomBytes(32).toString('hex');
  const { encrypted, iv, authTag } = encryptPassword(password);
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minuti
  
  tempSessions.set(token, {
    userId,
    email,
    encryptedPassword: encrypted,
    iv,
    authTag,
    expiresAt,
  });
  
  return token;
}

/**
 * Verifica e recupera il token temporaneo con password decriptata
 */
export function verifyTempSessionToken(
  token: string
): { userId: string; email: string; password: string } {
  const session = tempSessions.get(token);
  
  if (!session) {
    throw new Error('Invalid session token');
  }
  
  if (Date.now() > session.expiresAt) {
    tempSessions.delete(token);
    throw new Error('Session token expired');
  }
  
  // Decripta la password
  const password = decryptPassword(
    session.encryptedPassword,
    session.iv,
    session.authTag
  );
  
  return {
    userId: session.userId,
    email: session.email,
    password,
  };
}

/**
 * Invalida il token dopo l'uso
 */
export function invalidateTempSessionToken(token: string): void {
  tempSessions.delete(token);
}

/**
 * Pulizia periodica dei token scaduti
 */
export function cleanupExpiredTokens(): number {
  const now = Date.now();
  let count = 0;
  
  for (const [token, session] of tempSessions.entries()) {
    if (now > session.expiresAt) {
      tempSessions.delete(token);
      count++;
    }
  }
  
  return count;
}
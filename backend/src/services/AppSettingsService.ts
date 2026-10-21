import { PrismaClient } from '../generated/app/index.js';
import { decryptSecret, encryptSecret } from '../helpers/crypto.js';

const prisma = new PrismaClient();

/** Known app_settings keys, namespaced by section to avoid collisions. */
export const AppSettingsKeys = {
  CAT_API_URL: 'cat.apiUrl',
  CAT_API_KEY: 'cat.apiKey',
  CAT_API_KEY_UPDATED_AT: 'cat.apiKeyUpdatedAt',
  CAT_API_KEY_EXPIRES_AT: 'cat.apiKeyExpiresAt',

  EMAIL_PROVIDER: 'email.provider',
  EMAIL_FROM: 'email.from',
  EMAIL_HOST: 'email.host',
  EMAIL_PORT: 'email.port',
  EMAIL_SECURE: 'email.secure',
  EMAIL_USER: 'email.user',
  EMAIL_PASSWORD: 'email.password',
  EMAIL_RESEND_API_KEY: 'email.resendApiKey',
} as const;

export type AppSettingKey = (typeof AppSettingsKeys)[keyof typeof AppSettingsKeys];

interface SettingWrite {
  key: string;
  value: string | null;
  encrypt?: boolean;
}

/**
 * Thin key/value config store backed by `app_settings`, used for installation settings
 * that must be editable from the admin UI and take effect immediately (CAT API
 * credentials, outgoing email config) instead of being fixed at process boot via env vars.
 *
 * Caches the whole table in memory (it's tiny and read on every CAT/email call) and
 * invalidates on any write — safe for this single-process deployment; a multi-instance
 * deployment would need a shared invalidation signal instead.
 */
export class AppSettingsService {
  private static cache: Map<string, { value: string | null; is_encrypted: boolean }> | null = null;

  private static async loadCache() {
    if (!this.cache) {
      const rows = await prisma.app_settings.findMany();
      this.cache = new Map(rows.map((r) => [r.key, { value: r.value, is_encrypted: r.is_encrypted }]));
    }
    return this.cache;
  }

  private static invalidate() {
    this.cache = null;
  }

  /** Raw stored value (still encrypted, if the key is a secret) — mainly for internal use. */
  static async getRaw(key: string): Promise<string | null> {
    const cache = await this.loadCache();
    return cache.get(key)?.value ?? null;
  }

  /** True if the key has a non-empty value set (useful to report "is a secret configured" without exposing it). */
  static async has(key: string): Promise<boolean> {
    const raw = await this.getRaw(key);
    return !!raw;
  }

  /** Value as stored, decrypting first if the row is flagged encrypted. Returns null if unset. */
  static async get(key: string): Promise<string | null> {
    const cache = await this.loadCache();
    const entry = cache.get(key);
    if (!entry || entry.value === null) return null;
    return entry.is_encrypted ? decryptSecret(entry.value) : entry.value;
  }

  static async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const entries = await Promise.all(keys.map(async (key) => [key, await this.get(key)] as const));
    return Object.fromEntries(entries);
  }

  static async set(key: string, value: string | null, options: { encrypt?: boolean; updatedBy?: string | null } = {}) {
    const { encrypt = false, updatedBy = null } = options;
    const stored = value === null ? null : encrypt ? encryptSecret(value) : value;

    await prisma.app_settings.upsert({
      where: { key },
      update: { value: stored, is_encrypted: encrypt, updated_by: updatedBy },
      create: { key, value: stored, is_encrypted: encrypt, updated_by: updatedBy },
    });

    this.invalidate();
  }

  /** Writes several keys in one transaction; a `null` value clears the setting. */
  static async setMany(writes: SettingWrite[], updatedBy?: string | null): Promise<void> {
    await prisma.$transaction(
      writes.map(({ key, value, encrypt = false }) => {
        const stored = value === null ? null : encrypt ? encryptSecret(value) : value;
        return prisma.app_settings.upsert({
          where: { key },
          update: { value: stored, is_encrypted: encrypt, updated_by: updatedBy ?? null },
          create: { key, value: stored, is_encrypted: encrypt, updated_by: updatedBy ?? null },
        });
      })
    );

    this.invalidate();
  }
}

import { prisma } from '../config/database.js';
import { deleteUploadedFile } from '../helpers/FileStorage.js';

const SINGLETON_ID = 1;

export interface InstituteInput {
  name: string;
  address: string;
  city: string;
  country: string;
  note?: string | null;
  email?: string | null;
  phone?: string | null;
  referentName?: string | null;
  /** undefined = leave the logo untouched; null = remove it; string = replace it. */
  logoUrl?: string | null;
}

/**
 * `institutes` is a singleton table (row id is DB-constrained to 1) holding the identity
 * of the single institution running this installation, used to brand outgoing
 * emails/PDFs. `get()` returns null until an admin fills it in for the first time.
 */
export class InstituteService {
  static async get() {
    return prisma.institutes.findUnique({ where: { id: SINGLETON_ID } });
  }

  /**
   * Creates the institute of a fresh installation from the env it was set up
   * with, once: when the row already exists — created here or saved from the
   * Settings page — the env is no longer read. Name, address, city and country
   * are required by the table, so with any of them missing nothing is created
   * and the admin fills the page in instead. The note and the logo have no env
   * var: they are only set from the page.
   *
   * Returns the env vars that were missing, empty when the row was created or
   * already there.
   */
  static async initialiseFromEnv(): Promise<{ created: boolean; missing: string[] }> {
    if (await prisma.institutes.findUnique({ where: { id: SINGLETON_ID }, select: { id: true } })) {
      return { created: false, missing: [] };
    }

    const env = (name: string) => process.env[name]?.trim() || null;
    const required = {
      name: env('INSTITUTE_NAME'),
      address: env('INSTITUTE_ADDRESS'),
      city: env('INSTITUTE_CITY'),
      country: env('INSTITUTE_COUNTRY'),
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([field]) => `INSTITUTE_${field.toUpperCase()}`);
    if (missing.length > 0) return { created: false, missing };

    // skipDuplicates: two instances booting together must not fail on each other.
    await prisma.institutes.createMany({
      data: [
        {
          id: SINGLETON_ID,
          name: required.name!,
          address: required.address!,
          city: required.city!,
          country: required.country!,
          referent_name: env('INSTITUTE_REFERENT_NAME'),
          email: env('INSTITUTE_EMAIL'),
          phone: env('INSTITUTE_PHONE'),
        },
      ],
      skipDuplicates: true,
    });
    return { created: true, missing: [] };
  }

  static async upsert(data: InstituteInput) {
    const existing = await prisma.institutes.findUnique({ where: { id: SINGLETON_ID } });

    const payload = {
      name: data.name,
      address: data.address,
      city: data.city,
      country: data.country,
      note: data.note ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      referent_name: data.referentName ?? null,
      ...(data.logoUrl !== undefined ? { logo_url: data.logoUrl } : {}),
    };

    const updated = await prisma.institutes.upsert({
      where: { id: SINGLETON_ID },
      update: payload,
      create: { id: SINGLETON_ID, ...payload },
    });

    if (data.logoUrl !== undefined && existing?.logo_url && existing.logo_url !== data.logoUrl) {
      deleteUploadedFile(existing.logo_url);
    }

    return updated;
  }
}

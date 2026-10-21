import { PrismaClient } from '../generated/app/index.js';
import { deleteUploadedFile } from '../helpers/FileStorage.js';

const prisma = new PrismaClient();

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

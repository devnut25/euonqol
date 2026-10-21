import { PrismaClient } from '../generated/app/index.js';

const prisma = new PrismaClient();

export class CountryService {
  /**
   * Returns all EU countries ordered alphabetically by language.
   */
  static async getAll() {
    return prisma.eu_countries.findMany({
      select: {
        id: true,
        language: true,
        original_lang: true,
        alphabet: true,
      },
      orderBy: { language: 'asc' },
    });
  }
}

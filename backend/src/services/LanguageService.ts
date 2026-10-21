import { PrismaClient } from '../generated/app/index.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { LanguageModelConfig } from '../models/Language.js';

const prisma = new PrismaClient();

export class LanguageService {
  static async getList(query: Record<string, any>) {
    const { where, orderBy, take, skip } = QueryBuilder.for(LanguageModelConfig, query).build();

    const [total, languages] = await Promise.all([
      prisma.eu_countries.count({ where }),
      prisma.eu_countries.findMany({ where, orderBy, take, skip }),
    ]);

    return { languages, total, take, skip };
  }

  static async getAll(query: Record<string, any>) {
    const { where, orderBy, take, skip } = QueryBuilder.for(LanguageModelConfig, query).build();

    const effectiveTake = take && take > 0 ? take : undefined;

    const [total, languages] = await Promise.all([
      prisma.eu_countries.count({ where }),
      prisma.eu_countries.findMany({ where, orderBy, take: effectiveTake, skip }),
    ]);

    return { languages, total, take: effectiveTake ?? total, skip };
  }
}

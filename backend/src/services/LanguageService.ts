import XLSX from 'xlsx';
import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { LanguageRow } from '../models/Country.js';
import { LanguageModelConfig } from '../models/Language.js';
import type { CreateLanguageInput } from '../validators/schemas/language.js';

const norm = (v: unknown) => String(v ?? '').trim().normalize('NFC').toLowerCase();
const toId = (v: unknown) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

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

  /**
   * Languages available for a questionnaire: union of the languages in which at
   * least one active question (static, cat, socio-demo) of its active modules is
   * translated. Feedback questions are excluded: they fall back to the
   * is_fallback translation when the requested language is missing.
   */
  static async getAvailableForQuestionnaire(questionnaireId: number) {
    const questModules = await prisma.questionnaires_modules.findMany({
      where: { questionnaire_id: questionnaireId, is_active: true },
      select: { module_id: true },
    });
    const moduleIds = questModules.map((qm) => qm.module_id);
    if (moduleIds.length === 0) return [];

    const moduleQuestions = await prisma.modules_questions.findMany({
      where: { module_id: { in: moduleIds }, is_active: true },
      select: { question_id: true },
    });
    const questionIds = [...new Set(moduleQuestions.map((mq) => mq.question_id))];
    if (questionIds.length === 0) return [];

    const [staticLangs, catLangs, socioDemoLangs] = await Promise.all([
      prisma.static_questions.findMany({
        where: { question_id: { in: questionIds } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
      prisma.cat_questions.findMany({
        where: { question_id: { in: questionIds } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
      prisma.socio_demo_questions.findMany({
        where: { question_id: { in: questionIds } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
    ]);

    const allLangIds = [
      ...new Set([
        ...staticLangs.map((r) => r.language_id),
        ...catLangs.map((r) => r.language_id),
        ...socioDemoLangs.map((r) => r.language_id),
      ]),
    ];
    if (allLangIds.length === 0) return [];

    const languageRows = await prisma.eu_countries.findMany({
      where: { id: { in: allLangIds } },
      select: { id: true, language: true, original_lang: true },
      orderBy: { language: 'asc' },
    });

    // Deduplicate by language name: if multiple country entries share the same
    // language name (e.g. BE/French and FR/French), keep only the first one.
    // The preview endpoint already resolves all sibling IDs when querying translations.
    const seen = new Set<string>();
    return languageRows.filter((row) => {
      const key = row.language.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Adds a language. Languages are append-only: ids are referenced by every translation table,
   * so there is no update or delete. Name is unique (case-insensitive), id is unique.
   */
  static async create(input: CreateLanguageInput) {
    const language = input.language.trim();

    const sameName = await prisma.eu_countries.findFirst({
      where: { language: { equals: language, mode: 'insensitive' } },
    });
    if (sameName) {
      throw new ServiceError(
        `Language "${sameName.language}" already exists (id ${sameName.id})`,
        409,
        'language'
      );
    }

    if (input.id !== undefined) {
      const sameId = await prisma.eu_countries.findUnique({ where: { id: input.id } });
      if (sameId) {
        throw new ServiceError(
          `Language ID ${input.id} is already used by "${sameId.language}"`,
          409,
          'id'
        );
      }
    }

    try {
      return await prisma.eu_countries.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          language,
          original_lang: input.original_lang.trim(),
          alphabet: input.alphabet.trim(),
        },
      });
    } catch (err: any) {
      // Concurrent insert: the DB unique constraints are the last line of defence
      if (err?.code === 'P2002') {
        const field = String(err?.meta?.target ?? '').includes('id') ? 'id' : 'language';
        throw new ServiceError(
          field === 'id' ? 'Language ID is already in use' : 'Language already exists',
          409,
          field
        );
      }
      throw err;
    }
  }

  /**
   * Checks the language references of a module workbook against eu_countries, before anything
   * is written. Uploads never create or modify languages:
   *  - every Language_ID used in "Questions" / "Answers" must exist;
   *  - every row of the optional "Languages" sheet must match the stored language of that id
   *    (a different name/alphabet would silently re-label every translation of that id).
   * Returns the number of distinct languages the file refers to.
   */
  static async assertWorkbookLanguages(workbook: XLSX.WorkBook): Promise<number> {
    const usedIds = new Set<number>();
    for (const sheetName of ['Questions', 'Answers']) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      for (const row of XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]) {
        const id = toId(row['Language_ID'] ?? row['Language _ID']);
        if (id !== null) usedIds.add(id);
      }
    }

    const sheetRows: { id: number; row: LanguageRow }[] = [];
    const langSheet = workbook.Sheets['Languages'];
    if (langSheet) {
      for (const row of XLSX.utils.sheet_to_json(langSheet) as LanguageRow[]) {
        const id = toId(row.ID);
        if (id !== null) sheetRows.push({ id, row });
      }
    }

    const allIds = new Set<number>([...usedIds, ...sheetRows.map((r) => r.id)]);
    if (allIds.size === 0) return 0;

    const stored = await prisma.eu_countries.findMany({ where: { id: { in: [...allIds] } } });
    const byId = new Map(stored.map((l) => [l.id, l]));
    const errors: string[] = [];

    for (const { id, row } of sheetRows) {
      const lang = byId.get(id);
      if (!lang) continue; // reported below with the other missing ids
      const diffs: string[] = [];
      if (norm(row.Language) !== norm(lang.language)) {
        diffs.push(`name "${row.Language}" (stored: "${lang.language}")`);
      }
      if (norm(row.Original_Language) !== norm(lang.original_lang)) {
        diffs.push(`original language "${row.Original_Language}" (stored: "${lang.original_lang}")`);
      }
      if (norm(row.Alphabet) !== norm(lang.alphabet)) {
        diffs.push(`alphabet "${row.Alphabet}" (stored: "${lang.alphabet}")`);
      }
      if (diffs.length > 0) {
        errors.push(`Language ID ${id} does not match the stored language: ${diffs.join(', ')}`);
      }
    }

    const missing = [...allIds].filter((id) => !byId.has(id)).sort((a, b) => a - b);
    if (missing.length > 0) {
      errors.push(
        `Language ID(s) ${missing.join(', ')} not found: add them first in Settings > Languages`
      );
    }

    if (errors.length > 0) {
      throw new ServiceError(`Invalid languages in file: ${errors.join('; ')}`, 400);
    }
    return allIds.size;
  }
}

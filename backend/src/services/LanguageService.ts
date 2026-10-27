import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { LanguageModelConfig } from '../models/Language.js';

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
}

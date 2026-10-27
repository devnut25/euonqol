import { prisma } from '../config/database.js';
import { DEFAULT_LANGUAGE_ID } from '../config/language.js';
import { parseQueryParams } from '../helpers/queryParser.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { UI_TRANSLATION_KEYS, UI_TRANSLATIONS } from '../models/UiTranslation.js';

export interface UiTranslationRow {
  key: string;
  /** Where the text appears on the public page. */
  section: string;
  hidden_text: boolean;
  language_id: number;
  /** English text, shown to the admin as reference. */
  reference: string | null;
  /** Text for the requested language, null when not translated (public page falls back). */
  value: string | null;
}

async function assertLanguageExists(languageId: number) {
  const language = await prisma.eu_countries.findUnique({
    where: { id: languageId },
    select: { id: true },
  });
  if (!language) throw new ServiceError('Language not found', 404);
}

async function loadMap(languageId: number): Promise<Record<string, string>> {
  const rows = await prisma.ui_translations.findMany({
    where: { language_id: languageId, key: { in: [...UI_TRANSLATION_KEYS] } },
    select: { key: true, value: true },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export class UiTranslationService {
  /** Every editable key, in display order, with its English reference and the language's value. */
  static async getForLanguage(languageId: number): Promise<UiTranslationRow[]> {
    await assertLanguageExists(languageId);
    const [english, translated] = await Promise.all([
      loadMap(DEFAULT_LANGUAGE_ID),
      languageId === DEFAULT_LANGUAGE_ID ? Promise.resolve(null) : loadMap(languageId),
    ]);
    const values = translated ?? english;
    return UI_TRANSLATIONS.map((entry) => ({
      key: entry.key,
      section: entry.section,
      hidden_text: 'hiddenText' in entry && entry.hiddenText,
      language_id: languageId,
      reference: english[entry.key] ?? null,
      value: values[entry.key] ?? null,
    }));
  }

  /**
   * Paginated list for the Settings › Languages table (`filter[language_id]`, `search`,
   * `sort`, `page`, `per_page`). Rows are virtual — one per editable key, translated or
   * not — so QueryBuilder (which queries ui_translations rows) doesn't apply: the fixed,
   * small key set is filtered, sorted and paged in memory.
   */
  static async getList(
    query: Record<string, any>
  ): Promise<{ rows: UiTranslationRow[]; total: number; take: number; skip: number }> {
    // Language filter cleared in the toolbar → English, the reference language
    const requested = parseInt(query.filter?.language_id, 10);
    const languageId = requested > 0 ? requested : DEFAULT_LANGUAGE_ID;

    let rows = await this.getForLanguage(languageId);

    const search = String(query.search ?? '').trim().toLowerCase();
    if (search) {
      rows = rows.filter((r) =>
        [r.section, r.reference, r.value, r.key].some((v) => v?.toLowerCase().includes(search))
      );
    }

    // Only the section is sortable; default = UI_TRANSLATIONS order
    const { orderBy, take = 50, skip = 0 } = parseQueryParams(query);
    const sectionOrder = [orderBy ?? []].flat().find((o) => 'section' in o)?.section;
    if (sectionOrder) {
      rows = [...rows].sort(
        (a, b) => a.section.localeCompare(b.section) * (sectionOrder === 'desc' ? -1 : 1)
      );
    }

    return { rows: rows.slice(skip, skip + take), total: rows.length, take, skip };
  }

  /**
   * Saves one text of one language. An empty value removes the row, so the public page
   * falls back to English. English is that fallback, so its texts can't be emptied.
   */
  static async saveOne(
    languageId: number,
    key: string,
    value: string | null,
    userId?: string | null
  ): Promise<UiTranslationRow> {
    if (!(UI_TRANSLATION_KEYS as readonly string[]).includes(key)) {
      throw new ServiceError(`Unknown translation key: ${key}`, 404);
    }
    await assertLanguageExists(languageId);

    if (!value?.trim() && languageId === DEFAULT_LANGUAGE_ID) {
      throw new ServiceError('English texts are the fallback of every language and cannot be empty', 422);
    }

    if (value?.trim()) {
      await prisma.ui_translations.upsert({
        where: { key_language_id: { key, language_id: languageId } },
        update: { value, updated_by: userId ?? null },
        create: { key, language_id: languageId, value, updated_by: userId ?? null },
      });
    } else {
      await prisma.ui_translations.deleteMany({ where: { key, language_id: languageId } });
    }

    const rows = await this.getForLanguage(languageId);
    return rows.find((r) => r.key === key)!;
  }

  /** key → text for the public page: English as base, overridden by the language's texts. */
  static async getPublicMap(languageId: number): Promise<Record<string, string>> {
    const [english, translated] = await Promise.all([
      loadMap(DEFAULT_LANGUAGE_ID),
      languageId === DEFAULT_LANGUAGE_ID ? Promise.resolve({}) : loadMap(languageId),
    ]);
    return { ...english, ...translated };
  }
}

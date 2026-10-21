import { KitVersionTypeEnum } from '@/config/enums.js';
import { PatientGroupQuestion } from '@/models/PatientGroupQuestion.js';
import {
  SocioDemoAnswerRow,
  SocioDemoQuestion,
  SocioDemoQuestionRow,
} from '@/models/SocioDemoQuestion.js';
import XLSX from 'xlsx';
import { PrismaClient } from '../generated/app/index.js';
import { validateAnswerBoundsRows, type AnswerBoundsRow } from '../helpers/numericAnswerBounds.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { CatQuestion } from '../models/CatQuestion.js';
import { Country, LanguageRow } from '../models/Country.js';
import {
  FeedbackAnswerRow,
  FeedbackQuestion,
  FeedbackQuestionRow,
} from '../models/FeedbackQuestion.js';
import { KitVersion, KitVersionRef } from '../models/KitVersion.js';
import { Question } from '../models/Question.js';
import { StaticQuestion, StaticQuestionRow } from '../models/StaticQuestion.js';
import * as catService from './cat/catService.js';
import { ModuleService } from './ModuleService.js';

const prisma = new PrismaClient();

// ─── row interfaces ───────────────────────────────────────────────────────────

interface AnswerRow {
  Answer_Profile: string;
  Language: string;
  Language_ID: number;
  '-2'?: string;
  '-1'?: string;
  '1'?: string;
  '2'?: string;
  '3'?: string;
  '4'?: string;
  '5'?: string;
  '6'?: string;
  '7'?: string;
  '8'?: string;
  '9'?: string;
}

interface ImportResult {
  kitVersion: KitVersionRef;
  questionCount: number;
  translationCount: number;
  languageCount: number;
  answerProfileCount: number;
  moduleCount: number;
  createdCatSettingKeys?: string[];
  fixedFallbackScales?: { scale: string; group: string }[];
}

// The "CatSettings" sheet maps ScaleCode -> a setting_key PER PATIENT GROUP — the
// same scale can be driven by a different external CAT engine setting depending on
// the group (e.g. a "population-independent" group may need a different norm/config
// than an active-treatment group even for the same scale).
interface CatSettingsSheetRow {
  ScaleCode: string;
  Scale?: string;
  'Group A'?: string;
  'Group B'?: string;
  'Group C'?: string;
  'Group D'?: string;
}

const CAT_SETTINGS_GROUP_COLUMNS: { column: keyof CatSettingsSheetRow; patientGroupId: number }[] = [
  { column: 'Group A', patientGroupId: 1 },
  { column: 'Group B', patientGroupId: 2 },
  { column: 'Group C', patientGroupId: 3 },
  { column: 'Group D', patientGroupId: 4 },
];

// ─── service ──────────────────────────────────────────────────────────────────

export class KitVersionImportService {
  /**
   * Imports static questions from an Excel workbook into an existing kit version.
   * Reads the "Questions" sheet, upserts questions + static_questions + patient group mappings.
   * If a "Languages" sheet is present, upserts eu_countries records as well.
   */
  static async importStatic(
    workbook: XLSX.WorkBook,
    kitVersion: KitVersionRef,
    fileName: string,
    createdByUserId: string | null,
    autoCreateModules = false
  ): Promise<ImportResult> {
    const sheet = workbook.Sheets['Questions'];
    if (!sheet) {
      throw new ServiceError('Excel file must contain a "Questions" sheet');
    }

    const data = XLSX.utils.sheet_to_json(sheet) as StaticQuestionRow[];
    if (data.length === 0) {
      throw new ServiceError('The "Questions" sheet is empty');
    }

    await KitVersion.upsertFile(
      kitVersion.id,
      KitVersionTypeEnum.STATIC,
      fileName,
      createdByUserId
    );

    // Upsert languages from the Languages sheet (if present)
    let languageCount = 0;
    const langSheet = workbook.Sheets['Languages'];
    if (langSheet) {
      const langRows = XLSX.utils.sheet_to_json(langSheet) as LanguageRow[];
      languageCount = await Country.upsertLanguages(langRows);
    }

    const answerProfileCount = await KitVersionImportService.importAnswerProfiles(workbook);

    // Group rows by question_id
    const questionGroups = new Map<string, StaticQuestionRow[]>();
    for (const row of data) {
      if (!row.QuestionID) continue;
      if (!questionGroups.has(row.QuestionID)) {
        questionGroups.set(row.QuestionID, []);
      }
      questionGroups.get(row.QuestionID)!.push(row);
    }

    let questionCount = 0;
    let translationCount = 0;

    for (const [, rows] of questionGroups) {
      const firstRow = rows[0];

      // Scan all rows in the group for conditional fields (may appear on any row)
      const rawParent = rows.find((r) => r.Parent != null)?.Parent;
      const rawOperator = rows.find((r) => r.Operator != null)?.Operator;
      const rawValue = rows.find((r) => r.Value != null)?.Value;
      const rawPramble = rows.find((r) => r.Pramble != null && r.Pramble !== '')?.Pramble;
      const rowWithConditionals = {
        ...firstRow,
        ...(rawParent != null ? { Parent: rawParent } : {}),
        ...(rawOperator != null ? { Operator: rawOperator } : {}),
        ...(rawValue != null ? { Value: rawValue } : {}),
        ...(rawPramble != null ? { Pramble: rawPramble } : {}),
      };

      const question = await Question.upsertStatic(
        kitVersion.id,
        rowWithConditionals,
        createdByUserId
      );
      questionCount++;

      for (const row of rows) {
        await StaticQuestion.upsert(question.id, row);
        translationCount++;
      }

      await PatientGroupQuestion.upsert(question.id, [
        { groupId: 1, flag: firstRow['ACTIVE (Group A)'] },
        { groupId: 2, flag: firstRow['SURVIVORS (Group B)'] },
        { groupId: 3, flag: firstRow['PALLIATIVE (Group C)'] },
        { groupId: 4, flag: firstRow['POPULATION-INDEPENDENT (Group D)'] },
      ]);
    }

    // Auto-create one module per patient group that has at least one question
    let moduleCount = 0;
    if (autoCreateModules) {
      const GROUPS = [
        { id: 1, name: 'Group A' },
        { id: 2, name: 'Group B' },
        { id: 3, name: 'Group C' },
        { id: 4, name: 'Group D' },
      ];
      for (const group of GROUPS) {
        const pgQuestions = await prisma.patient_group_questions.findMany({
          where: {
            patient_group_id: group.id,
            question: { kit_version_id: kitVersion.id, question_kind: KitVersionTypeEnum.STATIC },
          },
          include: { question: { select: { id: true, order_position: true } } },
          orderBy: { question: { order_position: 'asc' } },
        });
        const mod = await ModuleService.create(
          {
            kitVersionId: kitVersion.id,
            name: `${kitVersion.name} - ${group.name}`,
            type: KitVersionTypeEnum.STATIC,
            patientGroupId: group.id,
          },
          createdByUserId
        );
        if (pgQuestions.length > 0) {
          await prisma.modules_questions.createMany({
            data: pgQuestions.map((pgq, idx) => ({
              module_id: mod.id,
              question_id: pgq.question_id,
              position: pgq.question.order_position ?? idx + 1,
              is_active: true,
              created_by: createdByUserId,
            })),
            skipDuplicates: true,
          });
        }
        moduleCount++;
      }
    }

    return {
      kitVersion,
      questionCount,
      translationCount,
      languageCount,
      answerProfileCount,
      moduleCount,
    };
  }

  /**
   * Imports dynamic (CAT) questions from an Excel workbook into a reusable CAT Item Bank,
   * and auto-creates the 4 per-patient-group dynamic modules for the given kit version.
   *
   * The workbook has the EXACT SAME shape as a static import — "Questions" sheet (with the
   * same columns, including the 4 patient-group flag columns), "Answers", "Languages" — plus
   * one extra "CatSettings" sheet mapping ScaleCode -> external CAT engine setting_key. Items
   * themselves are owned by the selected CAT Item Bank (reusable across kit versions), not by
   * this kit_version, mirroring how the same bank can back multiple dynamic uploads over time.
   */
  static async importDynamic(
    workbook: XLSX.WorkBook,
    kitVersion: KitVersionRef,
    fileName: string,
    createdByUserId: string | null,
    autoCreateModules = false,
    catItemBankId: number | null = null
  ): Promise<ImportResult> {
    if (!catItemBankId) {
      throw new ServiceError('cat_item_bank_id is required for dynamic kit versions');
    }

    const sheet = workbook.Sheets['Questions'];
    if (!sheet) {
      throw new ServiceError('Excel file must contain a "Questions" sheet');
    }

    const data = XLSX.utils.sheet_to_json(sheet) as StaticQuestionRow[];
    if (data.length === 0) {
      throw new ServiceError('The "Questions" sheet is empty');
    }

    await KitVersion.upsertFile(kitVersion.id, KitVersionTypeEnum.CAT, fileName, createdByUserId);

    // Upsert languages from the Languages sheet (if present) — same as static.
    let languageCount = 0;
    const langSheet = workbook.Sheets['Languages'];
    if (langSheet) {
      const langRows = XLSX.utils.sheet_to_json(langSheet) as LanguageRow[];
      languageCount = await Country.upsertLanguages(langRows);
    }

    const answerProfileCount = await KitVersionImportService.importAnswerProfiles(workbook);

    // Fixed preamble per (scale, language) for the CAT session — sourced from the
    // Questions sheet's own "Pramble" column (same value repeated on every row
    // sharing a ScaleCode/language, exactly like display_name), not from a
    // separate column on the CatSettings sheet.
    const scalePreambleByLang = new Map<string, Map<number, string>>();
    for (const row of data) {
      if (!row.ScaleCode || !row.Language_ID || !row.Pramble) continue;
      const text = String(row.Pramble).trim();
      if (!text) continue;
      if (!scalePreambleByLang.has(row.ScaleCode)) {
        scalePreambleByLang.set(row.ScaleCode, new Map());
      }
      scalePreambleByLang.get(row.ScaleCode)!.set(row.Language_ID, text);
    }

    // Map ScaleCode -> cat_settings (creating missing settings) before questions are upserted,
    // so every question's `scale` can later be resolved to a settingKey at runtime.
    const createdCatSettingKeys = await KitVersionImportService.importCatSettingsSheet(
      workbook,
      catItemBankId,
      scalePreambleByLang
    );

    // Group rows by question_id — identical logic to importStatic.
    const questionGroups = new Map<string, StaticQuestionRow[]>();
    for (const row of data) {
      if (!row.QuestionID) continue;
      if (!questionGroups.has(row.QuestionID)) {
        questionGroups.set(row.QuestionID, []);
      }
      questionGroups.get(row.QuestionID)!.push(row);
    }

    let questionCount = 0;
    let translationCount = 0;

    for (const [, rows] of questionGroups) {
      const firstRow = rows[0];

      // Scan all rows in the group for conditional fields (may appear on any row)
      const rawParent = rows.find((r) => r.Parent != null)?.Parent;
      const rawOperator = rows.find((r) => r.Operator != null)?.Operator;
      const rawValue = rows.find((r) => r.Value != null)?.Value;
      const rawPramble = rows.find((r) => r.Pramble != null && r.Pramble !== '')?.Pramble;
      const rowWithConditionals = {
        ...firstRow,
        ...(rawParent != null ? { Parent: rawParent } : {}),
        ...(rawOperator != null ? { Operator: rawOperator } : {}),
        ...(rawValue != null ? { Value: rawValue } : {}),
        ...(rawPramble != null ? { Pramble: rawPramble } : {}),
      };

      const question = await Question.upsertCat(
        catItemBankId,
        rowWithConditionals,
        createdByUserId
      );
      questionCount++;

      for (const row of rows) {
        await CatQuestion.upsert(
          question.id,
          row.Language_ID,
          row.Items || null,
          row.Pramble?.trim() || null,
          // The CAT item key. Unlike question_code (the Excel QuestionID, e.g.
          // "EUonQoL_014"), this is the key the EORTC engine knows ("AP4"), and
          // the only way to score this bank's FIXED IRT scales — see
          // computeIrtScoresForDynamicModuleFixedQuestions.
          row.IRT_ItemCode?.trim() || null
        );
        translationCount++;
      }

      await PatientGroupQuestion.upsert(question.id, [
        { groupId: 1, flag: firstRow['ACTIVE (Group A)'] },
        { groupId: 2, flag: firstRow['SURVIVORS (Group B)'] },
        { groupId: 3, flag: firstRow['PALLIATIVE (Group C)'] },
        { groupId: 4, flag: firstRow['POPULATION-INDEPENDENT (Group D)'] },
      ]);
    }

    // Auto-create one dynamic module per patient group that has at least one question —
    // exactly the same GROUPS loop as importStatic, scoped to this bank instead of kit_version.
    let moduleCount = 0;
    // Informational only (does NOT block the upload): a scale used by an active IRT
    // question in some group with no setting_key mapped for that group in the
    // "CatSettings" sheet is NOT rejected — it's handled exactly like a fixed/static
    // question instead (see getScalesForModule / getFixedQuestionsForModule in
    // catHelpers.ts): presented and answered in fixed order, no adaptive session,
    // but still scored via a stateless CAT call at completion (irtScoringService's
    // dynamic-module variant). CTT-scored scales are always fixed this way too, by
    // design, and aren't reported here.
    const fixedFallbackScales: { scale: string; group: string }[] = [];
    if (autoCreateModules) {
      const GROUPS = [
        { id: 1, name: 'Group A', flagColumn: 'ACTIVE (Group A)' as const },
        { id: 2, name: 'Group B', flagColumn: 'SURVIVORS (Group B)' as const },
        { id: 3, name: 'Group C', flagColumn: 'PALLIATIVE (Group C)' as const },
        { id: 4, name: 'Group D', flagColumn: 'POPULATION-INDEPENDENT (Group D)' as const },
      ];

      for (const group of GROUPS) {
        const scalesForGroup = new Set(
          data
            .filter(
              (r) =>
                r[group.flagColumn] === 1 &&
                r.ScaleCode &&
                String(r.Scoring_System ?? '').trim().toUpperCase() === 'IRT'
            )
            .map((r) => r.ScaleCode!)
        );
        for (const scale of scalesForGroup) {
          const mapping = await prisma.cat_item_bank_scales.findUnique({
            where: {
              cat_item_bank_id_scale_code_patient_group_id: {
                cat_item_bank_id: catItemBankId,
                scale_code: scale,
                patient_group_id: group.id,
              },
            },
          });
          if (!mapping) fixedFallbackScales.push({ scale, group: group.name });
        }
      }

      for (const group of GROUPS) {
        const pgQuestions = await prisma.patient_group_questions.findMany({
          where: {
            patient_group_id: group.id,
            question: { question_kind: KitVersionTypeEnum.CAT, cat_item_bank_id: catItemBankId },
          },
          include: { question: { select: { id: true, order_position: true } } },
          orderBy: { question: { order_position: 'asc' } },
        });
        const mod = await ModuleService.create(
          {
            kitVersionId: kitVersion.id,
            name: `${kitVersion.name} - ${group.name}`,
            type: 'dynamic',
            patientGroupId: group.id,
            catItemBankId,
          },
          createdByUserId
        );
        if (pgQuestions.length > 0) {
          await prisma.modules_questions.createMany({
            data: pgQuestions.map((pgq, idx) => ({
              module_id: mod.id,
              question_id: pgq.question_id,
              position: pgq.question.order_position ?? idx + 1,
              is_active: true,
              created_by: createdByUserId,
            })),
            skipDuplicates: true,
          });
        }
        moduleCount++;
      }
    }

    return {
      kitVersion,
      questionCount,
      translationCount,
      languageCount,
      answerProfileCount,
      moduleCount,
      createdCatSettingKeys,
      fixedFallbackScales,
    };
  }

  /**
   * Reads the "CatSettings" sheet (ScaleCode, Scale, Group A, Group B, Group C, Group D)
   * of a dynamic workbook. Each ScaleCode maps to a setting_key PER PATIENT GROUP — the
   * same scale can be driven by a different external CAT engine setting depending on the
   * group. Auto-creates any cat_settings row that doesn't exist yet by setting_key, and
   * upserts the (ScaleCode, patient group) -> cat_setting mapping for the given bank into
   * cat_item_bank_scales. Returns the setting_key values that were newly created, so the
   * caller can surface them for admin visibility.
   */
  private static async importCatSettingsSheet(
    workbook: XLSX.WorkBook,
    catItemBankId: number,
    scalePreambleByLang: Map<string, Map<number, string>>
  ): Promise<string[]> {
    const sheet = workbook.Sheets['CatSettings'];
    if (!sheet) {
      throw new ServiceError('Excel file must contain a "CatSettings" sheet');
    }

    const rows = XLSX.utils.sheet_to_json(sheet) as CatSettingsSheetRow[];
    if (rows.length === 0) {
      throw new ServiceError('The "CatSettings" sheet is empty');
    }

    const createdCatSettingKeys: string[] = [];
    const catSettingCache = new Map<string, number>();

    for (const row of rows) {
      if (!row.ScaleCode) continue;

      const preambleByLang = scalePreambleByLang.get(row.ScaleCode);

      for (const { column, patientGroupId } of CAT_SETTINGS_GROUP_COLUMNS) {
        const settingKey = row[column];
        if (!settingKey) continue;

        let catSettingId = catSettingCache.get(settingKey);
        if (!catSettingId) {
          let catSetting = await prisma.cat_settings.findFirst({ where: { setting_key: settingKey } });
          if (!catSetting) {
            // Fetch the full configuration from the external CAT API — same
            // enrichment as the manual "Fetch from CAT API" admin action — so an
            // auto-created setting doesn't end up with a bare name/setting_key and
            // no configuration. Best-effort: a fetch failure doesn't block the
            // import, it's just left null and can be filled in later in Settings.
            let apiConfiguration: any = undefined;
            try {
              apiConfiguration = await catService.fetchApiConfiguration(settingKey);
            } catch (error) {
              console.warn(
                `[importDynamic] Could not fetch api_configuration for "${settingKey}" — created without it:`,
                error
              );
            }

            catSetting = await prisma.cat_settings.create({
              data: {
                // Just the scale's own name — no "(Group X)" suffix. The same
                // scale can have a differently-named setting per group, but the
                // group is already tracked structurally (cat_item_bank_scales'
                // patient_group_id / the setting_key itself), so repeating it in
                // the display name only added noise.
                name: row.Scale || settingKey,
                setting_key: settingKey,
                api_configuration: apiConfiguration,
              },
            });
            createdCatSettingKeys.push(settingKey);
          }
          catSettingId = catSetting.id;
          catSettingCache.set(settingKey, catSettingId);
        }

        const scaleMapping = await prisma.cat_item_bank_scales.upsert({
          where: {
            cat_item_bank_id_scale_code_patient_group_id: {
              cat_item_bank_id: catItemBankId,
              scale_code: row.ScaleCode,
              patient_group_id: patientGroupId,
            },
          },
          update: { cat_setting_id: catSettingId, display_name: row.Scale || null },
          create: {
            cat_item_bank_id: catItemBankId,
            scale_code: row.ScaleCode,
            patient_group_id: patientGroupId,
            cat_setting_id: catSettingId,
            display_name: row.Scale || null,
          },
        });

        if (preambleByLang) {
          for (const [languageId, text] of preambleByLang) {
            await prisma.cat_item_bank_scale_preambles.upsert({
              where: {
                cat_item_bank_scale_id_language_id: {
                  cat_item_bank_scale_id: scaleMapping.id,
                  language_id: languageId,
                },
              },
              update: { preamble: text },
              create: {
                cat_item_bank_scale_id: scaleMapping.id,
                language_id: languageId,
                preamble: text,
              },
            });
          }
        }
      }
    }

    return [...new Set(createdCatSettingKeys)];
  }

  /**
   * Rejects the upload before anything is written when the optional Min/Max columns of
   * the "Answers" sheet are malformed (see helpers/numericAnswerBounds.ts).
   */
  private static assertValidAnswerBounds(workbook: XLSX.WorkBook): void {
    const answersSheet = workbook.Sheets['Answers'];
    if (!answersSheet) return;
    const rows = XLSX.utils.sheet_to_json(answersSheet) as AnswerBoundsRow[];
    const errors = validateAnswerBoundsRows(rows);
    if (errors.length > 0) {
      throw new ServiceError(`Invalid Min/Max in "Answers" sheet: ${errors.join('; ')}`);
    }
  }

  static async importSocioDemo(
    workbook: XLSX.WorkBook,
    kitVersion: KitVersionRef,
    fileName: string,
    createdByUserId: string | null,
    autoCreateModules = false
  ): Promise<ImportResult> {
    const sheet = workbook.Sheets['Questions'];
    if (!sheet) {
      throw new ServiceError('Excel file must contain a "Questions" sheet');
    }

    const data = XLSX.utils.sheet_to_json(sheet) as SocioDemoQuestionRow[];
    if (data.length === 0) {
      throw new ServiceError('The "Questions" sheet is empty');
    }

    KitVersionImportService.assertValidAnswerBounds(workbook);

    await KitVersion.upsertFile(
      kitVersion.id,
      KitVersionTypeEnum.SOCIO_DEMO,
      fileName,
      createdByUserId
    );

    // Upsert languages from the Languages sheet (if present)
    let languageCount = 0;
    const langSheet = workbook.Sheets['Languages'];
    if (langSheet) {
      const langRows = XLSX.utils.sheet_to_json(langSheet) as LanguageRow[];
      languageCount = await Country.upsertLanguages(langRows);
    }

    // Group rows by id
    const questionGroups = new Map<string, SocioDemoQuestionRow[]>();
    for (const row of data) {
      if (!row.Question_ID) continue;
      if (!questionGroups.has(row.Question_ID)) {
        questionGroups.set(row.Question_ID, []);
      }
      questionGroups.get(row.Question_ID)!.push(row);
    }

    let questionCount = 0;
    let translationCount = 0;

    // Build a map from question_code (Excel id) to DB question id for answer linking
    const questionIdMap = new Map<string, number>();

    for (const [questionCode, rows] of questionGroups) {
      const firstRow = rows[0];

      const question = await Question.upsertSocioDemo(kitVersion.id, firstRow, createdByUserId);
      questionCount++;
      questionIdMap.set(questionCode, question.id);

      for (const row of rows) {
        await SocioDemoQuestion.upsert(question.id, row);
        translationCount++;
      }
    }

    // Import socio_demo_answers from the Answers sheet
    let answerCount = 0;
    const answersSheet = workbook.Sheets['Answers'];
    if (answersSheet) {
      const answerRows = XLSX.utils.sheet_to_json(answersSheet) as SocioDemoAnswerRow[];
      for (const row of answerRows) {
        const questionId = questionIdMap.get(String(row.Question_ID));
        if (!questionId) continue;
        await SocioDemoQuestion.upsertAnswer(questionId, row);
        answerCount++;
      }
    }

    let moduleCount = 0;
    if (autoCreateModules) {
      const socioDemoQuestions = await prisma.questions.findMany({
        where: { kit_version_id: kitVersion.id, question_kind: KitVersionTypeEnum.SOCIO_DEMO },
        select: { id: true, order_position: true },
        orderBy: { order_position: 'asc' },
      });
      const mod = await ModuleService.create(
        {
          kitVersionId: kitVersion.id,
          name: kitVersion.name,
          type: KitVersionTypeEnum.SOCIO_DEMO,
        },
        createdByUserId
      );
      if (socioDemoQuestions.length > 0) {
        await prisma.modules_questions.createMany({
          data: socioDemoQuestions.map((q, idx) => ({
            module_id: mod.id,
            question_id: q.id,
            position: q.order_position ?? idx + 1,
            is_active: true,
            created_by: createdByUserId,
          })),
          skipDuplicates: true,
        });
      }
      moduleCount = 1;
    }

    return {
      kitVersion,
      questionCount,
      translationCount,
      languageCount,
      answerProfileCount: answerCount,
      moduleCount,
    };
  }

  static async importFeedback(
    workbook: XLSX.WorkBook,
    kitVersion: KitVersionRef,
    fileName: string,
    createdByUserId: string | null,
    autoCreateModules = false
  ): Promise<ImportResult> {
    const sheet = workbook.Sheets['Questions'];
    if (!sheet) {
      throw new ServiceError('Excel file must contain a "Questions" sheet');
    }

    const data = XLSX.utils.sheet_to_json(sheet) as FeedbackQuestionRow[];
    if (data.length === 0) {
      throw new ServiceError('The "Questions" sheet is empty');
    }

    KitVersionImportService.assertValidAnswerBounds(workbook);

    await KitVersion.upsertFile(
      kitVersion.id,
      KitVersionTypeEnum.FEEDBACK,
      fileName,
      createdByUserId
    );

    // Upsert languages from the Languages sheet (if present)
    let languageCount = 0;
    const langSheet = workbook.Sheets['Languages'];
    if (langSheet) {
      const langRows = XLSX.utils.sheet_to_json(langSheet) as LanguageRow[];
      languageCount = await Country.upsertLanguages(langRows);
    }

    // Group rows by Question_ID
    const questionGroups = new Map<string, FeedbackQuestionRow[]>();
    for (const row of data) {
      if (!row.Question_ID) continue;
      if (!questionGroups.has(row.Question_ID)) {
        questionGroups.set(row.Question_ID, []);
      }
      questionGroups.get(row.Question_ID)!.push(row);
    }

    let questionCount = 0;
    let translationCount = 0;

    const questionIdMap = new Map<string, number>();

    for (const [questionCode, rows] of questionGroups) {
      const firstRow = rows[0];

      const question = await Question.upsertFeedback(kitVersion.id, firstRow, createdByUserId);
      questionCount++;
      questionIdMap.set(questionCode, question.id);

      for (const row of rows) {
        await FeedbackQuestion.upsert(question.id, row);
        translationCount++;
      }
    }

    // Import feedback_answers from the Answers sheet
    let answerCount = 0;
    const answersSheet = workbook.Sheets['Answers'];
    if (answersSheet) {
      const answerRows = XLSX.utils.sheet_to_json(answersSheet) as FeedbackAnswerRow[];
      for (const row of answerRows) {
        const questionId = questionIdMap.get(String(row.Question_ID));
        if (!questionId) continue;
        await FeedbackQuestion.upsertAnswer(questionId, row);
        answerCount++;
      }
    }

    let moduleCount = 0;
    if (autoCreateModules) {
      const feedbackQuestions = await prisma.questions.findMany({
        where: { kit_version_id: kitVersion.id, question_kind: KitVersionTypeEnum.FEEDBACK },
        select: { id: true, order_position: true },
        orderBy: { order_position: 'asc' },
      });
      const mod = await ModuleService.create(
        {
          kitVersionId: kitVersion.id,
          name: kitVersion.name,
          type: KitVersionTypeEnum.FEEDBACK,
        },
        createdByUserId
      );
      if (feedbackQuestions.length > 0) {
        await prisma.modules_questions.createMany({
          data: feedbackQuestions.map((q, idx) => ({
            module_id: mod.id,
            question_id: q.id,
            position: q.order_position ?? idx + 1,
            is_active: true,
            created_by: createdByUserId,
          })),
          skipDuplicates: true,
        });
      }
      moduleCount = 1;
    }

    return {
      kitVersion,
      questionCount,
      translationCount,
      languageCount,
      answerProfileCount: answerCount,
      moduleCount,
    };
  }

  /**
   * Imports answer_profiles, answer_options, and answer_option_i18n from the
   * "Answers" sheet of a workbook. Returns the number of profiles upserted.
   * Public — also reused by CatItemBankImportService for the standalone CAT
   * Item Bank upload, which shares the exact same "Answers" sheet shape.
   */
  static async importAnswerProfiles(workbook: XLSX.WorkBook): Promise<number> {
    const sheet = workbook.Sheets['Answers'];
    if (!sheet) return 0;

    const data = XLSX.utils.sheet_to_json(sheet) as AnswerRow[];
    if (data.length === 0) return 0;

    // Group by Answer_Profile → Language_ID
    const profilesMap = new Map<string, Map<number, AnswerRow>>();
    for (const row of data) {
      if (!row.Answer_Profile) continue;
      if (!profilesMap.has(row.Answer_Profile)) {
        profilesMap.set(row.Answer_Profile, new Map());
      }
      profilesMap.get(row.Answer_Profile)!.set(row.Language_ID, row);
    }

    const VALUE_COLUMNS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let profileCount = 0;

    for (const [profileCode, languageRows] of profilesMap) {
      const profile = await prisma.answer_profiles.upsert({
        where: { code: profileCode },
        update: { code: profileCode },
        create: { code: profileCode, description: `Answer profile ${profileCode}` },
      });
      profileCount++;

      // Collect values that have at least one non-empty label across all languages
      const valuesWithLabels = new Set<string>();
      for (const row of languageRows.values()) {
        for (const col of VALUE_COLUMNS) {
          const label = row[col as keyof AnswerRow];
          if (label && typeof label === 'string' && label.trim()) {
            valuesWithLabels.add(col);
          }
        }
      }

      // quality_7* profiles always show the full 1-7 scale (1 and 7 carry the real
      // textual labels from the sheet, e.g. "Pessima"/"Ottima"; 2-6 have no dedicated
      // wording in the template, so they fall back to the plain numeral) — same
      // convention used by the historical data-fix migration
      // (20260805_fix_quality_7_scale_gaps.sql).
      const isQuality7Profile = profileCode.startsWith('quality_7');

      let displayOrder = 1;
      for (const valueStr of VALUE_COLUMNS) {
        const isScaleValue = isQuality7Profile && Number(valueStr) >= 1 && Number(valueStr) <= 7;
        if (!valuesWithLabels.has(valueStr) && !isScaleValue) continue;

        const value = parseInt(valueStr);
        let option_code: string | null = null;
        let is_selectable = true;

        if (value === -2) {
          option_code = 'SKIP_SYS';
          is_selectable = false;
        } else if (value === -1) {
          option_code = 'SKIP_PAT';
          is_selectable = true;
        } else if (value === 8) {
          option_code = 'NA';
        } else if (value === 9) {
          option_code = 'PNTA';
        }

        const option = await prisma.answer_options.upsert({
          where: { answer_profile_id_value: { answer_profile_id: profile.id, value } },
          update: { option_code, display_order: displayOrder, is_selectable },
          create: {
            answer_profile_id: profile.id,
            value,
            option_code,
            display_order: displayOrder,
            is_selectable,
          },
        });

        for (const [langId, row] of languageRows) {
          const rawLabel = row[valueStr as keyof AnswerRow];
          const label =
            rawLabel && typeof rawLabel === 'string' && rawLabel.trim()
              ? rawLabel.trim()
              : isScaleValue
                ? valueStr
                : null;
          if (!label) continue;

          await prisma.answer_option_i18n.upsert({
            where: {
              answer_option_id_language_id: { answer_option_id: option.id, language_id: langId },
            },
            update: { label },
            create: { answer_option_id: option.id, language_id: langId, label },
          });
        }

        displayOrder++;
      }
    }

    return profileCount;
  }
}

import { QuestionTypeEnum } from '@/config/enums.js';
import { prisma } from '../config/database.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizeQuestionType(type: string | null | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    Checkbox: 'check',
    checkbox: 'check',
    Textcheck: 'textcheck',
    textcheck: 'textcheck',
    Text: 'text',
    text: 'text',
  };
  return typeMap[type] || type.toLowerCase();
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

// ─── raw row interfaces ────────────────────────────────────────────────────────

export interface StaticQuestionRawInput {
  QuestionID: string;
  Type: string;
  Answer_Profile?: string;
  AnswerType?: string;
  Question_Order?: number;
  ScaleCode?: string;
  Reverse?: string;
  Scoring_System?: string;
  Pramble?: string;
  Parent?: string | number;
  Operator?: string;
  Value?: string | number;
}

/**
 * Row shape of the standalone CAT Item Bank upload's "CATquestions" sheet
 * (Settings > CAT Item Bank > Upload) — distinct from StaticQuestionRawInput,
 * which is the shape used by the Module Library dynamic-kit-version upload.
 * This is the plain item-bank-content format: no patient-group flags, since
 * populating a bank's items is decoupled from any specific kit version/module.
 */
export interface CatItemRawInput {
  Question_ID: string;
  Type: string;
  Answer?: string;
  Scale?: string;
  Version?: number;
}

export interface SocioDemoQuestionRawInput {
  Question_ID: string;
  Type?: string;
  Question_Order?: number;
  IsMandatory?: string;
  Parent?: string | number;
  Operator?: string;
  Value?: string | number;
}

export interface FeedbackQuestionRawInput {
  Question_ID: string;
  Type?: string;
  Question_Order?: number;
  IsMandatory?: string;
  Parent?: string | number;
  Operator?: string;
  Value?: string | number;
}

// ─── model ────────────────────────────────────────────────────────────────────

export class Question {
  /**
   * Builds the shared question field mapping used by both static and CAT/dynamic
   * imports — the two sheets share the exact same column shape (StaticQuestionRawInput),
   * so the normalization/truncation/answer_profile-lookup logic must not drift apart.
   */
  private static async buildStaticLikeQuestionData(row: StaticQuestionRawInput) {
    const questionCode = truncate(row.QuestionID, 50)!;

    const isInfoOnly =
      row.Type === 'Disclaimer' || row.QuestionID.startsWith('Disclaimer_') || !row.Answer_Profile;

    let answer_profile_id: number | null = null;
    if (!isInfoOnly && row.Answer_Profile) {
      const profile = await prisma.answer_profiles.findUnique({
        where: { code: row.Answer_Profile },
      });
      if (profile) {
        answer_profile_id = profile.id;
      }
    }

    const rawParent = row.Parent;
    const rawOperator = row.Operator;
    const rawValue = row.Value;
    const parentQid = rawParent != null ? truncate(String(rawParent).trim(), 50) || null : null;
    const operator = rawOperator != null ? String(rawOperator).trim() || null : null;
    let conditionValue: string | null = null;
    if (rawValue != null) {
      conditionValue =
        String(rawValue).trim().replace(/^"|"$/g, "'").replace(/^'|'$/g, '').trim() || null;
    }

    return {
      questionCode,
      data: {
        answer_profile_id,
        interface: truncate(row.Type, 50),
        question_type: normalizeQuestionType(row.AnswerType),
        order_position: row.Question_Order || null,
        scale: truncate(row.ScaleCode, 50),
        direction: row.Reverse === '1' ? 'negative' : row.Reverse === '0' ? 'positive' : null,
        score_system: truncate(row.Scoring_System, 50),
        parent_qid: parentQid,
        operator,
        value: conditionValue,
      },
    };
  }

  /**
   * Upserts a static question record from a raw Excel row.
   * Handles normalization, truncation, answer_profile lookup, and isInfoOnly check internally.
   * Returns the upserted question id.
   */
  static async upsertStatic(
    kitVersionId: number,
    row: StaticQuestionRawInput,
    createdByUserId: string | null
  ): Promise<{ id: number }> {
    const { questionCode, data } = await Question.buildStaticLikeQuestionData(row);

    return prisma.questions.upsert({
      where: {
        kit_version_id_question_kind_question_code: {
          kit_version_id: kitVersionId,
          question_kind: QuestionTypeEnum.STATIC,
          question_code: questionCode,
        },
      },
      update: data,
      create: {
        kit_version_id: kitVersionId,
        question_kind: QuestionTypeEnum.STATIC,
        question_code: questionCode,
        created_by: createdByUserId,
        ...data,
      },
      select: { id: true },
    });
  }

  /**
   * Upserts a CAT (dynamic) question record from a raw Excel row.
   * The dynamic "Questions" sheet is identical in shape to the static one, so this
   * reuses the exact same field mapping — the only difference is the ownership
   * scope: CAT questions belong to a reusable CAT Item Bank, not a kit_version.
   * Returns the upserted question id.
   */
  static async upsertCat(
    catItemBankId: number,
    row: StaticQuestionRawInput,
    createdByUserId: string | null
  ): Promise<{ id: number }> {
    const { questionCode, data } = await Question.buildStaticLikeQuestionData(row);

    return prisma.questions.upsert({
      where: {
        cat_item_bank_id_question_kind_question_code: {
          cat_item_bank_id: catItemBankId,
          question_kind: QuestionTypeEnum.CAT,
          question_code: questionCode,
        },
      },
      update: data,
      create: {
        cat_item_bank_id: catItemBankId,
        question_kind: QuestionTypeEnum.CAT,
        question_code: questionCode,
        created_by: createdByUserId,
        ...data,
      },
      select: { id: true },
    });
  }

  /**
   * Upserts a CAT item record from the standalone CAT Item Bank upload's plain
   * "CATquestions" sheet shape (Question_ID, Type, Answer, Scale, Version — no
   * patient-group flags). Used by Settings > CAT Item Bank > Upload, distinct
   * from `upsertCat` above (which reads the static-shaped sheet used when a
   * dynamic kit version is created via Module Library).
   */
  static async upsertCatItem(
    catItemBankId: number,
    row: CatItemRawInput,
    createdByUserId: string | null
  ): Promise<{ id: number }> {
    let answer_profile_id: number | null = null;
    if (row.Answer) {
      const profile = await prisma.answer_profiles.findUnique({ where: { code: row.Answer } });
      if (profile) answer_profile_id = profile.id;
    }

    const questionCode = truncate(row.Question_ID, 50)!;

    const data = {
      answer_profile_id,
      interface: truncate(row.Type, 50),
      scale: truncate(row.Scale, 50),
      version: row.Version || null,
    };

    return prisma.questions.upsert({
      where: {
        cat_item_bank_id_question_kind_question_code: {
          cat_item_bank_id: catItemBankId,
          question_kind: QuestionTypeEnum.CAT,
          question_code: questionCode,
        },
      },
      update: data,
      create: {
        cat_item_bank_id: catItemBankId,
        question_kind: QuestionTypeEnum.CAT,
        question_code: questionCode,
        created_by: createdByUserId,
        ...data,
      },
      select: { id: true },
    });
  }

  /**
   * Upserts a Socio-Demographic question record from a raw Excel row.
   * Handles answer_profile lookup internally.
   * Returns the upserted question id.
   */
  static async upsertSocioDemo(
    kitVersionId: number,
    row: SocioDemoQuestionRawInput,
    createdByUserId: string | null
  ): Promise<{ id: number }> {
    const rawParent = row.Parent;
    const rawOperator = row.Operator;
    const rawValue = row.Value;
    const parentQid = rawParent != null ? truncate(String(rawParent).trim(), 50) || null : null;
    const operator = rawOperator != null ? String(rawOperator).trim() || null : null;
    let conditionValue: string | null = null;
    if (rawValue != null) {
      conditionValue =
        String(rawValue).trim().replace(/^"|"$/g, "'").replace(/^'|'$/g, '').trim() || null;
    }
    const isMandatory =
      row.IsMandatory != null && String(row.IsMandatory).trim().toLowerCase() === 'yes'
        ? true
        : row.IsMandatory != null && String(row.IsMandatory).trim().toLowerCase() === 'no'
          ? false
          : null;

    const data = {
      answer_profile_id: null as null,
      interface: truncate(row.Type, 50),
      order_position: row.Question_Order || null,
      parent_qid: parentQid,
      operator: operator,
      value: conditionValue,
      is_mandatory: isMandatory,
    };

    return prisma.questions.upsert({
      where: {
        kit_version_id_question_kind_question_code: {
          kit_version_id: kitVersionId,
          question_kind: QuestionTypeEnum.SOCIO_DEMO,
          question_code: row.Question_ID,
        },
      },
      update: data,
      create: {
        kit_version_id: kitVersionId,
        question_kind: QuestionTypeEnum.SOCIO_DEMO,
        question_code: truncate(row.Question_ID, 50)!,
        created_by: createdByUserId,
        ...data,
      },
      select: { id: true },
    });
  }

  /**
   * Upserts a Feedback question record from a raw Excel row.
   * Mirrors upsertSocioDemo — uses question_kind FEEDBACK.
   */
  static async upsertFeedback(
    kitVersionId: number,
    row: FeedbackQuestionRawInput,
    createdByUserId: string | null
  ): Promise<{ id: number }> {
    const rawParent = row.Parent;
    const rawOperator = row.Operator;
    const rawValue = row.Value;
    const parentQid = rawParent != null ? truncate(String(rawParent).trim(), 50) || null : null;
    const operator = rawOperator != null ? String(rawOperator).trim() || null : null;
    let conditionValue: string | null = null;
    if (rawValue != null) {
      conditionValue =
        String(rawValue).trim().replace(/^"|"$/g, "'").replace(/^'|'$/g, '').trim() || null;
    }
    const isMandatory =
      row.IsMandatory != null && String(row.IsMandatory).trim().toLowerCase() === 'yes'
        ? true
        : row.IsMandatory != null && String(row.IsMandatory).trim().toLowerCase() === 'no'
          ? false
          : null;

    const data = {
      answer_profile_id: null as null,
      interface: truncate(row.Type, 50),
      order_position: row.Question_Order || null,
      parent_qid: parentQid,
      operator: operator,
      value: conditionValue,
      is_mandatory: isMandatory,
    };

    return prisma.questions.upsert({
      where: {
        kit_version_id_question_kind_question_code: {
          kit_version_id: kitVersionId,
          question_kind: QuestionTypeEnum.FEEDBACK,
          question_code: row.Question_ID,
        },
      },
      update: data,
      create: {
        kit_version_id: kitVersionId,
        question_kind: QuestionTypeEnum.FEEDBACK,
        question_code: truncate(row.Question_ID, 50)!,
        created_by: createdByUserId,
        ...data,
      },
      select: { id: true },
    });
  }
}

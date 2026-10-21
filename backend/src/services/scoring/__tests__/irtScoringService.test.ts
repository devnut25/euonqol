/**
 * Unit tests for irtScoringService.
 *
 * catService is fully mocked to isolate IRT routing logic. No module/
 * cat_setting lookup is involved anymore — the stateless estimates endpoint
 * uses a fixed instrument, so `not_applicable` depends only on whether the
 * module has IRT questions with a resolvable cat_id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeIrtScoresForStaticModule } from '../irtScoringService.js';

// ---------------------------------------------------------------------------
// Mock catService
// ---------------------------------------------------------------------------

vi.mock('../../cat/catService.js', () => ({
  getResponseEstimates: vi.fn(),
}));

import * as catService from '../../cat/catService.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function buildPrismaMock({
  moduleQuestions = [],
  profileOptions = [],
  responses = [],
}: {
  moduleQuestions?: any[];
  profileOptions?: any[];
  responses?: any[];
}) {
  return {
    modules_questions: {
      findMany: vi.fn().mockResolvedValue(moduleQuestions),
    },
    answer_options: {
      findMany: vi.fn().mockResolvedValue(profileOptions),
    },
    responses: {
      findMany: vi.fn().mockResolvedValue(responses),
    },
  } as any;
}

/** Builds a mock module_questions record for an IRT question. */
function mkMQ(questionId: number, scale: string, profileId: number, catId: string | null) {
  return {
    question: {
      id: questionId,
      scale,
      answer_profile_id: profileId,
      static_questions: catId ? [{ cat_id: catId, language_id: 29 }] : [],
    },
  };
}

/** Builds a mock answer_option record. `optionCode` defaults to null (real
 *  answer position); pass 'SKIP_SYS'/'SKIP_PAT'/'NA'/'PNTA' for sentinels. */
function mkOpt(profileId: number, value: number, optionCode: string | null = null) {
  return { answer_profile_id: profileId, value, option_code: optionCode };
}

function mkResp(questionId: number, value: number | null) {
  return {
    question_id: questionId,
    answer_option: value !== null ? { value } : null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeIrtScoresForStaticModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_applicable when module has no IRT questions', async () => {
    const prisma = buildPrismaMock({ moduleQuestions: [] });
    const result = await computeIrtScoresForStaticModule(1, 10, prisma);
    expect(result.irt_status).toBe('not_applicable');
    expect(result.irt_dimensions).toBeNull();
    expect(catService.getResponseEstimates).not.toHaveBeenCalled();
  });

  it('returns not_applicable when no question has a resolvable cat_id', async () => {
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'FA_S', 300, null)], // no cat_id
      responses: [mkResp(1, 3)],
    });
    const result = await computeIrtScoresForStaticModule(1, 10, prisma);
    expect(result.irt_status).toBe('not_applicable');
    expect(catService.getResponseEstimates).not.toHaveBeenCalled();
  });

  it('calls the stateless estimates endpoint once, with dimensionKey stripped of "_S" and 0-indexed values', async () => {
    vi.mocked(catService.getResponseEstimates).mockResolvedValue({
      FA: { irt: 52.5, information: 0.8 },
    });

    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'FA_S', 300, 'FA17'), mkMQ(2, 'FA_S', 300, 'FA21')],
      profileOptions: [mkOpt(300, 1), mkOpt(300, 2), mkOpt(300, 3), mkOpt(300, 4)],
      responses: [mkResp(1, 3), mkResp(2, 4)],
    });

    const result = await computeIrtScoresForStaticModule(1, 10, prisma);

    expect(catService.getResponseEstimates).toHaveBeenCalledTimes(1);
    expect(catService.getResponseEstimates).toHaveBeenCalledWith('QLQ-CAT', {
      FA: {
        scoreEstimationMethod: 'Eap',
        informationEstimationMethod: 'Fisher',
        itemSelectionMethod: 'MaxInformation',
        lastScoreEstimation: { Irt: 0 },
        responses: { FA17: 2, FA21: 3 }, // raw 3->2, 4->3 (0-indexed)
      },
    });
    expect(result.irt_status).toBe('computed');
    expect(result.irt_dimensions).toEqual([
      {
        dimension: 'FA_S',
        irt: 52.5,
        information: 0.8,
        missing_items: 0,
        total_items: 2,
        status: 'computed',
      },
    ]);
  });

  it('combines multiple dimensions into a single call', async () => {
    vi.mocked(catService.getResponseEstimates).mockResolvedValue({
      FA: { irt: 52.5, information: 0.8 },
      PF: { irt: 40, information: 0.5 },
    });

    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'FA_S', 300, 'FA17'), mkMQ(2, 'PF_S', 301, 'PF5')],
      profileOptions: [mkOpt(300, 1), mkOpt(300, 2), mkOpt(300, 3), mkOpt(300, 4), mkOpt(301, 1), mkOpt(301, 2)],
      responses: [mkResp(1, 3), mkResp(2, 2)],
    });

    const result = await computeIrtScoresForStaticModule(1, 10, prisma);

    expect(catService.getResponseEstimates).toHaveBeenCalledTimes(1);
    const [, body] = vi.mocked(catService.getResponseEstimates).mock.calls[0];
    expect(Object.keys(body).sort()).toEqual(['FA', 'PF']);
    expect(result.irt_dimensions).toHaveLength(2);
  });

  it('omits SKIP_PAT/SKIP_SYS/NA/PNTA values from the payload but still counts them as missing', async () => {
    vi.mocked(catService.getResponseEstimates).mockResolvedValue({
      FA: { irt: 10, information: 0.1 },
    });

    const prisma = buildPrismaMock({
      moduleQuestions: [
        mkMQ(1, 'FA_S', 300, 'FA1'),
        mkMQ(2, 'FA_S', 300, 'FA2'),
        mkMQ(3, 'FA_S', 300, 'FA3'),
        mkMQ(4, 'FA_S', 300, 'FA4'),
      ],
      profileOptions: [
        mkOpt(300, -2, 'SKIP_SYS'),
        mkOpt(300, -1, 'SKIP_PAT'),
        mkOpt(300, 8, 'NA'),
        mkOpt(300, 1),
        mkOpt(300, 2),
        mkOpt(300, 3),
        mkOpt(300, 4),
      ],
      responses: [mkResp(1, 3), mkResp(2, -2), mkResp(3, -1), mkResp(4, 8)],
    });

    const result = await computeIrtScoresForStaticModule(1, 10, prisma);

    const [, body] = vi.mocked(catService.getResponseEstimates).mock.calls[0];
    // Only the one real answer (question 1) is sent; the other three (SKIP_SYS,
    // SKIP_PAT, NA) are omitted entirely from the payload.
    expect(body.FA.responses).toEqual({ FA1: 2 });
    // But all four raw rows count toward total_items, and the three
    // non-real ones toward missing_items (IRT does not special-case SKIP_SYS
    // the way CTT does).
    expect(result.irt_dimensions?.[0]).toMatchObject({
      total_items: 4,
      missing_items: 3,
      status: 'computed',
    });
  });

  it('marks a dimension with zero real answers as not_applicable without excluding other dimensions from the call', async () => {
    vi.mocked(catService.getResponseEstimates).mockResolvedValue({
      PF: { irt: 40, information: 0.5 },
    });

    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'FA_S', 300, 'FA1'), mkMQ(2, 'PF_S', 301, 'PF5')],
      profileOptions: [mkOpt(300, 1), mkOpt(300, 2), mkOpt(301, 1), mkOpt(301, 2)],
      responses: [mkResp(1, -1), mkResp(2, 2)], // FA1 skipped by patient, PF5 answered
    });

    const result = await computeIrtScoresForStaticModule(1, 10, prisma);

    expect(catService.getResponseEstimates).toHaveBeenCalledTimes(1);
    const [, body] = vi.mocked(catService.getResponseEstimates).mock.calls[0];
    expect(Object.keys(body)).toEqual(['PF']); // FA excluded from the call body

    const faResult = result.irt_dimensions?.find((d) => d.dimension === 'FA_S');
    const pfResult = result.irt_dimensions?.find((d) => d.dimension === 'PF_S');
    expect(faResult).toMatchObject({ status: 'not_applicable', irt: null, missing_items: 1, total_items: 1 });
    expect(pfResult).toMatchObject({ status: 'computed', irt: 40 });
    expect(result.irt_status).toBe('computed');
  });

  it('returns not_applicable overall when every dimension has zero real answers', async () => {
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'FA_S', 300, 'FA1')],
      profileOptions: [mkOpt(300, 1), mkOpt(300, 2)],
      responses: [mkResp(1, -1)], // SKIP_PAT only
    });

    const result = await computeIrtScoresForStaticModule(1, 10, prisma);
    expect(catService.getResponseEstimates).not.toHaveBeenCalled();
    expect(result.irt_status).toBe('not_applicable');
    expect(result.irt_dimensions).toEqual([
      { dimension: 'FA_S', irt: null, information: null, missing_items: 1, total_items: 1, status: 'not_applicable' },
    ]);
  });

  it('returns cat_error for every included dimension when the CAT API call throws', async () => {
    vi.mocked(catService.getResponseEstimates).mockRejectedValue(new Error('Network timeout'));

    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'FA_S', 300, 'FA1')],
      profileOptions: [mkOpt(300, 1), mkOpt(300, 2), mkOpt(300, 3)],
      responses: [mkResp(1, 3)],
    });

    const result = await computeIrtScoresForStaticModule(1, 10, prisma);
    expect(result.irt_status).toBe('cat_error');
    expect(result.irt_dimensions).toEqual([
      { dimension: 'FA_S', irt: null, information: null, missing_items: 0, total_items: 1, status: 'cat_error' },
    ]);
  });
});

/**
 * Unit tests for cttScoringService.
 *
 * The Prisma client is fully mocked so tests run without a real database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeCttScores } from '../cttScoringService.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock PrismaClient for these tests. */
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

/** Builds a mock module question record. */
function mkMQ(questionId: number, scale: string, direction: string | null, profileId: number) {
  return {
    question: { id: questionId, scale, direction, answer_profile_id: profileId },
  };
}

/** Builds a mock answer_option range record. `optionCode` defaults to null
 *  (a genuine, real answer position); pass 'SKIP_SYS'/'SKIP_PAT'/'NA'/'PNTA'
 *  for sentinel rows. */
function mkOpt(profileId: number, value: number, optionCode: string | null = null) {
  return { answer_profile_id: profileId, value, option_code: optionCode };
}

/** Builds a mock response record. */
function mkResp(questionId: number, value: number | null) {
  return {
    question_id: questionId,
    answer_option: value !== null ? { value } : null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeCttScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no CTT questions exist in the module', async () => {
    const prisma = buildPrismaMock({ moduleQuestions: [] });
    const result = await computeCttScores(1, 10, prisma);
    expect(result).toEqual([]);
  });

  it('computes a correct score for a scale with no missing items', async () => {
    // Scale: 2 items, profile 1–4, both direct, values 3 and 4
    // item1: (3-1)/(4-1)*100 = 66.67
    // item2: (4-1)/(4-1)*100 = 100
    // mean: 83.33
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'WISP', 'positive', 100), mkMQ(2, 'WISP', 'positive', 100)],
      profileOptions: [mkOpt(100, 1), mkOpt(100, 2), mkOpt(100, 3), mkOpt(100, 4)],
      responses: [mkResp(1, 3), mkResp(2, 4)],
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result).toHaveLength(1);
    const score = result[0];
    expect(score.scale).toBe('WISP');
    expect(score.score_system).toBe('CTT');
    expect(score.missing_items).toBe(0);
    expect(score.total_items).toBe(2);
    expect(score.raw_0_100_score).toBeCloseTo(83.33, 1);
    expect(score.t_score).not.toBeNull();
    expect(score.status).toBe('computed');
  });

  it('marks scale as missing_too_many_items when missing exceeds threshold', async () => {
    // 3 items, 2 missing → floor(3/2)=1, 2 > 1 → missing_too_many_items
    const prisma = buildPrismaMock({
      moduleQuestions: [
        mkMQ(1, 'PAR_S', 'positive', 101),
        mkMQ(2, 'PAR_S', 'positive', 101),
        mkMQ(3, 'PAR_S', 'positive', 101),
      ],
      profileOptions: [mkOpt(101, 1), mkOpt(101, 2), mkOpt(101, 3), mkOpt(101, 4)],
      responses: [mkResp(1, 2)], // only 1 answered, 2 missing
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('missing_too_many_items');
    expect(result[0].raw_0_100_score).toBeNull();
    expect(result[0].t_score).toBeNull();
  });

  it('computes with missing exactly at threshold (floor(n/2))', async () => {
    // 4 items, 2 missing → floor(4/2)=2, 2 ≤ 2 → computed
    const prisma = buildPrismaMock({
      moduleQuestions: [
        mkMQ(1, 'PAR_S', 'positive', 101),
        mkMQ(2, 'PAR_S', 'positive', 101),
        mkMQ(3, 'PAR_S', 'positive', 101),
        mkMQ(4, 'PAR_S', 'positive', 101),
      ],
      profileOptions: [mkOpt(101, 1), mkOpt(101, 2), mkOpt(101, 3), mkOpt(101, 4)],
      responses: [mkResp(1, 4), mkResp(2, 4)], // 2 answered, 2 missing
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result[0].status).toBe('computed');
    expect(result[0].missing_items).toBe(2);
  });

  it('returns no_norms for a scale not in the CTT_SCALE_NORMS dictionary', async () => {
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'Unknown Scale XYZ', 'positive', 102)],
      profileOptions: [mkOpt(102, 1), mkOpt(102, 2), mkOpt(102, 3)],
      responses: [mkResp(1, 2)],
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result[0].status).toBe('no_norms');
    expect(result[0].t_score).toBeNull();
    expect(result[0].raw_0_100_score).not.toBeNull(); // raw score still computed
  });

  it('handles a reverse (negative) item correctly', async () => {
    // scale 1–4, value=1, direction=negative → direct=0, reverse=100
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'WISP', 'negative', 103)],
      profileOptions: [mkOpt(103, 1), mkOpt(103, 2), mkOpt(103, 3), mkOpt(103, 4)],
      responses: [mkResp(1, 1)],
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result[0].raw_0_100_score).toBeCloseTo(100);
  });

  it('handles a mix of CTT and IRT questions (IRT should not be processed here)', async () => {
    // Only CTT questions are returned from the DB query (filter in prisma mock)
    // If the DB mock returns only CTT questions, the result should only reflect those
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(5, 'EMP_S', 'positive', 104)],
      profileOptions: [mkOpt(104, 1), mkOpt(104, 2), mkOpt(104, 3), mkOpt(104, 4), mkOpt(104, 5)],
      responses: [mkResp(5, 3)],
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result).toHaveLength(1);
    expect(result[0].scale).toBe('EMP_S');
    // IRT questions are not in the result (they're filtered at DB level)
  });

  it('ignores SKIP_SYS (-2) items entirely: not scored, not missing, not counted in total_items', async () => {
    // 3 items: one real (value 3), one SKIP_SYS (-2, never shown to patient),
    // one SKIP_PAT (-1, patient chose not to answer). SKIP_SYS must not
    // appear in total_items at all; only SKIP_PAT counts as missing.
    const prisma = buildPrismaMock({
      moduleQuestions: [
        mkMQ(1, 'WISP', 'positive', 200),
        mkMQ(2, 'WISP', 'positive', 200),
        mkMQ(3, 'WISP', 'positive', 200),
      ],
      profileOptions: [
        mkOpt(200, -2, 'SKIP_SYS'),
        mkOpt(200, -1, 'SKIP_PAT'),
        mkOpt(200, 1),
        mkOpt(200, 2),
        mkOpt(200, 3),
        mkOpt(200, 4),
      ],
      responses: [mkResp(1, 3), mkResp(2, -2), mkResp(3, -1)],
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result).toHaveLength(1);
    // total_items excludes the SKIP_SYS row entirely: 3 raw rows - 1 SKIP_SYS = 2
    expect(result[0].total_items).toBe(2);
    expect(result[0].missing_items).toBe(1); // only the SKIP_PAT item
    expect(result[0].status).toBe('computed');
    // Only the real item (value 3) contributes: (3-1)/(4-1)*100 = 66.67
    expect(result[0].raw_0_100_score).toBeCloseTo(66.67, 1);
  });

  it('computes min/max from real values only, excluding sentinel rows from the range', async () => {
    // Profile has sentinel rows (-2, -1) alongside real 1-4 — the range used
    // by scoreItem must be [1,4], not [-2,4].
    const prisma = buildPrismaMock({
      moduleQuestions: [mkMQ(1, 'WISP', 'positive', 201)],
      profileOptions: [
        mkOpt(201, -2, 'SKIP_SYS'),
        mkOpt(201, -1, 'SKIP_PAT'),
        mkOpt(201, 1),
        mkOpt(201, 2),
        mkOpt(201, 3),
        mkOpt(201, 4),
      ],
      responses: [mkResp(1, 1)], // minimum real value should map to 0%, not to a mid-range value
    });

    const result = await computeCttScores(1, 10, prisma);
    expect(result[0].raw_0_100_score).toBeCloseTo(0, 5);
  });
});

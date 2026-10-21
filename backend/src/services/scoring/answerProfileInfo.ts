/**
 * Answer-profile range/sentinel classification, shared by CTT and IRT scoring.
 *
 * Every answer profile mixes genuine scale positions (option_code === null)
 * with sentinel codes: SKIP_SYS (-2, filtered by the system — the patient
 * never saw the item), SKIP_PAT (-1, patient chose not to answer), NA and
 * PNTA. Sentinels must never widen the min/max range used by the CTT 0-100
 * formula, and SKIP_SYS specifically must be excludable from item counts
 * entirely (unlike the other sentinels, which count as missing).
 */

import { PrismaClient } from '../../generated/app/index.js';

export interface AnswerProfileInfo {
  /** min/max computed ONLY over option_code === null (genuine) values. */
  min: number;
  max: number;
  /** Values with option_code === 'SKIP_SYS' — filtered by the system, never
   *  shown to the patient. */
  skipSystemValues: Set<number>;
}

/** A value is a genuine substantive answer iff it falls within [min, max] of
 *  the real (option_code null) options — a range check rather than exact
 *  membership, so it doesn't depend on every intermediate value having its
 *  own DB row (e.g. a 7-point scale may only have rows for the endpoints). */
export function isRealValue(info: AnswerProfileInfo, value: number): boolean {
  return value >= info.min && value <= info.max;
}

export async function loadAnswerProfileInfo(
  prisma: PrismaClient,
  profileIds: number[]
): Promise<Map<number, AnswerProfileInfo>> {
  if (profileIds.length === 0) return new Map();

  const options = await prisma.answer_options.findMany({
    where: { answer_profile_id: { in: profileIds } },
    select: { answer_profile_id: true, value: true, option_code: true },
  });

  const optionsByProfile = new Map<number, { value: number; option_code: string | null }[]>();
  for (const opt of options) {
    const arr = optionsByProfile.get(opt.answer_profile_id) ?? [];
    arr.push(opt);
    optionsByProfile.set(opt.answer_profile_id, arr);
  }

  const result = new Map<number, AnswerProfileInfo>();
  for (const [profileId, opts] of optionsByProfile) {
    const realVals = opts.filter((o) => o.option_code === null).map((o) => o.value);
    const skipSystemValues = new Set(
      opts.filter((o) => o.option_code === 'SKIP_SYS').map((o) => o.value)
    );
    if (realVals.length === 0) continue;
    result.set(profileId, {
      min: Math.min(...realVals),
      max: Math.max(...realVals),
      skipSystemValues,
    });
  }
  return result;
}

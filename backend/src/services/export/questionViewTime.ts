/**
 * Estimated moment each question was shown to the patient.
 *
 * The player does not record when a question appears on screen, only when its
 * answer is saved (`responses.created_at`, one answer at a time). So a question
 * is taken to appear when the previous answer was saved, and the first one when
 * the session opened (`patient_sessions.start_time`).
 *
 * It is an estimate and the export header says so. It is off when the patient
 * went back to change an answer (that answer keeps its original timestamp, so
 * the questions after it look shown earlier than they were re-shown), and it
 * includes any pause taken before answering.
 */

/**
 * For each answer, in the order given, the estimated time its question was
 * shown, or null when there is nothing to estimate from.
 */
export function estimateViewedAt(
  sessionStart: Date | null,
  answeredAt: (Date | null)[]
): (Date | null)[] {
  // Walk the answers in the order they were given, whatever order they came in.
  const order = answeredAt
    .map((date, index) => ({ date, index }))
    .filter((a): a is { date: Date; index: number } => a.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const viewedAt: (Date | null)[] = answeredAt.map(() => null);
  let previous: Date | null = sessionStart;

  for (const { date, index } of order) {
    // A session start later than the first answer is not a usable reference.
    viewedAt[index] = previous && previous.getTime() <= date.getTime() ? previous : null;
    previous = date;
  }

  return viewedAt;
}

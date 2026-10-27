import { prisma } from '../config/database.js';

export class PatientGroupQuestion {
  /**
   * Upserts patient_group_questions for a question based on flag values from the Excel row.
   * Only creates the association if flag === 1.
   */
  static async upsert(
    questionId: number,
    flags: { groupId: number; flag: number | undefined }[]
  ): Promise<void> {
    for (const { groupId, flag } of flags) {
      if (flag === 1) {
        await prisma.patient_group_questions.upsert({
          where: {
            patient_group_id_question_id: {
              patient_group_id: groupId,
              question_id: questionId,
            },
          },
          update: {},
          create: { patient_group_id: groupId, question_id: questionId },
        });
      }
    }
  }
}

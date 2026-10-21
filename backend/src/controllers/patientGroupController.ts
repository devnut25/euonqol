import { PrismaClient } from '../generated/app';
import { NextFunction, Request, Response } from 'express';
import { PatientGroupService } from '../services/PatientGroupService.js';
import { PatientGroupResource } from '../resources/patientGroups.js';
import { Resource } from '../resources/baseResource.js';

const prisma = new PrismaClient();

/**
 * GET /euonqol-api/patient-groups/:id
 * Get single patient group by ID
 */
export async function getPatientGroupById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const groupId = parseInt(id as string, 10);

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid patient group ID' });
    }

    const group = await prisma.patient_groups.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            patient_group_questions: true,
            patients: true,
            questionnaires: true,
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ 
        error: 'Patient group not found',
        message: `No patient group found with ID ${groupId}` 
      });
    }

    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      is_active: group.is_active,
      questionCount: group._count.patient_group_questions,
      patientCount: group._count.patients,
      questionnaireCount: group._count.questionnaires,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/patient-groups
 * Create a new patient group (Admin only)
 */
export async function createPatientGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, is_active } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'name is required and must be a non-empty string',
      });
    }

    if (name.length > 50) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'name cannot exceed 50 characters',
      });
    }

    if (description && description.length > 200) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'description cannot exceed 200 characters',
      });
    }

    // Check for duplicate name
    const existing = await prisma.patient_groups.findFirst({
      where: {
        name: {
          equals: name.trim(),
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Duplicate name',
        message: `A patient group with name "${name}" already exists`,
        existingId: existing.id,
      });
    }

    // Create patient group
    const newGroup = await prisma.patient_groups.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        is_active: is_active ?? true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    res.status(201).json({
      message: 'Patient group created successfully',
      patientGroup: {
        id: newGroup.id,
        name: newGroup.name,
        description: newGroup.description,
        is_active: newGroup.is_active,
        createdAt: newGroup.created_at,
        updatedAt: newGroup.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /euonqol-api/patient-groups/:id
 * Update an existing patient group (Admin only)
 */
export async function updatePatientGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    const groupId = parseInt(id as string, 10);

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid patient group ID' });
    }

    // Check if group exists
    const existing = await prisma.patient_groups.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Patient group not found',
        message: `No patient group found with ID ${groupId}`,
      });
    }

    // Build update data
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'name must be a non-empty string',
        });
      }

      if (name.length > 50) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'name cannot exceed 50 characters',
        });
      }

      // Check for duplicate name with other groups
      const duplicate = await prisma.patient_groups.findFirst({
        where: {
          name: {
            equals: name.trim(),
            mode: 'insensitive',
          },
          id: {
            not: groupId,
          },
        },
      });

      if (duplicate) {
        return res.status(409).json({
          error: 'Duplicate name',
          message: `Another patient group with name "${name}" already exists`,
          conflictingId: duplicate.id,
        });
      }

      updateData.name = name.trim();
    }

    if (description !== undefined) {
      if (description && description.length > 200) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'description cannot exceed 200 characters',
        });
      }
      updateData.description = description?.trim() || null;
    }

    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({
          error: 'Validation error',
          message: 'is_active must be a boolean',
        });
      }
      updateData.is_active = is_active;
    }

    // Update patient group
    const updated = await prisma.patient_groups.update({
      where: { id: groupId },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            patient_group_questions: true,
            patients: true,
            questionnaires: true,
          },
        },
      },
    });

    res.json({
      message: 'Patient group updated successfully',
      patientGroup: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        is_active: updated.is_active,
        questionCount: updated._count.patient_group_questions,
        patientCount: updated._count.patients,
        questionnaireCount: updated._count.questionnaires,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /euonqol-api/patient-groups/:id
 * Disable a patient group (soft delete, Admin only)
 */
export async function deletePatientGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const groupId = parseInt(id as string, 10);

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid patient group ID' });
    }

    // Check if group exists
    const existing = await prisma.patient_groups.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        is_active: true,
        _count: {
          select: {
            patient_group_questions: true,
            patients: true,
            questionnaires: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Patient group not found',
        message: `No patient group found with ID ${groupId}`,
      });
    }

    if (!existing.is_active) {
      return res.status(400).json({
        error: 'Already disabled',
        message: 'This patient group is already disabled',
      });
    }

    // Soft delete: update is_active to false
    const updated = await prisma.patient_groups.update({
      where: { id: groupId },
      data: { is_active: false },
      select: {
        id: true,
        name: true,
        is_active: true,
      },
    });

    res.json({
      message: 'Patient group disabled successfully',
      patientGroup: {
        id: updated.id,
        name: updated.name,
        is_active: updated.is_active,
      },
      note: 'The patient group has been disabled but not deleted. Associated data remains intact.',
      hadQuestions: existing._count.patient_group_questions > 0,
      hadPatients: existing._count.patients > 0,
      hadQuestionnaires: existing._count.questionnaires > 0,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/patient-groups
 * Lista tutti i patient groups
 */
export async function getPatientGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const { groups, total, take, skip } = await PatientGroupService.getList(req.query);
    const data = PatientGroupResource.collection(groups);
    res.json(Resource.paginate(data, total, take, skip));
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/patient-groups/:id/questions
 * Ottiene tutte le domande assegnate a un patient group specifico
 */
export async function getPatientGroupQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const {
      questionKind, // 'static' or 'cat'
      languageId = '14', // Default: Italian (Italy)
      page = '1',
      pageSize = '100',
    } = req.query;

    const groupId = parseInt(id as string, 10);
    const langId = parseInt(languageId as string, 10);
    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = Math.min(parseInt(pageSize as string, 10), 500);
    const skip = (pageNum - 1) * pageSizeNum;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid patient group ID' });
    }

    if (isNaN(langId)) {
      return res.status(400).json({ error: 'Invalid language ID' });
    }

    // Verify patient group exists
    const group = await prisma.patient_groups.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Patient group not found' });
    }

    // Build where clause for patient_group_questions
    const whereClause: any = {
      patient_group_id: groupId,
    };

    if (questionKind) {
      whereClause.question = {
        question_kind: questionKind,
      };
    }

    // Count total
    const total = await prisma.patient_group_questions.count({ 
      where: whereClause 
    });

    // Get questions
    const mappings = await prisma.patient_group_questions.findMany({
      where: whereClause,
      include: {
        question: {
          include: {
            answer_profile: {
              select: {
                code: true,
                description: true,
              },
            },
            static_questions: {
              where: {
                language_id: langId,
              },
              select: {
                head: true,
                question: true,
              },
            },
            cat_questions: {
              where: {
                language_id: langId,
              },
              select: {
                question: true,
              },
            },
            socio_demo_questions: {
              where: {
                language_id: langId,
              },
              select: {
                question_text: true,
              },
            },
            socio_demo_answers: {
              where: {
                language_id: langId,
              },
              select: {
                id: true,
                answer_text: true,
                answer_type: true,
                display_order: true,
              },
              orderBy: {
                display_order: 'asc',
              },
            },
          },
        },
      },
      skip,
      take: pageSizeNum,
    });

    // Format response
    const formattedQuestions = mappings.map(mapping => {
      const q = mapping.question;
      let questionText = '';
      let questionHead = '';
      let isFallback = false;

      if (q.question_kind === 'static' && q.static_questions.length > 0) {
        const translation = q.static_questions[0];
        questionText = translation.question || '';
        questionHead = translation.head || '';
      } else if (q.question_kind === 'cat' && q.cat_questions.length > 0) {
        const translation = q.cat_questions[0];
        questionText = translation.question || '';
      } else if (q.question_kind === 'socio-demo' && q.socio_demo_questions.length > 0) {
        const translation = q.socio_demo_questions[0];
        questionText = translation.question_text || '';
      } else {
        isFallback = true;
        questionText = `[Translation missing for language ${langId}]`;
      }

      return {
        id: q.id,
        questionCode: q.question_code,
        questionKind: q.question_kind,
        questionType: q.question_type,
        questionHead,
        questionText,
        isFallback,
        orderPosition: q.order_position,
        answerProfile: q.answer_profile ? {
          code: q.answer_profile.code,
          description: q.answer_profile.description,
        } : null,
        createdAt: q.created_at,
      };
    });

    res.json({
      patientGroup: {
        id: group.id,
        name: group.name,
        description: group.description,
        is_active: group.is_active,
      },
      questions: formattedQuestions,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum),
      },
      filters: {
        questionKind: questionKind || null,
        languageId: langId,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /euonqol-api/patient-groups/:id/questions
 * Bulk update delle assegnazioni question-group
 * Body: { questionIds: number[], action: 'add' | 'remove' }
 */
export async function updatePatientGroupQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { questionIds, action } = req.body;

    const groupId = parseInt(id as string, 10);

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid patient group ID' });
    }

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds must be a non-empty array' });
    }

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'action must be "add" or "remove"' });
    }

    // Verify patient group exists
    const group = await prisma.patient_groups.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Patient group not found' });
    }

    // Verify all questions exist
    const questions = await prisma.questions.findMany({
      where: {
        id: { in: questionIds },
      },
      select: { id: true },
    });

    if (questions.length !== questionIds.length) {
      return res.status(400).json({ 
        error: 'Some question IDs do not exist',
        found: questions.length,
        requested: questionIds.length,
      });
    }

    let affectedCount = 0;

    if (action === 'add') {
      // Add questions to group
      for (const questionId of questionIds) {
        await prisma.patient_group_questions.upsert({
          where: {
            patient_group_id_question_id: {
              patient_group_id: groupId,
              question_id: questionId,
            },
          },
          update: {},
          create: {
            patient_group_id: groupId,
            question_id: questionId,
          },
        });
        affectedCount++;
      }
    } else {
      // Remove questions from group
      const result = await prisma.patient_group_questions.deleteMany({
        where: {
          patient_group_id: groupId,
          question_id: { in: questionIds },
        },
      });
      affectedCount = result.count;
    }

    // Get updated question count
    const updatedCount = await prisma.patient_group_questions.count({
      where: { patient_group_id: groupId },
    });

    res.json({
      message: `Successfully ${action === 'add' ? 'added' : 'removed'} ${affectedCount} question(s)`,
      patientGroup: {
        id: group.id,
        name: group.name,
        description: group.description,
      },
      affectedCount,
      totalQuestions: updatedCount,
    });
  } catch (error) {
    return next(error);
  }
}

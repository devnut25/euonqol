import { DEFAULT_LANGUAGE_ID } from '@/config/language.js';
import { ModelConfig } from '@/helpers/QueryBuilder';
import { PrismaClient } from '../generated/app/index.js';

const prisma = new PrismaClient();

/**
 * QueryBuilder configuration for the KitVersion entity (app schema).
 * No attributeFields/sortableAttributes since this is a standard relational model,
 * not a Keycloak user_attribute-style model.
 */
export const KitVersionModelConfig: ModelConfig = {
  // Colonne su kit_versions su cui eseguire la ricerca globale (?search=)
  searchable: ['name'],

  // Nessun campo attributo custom (non è Keycloak)
  attributeFields: [],

  // Colonne ordinabili via DB (?sort=field o ?sort=-field)
  sortable: ['id', 'name', 'is_active', 'created_at', 'updated_at'],

  sortableAttributes: [],

  // Relazioni includibili via ?include=
  includable: ['questions', 'modules'],

  // Mappa alias frontend → nome colonna DB
  fieldMap: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },

  attributeMap: {},

  // Ordinamento di default: più recenti prima
  defaultOrder: [{ created_at: 'desc' }],
};

export interface KitVersionRef {
  id: number;
  name: string;
  is_active: boolean;
}

/**
 * Domain model for KitVersion.
 * Contains shared DB operations used by KitVersionImportService.
 */
export class KitVersion {
  /**
   * Upserts the kit_version_files tracking record for an uploaded Excel file.
   */
  static async upsertFile(
    kitVersionId: number,
    questionKind: string,
    fileName: string,
    uploadedBy: string | null
  ): Promise<void> {
    await prisma.kit_version_files.upsert({
      where: {
        unique_kit_file: {
          kit_version_id: kitVersionId,
          question_kind: questionKind,
          language_id: DEFAULT_LANGUAGE_ID,
        },
      },
      update: { file_name: fileName, uploaded_by: uploadedBy },
      create: {
        kit_version_id: kitVersionId,
        question_kind: questionKind,
        file_name: fileName,
        language_id: DEFAULT_LANGUAGE_ID,
        uploaded_by: uploadedBy,
      },
    });
  }
}

import { prisma } from '../config/database.js';

export class PatientGroupService {
  static async getList(query: Record<string, any>) {
    const page = parseInt(query.page ?? '1', 10);
    const rawPerPage = query.per_page ?? query.pageSize;
    const allRecords = rawPerPage === '-1' || rawPerPage === -1;
    const pageSize = allRecords ? 1000 : Math.min(parseInt(rawPerPage ?? '50', 10), 200);
    const skip = allRecords ? 0 : (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.is_active !== undefined) {
      where.is_active = query.is_active === 'true' || query.is_active === true;
    }

    const [total, groups] = await Promise.all([
      prisma.patient_groups.count({ where }),
      prisma.patient_groups.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return { groups, total, take, skip };
  }
}

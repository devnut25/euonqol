import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

const patientGroups = [
  {
    name: 'Group A',
    description: 'ACTIVE',
    is_active: true,
  },
  {
    name: 'Group B',
    description: 'SURVIVORS',
    is_active: true,
  },
  {
    name: 'Group C',
    description: 'PALLIATIVE',
    is_active: true,
  },
  {
    name: 'Group D',
    description: 'UNDEFINED',
    is_active: true,
  },
];

export async function seedPatientGroups() {
  console.log('👥 Seeding patient groups...');
  
  try {
    for (const group of patientGroups) {
      await prisma.patient_groups.upsert({
        where: { name: group.name },
        update: group,
        create: group,
      });
    }
    
    console.log(`✅ Successfully seeded ${patientGroups.length} patient groups`);
  } catch (error) {
    console.error('❌ Error seeding patient groups:', error);
    throw error;
  }
}

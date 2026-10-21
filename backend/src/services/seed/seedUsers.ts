import { PrismaClient } from '../../generated/app';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const defaultUsers = [
  {
    username: 'admin',
    email: 'admin@euonqol.eu',
    password: 'Admin123!', // Will be hashed
    user_type: 'admin' as const,
    institute_name: 'EUonQoL System',
    is_active: true,
    first_access: false,
  },
  {
    username: 'manager1',
    email: 'manager@euonqol.eu',
    password: 'Manager123!', // Will be hashed
    user_type: 'manager' as const,
    institute_name: 'Default Institute',
    is_active: true,
    first_access: true,
  },
];

export async function seedUsers() {
  console.log('👤 Seeding users...');
  
  try {
    for (const user of defaultUsers) {
      const password_hash = await bcrypt.hash(user.password, 10);
      
      await prisma.users.upsert({
        where: { username: user.username },
        update: {
          email: user.email,
          password_hash,
          user_type: user.user_type,
          institute_name: user.institute_name,
          is_active: user.is_active,
          first_access: user.first_access,
        },
        create: {
          username: user.username,
          email: user.email,
          password_hash,
          user_type: user.user_type,
          institute_name: user.institute_name,
          is_active: user.is_active,
          first_access: user.first_access,
        },
      });
    }
    
    console.log(`✅ Successfully seeded ${defaultUsers.length} users`);
    console.log('📝 Default credentials:');
    defaultUsers.forEach(u => {
      console.log(`   - ${u.username} / ${u.password} (${u.user_type})`);
    });
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  }
}

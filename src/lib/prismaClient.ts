import { PrismaClient } from '@prisma/client';

// Instantiate Prisma Client once
const prisma = new PrismaClient({
  // log: ['query', 'info', 'warn', 'error'], // Optional logging
});

export default prisma;

// Graceful shutdown
export async function disconnectPrisma() {
  await prisma.$disconnect();
  console.log('Prisma client disconnected.');
}
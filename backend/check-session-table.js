// Script para verificar y crear la tabla Session si no existe
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAndCreateSessionTable() {
  try {
    console.log('Checking if Session table exists...');
    
    // Intentar contar sesiones
    const count = await prisma.session.count();
    console.log(`✅ Session table exists! Current session count: ${count}`);
    
    // Verificar estructura
    const sample = await prisma.session.findFirst();
    if (sample) {
      console.log('✅ Session table structure is correct');
      console.log('Sample session:', {
        id: sample.id.substring(0, 20) + '...',
        expiresAt: sample.expiresAt,
        createdAt: sample.createdAt
      });
    }
    
  } catch (error) {
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      console.error('❌ Session table does NOT exist!');
      console.error('Error:', error.message);
      console.log('\n📋 To create the Session table, run:');
      console.log('   npx prisma migrate deploy');
      console.log('\nOr manually execute this SQL:');
      console.log(`
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
      `);
    } else {
      console.error('❌ Error checking Session table:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkAndCreateSessionTable();




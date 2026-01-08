// Script para crear la tabla Session en la base de datos
// Ejecutar: node create-session-table.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createSessionTable() {
  try {
    console.log('Creating Session table...');
    
    // Ejecutar SQL directamente
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Session" (
          "id" TEXT NOT NULL,
          "data" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
      );
    `;
    
    console.log('✅ Session table created!');
    
    // Crear índice
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
    `;
    
    console.log('✅ Session index created!');
    
    // Verificar
    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Session"`;
    console.log('✅ Verification: Session table exists with', count[0].count, 'sessions');
    
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log('ℹ️  Session table already exists');
    } else {
      console.error('❌ Error creating Session table:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

createSessionTable();


// Script para crear la tabla Session en Supabase
// Ejecutar: node create-session-table-supabase.js
// Asegúrate de tener DATABASE_URL configurada en .env o como variable de entorno

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createSessionTable() {
  try {
    console.log('🔍 Verificando conexión a la base de datos...');
    
    // Verificar conexión
    await prisma.$connect();
    console.log('✅ Conectado a la base de datos');
    
    console.log('🔍 Verificando si la tabla Session existe...');
    
    // Intentar verificar si la tabla existe
    try {
      await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
      console.log('✅ La tabla Session ya existe');
      const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Session"`;
      console.log(`📊 Sesiones actuales en la tabla: ${count[0]?.count || 0}`);
      return;
    } catch (error) {
      if (error.code === 'P2021' || error.message?.includes('does not exist') || 
          (error.message?.includes('relation') && error.message?.includes('does not exist'))) {
        console.log('⚠️  La tabla Session no existe, creándola...');
      } else {
        throw error;
      }
    }
    
    console.log('🔨 Creando tabla Session...');
    
    // Crear la tabla
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
          "id" TEXT NOT NULL,
          "data" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
      );
    `);
    
    console.log('✅ Tabla Session creada exitosamente');
    
    console.log('🔨 Creando índice...');
    
    // Crear índice
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
    `);
    
    console.log('✅ Índice creado exitosamente');
    
    // Verificar
    console.log('🔍 Verificando creación...');
    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Session"`;
    console.log(`✅ Verificación exitosa. Sesiones en la tabla: ${count[0]?.count || 0}`);
    
    console.log('\n🎉 ¡Tabla Session creada y lista para usar!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Código de error:', error.code);
    
    if (error.code === 'P1001') {
      console.error('\n💡 Posibles soluciones:');
      console.error('1. Verifica que DATABASE_URL esté configurada correctamente');
      console.error('2. Verifica que la URL use el puerto 6543 (connection pooling)');
      console.error('3. Verifica que la contraseña sea correcta');
    } else if (error.code === 'P2021') {
      console.error('\n💡 La tabla no existe y no se pudo crear automáticamente.');
      console.error('💡 Intenta ejecutar el SQL manualmente en Supabase SQL Editor:');
      console.error(`
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
      `);
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n👋 Desconectado de la base de datos');
  }
}

// Verificar que DATABASE_URL esté configurada
if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL no está configurada');
  console.error('💡 Configúrala en .env o como variable de entorno');
  console.error('💡 Ejemplo: DATABASE_URL=postgresql://postgres.xxx:password@...');
  process.exit(1);
}

console.log('🚀 Iniciando creación de tabla Session...\n');
createSessionTable();


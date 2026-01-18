#!/usr/bin/env node
/**
 * migrate_installations_to_prisma.js
 * 
 * Migra datos de github_installation.json a la tabla GitHubInstallation en Prisma.
 * 
 * Uso:
 *   node scripts/migrate_installations_to_prisma.js
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');

const prisma = new PrismaClient();
const STORAGE_PATH = path.resolve(__dirname, '../backend/github_installation.json');

async function migrate() {
  console.log('🔄 Migrando instalaciones de GitHub a Prisma...\n');

  // 1. Verificar si existe el archivo JSON
  if (!fs.existsSync(STORAGE_PATH)) {
    console.log('⚠️  No se encontró github_installation.json');
    console.log('   Nada que migrar.');
    await prisma.$disconnect();
    return;
  }

  // 2. Leer el archivo
  let data;
  try {
    const content = fs.readFileSync(STORAGE_PATH, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    console.error('❌ Error leyendo github_installation.json:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!data || !data.installation_id) {
    console.log('⚠️  Archivo JSON no contiene installation_id');
    console.log('   Nada que migrar.');
    await prisma.$disconnect();
    return;
  }

  console.log('📄 Datos encontrados:');
  console.log(`   Installation ID: ${data.installation_id}`);
  console.log(`   Account: ${data.account?.login || 'N/A'}`);
  console.log(`   Repos: ${data.repos?.length || 0}`);
  console.log('');

  // 3. Verificar si ya existe en DB
  const existing = await prisma.gitHubInstallation.findUnique({
    where: { installationId: BigInt(data.installation_id) }
  });

  if (existing) {
    console.log('ℹ️  La instalación ya existe en la base de datos.');
    console.log('   ¿Actualizar? (Repos pueden haber cambiado)');
    
    // Actualizar repos
    const updated = await prisma.gitHubInstallation.update({
      where: { installationId: BigInt(data.installation_id) },
      data: {
        repos: data.repos || [],
        accountLogin: data.account?.login || 'unknown',
        accountType: data.account?.type || 'User',
        installedAt: data.installed_at ? new Date(data.installed_at) : existing.installedAt
      }
    });

    console.log('✅ Instalación actualizada en DB');
    console.log(`   ID interno: ${updated.id}`);
  } else {
    // 4. Insertar en DB
    const created = await prisma.gitHubInstallation.create({
      data: {
        installationId: BigInt(data.installation_id),
        accountLogin: data.account?.login || 'unknown',
        accountType: data.account?.type || 'User',
        repos: data.repos || [],
        installedAt: data.installed_at ? new Date(data.installed_at) : new Date()
      }
    });

    console.log('✅ Instalación creada en DB');
    console.log(`   ID interno: ${created.id}`);
    console.log(`   Installation ID: ${created.installationId.toString()}`);
  }

  // 5. Renombrar archivo original (backup)
  const backupPath = STORAGE_PATH.replace('.json', '.json.migrated');
  fs.renameSync(STORAGE_PATH, backupPath);
  console.log('');
  console.log(`📦 Archivo original renombrado a:`);
  console.log(`   ${backupPath}`);

  console.log('');
  console.log('🎉 Migración completada!');
  console.log('');
  console.log('Próximos pasos:');
  console.log('  1. Reiniciar backend (el código ahora usará Prisma)');
  console.log('  2. Verificar: curl http://localhost:3000/github/installation');
  console.log('  3. Probar webhook/dispatch');

  await prisma.$disconnect();
}

migrate().catch(err => {
  console.error('❌ Error fatal:', err);
  prisma.$disconnect();
  process.exit(1);
});

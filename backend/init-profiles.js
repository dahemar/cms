const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function initProfiles() {
  try {
    console.log('🚀 Initializing Frontend Profiles...\n');

    const profilesDir = path.join(__dirname, 'profiles');
    const profileFiles = fs.readdirSync(profilesDir).filter(file => file.endsWith('.json'));

    if (profileFiles.length === 0) {
      console.log('⚠️  No profile files found in profiles/ directory');
      return;
    }

    for (const file of profileFiles) {
      const filePath = path.join(profilesDir, file);
      const profileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      console.log(`📄 Processing profile: ${profileData.name} v${profileData.version}`);

      // Buscar si ya existe un profile con el mismo name y version
      const existing = await prisma.frontendProfile.findUnique({
        where: { name: profileData.name },
      });

      if (existing) {
        if (existing.version === profileData.version) {
          console.log(`   ✅ Profile already exists with same version, skipping...`);
          continue;
        } else {
          console.log(`   ⚠️  Profile exists with different version (${existing.version}), updating...`);
          await prisma.frontendProfile.update({
            where: { name: profileData.name },
            data: {
              description: profileData.description,
              version: profileData.version,
              sectionSchemas: profileData.sectionSchemas,
              deprecated: false, // Reset deprecated flag on update
            },
          });
          console.log(`   ✅ Profile updated`);
          continue;
        }
      }

      // Crear nuevo profile
      await prisma.frontendProfile.create({
        data: {
          name: profileData.name,
          description: profileData.description,
          version: profileData.version,
          sectionSchemas: profileData.sectionSchemas,
          deprecated: false,
        },
      });

      console.log(`   ✅ Profile created successfully`);
      console.log(`   📋 Schemas: ${Object.keys(profileData.sectionSchemas).join(', ')}`);
    }

    console.log('\n✅ All profiles initialized successfully!');
  } catch (error) {
    console.error('❌ Error initializing profiles:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  initProfiles()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed:', error);
      process.exit(1);
    });
}

module.exports = { initProfiles };


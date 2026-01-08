const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function assignProfileToSite() {
  try {
    console.log('🔗 Assigning Frontend Profile to Site...\n');

    // Buscar el site "default" o el primer site disponible
    let site = await prisma.site.findFirst({
      where: {
        slug: {
          startsWith: 'default',
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!site) {
      // Si no hay site con slug "default", tomar el primero
      site = await prisma.site.findFirst({
        orderBy: {
          createdAt: 'asc',
        },
      });
    }

    if (!site) {
      console.log('❌ No sites found. Please create a site first.');
      return;
    }

    console.log(`📌 Found site: "${site.name}" (ID: ${site.id}, slug: ${site.slug})`);

    const desiredProfileName = process.argv[2] || process.env.PROFILE_NAME || 'default-v1';

    // Buscar el profile deseado (por nombre) o el primero disponible
    let profile = await prisma.frontendProfile.findUnique({
      where: { name: desiredProfileName },
    });

    if (!profile) {
      // Si no existe el profile deseado, tomar el primero no deprecado
      profile = await prisma.frontendProfile.findFirst({
        where: { deprecated: false },
        orderBy: {
          createdAt: 'asc',
        },
      });
    }

    if (!profile) {
      console.log('❌ No frontend profiles found. Please run init-profiles.js first.');
      return;
    }

    console.log(`📋 Found profile: "${profile.name}" v${profile.version} (ID: ${profile.id})`);

    // Verificar si ya tiene un profile asignado
    if (site.frontendProfileId) {
      const currentProfile = await prisma.frontendProfile.findUnique({
        where: { id: site.frontendProfileId },
      });
      console.log(`⚠️  Site already has profile: "${currentProfile.name}"`);
      console.log(`   Updating to: "${profile.name}"`);
    }

    // Asignar el profile al site
    const updatedSite = await prisma.site.update({
      where: { id: site.id },
      data: {
        frontendProfileId: profile.id,
      },
      include: {
        frontendProfile: true,
      },
    });

    console.log(`\n✅ Successfully assigned profile "${profile.name}" to site "${site.name}"`);
    console.log(`\n📊 Site details:`);
    console.log(`   - Name: ${updatedSite.name}`);
    console.log(`   - Slug: ${updatedSite.slug}`);
    console.log(`   - Profile: ${updatedSite.frontendProfile.name} v${updatedSite.frontendProfile.version}`);
    
    // Mostrar schemas disponibles
    const schemas = updatedSite.frontendProfile.sectionSchemas || {};
    const schemaKeys = Object.keys(schemas);
    if (schemaKeys.length > 0) {
      console.log(`\n📋 Available section schemas:`);
      schemaKeys.forEach(key => {
        const schema = schemas[key];
        console.log(`   - ${key}: ${schema.label || key} (${schema.postType || 'blog'})`);
      });
    }

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('❌ Error assigning profile:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  assignProfileToSite()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed:', error);
      process.exit(1);
    });
}

module.exports = { assignProfileToSite };


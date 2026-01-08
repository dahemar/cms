require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Migrating thumbnail detail posts to thumbnails section...");

  // Obtener el sitio por defecto
  const defaultSite = await prisma.site.findUnique({
    where: { slug: "default" },
  });

  if (!defaultSite) {
    console.error("❌ Default site not found. Please run seed.js first.");
    process.exit(1);
  }

  // Buscar la sección "thumbnail-details"
  const detailSection = await prisma.section.findFirst({
    where: {
      slug: "thumbnail-details",
      siteId: defaultSite.id,
    },
  });

  if (!detailSection) {
    console.log("ℹ️  No 'thumbnail-details' section found. Nothing to migrate.");
    await prisma.$disconnect();
    return;
  }

  // Buscar la sección "thumbnails"
  const thumbnailsSection = await prisma.section.findFirst({
    where: {
      slug: "thumbnails",
      siteId: defaultSite.id,
    },
  });

  if (!thumbnailsSection) {
    console.error("❌ 'thumbnails' section not found. Please create it first.");
    process.exit(1);
  }

  // Copiar el blockTemplate de detailSection a thumbnailsSection si thumbnailsSection no tiene uno
  if (!thumbnailsSection.blockTemplate && detailSection.blockTemplate) {
    await prisma.section.update({
      where: { id: thumbnailsSection.id },
      data: {
        blockTemplate: detailSection.blockTemplate,
      },
    });
    console.log("✅ Copied blockTemplate from detailSection to thumbnailsSection");
  }

  // Buscar todos los posts en la sección "thumbnail-details"
  const detailPosts = await prisma.post.findMany({
    where: {
      sectionId: detailSection.id,
      siteId: defaultSite.id,
    },
    include: {
      blocks: {
        orderBy: { order: "asc" },
      },
    },
  });

  console.log(`\n📋 Found ${detailPosts.length} posts in "thumbnail-details" section`);

  // Mover cada post a la sección "thumbnails"
  for (const post of detailPosts) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        sectionId: thumbnailsSection.id,
        type: "thumbnails", // Cambiar el tipo también
      },
    });
    console.log(`  ✅ Moved post "${post.title}" (ID: ${post.id}) to thumbnails section`);
  }

  // Actualizar thumbnails para que apunten a la sección correcta (aunque ya deberían estar bien)
  const thumbnails = await prisma.thumbnail.findMany({
    where: {
      sectionId: thumbnailsSection.id,
      siteId: defaultSite.id,
    },
  });

  console.log(`\n📋 Found ${thumbnails.length} thumbnails`);

  // La sección "thumbnail-details" ya no es necesaria, pero la dejamos por si acaso
  // (no la eliminamos para evitar problemas con relaciones)
  console.log(`\n✅ Migration complete!`);
  console.log(`   - Moved ${detailPosts.length} posts to "thumbnails" section`);
  console.log(`   - Updated blockTemplate in "thumbnails" section`);
  console.log(`\n💡 Note: The "thumbnail-details" section is no longer used but kept for safety.`);
  console.log(`   It will not appear in the frontend as it's filtered out.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });



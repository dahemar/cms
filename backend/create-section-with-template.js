require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Creating section with template...");

  // Obtener el sitio por defecto
  const defaultSite = await prisma.site.findUnique({
    where: { slug: "default" },
  });

  if (!defaultSite) {
    console.error("❌ Default site not found. Please run seed.js first.");
    process.exit(1);
  }

  // Template según especificaciones del usuario:
  // - Título (bloque de texto con header)
  // - Texto (half izquierdo)
  // - Imagen + caption (half derecho)
  // - Texto (full)
  const template = {
    blocks: [
      {
        type: "text",
        required: true,
        width: "full",
        // Nota: El cliente puede usar el editor Quill para crear un título (H1, H2, etc.)
      },
      {
        type: "text",
        required: true,
        width: "half",
      },
      {
        type: "image",
        required: true,
        width: "half",
        // La caption se guarda en metadata.caption
      },
      {
        type: "text",
        required: true,
        width: "full",
      },
    ],
  };

  // Verificar si la sección ya existe
  const existing = await prisma.section.findFirst({
    where: {
      slug: "template-test",
      siteId: defaultSite.id,
    },
  });

  if (existing) {
    console.log("⚠️  Section 'Template Test' already exists. Updating template...");
    const updated = await prisma.section.update({
      where: { id: existing.id },
      data: {
        blockTemplate: template,
      },
    });
    console.log("✅ Template updated successfully!");
    console.log(`   Section: ${updated.name} (${updated.slug})`);
    console.log(`   Post Type: ${updated.postType}`);
    console.log(`   Template blocks: ${template.blocks.length}`);
  } else {
    const section = await prisma.section.create({
      data: {
        name: "Template Test",
        slug: "template-test",
        postType: "blog",
        description: "Test section with predefined block template",
        blockTemplate: template,
        order: 10,
        siteId: defaultSite.id,
      },
    });
    console.log("✅ Section created successfully!");
    console.log(`   Section: ${section.name} (${section.slug})`);
    console.log(`   Post Type: ${section.postType}`);
    console.log(`   Template blocks: ${template.blocks.length}`);
    console.log("\n📋 Template structure:");
    template.blocks.forEach((block, index) => {
      console.log(`   ${index + 1}. ${block.type} (${block.width}) ${block.required ? '[REQUIRED]' : '[OPTIONAL]'}`);
    });
  }

  console.log("\n✨ Done! You can now create a new post in this section to see the template in action.");
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



require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Helper: generar slug desde un nombre
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("🌱 Creating thumbnails example section...");

  // Obtener el sitio por defecto
  const defaultSite = await prisma.site.findUnique({
    where: { slug: "default" },
  });

  if (!defaultSite) {
    console.error("❌ Default site not found. Please run seed.js first.");
    process.exit(1);
  }

  // 1. Crear sección de detalles (donde se guardarán los posts de detalle)
  const detailSectionTemplate = {
    blocks: [
      {
        type: "text",
        required: true,
        width: "full",
      },
      {
        type: "slideshow",
        required: false,
        width: "full",
        settings: {
          showArrows: true,
          autoplay: false,
          interval: 3,
        },
      },
      {
        type: "video",
        required: false,
        width: "full",
      },
      {
        type: "text",
        required: true,
        width: "full",
      },
    ],
  };

  let detailSection = await prisma.section.findFirst({
    where: {
      slug: "thumbnail-details",
      siteId: defaultSite.id,
    },
  });

  if (!detailSection) {
    detailSection = await prisma.section.create({
      data: {
        name: "Thumbnail Details",
        slug: "thumbnail-details",
        postType: "detailPage",
        description: "Detail pages for thumbnails",
        blockTemplate: detailSectionTemplate,
        order: 10,
        siteId: defaultSite.id,
      },
    });
    console.log(`✅ Created detail section: "${detailSection.name}" (${detailSection.slug})`);
  } else {
    // Actualizar template si ya existe
    detailSection = await prisma.section.update({
      where: { id: detailSection.id },
      data: {
        blockTemplate: detailSectionTemplate,
      },
    });
    console.log(`✓ Detail section already exists: "${detailSection.name}"`);
  }

  // 2. Crear sección de thumbnails
  let thumbnailsSection = await prisma.section.findFirst({
    where: {
      slug: "thumbnails",
      siteId: defaultSite.id,
    },
  });

  if (!thumbnailsSection) {
    thumbnailsSection = await prisma.section.create({
      data: {
        name: "Thumbnails",
        slug: "thumbnails",
        postType: "thumbnails",
        description: "Thumbnails gallery section",
        order: 11,
        siteId: defaultSite.id,
        detailSectionId: detailSection.id, // Asociar con la sección de detalles
      },
    });
    console.log(`✅ Created thumbnails section: "${thumbnailsSection.name}" (${thumbnailsSection.slug})`);
  } else {
    // Actualizar para asegurar que tiene la asociación correcta
    thumbnailsSection = await prisma.section.update({
      where: { id: thumbnailsSection.id },
      data: {
        postType: "thumbnails",
        detailSectionId: detailSection.id,
      },
    });
    console.log(`✓ Thumbnails section already exists: "${thumbnailsSection.name}"`);
  }

  // 3. Crear thumbnails de ejemplo con posts de detalle
  const exampleThumbnails = [
    {
      title: "Example Project 1",
      imageUrl: "https://i.imgur.com/placeholder1.jpg",
      description: "This is an example thumbnail with placeholder content.",
      order: 0,
    },
    {
      title: "Example Project 2",
      imageUrl: "https://i.imgur.com/placeholder2.jpg",
      description: "Another example thumbnail for testing purposes.",
      order: 1,
    },
    {
      title: "Example Project 3",
      imageUrl: "https://i.imgur.com/placeholder3.jpg",
      description: "Third example thumbnail to demonstrate the system.",
      order: 2,
    },
  ];

  // Usar imágenes placeholder reales de Unsplash
  const placeholderImages = [
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=300&fit=crop",
  ];

  console.log("\n📸 Creating example thumbnails with detail posts...");

  for (let i = 0; i < exampleThumbnails.length; i++) {
    const thumbData = exampleThumbnails[i];
    const imageUrl = placeholderImages[i] || thumbData.imageUrl;

    // Verificar si el thumbnail ya existe
    const existingThumb = await prisma.thumbnail.findFirst({
      where: {
        title: thumbData.title,
        sectionId: thumbnailsSection.id,
      },
    });

    if (existingThumb) {
      console.log(`  ⏭️  Thumbnail "${thumbData.title}" already exists, skipping...`);
      continue;
    }

    // Generar slug único para el post de detalle
    const baseSlug = generateSlug(thumbData.title);
    let postSlug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await prisma.post.findUnique({
        where: { siteId_slug: { siteId: defaultSite.id, slug: postSlug } },
      });
      if (!existing) break;
      postSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Generar bloques desde el template
    const blocksToCreate = detailSectionTemplate.blocks.map((blockDef, index) => {
      const baseBlock = {
        type: blockDef.type,
        content: "",
        order: index,
        metadata: {
          required: blockDef.required || false,
          width: blockDef.width || "full",
        },
      };

      // Configuración específica por tipo de bloque
      switch (blockDef.type) {
        case "slideshow":
          baseBlock.content = "";
          baseBlock.metadata = {
            ...baseBlock.metadata,
            images: [],
            slideshowConfig: blockDef.settings || {
              showArrows: true,
              autoplay: false,
              interval: 3,
            },
          };
          break;
        case "text":
          // Añadir contenido placeholder para el primer bloque de texto (título)
          if (index === 0) {
            baseBlock.content = `<h1>${thumbData.title}</h1>`;
          } else {
            baseBlock.content = `<p>This is the detail page content for ${thumbData.title}. You can edit this content in the admin panel by clicking "Edit Detail" on the thumbnail.</p>`;
          }
          break;
        case "image":
          baseBlock.content = "";
          baseBlock.metadata = {
            ...baseBlock.metadata,
            caption: "",
          };
          break;
        case "video":
          baseBlock.content = "";
          break;
        case "embed_instagram":
        case "embed_soundcloud":
          baseBlock.content = "";
          break;
      }

      return baseBlock;
    });

    // Crear el post de detalle
    const detailPost = await prisma.post.create({
      data: {
        title: thumbData.title,
        slug: postSlug,
        type: detailSection.postType || "detailPage",
        content: "",
        published: true, // Publicar por defecto para poder verlos
        siteId: defaultSite.id,
        sectionId: detailSection.id,
        blocks: {
          create: blocksToCreate.map((block) => ({
            type: block.type,
            content: block.content || null,
            order: block.order,
            metadata: block.metadata || null,
          })),
        },
      },
      include: {
        blocks: {
          orderBy: { order: "asc" },
        },
      },
    });

    // Crear el thumbnail
    const thumbnail = await prisma.thumbnail.create({
      data: {
        title: thumbData.title,
        imageUrl: imageUrl,
        description: thumbData.description,
        sectionId: thumbnailsSection.id,
        siteId: defaultSite.id,
        detailPostId: detailPost.id,
        order: thumbData.order,
      },
    });

    console.log(`  ✅ Created thumbnail: "${thumbData.title}" with detail post`);
  }

  console.log("\n✨ Done! Thumbnails example section created successfully!");
  console.log(`\n📋 Summary:`);
  console.log(`   - Thumbnails Section: "${thumbnailsSection.name}" (${thumbnailsSection.slug})`);
  console.log(`   - Detail Section: "${detailSection.name}" (${detailSection.slug})`);
  console.log(`   - Example thumbnails: ${exampleThumbnails.length}`);
  console.log(`\n💡 To test:`);
  console.log(`   1. Go to the admin panel and select the "Thumbnails" section`);
  console.log(`   2. You should see ${exampleThumbnails.length} example thumbnails`);
  console.log(`   3. Click "Edit Detail" on any thumbnail to edit its detail page`);
  console.log(`   4. In the frontend, navigate to the "Thumbnails" section to see the gallery`);
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



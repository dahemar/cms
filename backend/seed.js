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

// Helper: generar slug único para secciones
async function generateUniqueSectionSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.section.findUnique({
      where: { slug },
    });
    
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// Helper: generar slug único para sites
async function generateUniqueSiteSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.site.findUnique({
      where: { slug },
    });
    
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

async function main() {
  console.log("🌱 Starting seed...");

  // 1. Crear site por defecto si no existe
  let defaultSite = await prisma.site.findUnique({
    where: { slug: "default" },
  });

  if (!defaultSite) {
    const slug = await generateUniqueSiteSlug("default");
    defaultSite = await prisma.site.create({
      data: {
        name: "Default Site",
        slug: slug,
        description: "Default site for existing content",
        domain: null, // null permite que funcione con localhost en desarrollo
      },
    });
    console.log(`✓ Created default site: "${defaultSite.name}" (${defaultSite.slug})`);
  } else {
    // Asegurar que el sitio existente tenga domain: null para desarrollo local
    if (defaultSite.domain !== null) {
      defaultSite = await prisma.site.update({
        where: { id: defaultSite.id },
        data: { domain: null },
      });
      console.log(`✓ Updated default site domain to null for localhost development`);
    } else {
      console.log(`✓ Default site already exists: "${defaultSite.name}" (domain: null)`);
    }
  }

  // 2. Asociar todos los datos existentes sin siteId al site por defecto
  // Posts
  const postsWithoutSite = await prisma.post.findMany({
    where: { siteId: null },
  });
  if (postsWithoutSite.length > 0) {
    await prisma.post.updateMany({
      where: { siteId: null },
      data: { siteId: defaultSite.id },
    });
    console.log(`✓ Associated ${postsWithoutSite.length} post(s) to default site`);
  }

  // Sections
  const sectionsWithoutSite = await prisma.section.findMany({
    where: { siteId: null },
  });
  if (sectionsWithoutSite.length > 0) {
    await prisma.section.updateMany({
      where: { siteId: null },
      data: { siteId: defaultSite.id },
    });
    console.log(`✓ Associated ${sectionsWithoutSite.length} section(s) to default site`);
  }

  // Tags
  const tagsWithoutSite = await prisma.tag.findMany({
    where: { siteId: null },
  });
  if (tagsWithoutSite.length > 0) {
    await prisma.tag.updateMany({
      where: { siteId: null },
      data: { siteId: defaultSite.id },
    });
    console.log(`✓ Associated ${tagsWithoutSite.length} tag(s) to default site`);
  }

  // 3. Asociar usuarios existentes al site por defecto
  const users = await prisma.user.findMany();
  for (const user of users) {
    const existingUserSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId: defaultSite.id,
        },
      },
    });

    if (!existingUserSite) {
      await prisma.userSite.create({
        data: {
          userId: user.id,
          siteId: defaultSite.id,
        },
      });
      console.log(`✓ Associated user "${user.email}" to default site`);
    }
  }

  // 4. Crear secciones iniciales si no existen (dentro del site por defecto)
  const initialSections = [
    { 
      name: "Main", 
      slug: "main", 
      postType: "blog", 
      order: 0, 
      description: "Main section - home page",
      // Sin template = libertad total para el cliente
      blockTemplate: null,
    },
    { 
      name: "Music", 
      slug: "music", 
      postType: "blog", 
      order: 1, 
      description: "Music section",
      blockTemplate: null,
    },
    { 
      name: "Contact", 
      slug: "contact", 
      postType: "page", 
      order: 2, 
      description: "Contact section",
      blockTemplate: null,
    },
    // Ejemplo de sección con template predefinido
    { 
      name: "Detail Pages", 
      slug: "detail-pages", 
      postType: "detailPage", 
      order: 3, 
      description: "Detail pages with predefined structure",
      blockTemplate: {
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
      },
    },
  ];

  const createdSections = [];
  for (const sectionData of initialSections) {
    const existing = await prisma.section.findFirst({
      where: { 
        slug: sectionData.slug,
        siteId: defaultSite.id,
      },
    });

    if (existing) {
      console.log(`✓ Section "${sectionData.name}" already exists`);
      createdSections.push(existing);
    } else {
      const section = await prisma.section.create({
        data: {
          name: sectionData.name,
          slug: sectionData.slug,
          postType: sectionData.postType,
          order: sectionData.order,
          description: sectionData.description || null,
          blockTemplate: sectionData.blockTemplate || null,
          siteId: defaultSite.id,
        },
      });
      console.log(`✓ Created section: "${section.name}" (${section.slug})`);
      createdSections.push(section);
    }
  }

  // 5. Asociar posts sin sección a la sección "Main"
  const mainSection = createdSections.find(s => s.slug === "main");
  if (mainSection) {
    const postsWithoutSection = await prisma.post.findMany({
      where: { 
        sectionId: null,
        siteId: defaultSite.id,
      },
    });

    if (postsWithoutSection.length > 0) {
      await prisma.post.updateMany({
        where: { 
          sectionId: null,
          siteId: defaultSite.id,
        },
        data: { 
          sectionId: mainSection.id,
          type: mainSection.postType,
        },
      });
      console.log(`✓ Associated ${postsWithoutSection.length} post(s) to "Main" section`);
    }
  }

  console.log("\n✅ Seed completed successfully!");
  console.log(`\nDefault site: ${defaultSite.name} (${defaultSite.slug})`);
  console.log("\nSections:");
  createdSections.forEach(s => {
    console.log(`  - ${s.name} (${s.slug}) - Type: ${s.postType}`);
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });



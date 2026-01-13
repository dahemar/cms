const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const siteId = parseInt(process.argv[2] || "3");
  const sectionSlug = process.argv[3] || "sessoes";
  const schemaKey = process.argv[4] || "cineclube.session";

  if (!siteId || Number.isNaN(siteId)) {
    throw new Error("Invalid siteId. Usage: node set-section-schema.js <siteId> <sectionSlug> <schemaKey>");
  }

  const section = await prisma.section.findFirst({
    where: { siteId, slug: sectionSlug },
  });

  if (!section) {
    throw new Error(`Section not found for siteId=${siteId} slug=${sectionSlug}`);
  }

  const updated = await prisma.section.update({
    where: { id: section.id },
    data: {
      schemaKey,
      // Keep blockTemplate as-is; backend will derive template from schemaKey when needed.
    },
  });

  console.log("✅ Updated section schemaKey:");
  console.log({ id: updated.id, name: updated.name, slug: updated.slug, siteId: updated.siteId, schemaKey: updated.schemaKey });
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("❌ Error:", e);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}

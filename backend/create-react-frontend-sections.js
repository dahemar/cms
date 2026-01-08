const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function getTargetSite() {
  const siteSlug = process.argv[2] || "default";
  let site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) site = await prisma.site.findFirst({ orderBy: { id: "asc" } });
  if (!site) throw new Error("No Site found");
  return site;
}

async function upsertSection({ siteId, name, slug, schemaKey, order, postType }) {
  const existing = await prisma.section.findUnique({
    where: { siteId_slug: { siteId, slug } },
  });

  if (existing) {
    const updated = await prisma.section.update({
      where: { id: existing.id },
      data: {
        name,
        description: null,
        schemaKey,
        postType,
        order,
      },
    });
    return { action: "updated", section: updated };
  }

  const created = await prisma.section.create({
    data: {
      name,
      slug,
      description: null,
      schemaKey,
      postType,
      order,
      siteId,
    },
  });
  return { action: "created", section: created };
}

async function main() {
  const site = await getTargetSite();
  console.log(`🧩 Creating base sections for site: ${site.name} (id=${site.id}, slug=${site.slug})`);

  // These are intentionally generic: one section per screen/collection.
  const definitions = [
    { name: "Landing", slug: "landing", schemaKey: "landing.single", postType: "landing", order: 0 },
    { name: "Releases", slug: "releases", schemaKey: "grid.externalLinkItem", postType: "page", order: 1 },
    { name: "Live", slug: "live", schemaKey: "detail.media", postType: "project", order: 2 },
    { name: "Bio", slug: "bio", schemaKey: "content.richTextItem", postType: "page", order: 3 },
    { name: "Contact", slug: "contact", schemaKey: "list.linkItem", postType: "page", order: 4 },
  ];

  for (const d of definitions) {
    const res = await upsertSection({
      siteId: site.id,
      name: d.name,
      slug: slugify(d.slug) || d.slug,
      schemaKey: d.schemaKey,
      postType: d.postType,
      order: d.order,
    });
    console.log(`- ✅ ${res.action} section: ${res.section.name} (${res.section.slug}) schemaKey=${res.section.schemaKey}`);
  }

  console.log("✨ Done.");
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("❌ Failed:", e);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}



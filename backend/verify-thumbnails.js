require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const thumbnails = await prisma.thumbnail.findMany({
    include: {
      detailPost: {
        include: {
          blocks: true,
        },
      },
      section: true,
    },
    orderBy: { order: "asc" },
  });

  console.log(`\n📊 Found ${thumbnails.length} thumbnails:\n`);
  
  thumbnails.forEach((t, i) => {
    console.log(`${i + 1}. ${t.title}`);
    console.log(`   Image: ${t.imageUrl}`);
    console.log(`   Section: ${t.section.name} (${t.section.postType})`);
    console.log(`   Detail Post: ${t.detailPost ? `${t.detailPost.title} (${t.detailPost.blocks.length} blocks)` : 'N/A'}`);
    console.log(`   Order: ${t.order}`);
    console.log("");
  });

  const sections = await prisma.section.findMany({
    where: {
      postType: { in: ["thumbnails", "detailPage"] },
    },
  });

  console.log(`\n📁 Related sections:\n`);
  sections.forEach(s => {
    console.log(`  - ${s.name} (${s.postType}) - slug: ${s.slug}`);
    if (s.detailSectionId) {
      const detailSection = sections.find(sec => sec.id === s.detailSectionId);
      console.log(`    → Linked to detail section: ${detailSection ? detailSection.name : 'N/A'}`);
    }
  });
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



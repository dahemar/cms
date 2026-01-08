const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const profileName = process.argv[2] || "frontend-generic-react@1.0.0";
  const siteSlug = process.argv[3] || "react-frontend";
  const siteName = process.argv[4] || "React Frontend";

  console.log("🏗️  Creating site for frontend...");

  const profile = await prisma.frontendProfile.findUnique({ where: { name: profileName } });
  if (!profile) {
    throw new Error(`FrontendProfile not found in DB mirror: ${profileName} (restart backend to sync disk profiles)`);
  }

  let site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) {
    site = await prisma.site.create({
      data: {
        name: siteName,
        slug: siteSlug,
        description: "Site for a connected frontend (created by script)",
        domain: `site-${siteSlug}.local`,
        frontendProfileId: profile.id,
      },
    });
    console.log(`✅ Created site: ${site.name} (id=${site.id}, slug=${site.slug})`);
  } else {
    site = await prisma.site.update({
      where: { id: site.id },
      data: {
        name: siteName,
        frontendProfileId: profile.id,
      },
    });
    console.log(`✅ Updated existing site: ${site.name} (id=${site.id}, slug=${site.slug})`);
  }

  // Ensure all existing users can access it (dev convenience)
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  for (const u of users) {
    await prisma.userSite.upsert({
      where: { userId_siteId: { userId: u.id, siteId: site.id } },
      create: { userId: u.id, siteId: site.id },
      update: {},
    });
  }
  console.log(`👥 Granted access to ${users.length} user(s)`);

  console.log(`\n📌 Site ready:`);
  console.log(`- siteId: ${site.id}`);
  console.log(`- slug: ${site.slug}`);
  console.log(`- profile: ${profile.name}`);
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("❌ Failed:", e);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}



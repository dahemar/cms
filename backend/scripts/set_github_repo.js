const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    await p.$connect();
    console.log('Connected to DB');

    // Add column if missing (raw)
    await p.$executeRawUnsafe('ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "githubRepo" TEXT');

    // Parameterized updates
    await p.$queryRaw`UPDATE "Site" SET "githubRepo" = ${'dahemar/sympaathy-v2'} WHERE id = ${2}`;
    console.log('Updated site 2');
    await p.$queryRaw`UPDATE "Site" SET "githubRepo" = ${'dahemar/cineclub'} WHERE id = ${3}`;
    console.log('Updated site 3');

    const rows = await p.$queryRaw`SELECT id, name, slug, "githubRepo" FROM "Site" ORDER BY id`;
    console.log('Sites:');
    console.table(rows);

    await p.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    try { await p.$disconnect(); } catch (_) {}
    process.exit(1);
  }
})();

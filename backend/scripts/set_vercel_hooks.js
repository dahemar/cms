// Script helper to set vercelHookUrl for known sites
// Usage: NODE_ENV=development node set_vercel_hooks.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to DB...');

  // Ensure column exists (safe for environments where Prisma migrations were not run)
  try {
    await prisma.$executeRaw`ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "vercelHookUrl" text;`;
    console.log('Ensured Site.vercelHookUrl column exists');
  } catch (e) {
    console.warn('Could not ensure column vercelHookUrl exists:', e?.message || e);
  }

  // Example: set hooks for site id 2 and 3; replace with your real hook URLs
  const mapping = {
    2: process.env.VERCEL_HOOK_SYMPAATHY_V2 || null,
    3: process.env.VERCEL_HOOK_CINECLUB || null,
  };

  for (const [idStr, hook] of Object.entries(mapping)) {
    const id = parseInt(idStr, 10);
    if (!hook) {
      console.log(`Skipping site ${id}: no env var provided`);
      continue;
    }
    try {
      // Use raw SQL because Prisma schema may not include the new column yet
      await prisma.$executeRaw`UPDATE "Site" SET "vercelHookUrl" = ${hook} WHERE id = ${id}`;
      console.log(`Updated site ${id} vercelHookUrl`);
    } catch (e) {
      console.error(`Failed to update site ${id}:`, e.message || e);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

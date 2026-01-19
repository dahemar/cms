// Script helper to set vercelHookUrl for known sites
// Usage: NODE_ENV=development node set_vercel_hooks.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to DB...');

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
      await prisma.site.update({ where: { id }, data: { vercelHookUrl: hook } });
      console.log(`Updated site ${id} vercelHookUrl`);
    } catch (e) {
      console.error(`Failed to update site ${id}:`, e.message || e);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

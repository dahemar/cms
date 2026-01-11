// Cargar variables de entorno
try {
  require("dotenv").config();
} catch (e) {
  // dotenv no disponible, usar variables de entorno del sistema
}

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

// Usar DATABASE_URL de las variables de entorno (Vercel o sistema)
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable not found.");
  console.error("   Please set DATABASE_URL or run this script in an environment where it's available.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Updating site names and creating user...\n");

  // 1. Actualizar nombre del sitio "test-frontend" a "cineclube"
  const testFrontendSite = await prisma.site.findFirst({
    where: {
      OR: [
        { slug: "test-frontend" },
        { slug: { contains: "test-frontend" } }
      ]
    }
  });

  if (testFrontendSite) {
    const updatedSite1 = await prisma.site.update({
      where: { id: testFrontendSite.id },
      data: { name: "cineclube" }
    });
    console.log(`✅ Updated site "${testFrontendSite.slug}" name to: "${updatedSite1.name}"`);
  } else {
    console.log("⚠️  Site 'test-frontend' not found");
  }

  // 2. Actualizar nombre del sitio "react-frontend" a "sympaathy"
  const reactFrontendSite = await prisma.site.findFirst({
    where: {
      OR: [
        { slug: "react-frontend" },
        { slug: { contains: "react-frontend" } },
        { name: { contains: "React" } }
      ]
    }
  });

  if (reactFrontendSite) {
    const updatedSite2 = await prisma.site.update({
      where: { id: reactFrontendSite.id },
      data: { name: "sympaathy" }
    });
    console.log(`✅ Updated site "${reactFrontendSite.slug}" name to: "${updatedSite2.name}"`);
  } else {
    console.log("⚠️  Site 'react-frontend' not found");
  }

  // 3. Buscar el sitio cineclube (por ID 3 o por nombre)
  const cineclubeSite = await prisma.site.findFirst({
    where: {
      OR: [
        { id: 3 },
        { slug: "test-frontend" },
        { name: { contains: "cineclube" } }
      ]
    }
  });

  if (!cineclubeSite) {
    console.error("❌ Cineclube site not found. Cannot assign user.");
    return;
  }

  console.log(`\n📌 Found cineclube site: "${cineclubeSite.name}" (id=${cineclubeSite.id}, slug=${cineclubeSite.slug})\n`);

  // 4. Crear o actualizar usuario neuzaaneuza@gmail.com
  const userEmail = "neuzaaneuza@gmail.com";
  let user = await prisma.user.findUnique({
    where: { email: userEmail }
  });

  if (!user) {
    // Usar la contraseña especificada
    const password = "neuzaneuza";
    const hashedPassword = await bcrypt.hash(password, 10);
    
    user = await prisma.user.create({
      data: {
        email: userEmail,
        password: hashedPassword,
        isAdmin: false,
        emailVerified: false
      }
    });
    console.log(`✅ Created user: ${userEmail}`);
    console.log(`   ✅ Password set to: neuzaneuza`);
  } else {
    console.log(`✅ User already exists: ${userEmail}`);
    // Actualizar contraseña si el usuario ya existe
    const password = "neuzaneuza";
    const hashedPassword = await bcrypt.hash(password, 10);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isAdmin: false
      }
    });
    console.log(`   ✅ Updated password to: neuzaneuza`);
    console.log(`   ✅ Ensured user is non-admin`);
  }

  // 5. Asignar usuario al sitio cineclube
  await prisma.userSite.upsert({
    where: {
      userId_siteId: {
        userId: user.id,
        siteId: cineclubeSite.id
      }
    },
    create: {
      userId: user.id,
      siteId: cineclubeSite.id
    },
    update: {}
  });

  console.log(`✅ Assigned user ${userEmail} to site "${cineclubeSite.name}" (id=${cineclubeSite.id})`);

  console.log(`\n📋 Summary:`);
  console.log(`- Cineclube site: "${cineclubeSite.name}" (id=${cineclubeSite.id})`);
  console.log(`- User: ${userEmail} (id=${user.id}, admin=${user.isAdmin})`);
  console.log(`- User has access to cineclube site`);
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("❌ Failed:", e);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}

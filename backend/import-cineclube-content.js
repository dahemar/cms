const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const siteId = 3; // ID del sitio test-frontend
  
  console.log("🎬 Importando contenido de 1cineclube al CMS...\n");

  // Buscar o crear la sección "sessoes"
  let section = await prisma.section.findFirst({
    where: {
      siteId: siteId,
      slug: 'sessoes'
    }
  });

  if (!section) {
    // Buscar el frontend profile
    const profile = await prisma.frontendProfile.findFirst({
      where: { name: 'frontend-generic-react@1.0.0' }
    });

    if (!profile) {
      throw new Error('FrontendProfile not found. Make sure the backend has synced profiles.');
    }

    section = await prisma.section.create({
      data: {
        name: 'Sessões',
        slug: 'sessoes',
        description: 'Sessões do cineclube',
        siteId: siteId,
        postType: 'page',
        order: 0,
        schemaKey: 'cineclube.session',
      }
    });
    console.log(`✅ Sección creada: ${section.name} (id=${section.id})`);
  } else {
    console.log(`✅ Sección encontrada: ${section.name} (id=${section.id})`);

    if (section.schemaKey !== 'cineclube.session') {
      section = await prisma.section.update({
        where: { id: section.id },
        data: { schemaKey: 'cineclube.session' },
      });
      console.log(`✅ schemaKey actualizado: ${section.slug} -> ${section.schemaKey}`);
    }
  }

  // Sessão 2 - Malqueridas
  const sessao2 = await prisma.post.upsert({
    where: {
      siteId_slug: {
        siteId: siteId,
        slug: 'sessao-2-malqueridas'
      }
    },
    update: {
      title: 'Malqueridas, Tana Gilbert',
      metadata: {
        films: [
          { title: 'Malqueridas', director: 'Tana Gilbert' }
        ]
      }
    },
    create: {
      title: 'Malqueridas, Tana Gilbert', // Título simple sin HTML
      slug: 'sessao-2-malqueridas',
      content: '',
      published: true,
      siteId: siteId,
      sectionId: section.id,
      order: 1, // Sessão 2 (order 1 = segunda)
      metadata: {
        // Estructura semántica del título
        films: [
          { title: 'Malqueridas', director: 'Tana Gilbert' }
        ]
      },
      blocks: {
        create: [
          {
            type: 'text',
            content: '26 de Novembro, 2025 às 19:30h em Lisboa',
            order: 0,
          },
          {
            type: 'text',
            content: 'São mulheres. São mães. São reclusas a cumprir longas penas numa prisão no Chile. Os seus filhos crescem longe delas, mas permanecem nos seus corações. Na prisão, encontram o carinho de outras reclusas que partilham a mesma experiência. O apoio mútuo entre estas mulheres torna-se uma forma de resistência e emancipação. <i>Malqueridas</i> reconstrói as suas histórias através das imagens que elas próprias captaram com telemóveis proibidos dentro da prisão, recuperando a memória coletiva de uma comunidade esquecida.',
            order: 1,
          },
          {
            type: 'image',
            content: 'Images/Malqueridas.png',
            order: 2,
            metadata: { alt: 'still do filme Malqueridas' }
          }
        ]
      }
    }
  });
  console.log(`✅ Post creado: ${sessao2.title}`);

  // Sessão 1 - Palestinian Women + Untitled
  const sessao1 = await prisma.post.upsert({
    where: {
      siteId_slug: {
        siteId: siteId,
        slug: 'sessao-1-palestinian-untitled'
      }
    },
    update: {
      title: 'Palestinian Women, Jocelyne Saab / untitled part 1: everything & nothing, Jayce Salloum',
      metadata: {
        films: [
          { title: 'Palestinian Women', director: 'Jocelyne Saab' },
          { title: 'untitled part 1: everything & nothing', director: 'Jayce Salloum' }
        ]
      }
    },
    create: {
      title: 'Palestinian Women, Jocelyne Saab / untitled part 1: everything & nothing, Jayce Salloum',
      slug: 'sessao-1-palestinian-untitled',
      content: '',
      published: true,
      siteId: siteId,
      sectionId: section.id,
      order: 0, // Sessão 1 (order 0 = primera)
      metadata: {
        // Estructura semántica del título - múltiples películas
        films: [
          { title: 'Palestinian Women', director: 'Jocelyne Saab' },
          { title: 'untitled part 1: everything & nothing', director: 'Jayce Salloum' }
        ]
      },
      blocks: {
        create: [
          {
            type: 'text',
            content: '29 de Outubro, 2025 às 18:30h em Lisboa',
            order: 0,
          },
          {
            type: 'text',
            content: 'Na nossa primeira sessão iremos apresentar dois filmes que têm como figuras centrais mulheres e a sua acção revolucionária. <i>Palestinian women</i> (1973/4) é uma curta-metragem documental da realizadora libanesa Jocelyne Saab, que dá voz às mulheres palestinianas guerrilheiras na Síria. O filme resultou de uma encomenda pela Antenne 2, estação francesa de televisão, e nunca chegou a ser exibido, tendo sido censurado durante a sua pós-produção. A Cinemateca Portuguesa restaurou a cópia atualmente disponível, aquando de uma retrospectiva da realizadora.<br><br>O segundo filme, <i>untitled part 1: everything & nothing</i> (2002), do realizador canadiano Jayce Salloum, é uma conversa-retrato com Soha Bechara, libanesa ex-combatente da Resistência Nacional Libanesa. Estas imagens foram filmadas um ano após a sua libertação do centro de tortura e interrogatório de El-Khiam, no sul do Líbano. Um diálogo que acompanha as memórias de Soha e o seu testemunho, através da partilha dos seus pensamentos assentes sobre os seus ideais de resistência, sobrevivência, distância, amor, perda, empatia, o que resta e permanece.',
            order: 1,
          },
          {
            type: 'image',
            content: 'Images/palestinian-women-b-w-2.png',
            order: 2,
            metadata: { alt: 'still do filme Palestinian Women' }
          },
          {
            type: 'image',
            content: 'Images/untitled-b-w.png',
            order: 3,
            metadata: { alt: 'still do filme Untitled' }
          }
        ]
      }
    }
  });
  console.log(`✅ Post creado: ${sessao1.title}`);

  console.log(`\n✅ Contenido importado exitosamente!`);
  console.log(`\n📌 Próximos pasos:`);
  console.log(`1. Abre el frontend en: file:///Users/david/Desktop/web/1cineclube-main/index.html`);
  console.log(`2. O sirve el frontend con un servidor HTTP local`);
  console.log(`3. Asegúrate de que el backend esté corriendo en http://localhost:3000`);
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("❌ Error:", e);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}


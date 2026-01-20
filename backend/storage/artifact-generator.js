/**
 * Artifact Generation for Supabase Storage Publishing
 * 
 * Generates prerender artifacts (posts_bootstrap.json, posts.html) 
 * in-memory without writing to disk, ready for direct upload
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MEDIA_BASE = process.env.PRERENDER_MEDIA_BASE_URL || '';

function resolveMediaUrl(url) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url)) return url;
  if (MEDIA_BASE) {
    return `${MEDIA_BASE.replace(/\/$/, '')}/${url.replace(/^\/+/, '')}`;
  }
  return url;
}

function firstBlockOfType(blocks, type) {
  if (!Array.isArray(blocks)) return null;
  return blocks.find(b => b?.type === type);
}

function slideshowUrls(block) {
  const images = block?.metadata?.images;
  if (!Array.isArray(images)) return [];
  return images.map(i => i?.url).filter(Boolean);
}

/**
 * Fetch posts for a section
 */
async function fetchPostsForSection(siteId, sectionId) {
  if (!sectionId) return [];
  
  try {
    const posts = await prisma.post.findMany({
      where: {
        siteId: Number(siteId),
        sectionId: Number(sectionId),
        published: true
      },
      include: {
        blocks: {
          orderBy: { order: 'asc' }
        },
        tags: true,
        section: true
      },
      orderBy: [
        { order: 'asc' },
        { updatedAt: 'desc' }
      ]
    });
    
    console.log(`[Artifacts] Fetched ${posts.length} posts for site ${siteId} section ${sectionId}`);
    return posts;
  } catch (err) {
    console.error(`[Artifacts] Error fetching posts:`, err.message);
    return [];
  }
}

/**
 * Fetch all sections for a site
 */
async function fetchSections(siteId) {
  try {
    const sections = await prisma.section.findMany({
      where: { siteId: Number(siteId) },
      orderBy: { createdAt: 'asc' }
    });
    
    console.log(`[Artifacts] Fetched ${sections.length} sections for site ${siteId}`);
    return sections;
  } catch (err) {
    console.error(`[Artifacts] Error fetching sections:`, err.message);
    return [];
  }
}

/**
 * Build complete bootstrap JSON for a site
 */
async function buildCompleteBootstrap(siteId) {
  const sections = await fetchSections(siteId);
  const bySlug = {};
  sections.forEach(s => { if (s?.slug) bySlug[s.slug] = s; });

  const getSectionId = (slug) => (bySlug[slug] && bySlug[slug].id) ? bySlug[slug].id : null;

  // Support common alias slugs (Portuguese / English) for sites like Cineclub
  const findSectionId = (names) => {
    if (!Array.isArray(names)) names = [names];
    for (const n of names) {
      const id = getSectionId(n);
      if (id) return id;
    }
    return null;
  };

  const landingId = findSectionId(['landing', 'inicio', 'home']);
  const releasesId = findSectionId(['releases', 'lancamentos', 'releases']);
  const liveId = findSectionId(['live', 'sessions', 'sessoes']);
  const bioId = findSectionId(['bio', 'sobre', 'quem-somos']);
  const contactId = findSectionId(['contact', 'contato']);

  console.log(`[Artifacts] Section IDs: landing=${landingId}, releases=${releasesId}, live=${liveId}, bio=${bioId}, contact=${contactId}`);

  const [landingPosts, releasesPosts, livePosts, bioPosts, contactPosts] = await Promise.all([
    landingId ? fetchPostsForSection(siteId, landingId) : Promise.resolve([]),
    releasesId ? fetchPostsForSection(siteId, releasesId) : Promise.resolve([]),
    liveId ? fetchPostsForSection(siteId, liveId) : Promise.resolve([]),
    bioId ? fetchPostsForSection(siteId, bioId) : Promise.resolve([]),
    contactId ? fetchPostsForSection(siteId, contactId) : Promise.resolve([])
  ]);

  // Landing slides
  const landingSlides = (landingPosts[0] && Array.isArray(landingPosts[0].blocks))
    ? (firstBlockOfType(landingPosts[0].blocks, 'slideshow') 
        ? slideshowUrls(firstBlockOfType(landingPosts[0].blocks, 'slideshow')).map(resolveMediaUrl) 
        : [])
    : [];

  // Releases
  const releases = (releasesPosts || [])
    .map(p => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || '';
      const href = firstBlockOfType(p.blocks, 'link')?.content || '';
      return { 
        href, 
        title: p.title, 
        image: resolveMediaUrl(img), 
        order: p.order ?? 0 
      };
    })
    .filter(r => r.href && r.title)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Live projects
  const liveProjects = (livePosts || [])
    .map(p => ({
      slug: p.slug,
      title: p.title,
      image: resolveMediaUrl(firstBlockOfType(p.blocks, 'image')?.content || ''),
      order: p.order ?? 0
    }))
    .filter(r => r.slug)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Live detail map
  const liveDetailMap = (livePosts || []).reduce((acc, p) => {
    const slideshows = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'slideshow') : [];
    const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]).map(resolveMediaUrl) : null;
    const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]).map(resolveMediaUrl) : null;
    
    const videoBlock = firstBlockOfType(p.blocks, 'video');
    const video = videoBlock ? (function() {
      const src = String(videoBlock?.content || '').trim();
      if (!src) return null;
      if (/youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/.test(src)) {
        return { type: 'iframe', src, title: p.title };
      }
      if (/\.(mp4|mov|webm|ogg)(\?.*)?$/.test(src) || src.startsWith('/')) {
        return { type: 'video', src, title: p.title };
      }
      return null;
    })() : null;

    // Extract text content for description
    const textBlocks = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'text') : [];
    const description = textBlocks.map(b => b?.content || '').filter(Boolean).join('\n') || p.content || '';

    // Extract all image blocks (not slideshows)
    const imageBlocks = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'image') : [];
    const images = imageBlocks.map(b => resolveMediaUrl(b?.content || '')).filter(Boolean);
    
    acc[p.slug] = {
      title: p.title || p.slug,
      video,
      primaryImages,
      secondaryImages,
      // New fields for frontend rendering:
      description,
      images,
      blocks: p.blocks || [],
      content: p.content || '',
      metadata: p.metadata || {},
      order: p.order ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    };
    return acc;
  }, {});

  // Bio sections
  const bioSections = (bioPosts || [])
    .map(p => ({
      order: p.order ?? 0,
      title: p.title,
      html: firstBlockOfType(p.blocks, 'text')?.content || ''
    }))
    .filter(s => s.title)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Contact links
  const contactLinks = (contactPosts || [])
    .map(p => {
      const href = firstBlockOfType(p.blocks, 'link')?.content || '';
      return {
        order: p.order ?? 0,
        label: p.title,
        href,
        is_external: /^(https?:\/\/|mailto:|tel:)/i.test(String(href))
      };
    })
    .filter(l => l.label && l.href)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    landingSlides,
    releases,
    liveProjects,
    liveDetailMap,
    bioSections,
    contactLinks,
    _meta: {
      generatedAt: new Date().toISOString(),
      siteId
    }
  };
}

/**
 * Generate HTML for cineclub posts
 */
function renderFormattedTitle(post) {
  let title = post.title || '';
  title = title.replace(/<\/p>\s*<p>/gi, '<br>');
  title = title.replace(/^<p>/, '').replace(/<\/p>$/g, '');
  return title;
}

function getBlocksByType(blocks, type) {
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((b) => b?.type === type);
}

function renderSession(post, index) {
  const formattedTitle = renderFormattedTitle(post);
  const textBlocks = getBlocksByType(post.blocks, 'text');
  const horarioText = textBlocks[0]?.content || post.metadata?.horario || '';
  const description = textBlocks[1]?.content || textBlocks[0]?.content || post.content || '';
  
  const imagesRaw = getBlocksByType(post.blocks, 'image');
  const images = imagesRaw.filter(img => img && img.content && String(img.content).trim());
  const sessionNum = post.order !== undefined && post.order >= 0 ? `Sessão ${post.order + 1}` : `Sessão ${index + 1}`;
  const imgContainerClass = images.length === 2 ? 'imagem-sessao imagem-sessao--two' : 'imagem-sessao';
  const primaryThumb = images[0]?.content || '';

  return `
    <section class="session" data-post-id="${post.id}" data-slug="${post.slug || ''}" data-updated-at="${post.updatedAt || ''}" data-thumb="${primaryThumb}">
      <p class="session-num">${sessionNum}</p>
      ${horarioText ? `<p class="horario">${horarioText}</p>` : ''}
      <h2 class="filme">${formattedTitle}</h2>
      ${description ? `<div class="descricao">${description}</div>` : ''}
      ${images.length > 0 ? `
        <div class="${imgContainerClass}">
          ${images.map((img, i) => `
            <img
              src="${resolveMediaUrl(img.content)}"
              alt="${img.metadata?.alt || post.title || ''}"
              class="movie-img"
              loading="${i === 0 ? 'eager' : 'lazy'}"
              fetchpriority="${i === 0 ? 'high' : 'auto'}"
            >
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

/**
 * Generate posts.html for cineclub
 */
async function generatePostsHtml(siteId, sectionId) {
  const posts = await fetchPostsForSection(siteId, sectionId);
  
  const sessionsHtml = posts
    .map((post, idx) => renderSession(post, idx))
    .join('\n');
  
  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sessões - Cineclub</title>
  <meta name="generated-at" content="${new Date().toISOString()}">
</head>
<body>
  ${sessionsHtml}
</body>
</html>`;

  return html;
}

/**
 * Main function: generate all artifacts for a site
 * @param {number} siteId 
 * @returns {Promise<object>} Map of { filename: content }
 */
async function generateArtifacts(siteId) {
  console.log(`[Artifacts] Generating artifacts for site ${siteId}`);
  
  const artifacts = {};
  
  try {
    // Generate complete bootstrap
    const bootstrap = await buildCompleteBootstrap(siteId);
    artifacts['posts_bootstrap.json'] = JSON.stringify(bootstrap, null, 2);

    // Also generate a minimal bootstrap for fast initial loads
    // Only include top-N posts (above-the-fold), with minimal fields
    const topN = 3;
    const topLiveProjects = (bootstrap.liveProjects || []).slice(0, topN);
    const minBootstrap = {
      liveProjects: topLiveProjects.map(p => ({
        slug: p.slug,
        title: p.title,
        order: p.order || 0,
        image: p.image || ''
      })),
      // minimal details map: only for top-N posts, with truncated description
      liveDetailMap: topLiveProjects.reduce((acc, p) => {
        const d = bootstrap.liveDetailMap[p.slug];
        if (d) {
          acc[p.slug] = {
            title: d.title,
            description: (String(d.description || '').replace(/\s+/g, ' ').substring(0, 160)).trim(),
            order: d.order || 0
          };
        }
        return acc;
      }, {}),
      _meta: {
        generatedAt: new Date().toISOString(),
        siteId,
        minimal: true
      }
    };

    artifacts['posts_bootstrap.min.json'] = JSON.stringify(minBootstrap);
    
    // For cineclub (site 3), also generate posts.html
    if (Number(siteId) === 3) {
      const sections = await fetchSections(siteId);
      const mainSection = sections.find(s => s.slug === 'main' || s.slug === 'sessions');
      if (mainSection) {
        const html = await generatePostsHtml(siteId, mainSection.id);
        artifacts['posts.html'] = html;
      }
    }
    
    console.log(`[Artifacts] Generated ${Object.keys(artifacts).length} artifacts for site ${siteId}`);
    return artifacts;
  } catch (err) {
    console.error(`[Artifacts] Error generating artifacts for site ${siteId}:`, err.message);
    throw err;
  }
}

module.exports = {
  generateArtifacts,
  buildCompleteBootstrap,
  generatePostsHtml
};

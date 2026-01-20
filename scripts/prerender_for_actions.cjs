#!/usr/bin/env node
/**
 * Prerender script para ejecución en GitHub Actions
 * 
 * Este script genera posts.html y posts_bootstrap.json desde el CMS backend
 * y los escribe en el directorio actual del repo frontend.
 * 
 * Variables de entorno requeridas:
 * - CMS_API_URL: URL del backend CMS (ej: https://cms-woad-delta.vercel.app)
 * - CMS_SITE_ID: ID del site a prerender
 * - CMS_SECTION_ID: ID de la sección (o 'ALL' para bootstrap completo)
 * - OUTPUT_DIR: directorio donde escribir los archivos (default: 'public')
 * - REPO_TYPE: 'cineclub' o 'sympaathy' (afecta el formato de output)
 */

const fs = require('fs');
const path = require('path');

// Configuración desde env vars
const CMS_API_URL = process.env.CMS_API_URL || 'http://localhost:3000';
const SITE_ID = process.env.CMS_SITE_ID ? Number(process.env.CMS_SITE_ID) : 3;
const SECTION_ID = process.env.CMS_SECTION_ID || 'ALL';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'public';
const REPO_TYPE = process.env.REPO_TYPE || 'cineclub';
const MEDIA_BASE = process.env.CMS_MEDIA_BASE_URL || '';

console.log(`[Prerender] Starting...`);
console.log(`  CMS_API_URL: ${CMS_API_URL}`);
console.log(`  SITE_ID: ${SITE_ID}`);
console.log(`  SECTION_ID: ${SECTION_ID}`);
console.log(`  OUTPUT_DIR: ${OUTPUT_DIR}`);
console.log(`  REPO_TYPE: ${REPO_TYPE}`);

function resolveMediaUrl(url) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url)) return url;
  if (MEDIA_BASE) {
    return `${MEDIA_BASE.replace(/\/$/, '')}/${url.replace(/^\/+/, '')}`;
  }
  return url;
}

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
      ${horarioText ? `<div class="horario">${horarioText}</div>` : ''}
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

async function fetchPostsForSection(site, section) {
  if (!section) {
    console.log(`[fetchPosts] Skipping null section for site ${site}`);
    return [];
  }
  const url = `${CMS_API_URL}/posts?siteId=${site}&sectionId=${section}&page=1&limit=1000&includeTags=false&includeSection=false&includeBlocks=true`;
  console.log(`[fetchPosts] GET ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`⚠️ fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    const count = Array.isArray(data.posts) ? data.posts.length : 0;
    console.log(`[fetchPosts] Got ${count} posts`);
    return Array.isArray(data.posts) ? data.posts : [];
  } catch (e) {
    console.error(`❌ fetch error:`, e.message);
    return [];
  }
}

async function buildCompleteBootstrap(site) {
  try {
    const sectionsUrl = `${CMS_API_URL}/sections?siteId=${site}&limit=200`;
    console.log(`[Bootstrap] Fetching sections from ${sectionsUrl}`);
    const sectionsRes = await fetch(sectionsUrl);
    if (!sectionsRes.ok) {
      console.warn(`⚠️ sections fetch failed: ${sectionsRes.status}`);
      return null;
    }
    const sections = await sectionsRes.json();
    console.log(`[Bootstrap] Got ${Array.isArray(sections) ? sections.length : 0} sections`);
    
    const bySlug = {};
    (Array.isArray(sections) ? sections : []).forEach(s => { if (s?.slug) bySlug[s.slug] = s });

    const getSectionId = (slug) => (bySlug[slug] && bySlug[slug].id) ? bySlug[slug].id : null;
    const landingId = getSectionId('landing');
    const releasesId = getSectionId('releases');
    const liveId = getSectionId('live');
    const bioId = getSectionId('bio');
    const contactId = getSectionId('contact');
    
    console.log(`[Bootstrap] IDs: landing=${landingId}, releases=${releasesId}, live=${liveId}, bio=${bioId}, contact=${contactId}`);

    const [landingPosts, releasesPosts, livePosts, bioPosts, contactPosts] = await Promise.all([
      fetchPostsForSection(site, landingId),
      fetchPostsForSection(site, releasesId),
      fetchPostsForSection(site, liveId),
      fetchPostsForSection(site, bioId),
      fetchPostsForSection(site, contactId)
    ]);

    const firstBlockOfType = (blocks, type) => (Array.isArray(blocks) ? blocks.find(b => b?.type === type) : null);
    const slideshowUrls = (block) => {
      const images = block?.metadata?.images;
      if (!Array.isArray(images)) return [];
      return images.map(i => i?.url).filter(Boolean);
    };

    const landingSlides = (landingPosts[0] && Array.isArray(landingPosts[0].blocks))
      ? (firstBlockOfType(landingPosts[0].blocks, 'slideshow') ? slideshowUrls(firstBlockOfType(landingPosts[0].blocks, 'slideshow')) : [])
      : [];

    const releases = (releasesPosts || []).map(p => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || '';
      const href = firstBlockOfType(p.blocks, 'link')?.content || '';
      return { href, title: p.title, image: resolveMediaUrl(img), order: p.order ?? 0 };
    }).filter(r => r.href && r.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

    const liveProjects = (livePosts || []).map(p => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || '';
      return { slug: p.slug, title: p.title, image: resolveMediaUrl(img), order: p.order ?? 0 };
    }).filter(r => r.slug).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

    const liveDetailMap = (livePosts || []).reduce((acc, p) => {
      const slideshows = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'slideshow') : [];
      const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]).map(resolveMediaUrl) : null;
      const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]).map(resolveMediaUrl) : null;
      const videoBlock = firstBlockOfType(p.blocks, 'video');
      const video = videoBlock ? (function(){
        const src=String(videoBlock?.content||'').trim(); 
        if(!src) return null; 
        if(/youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/.test(src)) return {type:'iframe',src,title:p.title}; 
        if(/\.(mp4|mov|webm|ogg)(\?.*)?$/.test(src)||src.startsWith('/')) return {type:'video',src,title:p.title}; 
        return null;
      })() : null;
      acc[p.slug] = { title: p.title || p.slug, video, primaryImages, secondaryImages };
      return acc;
    }, {});

    const bioSections = (bioPosts || []).map(p => ({ 
      order: p.order ?? 0, 
      title: p.title, 
      html: firstBlockOfType(p.blocks, 'text')?.content || '' 
    })).filter(s => s.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

    const contactLinks = (contactPosts || []).map(p => ({ 
      order: p.order ?? 0, 
      label: p.title, 
      href: firstBlockOfType(p.blocks, 'link')?.content || '', 
      is_external: /^(https?:\/\/|mailto:|tel:)/i.test(String(firstBlockOfType(p.blocks, 'link')?.content || '')) 
    })).filter(l => l.label && l.href).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

    const result = { landingSlides, releases, liveProjects, liveDetailMap, bioSections, contactLinks };
    console.log(`[Bootstrap] Generated: slides=${landingSlides.length}, releases=${releases.length}, liveProjects=${liveProjects.length}, liveDetail=${Object.keys(liveDetailMap).length}, bio=${bioSections.length}, contact=${contactLinks.length}`);
    return result;
  } catch (e) {
    console.error(`❌ buildCompleteBootstrap error:`, e.message);
    return null;
  }
}

async function main() {
  try {
    // Crear output dir si no existe
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`[Prerender] Created ${OUTPUT_DIR}`);
    }

    let posts = [];
    let bootstrap = null;

    // Determinar si queremos bootstrap completo o posts de una sección
    if (SECTION_ID === 'ALL') {
      console.log(`[Prerender] Building complete bootstrap for site ${SITE_ID}`);
      bootstrap = await buildCompleteBootstrap(SITE_ID);
    } else {
      console.log(`[Prerender] Fetching posts for site ${SITE_ID}, section ${SECTION_ID}`);
      posts = await fetchPostsForSection(SITE_ID, Number(SECTION_ID));
    }

    // Escribir posts.html si tenemos posts
    if (posts.length > 0 && REPO_TYPE === 'cineclub') {
      const html = posts.map((p, i) => renderSession(p, i)).join('\n');
      const postsHtmlPath = path.join(OUTPUT_DIR, 'posts.html');
      fs.writeFileSync(postsHtmlPath, html, 'utf8');
      console.log(`✅ Written ${postsHtmlPath} (${posts.length} posts)`);
    }

    // Escribir posts_bootstrap.json
    const bootstrapPath = path.join(OUTPUT_DIR, 'posts_bootstrap.json');
    if (bootstrap) {
      const json = JSON.stringify(bootstrap, null, 2);
      fs.writeFileSync(bootstrapPath, json, 'utf8');
      console.log(`✅ Written ${bootstrapPath} (bootstrap)`);
    } else if (posts.length > 0) {
      // Fallback: escribir array de posts
      const json = JSON.stringify(posts, null, 2);
      fs.writeFileSync(bootstrapPath, json, 'utf8');
      console.log(`✅ Written ${bootstrapPath} (${posts.length} posts)`);
    } else {
      console.warn(`⚠️ No data to write`);
    }

    console.log(`[Prerender] Done!`);
  } catch (err) {
    console.error(`❌ Fatal error:`, err);
    process.exit(1);
  }
}

main();

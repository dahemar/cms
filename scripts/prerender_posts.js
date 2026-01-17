const fs = require('fs');
const path = require('path');

const SITE_ID = process.env.PRERENDER_DEFAULT_SITE_ID ? Number(process.env.PRERENDER_DEFAULT_SITE_ID) : 3;
const SECTION_ID = process.env.PRERENDER_DEFAULT_SECTION_ID ? Number(process.env.PRERENDER_DEFAULT_SECTION_ID) : 21;
const LIMIT = 10;
const OUTPUT_DIR = path.join(process.cwd(), 'public');
const EXTRA_OUTPUT_DIRS = (process.env.PRERENDER_OUTPUT_DIRS || '')
  .split(',')
  .map((dir) => dir.trim())
  .filter(Boolean);
const CINECLUB_DIR = path.resolve(process.cwd(), '..', 'cineclub');
const MEDIA_BASE = process.env.PRERENDER_MEDIA_BASE_URL || '';

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
  // Buscar imágenes: permitir cualquier número, filtrar entradas vacías
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

async function prerender() {
  // Build list of target directories
  const outputDirs = [OUTPUT_DIR, ...EXTRA_OUTPUT_DIRS];
  if (fs.existsSync(CINECLUB_DIR)) outputDirs.push(CINECLUB_DIR);
  const uniqueDirs = Array.from(new Set(outputDirs));

  const writeResults = [];

  // Helper: derive site/section from env vars per-dir using basename
  function paramsForDir(dir) {
    const base = path.basename(dir).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    const siteEnv = process.env[`PRERENDER_SITE_${base}`] || process.env[`PRERENDER_SITE_${base}`.toLowerCase()];
    const sectionEnv = process.env[`PRERENDER_SECTION_${base}`] || process.env[`PRERENDER_SECTION_${base}`.toLowerCase()];
    const site = siteEnv ? Number(siteEnv) : SITE_ID;
    const section = (sectionEnv && sectionEnv.toUpperCase() === 'ALL') ? 'ALL' : (sectionEnv ? Number(sectionEnv) : SECTION_ID);
    return { site, section };
  }

  // Helper: fetch posts for a specific section
  async function fetchPostsForSection(site, section) {
    if (!section) {
      console.log(`[fetchPostsForSection] Skipping null section for site ${site}`);
      return [];
    }
    const url = `http://localhost:3000/posts?siteId=${site}&sectionId=${section}&page=1&limit=1000&includeTags=false&includeSection=false&includeBlocks=true`;
    console.log(`[fetchPostsForSection] Fetching: ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const count = Array.isArray(data.posts) ? data.posts.length : 0;
      console.log(`[fetchPostsForSection] Got ${count} posts for site ${site} section ${section}`);
      return Array.isArray(data.posts) ? data.posts : [];
    } catch (e) {
      console.warn(`⚠️ fetch posts (site ${site} section ${section}):`, e.message);
      return [];
    }
  }

  // Helper: fetch all sections for site and build complete bootstrap
  async function buildCompleteBootstrap(site) {
    try {
      const sectionsRes = await fetch(`http://localhost:3000/sections?siteId=${site}&limit=200`);
      if (!sectionsRes.ok) return null;
      const sections = await sectionsRes.json();
      console.log(`[buildCompleteBootstrap] Site ${site}: received ${Array.isArray(sections) ? sections.length : 0} sections`);
      const bySlug = {};
      (Array.isArray(sections) ? sections : []).forEach(s => { if (s?.slug) bySlug[s.slug] = s });

      const getSectionId = (slug) => (bySlug[slug] && bySlug[slug].id) ? bySlug[slug].id : null;
      const landingId = getSectionId('landing');
      const releasesId = getSectionId('releases');
      const liveId = getSectionId('live');
      const bioId = getSectionId('bio');
      const contactId = getSectionId('contact');
      console.log(`[buildCompleteBootstrap] Section IDs: landing=${landingId}, releases=${releasesId}, live=${liveId}, bio=${bioId}, contact=${contactId}`);

      const [landingPosts, releasesPosts, livePosts, bioPosts, contactPosts] = await Promise.all([
        fetchPostsForSection(site, landingId),
        fetchPostsForSection(site, releasesId),
        fetchPostsForSection(site, liveId),
        fetchPostsForSection(site, bioId),
        fetchPostsForSection(site, contactId)
      ]);

      const firstBlockOfType = (blocks, type) => (Array.isArray(blocks) ? blocks.find(b => b?.type === type) : null);
      const slideshowUrls = (block) => {
        const images = block?.metadata?.images
        if (!Array.isArray(images)) return []
        return images.map(i => i?.url).filter(Boolean)
      }

      const landingSlides = (landingPosts[0] && Array.isArray(landingPosts[0].blocks))
        ? (firstBlockOfType(landingPosts[0].blocks, 'slideshow') ? slideshowUrls(firstBlockOfType(landingPosts[0].blocks, 'slideshow')) : [])
        : [];

      const releases = (releasesPosts || []).map(p => {
        const img = firstBlockOfType(p.blocks, 'image')?.content || ''
        const href = firstBlockOfType(p.blocks, 'link')?.content || ''
        return { href, title: p.title, image: resolveMediaUrl(img), order: p.order ?? 0 }
      }).filter(r => r.href && r.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

      const liveProjects = (livePosts || []).map(p => {
        const img = firstBlockOfType(p.blocks, 'image')?.content || ''
        return { slug: p.slug, title: p.title, image: resolveMediaUrl(img), order: p.order ?? 0 }
      }).filter(r => r.slug).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

      const liveDetailMap = (livePosts || []).reduce((acc, p) => {
        const slideshows = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'slideshow') : []
        const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]).map(resolveMediaUrl) : null
        const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]).map(resolveMediaUrl) : null
        const videoBlock = firstBlockOfType(p.blocks, 'video')
        const video = videoBlock ? (function(){
          const src=String(videoBlock?.content||'').trim(); 
          if(!src) return null; 
          if(/youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/.test(src)) return {type:'iframe',src,title:p.title}; 
          if(/\.(mp4|mov|webm|ogg)(\?.*)?$/.test(src)||src.startsWith('/')) return {type:'video',src,title:p.title}; 
          return null
        })() : null
        acc[p.slug] = { title: p.title || p.slug, video, primaryImages, secondaryImages }
        return acc
      }, {})

      const bioSections = (bioPosts || []).map(p => ({ 
        order: p.order ?? 0, 
        title: p.title, 
        html: firstBlockOfType(p.blocks, 'text')?.content || '' 
      })).filter(s => s.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

      const contactLinks = (contactPosts || []).map(p => ({ 
        order: p.order ?? 0, 
        label: p.title, 
        href: firstBlockOfType(p.blocks, 'link')?.content || '', 
        is_external: /^(https?:\/\/|mailto:|tel:)/i.test(String(firstBlockOfType(p.blocks, 'link')?.content || '')) 
      })).filter(l => l.label && l.href).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

      const result = { landingSlides, releases, liveProjects, liveDetailMap, bioSections, contactLinks };
      console.log(`[buildCompleteBootstrap] Result: landingSlides=${landingSlides.length}, releases=${releases.length}, liveProjects=${liveProjects.length}, liveDetailMap=${Object.keys(liveDetailMap).length}, bioSections=${bioSections.length}, contactLinks=${contactLinks.length}`);
      return result;
    } catch (e) {
      console.warn(`⚠️ buildCompleteBootstrap (site ${site}):`, e.message);
      return null;
    }
  }

  for (const dir of uniqueDirs) {
    const { site, section } = paramsForDir(dir);
    let posts = [];
    let bootstrap = null;

    if (section === 'ALL') {
      // Full bootstrap mode: fetch all sections and generate complete bootstrap
      bootstrap = await buildCompleteBootstrap(site);
      if (!bootstrap) {
        console.warn(`⚠️ Could not build complete bootstrap for ${dir} (site ${site})`);
        bootstrap = { landingSlides: [], releases: [], liveProjects: [], liveDetailMap: {}, bioSections: [], contactLinks: [] };
      }
    } else {
      // Single section mode: fetch posts and generate simple bootstrap
      posts = await fetchPostsForSection(site, section);
      const firstBlockOfType = (blocks, type) => (Array.isArray(blocks) ? blocks.find(b => b?.type === type) : null);
      const slideshowUrls = (block) => {
        const images = block?.metadata?.images
        if (!Array.isArray(images)) return []
        return images.map(i => i?.url).filter(Boolean)
      }

      // Generate bootstrap JSON shape expected by frontends
      bootstrap = (function buildBootstrapFromPosts(postsList) {
        const landingSlides = (postsList[0] && Array.isArray(postsList[0].blocks))
          ? (firstBlockOfType(postsList[0].blocks, 'slideshow') ? slideshowUrls(firstBlockOfType(postsList[0].blocks, 'slideshow')) : [])
          : [];

        const releases = (postsList || []).map(p => {
          const img = firstBlockOfType(p.blocks, 'image')?.content || ''
          const href = firstBlockOfType(p.blocks, 'link')?.content || ''
          return { href, title: p.title, image: resolveMediaUrl(img), order: p.order ?? 0 }
        }).filter(r => r.href && r.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

        const liveProjects = (postsList || []).map(p => ({ slug: p.slug, title: p.title, image: resolveMediaUrl(firstBlockOfType(p.blocks, 'image')?.content || ''), order: p.order ?? 0 })).filter(r => r.slug).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

        const liveDetailMap = (postsList || []).reduce((acc, p) => {
          const slideshows = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'slideshow') : []
          const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]).map(resolveMediaUrl) : null
          const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]).map(resolveMediaUrl) : null
          const videoBlock = firstBlockOfType(p.blocks, 'video')
          const video = videoBlock ? (function(){const src=String(videoBlock?.content||'').trim(); if(!src) return null; if(/youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/.test(src)) return {type:'iframe',src,title:p.title}; if(/\.(mp4|mov|webm|ogg)(\?.*)?$/.test(src)||src.startsWith('/')) return {type:'video',src,title:p.title}; return null})() : null
          acc[p.slug] = { title: p.title || p.slug, video, primaryImages, secondaryImages }
          return acc
        }, {})

        const bioSections = (postsList || []).map(p => ({ order: p.order ?? 0, title: p.title, html: firstBlockOfType(p.blocks, 'text')?.content || '' })).filter(s => s.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

        const contactLinks = (postsList || []).map(p => ({ order: p.order ?? 0, label: p.title, href: firstBlockOfType(p.blocks, 'link')?.content || '', is_external: /^(https?:\/\/|mailto:|tel:)/i.test(String(firstBlockOfType(p.blocks, 'link')?.content || '')) })).filter(l => l.label && l.href).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

        return { landingSlides, releases, liveProjects, liveDetailMap, bioSections, contactLinks };
      })(posts);
    }

    // For app-style frontends (Vite/React), serve prerender artifacts from `public/`
    // so they are available at runtime as `/posts.html` and `/posts_bootstrap.json`.
    const publicDir = path.join(dir, 'public');
    const targetDir = fs.existsSync(publicDir) ? publicDir : dir;

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Write HTML fragment (only for single-section mode)
    let htmlPath = null;
    if (section !== 'ALL') {
      const html = `<!-- prerendered sessions -->\n<div data-prerendered="true">\n  ${posts.map((p, index) => renderSession(p, index)).join('\n')}\n</div>\n`;
      htmlPath = path.join(targetDir, 'posts.html');
      fs.writeFileSync(htmlPath, html, 'utf8');
    }

    const jsonPath = path.join(targetDir, 'posts_bootstrap.json');
    const tmpPath = jsonPath + '.tmp';
    const content = JSON.stringify(bootstrap);
    console.log(`[prerender] About to write bootstrap to ${jsonPath}, size: ${content.length} bytes (tmp: ${tmpPath})`);
    try {
      // write to temp file first
      fs.writeFileSync(tmpPath, content, 'utf8');

      // simple validation: ensure we have expected keys
      let valid = false;
      try {
        const parsed = JSON.parse(content);
        valid = Array.isArray(parsed.landingSlides) && Array.isArray(parsed.releases);
      } catch (e) {
        valid = false;
      }

      if (valid) {
        fs.renameSync(tmpPath, jsonPath);
        console.log(`[prerender] Wrote bootstrap json to ${jsonPath}`);
      } else {
        // If target exists, keep it and remove tmp; otherwise fallback to rename to avoid missing artifact
        if (fs.existsSync(jsonPath)) {
          fs.unlinkSync(tmpPath);
          console.warn(`[prerender] Validation failed for ${jsonPath}; keeping existing file`);
        } else {
          fs.renameSync(tmpPath, jsonPath);
          console.warn(`[prerender] Validation failed but no existing file; wrote bootstrap json to ${jsonPath}`);
        }
      }
    } catch (e) {
      console.error(`[prerender] Failed writing bootstrap json to ${jsonPath}:`, e.message || e);
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e2) {}
    }

    writeResults.push({ dir: targetDir, htmlPath, jsonPath, site, section, count: posts.length });
  }

  writeResults.forEach(r => console.log(`✅ Prerender para ${r.dir} (site ${r.site} section ${r.section}) -> posts: ${r.count} -> ${r.htmlPath}, ${r.jsonPath}`));
}

// Additionally generate a small JSON "bootstrap" that frontends (React) can
// consume directly to avoid calling the CMS on first paint. This mirrors the
// shape expected by `sympaathy-v2/src/App.jsx`'s buildDataFromCms result.
async function generateBootstrapJSON() {
  try {
    const sectionsRes = await fetch(`http://localhost:3000/sections?limit=200`);
    if (!sectionsRes.ok) throw new Error('sections fetch failed')
    const sections = await sectionsRes.json();
    const bySlug = {};
    (Array.isArray(sections) ? sections : []).forEach(s => { if (s?.slug) bySlug[s.slug] = s });

    const requireSectionId = (slug) => (bySlug[slug] && bySlug[slug].id) ? bySlug[slug].id : null;

    const fetchPostsFor = async (sectionId) => {
      if (!sectionId) return [];
      const url = `http://localhost:3000/posts?sectionId=${sectionId}&page=1&limit=1000&includeTags=false&includeSection=false&includeBlocks=true${SITE_ID ? `&siteId=${SITE_ID}` : ''}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d.posts) ? d.posts : [];
    }

    const firstBlockOfType = (blocks, type) => (Array.isArray(blocks) ? blocks.find(b => b?.type === type) : null);
    const slideshowUrls = (block) => {
      const images = block?.metadata?.images
      if (!Array.isArray(images)) return []
      return images.map(i => i?.url).filter(Boolean)
    }
    const inferVideo = (row) => {
      const videoSrc = String(row?.content || '').trim()
      if (!videoSrc) return null
      const lower = videoSrc.toLowerCase()
      const isLocalVideo = /\.(mp4|mov|webm|ogg)(\?.*)?$/.test(lower) || lower.startsWith('/images/') || lower.startsWith('/videos/') || lower.startsWith('/')
      const isIframe = /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/.test(lower)
      if (isIframe) return { type: 'iframe', src: videoSrc, title: '' }
      if (isLocalVideo) return { type: 'video', src: videoSrc, title: '' }
      return null
    }

    const landingId = requireSectionId('landing');
    const releasesId = requireSectionId('releases');
    const liveId = requireSectionId('live');
    const bioId = requireSectionId('bio');
    const contactId = requireSectionId('contact');

    const landingPosts = await fetchPostsFor(landingId);
    const releasesPosts = await fetchPostsFor(releasesId);
    const livePosts = await fetchPostsFor(liveId);
    const bioPosts = await fetchPostsFor(bioId);
    const contactPosts = await fetchPostsFor(contactId);

    const landingSlides = (landingPosts[0] && Array.isArray(landingPosts[0].blocks))
      ? (firstBlockOfType(landingPosts[0].blocks, 'slideshow') ? slideshowUrls(firstBlockOfType(landingPosts[0].blocks, 'slideshow')) : [])
      : [];

    const releases = (releasesPosts || []).map(p => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || ''
      const href = firstBlockOfType(p.blocks, 'link')?.content || ''
      return {
        href,
        title: p.title,
        image: resolveMediaUrl(img),
        order: p.order ?? 0
      }
    }).filter(r => r.href && r.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

    const liveProjects = (livePosts || []).map(p => {
      const img = firstBlockOfType(p.blocks, 'image')?.content || ''
      return { slug: p.slug, title: p.title, image: resolveMediaUrl(img), order: p.order ?? 0 }
    }).filter(r => r.slug).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

    const liveDetailMap = (livePosts || []).reduce((acc, p) => {
      const slideshows = Array.isArray(p.blocks) ? p.blocks.filter(b => b?.type === 'slideshow') : []
      const primaryImages = slideshows[0] ? slideshowUrls(slideshows[0]).map(resolveMediaUrl) : null
      const secondaryImages = slideshows[1] ? slideshowUrls(slideshows[1]).map(resolveMediaUrl) : null
      const videoBlock = firstBlockOfType(p.blocks, 'video')
      const video = videoBlock ? inferVideo(videoBlock) : null
      acc[p.slug] = { title: p.title || p.slug, video, primaryImages, secondaryImages }
      return acc
    }, {})

    const bioSections = (bioPosts || []).map(p => ({ order: p.order ?? 0, title: p.title, html: firstBlockOfType(p.blocks, 'text')?.content || '' })).filter(s => s.title).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

    const contactLinks = (contactPosts || []).map(p => ({ order: p.order ?? 0, label: p.title, href: firstBlockOfType(p.blocks, 'link')?.content || '', is_external: /^(https?:\/\/|mailto:|tel:)/i.test(String(firstBlockOfType(p.blocks, 'link')?.content || '')) })).filter(l => l.label && l.href).sort((a,b) => (a.order ?? 0) - (b.order ?? 0))

    const bootstrap = { landingSlides, releases, liveProjects, liveDetailMap, bioSections, contactLinks }

    const outputDirs = [OUTPUT_DIR, ...EXTRA_OUTPUT_DIRS];
    if (fs.existsSync(CINECLUB_DIR)) outputDirs.push(CINECLUB_DIR);
    const uniqueDirs = Array.from(new Set(outputDirs));

    const jsonOutputPaths = [];
    uniqueDirs.forEach((dir) => {
      const outPath = path.join(dir, 'posts_bootstrap.json');
      fs.writeFileSync(outPath, JSON.stringify(bootstrap), 'utf8');
      jsonOutputPaths.push(outPath);
    });
    console.log(`✅ Bootstrap JSON generado en: ${jsonOutputPaths.join(', ')}`);
  } catch (e) {
    console.warn('⚠️ No se pudo generar bootstrap JSON:', e.message || e)
  }
}

// Fire and forget (but await in top-level would be fine)
// NOTE: generateBootstrapJSON() is deprecated - prerender() now handles
// bootstrap generation with per-directory site/section params
// generateBootstrapJSON();

prerender().catch((err) => {
  console.error('Error generando prerender:', err);
  process.exit(1);
});

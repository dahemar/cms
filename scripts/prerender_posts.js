const fs = require('fs');
const path = require('path');

const SITE_ID = 3;
const SECTION_ID = 21;
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
  const images = getBlocksByType(post.blocks, 'image');
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
  const url = `http://localhost:3000/posts?siteId=${SITE_ID}&sectionId=${SECTION_ID}&page=1&limit=${LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const posts = Array.isArray(data.posts) ? data.posts : [];

  const html = `<!-- prerendered sessions -->
<div data-prerendered="true">
  ${posts.map((p, index) => renderSession(p, index)).join('\n')}
</div>
`;

  const outputDirs = [OUTPUT_DIR, ...EXTRA_OUTPUT_DIRS];
  if (fs.existsSync(CINECLUB_DIR)) {
    outputDirs.push(CINECLUB_DIR);
  }

  const uniqueDirs = Array.from(new Set(outputDirs));
  const outputPaths = [];

  uniqueDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const outputPath = path.join(dir, 'posts.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    outputPaths.push(outputPath);
  });

  console.log(`✅ HTML prerenderizado generado en: ${outputPaths.join(', ')}`);
}

prerender().catch((err) => {
  console.error('Error generando prerender:', err);
  process.exit(1);
});

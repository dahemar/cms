const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Minimal CSV parser supporting quoted fields, commas, and newlines.
function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (c === "\r") continue;

    if (c === "\n") {
      row.push(field);
      field = "";
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += c;
  }
  row.push(field);
  if (row.some((v) => String(v).trim() !== "")) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 1) return [];
  const headers = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toInt(v, fallback = 0) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function ensureAbsolutePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.join(process.cwd(), p);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tokenRichTextToHtml(fragment) {
  // Supports:
  // - link tokens: [[Text|https://...]] / mailto: / tel:
  // - [BR] token for explicit line breaks
  const tokens = String(fragment || "").split(/(\[\[.+?\|(?:https?:\/\/|mailto:|tel:)[^\]]+\]\]|\[BR\])/g);
  return tokens
    .map((token) => {
      if (token === "[BR]") return "<br/>";
      const linkMatch = token.match(/^\[\[(.+?)\|((?:https?:\/\/|mailto:|tel:)[^\]]+)\]\]$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const safeLabel = escapeHtml(label);
        const safeHref = escapeHtml(href);
        const isExternal = /^https?:\/\//i.test(href);
        const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
        // Keep className consistent with the old Sheets renderer (CSS expects .contact-link for hover styling).
        return `<a href="${safeHref}" class="contact-link"${target}>${safeLabel}</a>`;
      }
      // Preserve newlines inside text fragments as <br/> (after escaping).
      return escapeHtml(token).replace(/\r?\n/g, "<br/>");
    })
    .join("");
}

function normalizeTextToHtml(text) {
  // Goal: reproduce the old Sheets renderer behavior:
  // - treat each newline as its own <p> (gives vertical spacing via CSS p margins)
  // - keep [[text|url]] links and [BR]
  const raw = String(text || "");
  // Normalize escaped newlines coming from CSV exports
  const normalized = raw.replace(/\\n/g, "\n");

  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0) return "<p></p>";

  return lines
    .map((line) => {
      // Preserve blank lines as empty paragraphs (keeps vertical rhythm).
      if (String(line).trim() === "") return "<p></p>";
      return `<p>${tokenRichTextToHtml(line)}</p>`;
    })
    .join("");
}

async function getTargetSite() {
  const siteSlug = process.argv[3] || "default";
  let site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) site = await prisma.site.findFirst({ orderBy: { id: "asc" } });
  if (!site) throw new Error("No Site found");
  return site;
}

async function getSectionBySlug(siteId, slug) {
  const section = await prisma.section.findUnique({ where: { siteId_slug: { siteId, slug } } });
  if (!section) throw new Error(`Section not found: ${slug}`);
  return section;
}

async function upsertPostWithBlocks({ siteId, sectionId, slug, title, order, published, blocks }) {
  const existing = await prisma.post.findUnique({ where: { siteId_slug: { siteId, slug } } });

  if (existing) {
    // Replace blocks completely for determinism
    await prisma.postBlock.deleteMany({ where: { postId: existing.id } });
    const updated = await prisma.post.update({
      where: { id: existing.id },
      data: {
        title,
        order,
        published,
        sectionId,
        content: "", // legacy empty when using blocks
        blocks: {
          create: blocks.map((b, idx) => ({
            type: b.type,
            content: b.content ?? "",
            order: idx,
            metadata: b.metadata ?? null,
          })),
        },
      },
    });
    return { action: "updated", post: updated };
  }

  const created = await prisma.post.create({
    data: {
      siteId,
      sectionId,
      title,
      slug,
      published,
      order,
      content: "",
      blocks: {
        create: blocks.map((b, idx) => ({
          type: b.type,
          content: b.content ?? "",
          order: idx,
          metadata: b.metadata ?? null,
        })),
      },
    },
  });
  return { action: "created", post: created };
}

async function main() {
  const csvDir = ensureAbsolutePath(process.argv[2] || "../frontend prueba/content-sheets");
  const site = await getTargetSite();
  console.log(`📥 Importing CSV content into CMS (site=${site.slug}, id=${site.id}) from: ${csvDir}`);

  const landingSection = await getSectionBySlug(site.id, "landing");
  const releasesSection = await getSectionBySlug(site.id, "releases");
  const liveSection = await getSectionBySlug(site.id, "live");
  const bioSection = await getSectionBySlug(site.id, "bio");
  const contactSection = await getSectionBySlug(site.id, "contact");

  // LandingSlides -> one post (slug: landing)
  {
    const raw = fs.readFileSync(path.join(csvDir, "LandingSlides.csv"), "utf8");
    const rows = rowsToObjects(parseCsv(raw));
    const images = rows
      .map((r) => ({ order: toInt(r.order, 0), url: r.src, caption: r.caption || "" }))
      .filter((r) => r.url)
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ url: r.url, caption: r.caption }));

    const res = await upsertPostWithBlocks({
      siteId: site.id,
      sectionId: landingSection.id,
      slug: "landing",
      title: "Landing",
      order: 0,
      published: true,
      blocks: [
        {
          type: "slideshow",
          content: "",
          metadata: {
            required: true,
            width: "full",
            images,
            slideshowConfig: {
              showArrows: true,
              arrowStyle: "arrows",
              autoPlay: true,
              slideDuration: 6,
              imageWidth: 1200,
              imageHeight: 800,
            },
          },
        },
      ],
    });
    console.log(`- Landing: ${res.action}`);
  }

  // Releases -> one post per row (image + link)
  {
    const raw = fs.readFileSync(path.join(csvDir, "Releases.csv"), "utf8");
    const rows = rowsToObjects(parseCsv(raw));
    for (const r of rows) {
      const title = String(r.title || "").trim();
      const href = String(r.href || "").trim();
      const image = String(r.image || "").trim();
      if (!title || !href) continue;
      const order = toInt(r.order, 0);
      const baseSlug = slugify(title) || `release-${order}`;

      await upsertPostWithBlocks({
        siteId: site.id,
        sectionId: releasesSection.id,
        slug: baseSlug,
        title,
        order,
        published: true,
        blocks: [
          { type: "image", content: image, metadata: { required: true, width: "full", caption: "" } },
          { type: "link", content: href, metadata: { required: true, width: "full" } },
        ],
      });
    }
    console.log("- Releases: imported");
  }

  // LiveGrid + LiveDetails + LiveSlides -> ONE post per slug with:
  // - image (thumbnail) + slideshows + video
  {
    const rawGrid = fs.readFileSync(path.join(csvDir, "LiveGrid.csv"), "utf8");
    const gridRows = rowsToObjects(parseCsv(rawGrid));
    const gridBySlug = new Map();
    for (const r of gridRows) {
      const slug = String(r.slug || "").trim();
      if (!slug) continue;
      gridBySlug.set(slug, {
        slug,
        title: String(r.title || slug).trim(),
        image: String(r.image || "").trim(),
        order: toInt(r.order, 0),
      });
    }

    const slidesRaw = fs.readFileSync(path.join(csvDir, "LiveSlides.csv"), "utf8");
    const slidesRows = rowsToObjects(parseCsv(slidesRaw));
    const slidesById = new Map();
    for (const r of slidesRows) {
      const sliderId = String(r.slider_id || "").trim();
      const src = String(r.src || "").trim();
      if (!sliderId || !src) continue;
      const order = toInt(r.order, 0);
      const arr = slidesById.get(sliderId) || [];
      arr.push({ order, url: src, caption: "" });
      slidesById.set(sliderId, arr);
    }

    const detailsRaw = fs.readFileSync(path.join(csvDir, "LiveDetails.csv"), "utf8");
    const detailsRows = rowsToObjects(parseCsv(detailsRaw));
    for (const r of detailsRows) {
      const slug = String(r.slug || "").trim();
      if (!slug) continue;
      const grid = gridBySlug.get(slug);
      const title = String((grid && grid.title) || r.title || slug).trim();
      const thumbImage = String((grid && grid.image) || "").trim();
      const order = grid ? grid.order : 0;
      const videoSrc = String(r.video_src || "").trim();
      const primaryId = String(r.primary_slider_id || "").trim();
      const secondaryId = String(r.secondary_slider_id || "").trim();

      const primaryImages = (slidesById.get(primaryId) || []).sort((a, b) => a.order - b.order).map((x) => ({ url: x.url, caption: x.caption }));
      const secondaryImages = (slidesById.get(secondaryId) || []).sort((a, b) => a.order - b.order).map((x) => ({ url: x.url, caption: x.caption }));

      const blocks = [];

      if (thumbImage) {
        blocks.push({
          type: "image",
          content: thumbImage,
          metadata: { required: true, width: "full", caption: "" },
        });
      }

      blocks.push({
        type: "slideshow",
        content: "",
        metadata: {
          required: true,
          width: "full",
          images: primaryImages,
          slideshowConfig: {
            showArrows: true,
            arrowStyle: "arrows",
            autoPlay: false,
            slideDuration: 5,
            imageWidth: 1200,
            imageHeight: 800,
          },
        },
      });

      if (secondaryImages.length) {
        blocks.push({
          type: "slideshow",
          content: "",
          metadata: {
            required: false,
            width: "full",
            images: secondaryImages,
            slideshowConfig: {
              showArrows: true,
              arrowStyle: "arrows",
              autoPlay: false,
              slideDuration: 5,
              imageWidth: 1200,
              imageHeight: 800,
            },
          },
        });
      }

      if (videoSrc) {
        blocks.push({ type: "video", content: videoSrc, metadata: { required: false, width: "full" } });
      }

      await upsertPostWithBlocks({
        siteId: site.id,
        sectionId: liveSection.id,
        slug,
        title,
        order,
        published: true,
        blocks,
      });
    }
    console.log("- Live (unified): imported");
  }

  // Bio -> one post per row (title + rich text)
  {
    const raw = fs.readFileSync(path.join(csvDir, "Bio.csv"), "utf8");
    const rows = rowsToObjects(parseCsv(raw));
    for (const r of rows) {
      const title = String(r.title || "").trim();
      if (!title) continue;
      const order = toInt(r.order, 0);
      const slug = slugify(title) || `bio-${order}`;
      const html = normalizeTextToHtml(r.text || "");
      await upsertPostWithBlocks({
        siteId: site.id,
        sectionId: bioSection.id,
        slug,
        title,
        order,
        published: true,
        blocks: [{ type: "text", content: html, metadata: { required: true, width: "full" } }],
      });
    }
    console.log("- Bio: imported");
  }

  // Contact -> one post per row (label as title + link block)
  {
    const raw = fs.readFileSync(path.join(csvDir, "Contact.csv"), "utf8");
    const rows = rowsToObjects(parseCsv(raw));
    for (const r of rows) {
      const id = String(r.id || "").trim();
      const label = String(r.label || "").trim();
      const href = String(r.href || "").trim();
      if (!label || !href) continue;
      const order = toInt(r.order, 0);
      const slug = slugify(id || label) || `contact-${order}`;
      await upsertPostWithBlocks({
        siteId: site.id,
        sectionId: contactSection.id,
        slug,
        title: label,
        order,
        published: true,
        blocks: [{ type: "link", content: href, metadata: { required: true, width: "full" } }],
      });
    }
    console.log("- Contact: imported");
  }

  console.log("✅ Import finished.");
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("❌ Import failed:", e);
      prisma.$disconnect().finally(() => process.exit(1));
    });
}



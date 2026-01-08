const fs = require("fs");
const path = require("path");

const PROFILES_DIR = path.join(__dirname);

function safeJsonParse(raw, filePath) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error(`Invalid JSON in profile file: ${filePath}`);
    err.cause = e;
    throw err;
  }
}

function validateProfileShape(profile, filePath) {
  if (!profile || typeof profile !== "object") {
    throw new Error(`Invalid profile (not an object): ${filePath}`);
  }
  if (!profile.name || typeof profile.name !== "string") {
    throw new Error(`Profile missing "name" (string): ${filePath}`);
  }
  if (!profile.version || typeof profile.version !== "string") {
    // Version is important for future evolution; keep it required.
    throw new Error(`Profile missing "version" (string): ${filePath}`);
  }
  if (!profile.sectionSchemas || typeof profile.sectionSchemas !== "object") {
    throw new Error(`Profile missing "sectionSchemas" (object): ${filePath}`);
  }
  return true;
}

// Simple in-memory cache. In dev, restarting server reloads. If needed later,
// we can add file watchers or a reload endpoint.
let cachedProfiles = null; // Map<name, profile>

function loadProfilesFromDisk({ forceReload = false } = {}) {
  if (cachedProfiles && !forceReload) return cachedProfiles;

  try {
    const files = fs
      .readdirSync(PROFILES_DIR)
      .filter((f) => f.endsWith(".json"));

    const map = new Map();
    for (const file of files) {
      try {
        const filePath = path.join(PROFILES_DIR, file);
        const raw = fs.readFileSync(filePath, "utf8");
        const profile = safeJsonParse(raw, filePath);
        validateProfileShape(profile, filePath);

        // Normalize optional fields
        profile.description =
          profile.description && typeof profile.description === "string"
            ? profile.description
            : null;
        profile.deprecated = Boolean(profile.deprecated);

        map.set(profile.name, profile);
      } catch (fileError) {
        console.warn(`[Profiles] ⚠️ Failed to load profile file ${file}:`, fileError.message);
        // Continuar con otros archivos
      }
    }

    cachedProfiles = map;
    return cachedProfiles;
  } catch (error) {
    console.error("[Profiles] ❌ Error loading profiles from disk:", error.message);
    // Retornar cache vacío en lugar de crashear
    cachedProfiles = new Map();
    return cachedProfiles;
  }
}

function getProfileByName(name, { forceReload = false } = {}) {
  const profiles = loadProfilesFromDisk({ forceReload });
  return profiles.get(name) || null;
}

function listProfiles({ forceReload = false } = {}) {
  const profiles = loadProfilesFromDisk({ forceReload });
  return Array.from(profiles.values()).sort((a, b) => {
    // non-deprecated first, then name, then version desc
    if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    // naive semver-ish compare: fallback to string
    return String(b.version).localeCompare(String(a.version));
  });
}

async function syncProfilesToDb(prisma) {
  const profiles = listProfiles({ forceReload: true });
  for (const p of profiles) {
    // DB is a mirror for assignment/visibility, but source of truth is disk.
    await prisma.frontendProfile.upsert({
      where: { name: p.name },
      create: {
        name: p.name,
        description: p.description,
        version: p.version,
        sectionSchemas: p.sectionSchemas,
        deprecated: p.deprecated,
      },
      update: {
        description: p.description,
        version: p.version,
        sectionSchemas: p.sectionSchemas,
        deprecated: p.deprecated,
      },
    });
  }
  return profiles.length;
}

module.exports = {
  loadProfilesFromDisk,
  getProfileByName,
  listProfiles,
  syncProfilesToDb,
};



/**
 * Supabase Storage + Redis Publishing System
 * 
 * Architecture:
 * - Redis is the source of truth for current published version
 * - Supabase Storage provides CDN-backed persistence
 * - No GitHub Actions or Vercel rebuilds required
 * 
 * Publish flow:
 * 1. Acquire Redis lock (publish:lock:<siteId>)
 * 2. Generate prerender artifacts
 * 3. Upload to Supabase Storage with versioned names
 * 4. Update Redis state (publish:current:<siteId>)
 * 5. Write manifest.json derived from Redis state
 * 6. Release lock
 */

const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Initialize Supabase client (server-side with service role)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'prerender';

let supabaseClient = null;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseClient;
}

// Redis client (imported from main app)
let redisClient = null;

function setRedisClient(client) {
  redisClient = client;
}

/**
 * Acquire publish lock for a site
 * @param {number} siteId 
 * @param {number} ttlSeconds - Lock TTL (default 60s)
 * @returns {Promise<boolean>} true if lock acquired
 */
async function acquirePublishLock(siteId, ttlSeconds = 60) {
  if (!redisClient) {
    console.warn('[Storage] Redis not available, skipping lock');
    return true; // Fallback: allow publish without lock
  }

  const lockKey = `publish:lock:${siteId}`;
  const lockValue = `${Date.now()}`;
  
  try {
    // SET NX (only if not exists) with TTL
    const result = await redisClient.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');
    if (result === 'OK') {
      console.log(`[Storage] Lock acquired for site ${siteId}`);
      return true;
    }
    console.warn(`[Storage] Lock already held for site ${siteId}`);
    return false;
  } catch (err) {
    console.error('[Storage] Error acquiring lock:', err.message);
    return false;
  }
}

/**
 * Release publish lock
 * @param {number} siteId 
 */
async function releasePublishLock(siteId) {
  if (!redisClient) return;

  const lockKey = `publish:lock:${siteId}`;
  try {
    await redisClient.del(lockKey);
    console.log(`[Storage] Lock released for site ${siteId}`);
  } catch (err) {
    console.error('[Storage] Error releasing lock:', err.message);
  }
}

/**
 * Update Redis state with current published version (source of truth)
 * @param {number} siteId 
 * @param {string} version - Timestamp string
 * @param {object} files - Map of artifact names
 */
async function updateRedisState(siteId, version, files) {
  if (!redisClient) {
    console.warn('[Storage] Redis not available, cannot update state');
    return;
  }

  const stateKey = `publish:current:${siteId}`;
  const state = {
    version,
    files,
    updatedAt: Date.now()
  };

  try {
    await redisClient.set(stateKey, JSON.stringify(state));
    console.log(`[Storage] Redis state updated for site ${siteId}:`, { version, filesCount: Object.keys(files).length });
  } catch (err) {
    console.error('[Storage] Error updating Redis state:', err.message);
    throw err;
  }
}

/**
 * Get current published state from Redis
 * @param {number} siteId 
 * @returns {Promise<object|null>}
 */
async function getRedisState(siteId) {
  if (!redisClient) return null;

  const stateKey = `publish:current:${siteId}`;
  try {
    const data = await redisClient.get(stateKey);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('[Storage] Error reading Redis state:', err.message);
    return null;
  }
}

/**
 * Upload file to Supabase Storage
 * @param {string} path - Storage path (e.g., "3/posts_bootstrap.1234.json")
 * @param {Buffer|string} content - File content
 * @param {object} options - Upload options
 */
async function uploadToStorage(path, content, options = {}) {
  const supabase = getSupabaseClient();
  
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  
  const uploadOptions = {
    contentType: options.contentType || 'application/json',
    cacheControl: options.cacheControl || 'public, max-age=31536000, immutable',
    upsert: true // Overwrite if exists
  };

  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(path, buffer, uploadOptions);

    if (error) {
      throw new Error(`Supabase upload error: ${error.message}`);
    }

    console.log(`[Storage] Uploaded: ${path} (${buffer.length} bytes)`);
    return data;
  } catch (err) {
    console.error(`[Storage] Upload failed for ${path}:`, err.message);
    throw err;
  }
}

/**
 * Generate manifest.json from Redis state
 * @param {number} siteId 
 */
async function writeManifest(siteId) {
  const state = await getRedisState(siteId);
  if (!state) {
    throw new Error(`No Redis state found for site ${siteId}`);
  }

  // Convert files map to an array format expected by frontend workflows
  const filesArray = Object.keys(state.files || {}).map(k => ({ name: state.files[k], key: k }));

  const manifest = {
    version: state.version,
    // Backwards-compatible: keep a map under `filesMap` and provide `files` as an array
    filesMap: state.files,
    files: filesArray,
    updatedAt: state.updatedAt
  };

  const manifestPath = `${siteId}/manifest.json`;
  await uploadToStorage(manifestPath, JSON.stringify(manifest, null, 2), {
    contentType: 'application/json',
    cacheControl: 'public, max-age=30' // Short TTL for manifest
  });

  console.log(`[Storage] Manifest written for site ${siteId}`);
}

/**
 * Main publish function: orchestrates the entire flow
 * @param {number} siteId 
 * @param {object} artifacts - Map of { filename: content }
 * @param {object} metadata - Additional metadata
 */
async function publishArtifacts(siteId, artifacts, metadata = {}) {
  const startTime = Date.now();
  const version = `${Date.now()}`;

  console.log(`[Storage] Publishing artifacts for site ${siteId}, version ${version}`);

  // Step 1: Acquire lock
  const lockAcquired = await acquirePublishLock(siteId, 60);
  if (!lockAcquired) {
    throw new Error(`Publish already in progress for site ${siteId}`);
  }

  try {
    // Step 2: Upload artifacts to Supabase Storage with versioned names
    const uploadedFiles = {};
    
    for (const [filename, content] of Object.entries(artifacts)) {
      const ext = filename.split('.').pop();
      const baseName = filename.replace(/\.[^.]+$/, '');
      const versionedName = `${baseName}.${version}.${ext}`;
      const storagePath = `${siteId}/${versionedName}`;
      
      await uploadToStorage(storagePath, content, {
        contentType: ext === 'json' ? 'application/json' : 'text/html',
        cacheControl: 'public, max-age=31536000, immutable'
      });
      
      uploadedFiles[filename] = versionedName;
    }

    // Step 3: Update Redis state (source of truth)
    await updateRedisState(siteId, version, uploadedFiles);

    // Step 4: Write manifest.json derived from Redis
    await writeManifest(siteId);

    // Step 5: Store current version in Redis for fast lookups
    // Use explicit argument form supported by this redis client
    await redisClient.set(`publish:version:${siteId}`, version, 'EX', 86400 * 7);

    // Step 6: Release lock
    await releasePublishLock(siteId);

    const duration = Date.now() - startTime;
    console.log(`[Storage] ✅ Publish complete for site ${siteId} in ${duration}ms`);

    return {
      success: true,
      version,
      files: uploadedFiles,
      duration
    };
  } catch (err) {
    // Always release lock on error
    await releasePublishLock(siteId);
    console.error(`[Storage] ❌ Publish failed for site ${siteId}:`, err.message);
    throw err;
  }
}

/**
 * Get public URL for a file in Supabase Storage
 * @param {string} path - Storage path
 * @returns {string}
 */
function getPublicUrl(path) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;
}

/**
 * Get base URL for a site's artifacts
 * @param {number} siteId 
 * @returns {string}
 */
function getSiteBaseUrl(siteId) {
  return getPublicUrl(`${siteId}`);
}

module.exports = {
  setRedisClient,
  publishArtifacts,
  getRedisState,
  getPublicUrl,
  getSiteBaseUrl,
  acquirePublishLock,
  releasePublishLock
};

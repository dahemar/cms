# Supabase Storage Migration Guide

## Overview

This document describes the migration from **GitHub Actions + Vercel Deploy Hooks** to **Supabase Storage + Redis** for content publishing in the headless CMS.

### Why Migrate?

- **Latency**: Reduce publish-to-visible time from 30s–3min to <10s
- **Simplicity**: No frontend rebuilds for content changes
- **Cost**: Eliminate GitHub Actions minutes and Vercel build time
- **Decoupling**: Frontend code changes independent of content updates

### Architecture Changes

#### Before (GitHub Actions / Vercel Hooks)
```
CMS Post Publish → GitHub Actions Dispatch → Frontend Rebuild → Vercel Deploy → Content Visible (30s–3min)
```

#### After (Supabase Storage + Redis)
```
CMS Post Publish → Generate Artifacts → Upload to Supabase Storage → Content Visible (<10s)
                   ↓
                 Redis Lock + State Management
```

---

## Components

### 1. Backend (Node.js + Express)

#### New Modules

- **`backend/storage/supabase-storage.js`**: Handles uploads, Redis locks, manifest generation
- **`backend/storage/artifact-generator.js`**: Generates `posts_bootstrap.json` and `posts.html` in-memory

#### Modified Files

- **`backend/index.js`**:
  - Added `publishToStorage()` function (replaces `triggerFrontendRebuild`)
  - Deprecated `triggerFrontendRebuild()` (forwards to `publishToStorage`)
  - Deprecated local `triggerPrerender()` (no-op)
  - Calls `publishToStorage()` on POST/PUT/DELETE of posts

### 2. Redis (Source of Truth)

Redis is the authoritative source for currently published content versions.

#### Keys

- **`publish:lock:<siteId>`**: Exclusive lock during publish (TTL: 60s)
- **`publish:current:<siteId>`**: Current published version state

#### State Schema

```json
{
  "version": "1737320000000",
  "files": {
    "posts_bootstrap.json": "posts_bootstrap.1737320000000.json",
    "posts.html": "posts.1737320000000.html"
  },
  "updatedAt": 1737320000000
}
```

### 3. Supabase Storage

Stores versioned artifacts publicly via CDN.

#### Bucket Structure

```
prerender/
├── 2/
│   ├── manifest.json
│   ├── posts_bootstrap.1737320000000.json
│   └── posts_bootstrap.1737320100000.json
├── 3/
│   ├── manifest.json
│   ├── posts_bootstrap.1737320000000.json
│   ├── posts.1737320000000.html
│   └── posts.1737320100000.html
└── _test/
```

#### Files

- **`<siteId>/manifest.json`**: Current version pointer (cache: 30s)
- **`<siteId>/<filename>.<version>.<ext>`**: Versioned artifacts (cache: immutable)

---

## Publish Flow (Backend)

### Step-by-Step

1. **Acquire Lock**: `SET publish:lock:<siteId> <timestamp> EX 60 NX`
   - If lock exists → abort (publish already in progress)
   
2. **Generate Artifacts**: Call `artifactGenerator.generateArtifacts(siteId)`
   - Fetches posts from DB (Prisma)
   - Generates `posts_bootstrap.json` (JSON)
   - Generates `posts.html` (for cineclub, site 3)
   
3. **Upload to Supabase Storage**:
   - Upload each artifact with versioned name: `<filename>.<timestamp>.<ext>`
   - Set `Cache-Control: public, max-age=31536000, immutable`
   
4. **Update Redis State**:
   - `SET publish:current:<siteId> <JSON>`
   - Contains `version`, `files`, `updatedAt`
   
5. **Write Manifest**: Upload `<siteId>/manifest.json` derived from Redis state
   - Set `Cache-Control: public, max-age=30`
   
6. **Release Lock**: `DEL publish:lock:<siteId>`

### Error Handling

- Lock always released in `finally` block
- Failed publish logged but doesn't crash server
- Retries not implemented (manual retry via admin)

---

## Frontend Changes

### Old Behavior

Frontend fetched `/posts_bootstrap.json` from its own build output (static file generated during Vercel build).

### New Behavior

Frontend fetches directly from Supabase Storage CDN.

#### Implementation

##### 1. Read Manifest (optional, for versioning)

```javascript
const STORAGE_BASE = 'https://<project>.supabase.co/storage/v1/object/public/prerender';
const SITE_ID = 3;

// Fetch manifest to get current version
const manifest = await fetch(`${STORAGE_BASE}/${SITE_ID}/manifest.json`)
  .then(r => r.json());

console.log('Current version:', manifest.version);
```

##### 2. Fetch Bootstrap Directly

```javascript
// Option A: Fetch versioned file from manifest
const bootstrap = await fetch(`${STORAGE_BASE}/${SITE_ID}/${manifest.files['posts_bootstrap.json']}`)
  .then(r => r.json());

// Option B: Fetch latest (if manifest not needed)
const bootstrap = await fetch(`${STORAGE_BASE}/${SITE_ID}/posts_bootstrap.json?v=${Date.now()}`)
  .then(r => r.json());
```

##### 3. Cache Strategy

```javascript
// Use ETag/If-None-Match for conditional requests
const headers = {};
const cachedEtag = localStorage.getItem('bootstrap_etag');
if (cachedEtag) {
  headers['If-None-Match'] = cachedEtag;
}

const response = await fetch(`${STORAGE_BASE}/${SITE_ID}/posts_bootstrap.json`, { headers });

if (response.status === 304) {
  // Use cached data
  const cached = JSON.parse(localStorage.getItem('bootstrap_data'));
  return cached;
} else {
  const data = await response.json();
  localStorage.setItem('bootstrap_data', JSON.stringify(data));
  localStorage.setItem('bootstrap_etag', response.headers.get('etag'));
  return data;
}
```

---

## Migration Steps

### Prerequisites

1. **Supabase Project**: Create project at https://supabase.com
2. **Get Credentials**:
   - `SUPABASE_URL`: https://your-project.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY`: From Supabase Dashboard → Settings → API
3. **Redis**: Already configured (Upstash)

### Backend Setup

#### 1. Install Dependencies

```bash
cd /Users/david/Documents/GitHub/cms/backend
npm install @supabase/supabase-js
```

#### 2. Configure Environment Variables

Add to `.env` (local) and Vercel environment (production):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_BUCKET=prerender
REDIS_URL=rediss://...  # Already configured
```

#### 3. Create Supabase Bucket

```bash
node scripts/setup-supabase-storage.js
```

Expected output:
```
✅ Setup Complete!
Base URL for artifacts: https://your-project.supabase.co/storage/v1/object/public/prerender/
```

#### 4. Deploy Backend

```bash
git add backend/storage backend/index.js scripts/setup-supabase-storage.js
git commit -m "feat: migrate to Supabase Storage publishing"
git push
```

Vercel will auto-deploy. Verify:
```bash
curl https://cms-woad-delta.vercel.app/health
```

#### 5. Test Publishing

- Go to admin: https://cms-woad-delta.vercel.app/admin.html
- Create or update a post
- Check logs in Vercel Dashboard for `[Publish] ✅ Published successfully`
- Verify files in Supabase Dashboard → Storage → prerender bucket

### Frontend Setup

#### Cineclub

Update `cms-loader.js` or main entry file:

```javascript
// OLD
const BOOTSTRAP_URL = '/posts_bootstrap.json';

// NEW
const STORAGE_BASE = 'https://your-project.supabase.co/storage/v1/object/public/prerender';
const SITE_ID = 3;
const BOOTSTRAP_URL = `${STORAGE_BASE}/${SITE_ID}/posts_bootstrap.json`;
```

#### Sympaathy-v2

Update `src/hooks/usePosts.js` or equivalent:

```javascript
// OLD
const response = await fetch('/posts_bootstrap.json');

// NEW
const STORAGE_BASE = 'https://your-project.supabase.co/storage/v1/object/public/prerender';
const SITE_ID = 2;
const response = await fetch(`${STORAGE_BASE}/${SITE_ID}/posts_bootstrap.json`);
```

#### Deploy Frontends

```bash
# Cineclub
cd /Users/david/Documents/GitHub/cineclub
git add cms-loader.js  # Or relevant file
git commit -m "feat: fetch posts from Supabase Storage CDN"
git push

# Sympaathy-v2
cd /Users/david/Documents/GitHub/sympaathy-v2
git add src/hooks/usePosts.js  # Or relevant file
git commit -m "feat: fetch posts from Supabase Storage CDN"
git push
```

---

## Verification

### 1. Backend Publish

Create a post and check:

```bash
# Backend logs (Vercel)
[Publish] Starting publish for site: 3 reason: post-created
[Artifacts] Generating artifacts for site 3
[Storage] Lock acquired for site 3
[Storage] Uploaded: 3/posts_bootstrap.1737320000000.json (12345 bytes)
[Storage] Redis state updated for site 3: { version: '1737320000000', filesCount: 1 }
[Storage] Manifest written for site 3
[Storage] Lock released for site 3
[Publish] ✅ Published successfully: { siteId: 3, version: '1737320000000', files: [...], duration: 2345 }
```

### 2. Supabase Storage

Check Supabase Dashboard → Storage → prerender:

```
3/
├── manifest.json
├── posts_bootstrap.1737320000000.json
```

### 3. Frontend Fetch

```bash
curl 'https://your-project.supabase.co/storage/v1/object/public/prerender/3/manifest.json'
# Should return: {"version":"1737320000000","files":{...},"updatedAt":...}

curl 'https://your-project.supabase.co/storage/v1/object/public/prerender/3/posts_bootstrap.1737320000000.json'
# Should return: full bootstrap JSON
```

### 4. End-to-End

1. Publish post from admin
2. Wait <10s
3. Refresh frontend
4. Verify new content appears

---

## Rollback Plan

If migration fails, revert by:

1. **Backend**: Restore `triggerFrontendRebuild()` to original implementation
2. **Frontend**: Restore fetch from `/posts_bootstrap.json`
3. **Re-enable**: Vercel Deploy Hooks or GitHub Actions

Code is preserved commented in `backend/index.js` for quick restoration.

---

## Performance Comparison

| Metric                  | GitHub Actions/Vercel | Supabase Storage |
|-------------------------|----------------------|------------------|
| Publish → Visible       | 30s – 3min           | <10s             |
| Backend processing      | ~500ms               | ~2s              |
| Upload time             | N/A                  | ~500ms           |
| CDN propagation         | ~30s (Vercel)        | ~2s (Supabase)   |
| Total latency           | High                 | Low              |
| Cost per publish        | CI minutes + build   | Storage egress   |
| Frontend rebuild        | Required             | Not required     |

---

## Cost Analysis

### Supabase Free Tier

- **Storage**: 1 GB (sufficient for JSON/HTML artifacts)
- **Bandwidth**: 2 GB/month egress
- **Requests**: Unlimited

### Estimated Usage

- **Per publish**: ~10 KB JSON + ~5 KB HTML = 15 KB
- **Per frontend fetch**: ~10 KB
- **100 publishes/month**: 1.5 MB storage, negligible egress
- **10,000 frontend views/month**: 100 MB egress

**Conclusion**: Free tier sufficient for moderate traffic; monitor bandwidth.

---

## Troubleshooting

### Publish Fails: "Lock already held"

**Cause**: Previous publish didn't release lock (crash or timeout).

**Solution**: Lock expires automatically (TTL 60s). Wait 1 minute or manually delete:

```bash
# Connect to Redis (Upstash)
redis-cli -u $REDIS_URL
> DEL publish:lock:3
```

### Artifacts Not Visible in Frontend

**Cause**: CORS or public bucket misconfiguration.

**Solution**: Verify bucket is public:

```bash
# In Supabase Dashboard
Storage → prerender → Settings → Public bucket: ON
```

### High Egress Costs

**Cause**: Too many frontend requests without caching.

**Solution**: Implement frontend caching (ETag, localStorage) and use CDN Cache-Control headers.

---

## Future Enhancements

### Versioned History

Store last N versions for rollback:

```javascript
// In supabase-storage.js, keep old versions
const MAX_VERSIONS = 5;
// After upload, list and delete old versions beyond MAX_VERSIONS
```

### Webhooks for Invalidation

Trigger frontend cache invalidation via webhook:

```javascript
// After publish success
await fetch(frontendWebhookUrl, {
  method: 'POST',
  body: JSON.stringify({ siteId, version })
});
```

### Multi-Region CDN

Use Cloudflare or similar in front of Supabase Storage for global performance.

---

## Summary

- ✅ Supabase Storage + Redis replaces GitHub Actions/Vercel Hooks
- ✅ Publish latency reduced from minutes to seconds
- ✅ Frontend no longer rebuilds for content changes
- ✅ Redis is source of truth for published state
- ✅ Supabase Storage provides CDN-backed persistence
- ✅ Migration is non-breaking (can coexist during transition)

**Status**: Implementation complete, ready for testing and deployment.

**Last Updated**: 2026-01-19

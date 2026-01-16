# Redis Cache Configuration for Production

This CMS now supports **Redis** as a shared cache layer for production deployments.

## Local Development

- Uses **in-memory cache** (TTL = 10s by default).
- No Redis needed for local development.
- Override TTL via `CACHE_TTL` environment variable (milliseconds).

## Production Setup

### 1. **Install `ioredis` (if deploying to production)**

```bash
cd my-headless-cms/backend
npm install ioredis
```

### 2. **Configure Environment Variables**

Add to your production `.env` or hosting platform (Vercel, Railway, etc.):

```env
NODE_ENV=production
REDIS_URL=redis://:password@hostname:6379
CACHE_TTL=300000  # Optional: 5 minutes (default)
```

- **REDIS_URL**: Connection string for your Redis instance.
  - For **Vercel**: Use [Upstash Redis](https://upstash.com/) or [Railway Redis](https://railway.app/).
  - Format: `redis://:password@host:port` or `rediss://` (TLS).
- **CACHE_TTL**: Cache time-to-live in milliseconds. Default: `300000` (5 min) in production, `10000` (10s) in dev.

### 3. **Cache Behavior**

#### Cached Endpoints:
- `GET /sections?siteId=X` — sections for a site.
- `GET /posts?siteId=X&sectionId=Y&limit=Z&page=N` — posts (simple queries only; no search/tag filters).

#### Invalidation (automatic):
- **POST/PUT/DELETE `/posts`** → invalidates `posts:*siteId:X*`.
- **POST/PUT/DELETE `/sections`** → invalidates `sections:*siteId:X*` and `posts:*siteId:X*` (posts in that section).
- **POST/PUT/DELETE `/thumbnails`** → invalidates `thumbnails:*siteId:X*` and `posts:*siteId:X*`.

### 4. **Redis Providers**

#### Upstash (recommended for Vercel)
1. Create a Redis database at [console.upstash.com](https://console.upstash.com/).
2. Copy **Redis REST URL** or **Redis URL**.
3. Add to Vercel environment variables:
   ```
   REDIS_URL=rediss://default:password@hostname:port
   ```

#### Railway
1. Add **Redis** service in Railway project.
2. Copy `REDIS_URL` from service variables.
3. Add to Railway environment variables.

### 5. **Warm-Up Strategy (Optional)**

For frequently accessed endpoints, add a warm-up script to pre-populate cache after deployment:

**`backend/scripts/cache-warmup.js`**:
```javascript
const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'https://your-cms.vercel.app';
const SITE_IDS = [1, 2, 3]; // Your site IDs

async function warmup() {
  for (const siteId of SITE_IDS) {
    await fetch(`${BASE_URL}/sections?siteId=${siteId}`);
    await fetch(`${BASE_URL}/posts?siteId=${siteId}&limit=10`);
  }
  console.log('Cache warmed up');
}

warmup().catch(console.error);
```

Run after deployment:
```bash
node backend/scripts/cache-warmup.js
```

### 6. **Monitoring Cache Performance**

- Check logs for `[Redis] initialized` on startup.
- Look for `Redis cache hit` / `Redis cache miss` in request logs.
- Monitor Redis memory usage in provider dashboard.
- Use `invalidateCache` logs to confirm cache clears after mutations.

### 7. **Fallback Behavior**

If Redis is unavailable or `REDIS_URL` is not set:
- The backend **falls back to in-memory cache** (works for single-instance deployments).
- No errors — Redis is optional.

### 8. **Redis Key Patterns**

- Sections: `sections:{"siteId":3}`
- Posts: `posts:{"sectionId":null,"siteId":3,"page":1,"limit":10}`
- Thumbnails: `thumbnails:*siteId:3*`

These patterns are used for invalidation (SCAN + DELETE) when data changes.

---

## Summary

✅ **Redis is enabled automatically in production** when `REDIS_URL` is set.  
✅ **No code changes needed** — just set environment variables.  
✅ **Cache invalidation is automatic** on create/update/delete.  
✅ **Fallback to memory cache** if Redis is unavailable.

For questions, see `GUIA_PROCESO_CONEXION_FRONTEND_EXISTENTE.md` or backend logs.

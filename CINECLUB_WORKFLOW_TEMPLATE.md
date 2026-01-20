# Cineclub — Publish & Frontend Integration Template

Fecha: 2026-01-20
Propósito: plantilla concreta para replicar el flujo de publicación instantánea y las optimizaciones frontend usadas en Cineclub.

---

## Resumen ejecutivo

Arquitectura: publicación directa desde el backend a Supabase Storage (public bucket) + Redis como fuente de verdad para la versión actual y manifest atómico. El frontend solicita una única URL rápida (`GET /prerender/current/:siteId`) y carga primero un artefacto `min` pequeño para render inmediato, luego recupera el artefacto `full` en background y re-renderiza.

Beneficio: cambios en el CMS se reflejan en el frontend en segundos sin commits, GitHub Actions, ni rebuilds.

---

## Componentes clave

- Backend: Node.js + Express (publica artefactos y actualiza Redis)
  - `backend/storage/supabase-storage.js` — subida versionada, manifest, locking
  - `backend/storage/artifact-generator.js` — genera `posts_bootstrap.json` y `posts_bootstrap.min.json`
  - `backend/index.js` — rutas de publicación y `GET /prerender/current/:siteId`
- Almacenamiento: Supabase Storage (bucket `prerender`) + CDN
- Estado: Redis (keys descriptas abajo)
- Frontend: sitio estático (cineclub) con `cms-loader.js` que implementa la lógica min-first + background full

---

## Redis keys (convención)

- `publish:lock:<siteId>` — lock corto (p.ej. 10s) durante publish
- `publish:current:<siteId>` — JSON con { version, files, updatedAt }
- `publish:version:<siteId>` — versión actual (string) para búsquedas rápidas

---

## Naming de artefactos

- `posts_bootstrap.<version>.json` — artifact completo (full)
- `posts_bootstrap.min.<version>.json` — artifact mínimo (min)
- `manifest.json` — escrito por el backend desde `publish:current` (contiene `version`, `filesMap`, `files`)

---

## Flujo de publicación (backend)

1. Generar artifacts (full + min) con `artifact-generator`.
2. Adquirir lock Redis `publish:lock:<siteId>` (SET NX, TTL corto).
3. Subir archivos versionados a Supabase Storage: `<siteId>/posts_bootstrap.<version>.json`, `<siteId>/posts_bootstrap.min.<version>.json`.
4. Actualizar Redis `publish:current:<siteId>` con `{ version, files }`.
5. Escribir `manifest.json` en Storage (derivado de Redis).
6. Escribir `publish:version:<siteId>` y liberar lock.

Notas:
- Use `EX` TTL con `redis.set(key, value, 'EX', ttl)` para compatibilidad.
- Comprimir localmente (Brotli) está implementado en subida, pero CDN puede no devolver `Content-Encoding: br`.

---

## Endpoint público para frontend

`GET /prerender/current/:siteId` — devuelve JSON rápido y cacheable con:

```json
{ "version": "<ts>", "urls": { "min": "<url>", "full": "<url>" }, "siteId": 3 }
```

- Headers recomendados: `Cache-Control: public, max-age=5, s-maxage=5`
- Objetivo: evitar manifest→artifact secuencial y dar al cliente URLs directas a CDN.

---

## Frontend: integración mínima (template)

1. Inline config (evitar roundtrip):

```html
<script>
  window.CMS_CONFIG = { API_URL: 'https://cms-woad-delta.vercel.app', SITE_ID: 3 };
</script>
```

2. Preconnect + DNS-prefetch al CDN/storage:

```html
<link rel="dns-prefetch" href="https://cms-woad-delta.vercel.app">
<link rel="dns-prefetch" href="https://xpprwxeptbcqehkfzedh.supabase.co">
<link rel="preconnect" href="https://xpprwxeptbcqehkfzedh.supabase.co" crossorigin>
<link rel="preload" href="https://cms-woad-delta.vercel.app/prerender/current/3" as="fetch" crossorigin>
```

3. Cargar CSS crítico (no async) para evitar FOUC:

```html
<link rel="stylesheet" href="style.css">
```

4. Ejecutar loader lo antes posible (script sin `defer`) para comenzar el fetch durante el parse:

```html
<script src="cms-loader.js"></script>
```

5. Lógica recomendada en `cms-loader.js` (pseudocódigo):

```javascript
const { API_URL, SITE_ID } = window.CMS_CONFIG;
const PRERENDER_ENDPOINT = `${API_URL}/prerender/current/${SITE_ID}`;

async function loadFromSupabase() {
  const info = await fetch(PRERENDER_ENDPOINT).then(r => r.json());
  if (info.urls?.min) {
    const min = await fetch(info.urls.min).then(r => r.json());
    renderBootstrap(min, false);
    if (info.urls.full) {
      fetch(info.urls.full).then(r => r.json()).then(full => renderBootstrap(full, true));
    }
  } else if (info.urls?.full) {
    const full = await fetch(info.urls.full).then(r => r.json());
    renderBootstrap(full, false);
  }
}

// Ejecutar inmediatamente (no esperar DOMContentLoaded)
loadFromSupabase();
```

6. Polling ligero para detectar nuevas versiones (p.ej. cada 30s) usando `GET /prerender/current/:siteId` y comparar `version`.

---

## Optimizaciones implementadas (lista replicable)

1. Render inmediatamente (script sin `defer`) — inicia fetch durante parse HTML.
2. Inline small config — elimina request extra.
3. Preconnect/DNS-prefetch al CDN — reduce handshake latencia.
4. CSS cargado de forma bloqueante para FCP correcto (si es pequeño/critico).
5. Min-first artifact: `posts_bootstrap.min.json` → render rápido con datos mínimos.
6. Background fetch del `full` artifact y re-render.
7. Image LCP hints: primera imagen eager + `decoding="sync"` + `fetchpriority="high"` y resto `loading="lazy"`.
8. Locking y Redis state for atomicity (`publish:lock`, `publish:current`).
9. Artifact versioning + `Cache-Control: immutable` para artefactos versionados.
10. Brotli compression on upload (optional; CDN header caveat).

---

## Headers y cache recomendados

- Artefactos versionados (full/min): `Cache-Control: public, max-age=31536000, immutable`
- Manifest / publish endpoint: `Cache-Control: public, max-age=5, s-maxage=5`
- HTML: según hosting (Vercel defaults está bien)

---

## Checklist para portar a otro frontend

- [ ] Copiar `cms-loader.js` y adaptar selectores y render functions.
- [ ] Inlinear `CMS_CONFIG` con `API_URL` y `SITE_ID` del nuevo sitio.
- [ ] Añadir `preconnect` y `dns-prefetch` al endpoint y Supabase URL.
- [ ] Asegurar que el HTML contiene el contenedor donde `renderBootstrap` insertará el HTML (p.ej. `.col-left`).
- [ ] Verificar que `backend` publica `posts_bootstrap.min.json` y actualiza `publish:current` en Redis.
- [ ] Confirmar headers de cache en Supabase y en el endpoint.
- [ ] Optimizar primera imagen LCP en la plantilla `renderSession`.
- [ ] Medir con Lighthouse antes/después.

---

## Medición obligatoria

1. Ejecutar Lighthouse (FCP, LCP, TTI) en una máquina con conexión representativa.
2. Medir TTFB del HTML y del endpoint (`time_starttransfer` con `curl -w`).
3. Medir artifact download time desde CDN.
4. Comparar antes/después y revertir si no hay mejora real.

---

## Notas operativas y limitaciones

- No requiere CI/CD ni rebuilds: publicar actualiza Redis y Storage, el frontend detecta la nueva versión.
- Brotli: backend puede comprimir antes de subir, pero la capa CDN/Supabase puede no exponer `Content-Encoding: br`. Esto es opcional y puede no aportar ganancia apreciable dada la reducción ya lograda con `min` artifacts.
- Si el endpoint TTFB es un cuello de botella (>300ms), valorar edge caching o mover la lectura de `publish:current` a un edge function (fuera del alcance de esta plantilla si no se quiere cambiar infra).

---

## Archivos relevantes (para implementar)

- `backend/storage/supabase-storage.js`
- `backend/storage/artifact-generator.js`
- `backend/index.js` (ruta `GET /prerender/current/:siteId`)
- `cineclub/cms-loader.js` (loader cliente)
- `cineclub/index.html` (snippets: preconnect, inline config, script)
- `OPTIMIZACIONES_FRONTEND_2026-01-20.md` (documento de referencia)

---

## Ejemplo rápido de snippets

HTML head (recommended):

```html
<link rel="dns-prefetch" href="https://cms-woad-delta.vercel.app">
<link rel="preconnect" href="https://xpprwxeptbcqehkfzedh.supabase.co" crossorigin>
<link rel="stylesheet" href="style.css">
<script>
  window.CMS_CONFIG = { API_URL: 'https://cms-woad-delta.vercel.app', SITE_ID: 3 };
</script>
<script src="cms-loader.js"></script>
```

Fetch pattern (client):

```javascript
const PRERENDER = `${CMS_CONFIG.API_URL}/prerender/current/${CMS_CONFIG.SITE_ID}`;
const info = await fetch(PRERENDER).then(r => r.json());
if (info.urls?.min) {
  const min = await fetch(info.urls.min).then(r => r.json());
  renderBootstrap(min, false);
  if (info.urls.full) fetch(info.urls.full).then(r => r.json()).then(f => renderBootstrap(f, true));
}
```

---

## Conclusión

Esta plantilla recoge el flujo concreto usado por Cineclub: publicación instantánea desde backend a Supabase Storage, Redis como fuente de verdad, artefactos `min` para primer render, y una batería de optimizaciones frontend-first para reducir FCP/LCP sin cambiar infraestructura. Es adecuada como checklist replicable y punto de partida para portar a otros frontends.


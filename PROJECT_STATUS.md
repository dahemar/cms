# Estado técnico del proyecto — CMS + frontends (cineclub, sympaathy)

Última actualización: 2026-01-17

**Resumen rápido**

- Repos locales principales:
  - `cms` (backend API, admin UI, scripts, prerenderer)
  - `cineclub` (sitio estático que consume el CMS)
  - `sympaathy-v2` (otro frontend en el workspace que consume el CMS)
- Despliegues en Vercel:
  - CMS: https://cms-woad-delta.vercel.app (alias del proyecto)
  - Cineclub: https://cineclub-theta.vercel.app (alias del proyecto)
- Estado: prerendering automático (opcional) implementado en backend; prerender fragment `posts.html` generado y servido por el sitio; cliente del frontend carga el fragmento estático antes de llamar al CMS.

---

**Arquitectura general**

- Backend (Node.js + Express, Prisma + PostgreSQL): sirve la API REST para `sections`, `posts`, etc. Localmente corre en `http://localhost:3000`.
- Admin UI (static files + small server): `http://localhost:8000` en dev.
- Static site `cineclub`: frontend estático (index.html + `cms-loader.js`) servido localmente por un servidor simple en `http://localhost:8002`.
- Prerender script: `cms/scripts/prerender_posts.js` — consulta `GET /posts` en el backend y escribe un fragmento HTML (div[data-prerendered="true"]) en `cms/public/posts.html` y en `../cineclub/posts.html`.

Flujo (alto nivel): CMS -> prerender script -> posts.html (fragmento) -> site sirve fragmento a los navegadores

---

**Detalles de implementación y archivos clave**

- Backend
  - File: `backend/index.js`
    - Maneja endpoints CRUD para `/posts` y `sections`.
    - Tras POST/PUT/DELETE en `/posts` se llama a `triggerPrerender()` (debounced) si `PRERENDER_ON_MUTATION=true`.
    - Opciones de consulta: `includeTags`, `includeSection`, `includeBlocks` (permiten reducir joins/payloads).
    - Cache en memoria (Map) con TTL breve (ej. 10s) y cabeceras `Cache-Control: public,s-maxage=60,stale-while-revalidate=300` para CDN.
- Prerender
  - File: `scripts/prerender_posts.js`
    - Llama a `http://localhost:3000/posts?siteId=...&sectionId=...&includeBlocks=true` y genera un fragmento HTML:
      - Formato: `<!-- prerendered sessions --><div data-prerendered="true">...<section class="session" data-post-id="...">...</section>...</div>`
    - Resuelve URLs de media con `PRERENDER_MEDIA_BASE_URL` si está configurado.
    - Escribe `public/posts.html` (cms) y `../cineclub/posts.html`.
    - Se actualizó para FILTRAR bloques de imagen vacíos (problema resuelto).
- Cineclub (frontend)
  - Files: `index.html`, `cms-loader.js`, `style.css`, `posts.html` (generado)
  - `cms-loader.js`:
    - Lógica nueva: intenta primero `fetch('/posts.html')` (misma origen) y, si existe e incluye `data-prerendered="true"`, inyecta el fragmento en `<main class="col-left">` y evita consultar el CMS.
    - Si no existe el fragmento, continúa con la lógica original: `GET ${API_URL}/sections` y `GET ${API_URL}/posts?...&includeTags=false&includeSection=false`.
    - Renderiza sesiones leyendo `post.blocks`; se actualizó para FILTRAR imágenes vacías y renderizar N imágenes (0..N). Primer imagen: `loading="eager" fetchpriority="high"`; resto: `loading="lazy"`.
  - `style.css`:
    - Ajustes para el layout de dos imágenes: `imagem-sessao--two` ahora deja que ambas imágenes se muestren con `flex: 0 0 auto` y `width: auto` (evita ocultar la segunda imagen). También existe lógica JS `enhanceSessions()` para 'height-match' en casos de dos imágenes.
- Sympaathy (otro frontend que consume el CMS)
  - Ruta: workspace `sympaathy-v2/`.
  - No hemos modificado su código en esta sesión, pero la arquitectura de la API es la misma: usa `GET /posts` y `GET /sections`.

---

**Comportamiento en Local**

- Para arrancar servidores locales (desde `cms` root):

```bash
./start-servers.sh
# o arrancar manualmente
# backend
cd backend && node index.js
# admin
cd ../my-headless-cms && (serve admin or start) # según script
# cineclub (site)
cd ../cineclub && node server.js
```

- Generar prerender manualmente (útil en dev):

```bash
# desde /Users/david/Documents/GitHub/cms
node scripts/prerender_posts.js
# genera: cms/public/posts.html y ../cineclub/posts.html
```

- Para probar la integración localmente:
  - Abrir `http://localhost:8002/index.html` (cineclub) — el `cms-loader.js` primero intenta `/posts.html` en el site; si no existe, consulta al backend local `http://localhost:3000`.
  - Al editar en el admin (POST/PUT/DELETE), el backend invalidará su cache interno y (si `PRERENDER_ON_MUTATION=true`) disparará el prerender debounced que reescribirá `posts.html`.

---

**Comportamiento en Vercel (producción)**

- Deploys realizados mediante Vercel CLI y/o push a GitHub conectado al proyecto.
- Observaciones relevantes:
  - Vercel sirve `index.html` y assets estáticos sin ejecutar un proceso Express persistente (a menos que uses Serverless Functions o un Server en builds). Por tanto, inyección server-side dinámica (Express) no se aplica si el site está configurado como static.
  - Por eso la arquitectura elegida: prerender script genera `posts.html` en build/deploy o via CI/hook, y el site sirve ese fragmento estático.
  - Cabeceras observadas en producción:
    - `index.html`: `cache-control: public, max-age=0, must-revalidate` (no cache agresivo por estar HTML)
    - `style.css` y otros activos: `cache-control: public, max-age=31536000, immutable` (long-lived)
    - Backend (`/posts`): `cache-control: public, s-maxage=60, stale-while-revalidate=300` para permitir CDN caching.
- URLs de despliegue (ejemplos obtenidos durante la sesión):
  - CMS aliased: https://cms-woad-delta.vercel.app
  - Cineclub aliased: https://cineclub-theta.vercel.app

---

**Prerender automático y sincronización**

- Triggers:
  - Backend llama a un `triggerPrerender()` tras mutaciones en `/posts` (POST/PUT/DELETE). Esa función está debounceada y ejecuta `node scripts/prerender_posts.js` cuando `PRERENDER_ON_MUTATION=true`.
  - Env vars control:
    - `PRERENDER_ON_MUTATION` (true/false)
    - `PRERENDER_DEBOUNCE_MS` (ms)
    - `PRERENDER_ALLOW_PROD` (para proteger producción)
    - `PRERENDER_MEDIA_BASE_URL` (opcional)
    - `PRERENDER_OUTPUT_DIRS` (comma-separated extra output dirs)
- En producción (Vercel) hay 2 opciones para mantener `posts.html` sincronizado:
  1. Ejecutar `scripts/prerender_posts.js` DURANTE el proceso de build (integrarlo en `vercel build` o en un hook), de modo que `index.html`/`posts.html` formen parte del despliegue. Esto garantiza que la primera pintura muestre el prerender sin JS.
  2. Mantener la generación en el backend y, tras escribir `posts.html`, invalidar o redeployar (o usar la Vercel API/CDN purge) para actualizar el archivo en el CDN. Esto permite regeneración sin tocar el pipeline de build.

Recomendación: usar la opción (1) para la experiencia más rápida en primer paint; usar la opción (2) si se prefiere regenerar tras cada mutación sin redeploy completo.

---

**Conexión con frontends: cineclub y sympaathy**

- Cineclub:
  - Consume `posts.html` estático primero (misma origen). Si existe, se inyecta y no se consulta al CMS.
  - Si no existe `posts.html`, `cms-loader.js` hace llamadas a la API del CMS para `sections` y `posts` y renderiza dinámicamente.
  - `scripts/prerender_posts.js` escribe `../cineclub/posts.html` durante prerender local o CI, así el site lo sirve directamente.
  - En production hemos desplegado `posts.html` al repo `cineclub` y el loader del sitio lo aprovecha.
- Sympaathy:
  - No modificado en esta sesión, pero puede consumir la misma API (`/posts`, `/sections`). Se puede adaptar para usar el mismo patrón prerender (generar fragmento) si se desea.

---

**Problemas resueltos en esta sesión**

- El prerender originalmente incluía imágenes vacías (src `null`/"") -> se filtró en `scripts/prerender_posts.js` y en `cms-loader.js`.
- El frontend mostraba siempre una sola imagen: el renderer y el prerender ahora renderizan N imágenes y el CSS se ajustó para mostrar correctamente la segunda imagen en el layout `imagem-sessao--two`.
- Añadido fallback en `cms-loader.js` para cargar `/posts.html` antes de llamar al CMS, reduciendo la latencia de primer paint.

---

**Comandos útiles y verificación**

- Generar prerender localmente y revisar archivos:

```bash
# desde /Users/david/Documents/GitHub/cms
node scripts/prerender_posts.js
# comprueba:
ls -lh public/posts.html ../cineclub/posts.html
```

- Forzar deploy a Vercel (requiere `vercel` CLI y estar autenticado):

```bash
# cms
cd /Users/david/Documents/GitHub/cms && vercel --yes --prod
# cineclub
cd /Users/david/Documents/GitHub/cineclub && vercel --yes --prod
```

- Medir tiempos y cabeceras (ejemplo):

```bash
curl -sI "https://cms-woad-delta.vercel.app/posts?siteId=3&sectionId=21&page=1&limit=1" | grep -i "cache-control\|x-vercel-cache\|age"
curl -sI https://cineclub-theta.vercel.app/posts.html | sed -n '1,8p'
```

- Forzar invalidación de CDN (si decides usar Vercel API) — requiere token y usar su REST API:
  - POST a `https://api.vercel.com/v1/integrations/deploy/prune` o usar `vercel` CLI (según permisos y proyecto).

---

**Ubicaciones y logs**

- Prerender outputs (local): `cms/public/posts.html`, `cineclub/posts.html`
- Backend logs (dev): se pueden redirigir a `/tmp/cms-backend.log` al arrancar `node backend/index.js > /tmp/cms-backend.log 2>&1 &`.
- Vercel: panel de despliegues e inspección por proyecto (ver enlaces generados por `vercel` CLI en la salida de deploy).

---

**Cambios en Git (commits relevantes durante la sesión)**

- `backend/index.js` — añadido `triggerPrerender()` y llamadas tras mutaciones en posts; mejoras de cache y flags de include.
- `scripts/prerender_posts.js` — reescrito para generar fragmento y filtrar imágenes vacías.
- `cineclub/cms-loader.js` — intenta cargar `/posts.html` antes de usar la API; renderiza múltiples imágenes.
- `cineclub/style.css` — ajustes para que dos imágenes se muestren correctamente.

Puedes ver los commits recientes en el repo local (`git log --oneline -n 10`).

---

**Siguientes recomendaciones (prioritarias)**

1. Elegir la estrategia de actualización en producción: 
   - Incluir `scripts/prerender_posts.js` en el build de Vercel (ci) para que `posts.html` sea parte del despliegue, o
   - Mantener prerender en backend y usar la API de Vercel para purgar/actualizar `posts.html` en el CDN tras regenerar.
2. Añadir índices en la base de datos (Prisma migrations) para acelerar consultas frecuentes (ej. composite index para (siteId, sectionId, published, order)).
3. Agregar un webhook o integración que permita invalidar el archivo en Vercel tras prerender (si eliges opción 2).
4. Considerar mover el prerender a un job (cron/queue) si la generación se vuelve costosa o si hay muchas mutaciones en poco tiempo.

---

Si quieres, puedo:

- Integrar `scripts/prerender_posts.js` en el proceso de `vercel build` (patch en `vercel.json`/build script) y desplegar un nuevo build para que `index.html` contenga el fragmento en el primer deploy.
- Añadir un webhook en el backend para llamar a la API de Vercel y purgar `posts.html` tras cada prerender.




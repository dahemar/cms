# GitHub Actions Auto-Rebuild: Configuración Completa

Este documento describe cómo configurar el sistema de auto-rebuild para que el frontend se regenere automáticamente al publicar contenido en el CMS.

## Arquitectura

```
┌──────────────┐      Publish Post      ┌──────────────────┐
│              │─────────────────────────▶│                  │
│   CMS Admin  │                          │   Backend CMS    │
│  (Browser)   │                          │  (Node/Express)  │
└──────────────┘                          └────────┬─────────┘
                                                   │
                                                   │ GitHub API
                                                   │ POST /repos/.../dispatches
                                                   ▼
                                          ┌─────────────────────┐
                                          │  GitHub Actions     │
                                          │  (sympaathy-v2)     │
                                          └──────────┬──────────┘
                                                     │
                                                     │ 1. npm ci
                                                     │ 2. node generate_bootstrap.mjs
                                                     │ 3. git commit & push
                                                     │ 4. Vercel auto-deploy
                                                     ▼
                                          ┌─────────────────────┐
                                          │   Frontend Prod     │
                                          │  (Vercel/Static)    │
                                          └─────────────────────┘
```

## Componentes

### 1. Workflow en el Frontend (`sympaathy-v2`)

**Archivo:** `.github/workflows/update_posts_bootstrap.yml`

```yaml
name: Update posts_bootstrap.json

on:
  workflow_dispatch:           # Manual
  repository_dispatch:         # ✅ NUEVO: Disparado por CMS
    types: [cms-content-updated]
  schedule:
    - cron: '*/15 * * * *'     # Fallback cada 15 min

concurrency:
  group: update-posts-bootstrap
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    env:
      PREWARM_URL: ${{ secrets.PREWARM_URL }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install
        run: npm ci

      - name: Generate bootstrap
        env:
          CMS_API: ${{ secrets.CMS_API }}
          CMS_SITE_ID: ${{ secrets.CMS_SITE_ID }}
        run: |
          node scripts/generate_bootstrap.mjs

      - name: Commit and push if changed
        run: |
          if git diff --quiet -- public/posts_bootstrap.json; then
            echo "No changes"
            exit 0
          fi

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git add public/posts_bootstrap.json
          git commit -m "chore: update posts_bootstrap.json [skip ci]"
          git push

      - name: Pre-warm CDN (optional)
        if: env.PREWARM_URL != ''
        run: |
          echo "Pre-warming CDN via $PREWARM_URL/posts_bootstrap.json"
          curl -sS --max-time 10 "$PREWARM_URL/posts_bootstrap.json" > /dev/null || echo "pre-warm failed"
```

**Cambios aplicados:**
- Añadido `repository_dispatch` con `types: [cms-content-updated]`

### 2. Backend del CMS

**Archivo:** `backend/index.js`

Se añadió la función `triggerFrontendRebuild()` que:
- Llama a `POST https://api.github.com/repos/{owner}/{repo}/dispatches`
- Envía `event_type: 'cms-content-updated'`
- Incluye metadata (`reason`, `postId`, `timestamp`)

**Se ejecuta automáticamente:**
- Al crear un post con `published: true` (POST `/posts`)
- Al actualizar un post a `published: true` (PUT `/posts/:id`)
- Al despublicar un post (PUT `/posts/:id` con `published: false`)

**Logs:**
```
[GitHub Rebuild] ✅ Triggered successfully: { reason: 'post-created', repo: 'dahemar/sympaathy-v2', ... }
```

---

## Configuración Paso a Paso

### Paso 1: Crear GitHub Personal Access Token (PAT)

1. Ve a **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Configurar:
   - **Note:** `CMS Backend - Trigger Workflows`
   - **Expiration:** 90 days (o No expiration si prefieres)
   - **Scopes (permisos mínimos):**
     - ✅ `repo` (o específicamente `repo:status` + `repo_deployment`)
     - ✅ `workflow` (necesario para `repository_dispatch`)

4. Click **Generate token**
5. **Copiar el token** (solo se muestra una vez): `ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

---

### Paso 2: Configurar Variables de Entorno en el Backend CMS

**En producción (Vercel/Railway/Render):**

Añade estas variables de entorno en el dashboard:

```bash
GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_REPO_OWNER=dahemar
GITHUB_REPO_NAME=sympaathy-v2
```

**En desarrollo local (`.env`):**

```bash
# GitHub Actions Rebuild
GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_REPO_OWNER=dahemar
GITHUB_REPO_NAME=sympaathy-v2
```

**⚠️ Seguridad:**
- **NUNCA** commitear el token al repositorio
- Añadir `.env` a `.gitignore`
- En Vercel, usar **Environment Variables** (no expuestas al cliente)

---

### Paso 3: Configurar Secrets en el Repositorio del Frontend

**En `dahemar/sympaathy-v2` → Settings → Secrets and variables → Actions:**

```bash
CMS_API=https://cms-woad-delta.vercel.app
CMS_SITE_ID=2
PREWARM_URL=https://sympaathy.vercel.app
```

---

### Paso 4: Verificar Permisos del Workflow

**En `dahemar/sympaathy-v2` → Settings → Actions → General:**

1. **Workflow permissions:**
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests** (opcional)

2. Guardar cambios.

---

## Pruebas

### Prueba 1: Ejecutar Workflow Manualmente

1. Ve a `dahemar/sympaathy-v2` → **Actions** → **Update posts_bootstrap.json**
2. Click **Run workflow** → **Run workflow**
3. Espera 1-2 minutos
4. Verifica que el workflow terminó con éxito ✅

### Prueba 2: Publicar un Post desde el CMS

1. Abre el CMS admin
2. Crea o edita un post
3. Marca **Published**
4. Guarda el post
5. Revisa los logs del backend:
   ```
   [GitHub Rebuild] ✅ Triggered successfully: { reason: 'post-created', repo: 'dahemar/sympaathy-v2', postId: 123 }
   ```
6. Ve a GitHub Actions y verifica que el workflow se ejecutó automáticamente

### Prueba 3: Verificar Actualización en el Frontend

1. Espera ~2-3 minutos (tiempo de build + deploy de Vercel)
2. Abre `https://sympaathy.vercel.app`
3. Verifica que el nuevo contenido aparece

---

## Tiempos Esperados

| Evento                        | Tiempo              |
|-------------------------------|---------------------|
| Publicar post → GitHub API    | < 1 segundo         |
| GitHub Actions workflow start | 5-10 segundos       |
| npm ci + generate_bootstrap   | 30-60 segundos      |
| git push                      | 5-10 segundos       |
| Vercel auto-deploy            | 30-90 segundos      |
| **Total**                     | **~2-3 minutos**    |

---

## Troubleshooting

### El workflow no se dispara

**Síntomas:**
- No aparece ningún run en GitHub Actions después de publicar

**Diagnóstico:**
1. Revisar logs del backend CMS:
   ```
   [GitHub Rebuild] Skipped: missing GITHUB_TOKEN, GITHUB_REPO_OWNER, or GITHUB_REPO_NAME
   ```
2. Verificar que las variables de entorno estén configuradas en Vercel/Railway
3. Verificar que el token no haya expirado

**Solución:**
- Configurar las variables de entorno (ver Paso 2)
- Regenerar el token si expiró

---

### El workflow falla con "Resource not accessible by integration"

**Síntomas:**
- El workflow se dispara pero falla en GitHub Actions

**Causa:**
- El token no tiene permisos suficientes

**Solución:**
1. Regenerar el PAT con scopes `repo` + `workflow`
2. Actualizar `GITHUB_TOKEN` en las variables de entorno

---

### El workflow falla en "Generate bootstrap"

**Síntomas:**
```
❌ generate_bootstrap failed: HTTP 500 for https://cms.../sections
Process completed with exit code 1.
```

**Causa:**
- El CMS no está accesible desde GitHub Actions
- Los secrets `CMS_API` o `CMS_SITE_ID` están mal configurados

**Solución:**
1. Verificar que `CMS_API` apunta a la URL correcta (sin `/` al final)
2. Verificar que `CMS_SITE_ID` es el ID correcto
3. Probar manualmente:
   ```bash
   curl -I https://cms-woad-delta.vercel.app/sections?siteId=2
   ```

---

### El contenido no aparece en el frontend después del workflow

**Síntomas:**
- El workflow termina OK ✅
- Pero el sitio muestra contenido antiguo

**Causa:**
- Cache del CDN de Vercel

**Solución:**
1. Abrir la URL directamente (bypass cache):
   ```
   https://sympaathy.vercel.app/posts_bootstrap.json?t=123456789
   ```
2. Verificar que el JSON contiene el nuevo contenido
3. Si sí, es cache del navegador/CDN (esperar 5-10 min)
4. Si no, revisar el commit en GitHub para ver si se actualizó `public/posts_bootstrap.json`

---

## Alternativas de Configuración

### Opción 1: Deshabilitar cron (solo manual + CMS trigger)

Editar `.github/workflows/update_posts_bootstrap.yml`:

```yaml
on:
  workflow_dispatch:
  repository_dispatch:
    types: [cms-content-updated]
  # schedule:                    # ❌ Comentar o eliminar
  #   - cron: '*/15 * * * *'
```

**Ventajas:**
- No hay runs automáticos cada 15 minutos
- Menos consumo de minutos de GitHub Actions
- No recibes correos de fallos automáticos

**Desventajas:**
- Si el trigger falla, el contenido no se actualiza hasta ejecutar manualmente

---

### Opción 2: Cron menos frecuente (backup)

```yaml
schedule:
  - cron: '0 */6 * * *'  # Cada 6 horas
```

**Ventajas:**
- Sincronización garantizada incluso si falla el trigger
- Menos correos de fallos

---

### Opción 3: Fetch en runtime (sin pre-render)

**Cambiar `src/App.jsx` para hacer fetch directo al CMS:**

```javascript
useEffect(() => {
  fetch('https://cms-woad-delta.vercel.app/posts?siteId=2&published=true')
    .then(res => res.json())
    .then(data => setPosts(data.posts))
}, [])
```

**Ventajas:**
- Contenido siempre actualizado (sin delay)
- No necesita workflows ni tokens

**Desventajas:**
- Requests extra al CMS en cada visita
- SEO peor (contenido no pre-renderizado)
- Latencia adicional

---

## Seguridad y Permisos Mínimos

### Token Scope Explicado

| Scope      | ¿Necesario? | Razón                                    |
|------------|-------------|------------------------------------------|
| `repo`     | ✅ Sí       | Permite `repository_dispatch`            |
| `workflow` | ✅ Sí       | Requerido para triggers de workflows     |
| `admin:repo_hook` | ❌ No | Solo si usas webhooks (no aplica aquí)   |
| `write:packages` | ❌ No | Solo para GitHub Packages                |

### ¿Por qué no usar GitHub App?

**GitHub App con permisos más granulares:**
- Más seguro (permisos por repo)
- Requiere setup más complejo (instalación, private key)

**PAT con `repo` + `workflow`:**
- Más simple para proyectos pequeños
- Suficientemente seguro si el token está en variables de entorno (no en código)

---

## Flujo Completo (Diagrama de Secuencia)

```
Usuario      CMS Admin      Backend CMS      GitHub API      GitHub Actions      Vercel
  │              │               │                │                 │                │
  │──Publish─────▶               │                │                 │                │
  │              │──POST /posts──▶               │                 │                │
  │              │               │──(save to DB)─▶                 │                │
  │              │               │                │                 │                │
  │              │               │──POST dispatches─▶              │                │
  │              │               │                │                 │                │
  │              │               │                │──trigger workflow─▶            │
  │              │               │                │                 │                │
  │              │               │                │                 │──npm ci───────▶│
  │              │               │                │                 │──generate.mjs─▶│
  │              │               │                │                 │◀──JSON────────│
  │              │               │                │                 │──git push─────▶│
  │              │               │                │                 │                │
  │              │               │                │                 │                │──auto deploy─▶
  │              │               │                │                 │                │
  │◀─────────────────────────────────────────────────────────────────────────────── ✅ Updated Site
```

---

## Mantenimiento

### Renovar Token Expirado

1. Crear nuevo PAT (Paso 1)
2. Actualizar `GITHUB_TOKEN` en Vercel/Railway
3. No requiere cambios de código

### Cambiar Repositorio de Destino

Actualizar variables de entorno:
```bash
GITHUB_REPO_OWNER=nuevo_owner
GITHUB_REPO_NAME=nuevo_repo
```

### Añadir Más Repositorios

Modificar `triggerFrontendRebuild()` para disparar múltiples repos:

```javascript
const repos = [
  { owner: 'dahemar', name: 'sympaathy-v2' },
  { owner: 'dahemar', name: 'cineclub' }
];

for (const repo of repos) {
  await triggerRebuild(repo.owner, repo.name, reason, meta);
}
```

---

## Documentos Relacionados

- [GitHub API: repository_dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)
- [GitHub Actions: on.repository_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch)
- [Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

---

## Resumen Ejecutivo

✅ **Implementado:**
- Workflow escucha `repository_dispatch`
- Backend dispara workflow al publicar
- Token con permisos mínimos

✅ **Resultado:**
- Contenido aparece en ~2-3 minutos
- Sin intervención manual
- Tokens seguros (no en código)

✅ **Próximos Pasos:**
1. Crear PAT
2. Configurar variables de entorno
3. Probar publicando un post
4. (Opcional) Deshabilitar cron

---

**Creado:** 2026-01-18  
**Autor:** GitHub Copilot  
**Versión:** 1.0

# Guía de Configuración: Prerender en GitHub Actions

## 📋 Resumen

Este documento describe cómo configurar el flujo de prerender y despliegue automático donde:

1. **Backend CMS** emite `repository_dispatch` cuando se publica/actualiza contenido
2. **GitHub Actions** en repos frontend ejecutan el script de prerender
3. Los artefactos generados se despliegan directamente a **GitHub Pages**
4. **No se commitean** archivos generados en los repos

## 🏗️ Arquitectura del Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│ CMS Backend (Node.js + Express)                                 │
│                                                                  │
│  1. Usuario publica post en admin                               │
│  2. POST /posts → crea/actualiza post en DB                     │
│  3. triggerFrontendRebuild() llamado                            │
│     ├─ GitHub App: JWT → Installation Token                     │
│     └─ POST /repos/:owner/:repo/dispatches                      │
│        (event_type: cms-content-updated)                        │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ repository_dispatch
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ GitHub Actions (Frontend Repos)                                 │
│                                                                  │
│  1. Workflow escucha repository_dispatch                        │
│  2. Checkout sparse del CMS para obtener script                 │
│  3. Ejecuta scripts/prerender_for_actions.js                    │
│     ├─ Fetch posts desde CMS_API_URL                            │
│     ├─ Genera posts.html / posts_bootstrap.json                 │
│     └─ Escribe en OUTPUT_DIR (temp, no commiteado)             │
│  4. Build del frontend (npm run build si aplica)               │
│  5. Deploy a GitHub Pages (upload-pages-artifact + deploy)     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                        🌐 GitHub Pages
                     (site público actualizado)
```

## 🔐 Requisitos Previos

### 1. GitHub App Configurada

Ver [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) para crear la App.

**Permisos necesarios:**
- ✅ `Actions: Read and write` (para trigger workflows)
- ✅ `Contents: Read only` (opcional, para leer workflows)

**Variables de entorno en backend:**
```bash
GITHUB_APP_ID=2681636
GITHUB_APP_PRIVATE_KEY_PATH=./github-app-private-key.pem
# O alternativamente:
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_APP_INSTALLATION_ID=104890890  # Opcional si usas webhook
```

### 2. Repositorios Frontend Listados

En `backend/.env`:
```bash
GITHUB_FRONTEND_REPOS=dahemar/cineclub,dahemar/sympaathy-v2
```

### 3. GitHub Pages Habilitado

Para cada repo frontend:
1. Settings → Pages
2. Source: **GitHub Actions**

## 📁 Archivos Creados

### Script de Prerender para Actions

📄 [`cms/scripts/prerender_for_actions.js`](scripts/prerender_for_actions.js)

Script standalone que:
- Se ejecuta en GitHub Actions runners
- Configurable vía env vars (no hardcoded paths)
- Genera `posts.html` y/o `posts_bootstrap.json`
- Valida salida y maneja errores

**Variables de entorno:**
- `CMS_API_URL`: URL del backend (ej. `https://cms-woad-delta.vercel.app`)
- `CMS_SITE_ID`: ID del site a prerender
- `CMS_SECTION_ID`: ID de la sección o `'ALL'` para bootstrap completo
- `OUTPUT_DIR`: directorio donde escribir (default: `public`)
- `REPO_TYPE`: `'cineclub'` o `'sympaathy'` (afecta formato)
- `CMS_MEDIA_BASE_URL`: base URL para imágenes (opcional)

### Workflows de GitHub Actions

#### 📄 `cineclub/.github/workflows/prerender-deploy.yml`

Workflow para **cineclub** que:
- Escucha `repository_dispatch` con `types: [cms-content-updated]`
- Escucha `workflow_dispatch` para triggers manuales
- Hace sparse checkout del script desde repo CMS
- Ejecuta prerender con `CMS_SECTION_ID=21` (sesiones)
- Genera `posts.html` y `posts_bootstrap.json` en raíz
- Despliega toda la raíz a Pages

**Secrets requeridos:**
- `CMS_API_URL` (default: `https://cms-woad-delta.vercel.app`)
- `CMS_SITE_ID` (default: `3`)
- `CMS_SECTION_ID` (default: `21`)

#### 📄 `sympaathy-v2/.github/workflows/prerender-deploy.yml`

Workflow para **sympaathy-v2** que:
- Escucha `repository_dispatch` con `types: [cms-content-updated]`
- Escucha `workflow_dispatch` para triggers manuales
- Hace sparse checkout del script desde repo CMS
- Ejecuta prerender con `CMS_SECTION_ID=ALL` (bootstrap completo)
- Genera `public/posts_bootstrap.json`
- Ejecuta `npm run build` (Vite)
- Despliega el `dist/` a Pages

**Secrets requeridos:**
- `CMS_API_URL` (default: `https://cms-woad-delta.vercel.app`)
- `CMS_SITE_ID` (default: `2`)

## ⚙️ Configuración Paso a Paso

### Paso 1: Configurar Secrets en Frontend Repos

Para cada repo frontend (cineclub, sympaathy-v2):

1. Ir a `Settings → Secrets and variables → Actions`
2. Añadir secrets:

```bash
CMS_API_URL = https://cms-woad-delta.vercel.app
CMS_SITE_ID = 3  # (o 2 para sympaathy)
CMS_SECTION_ID = 21  # (o dejar vacío para sympaathy que usa ALL)
```

### Paso 2: Hacer Commit de los Workflows

```bash
# En repo cineclub
cd /Users/david/Documents/GitHub/cineclub
git add .github/workflows/prerender-deploy.yml
git commit -m "feat: add prerender workflow with GitHub Actions"
git push origin main

# En repo sympaathy-v2
cd /Users/david/Documents/GitHub/sympaathy-v2
git add .github/workflows/prerender-deploy.yml
git commit -m "feat: add prerender workflow with GitHub Actions"
git push origin main
```

### Paso 3: Commit del Script de Prerender en CMS

```bash
cd /Users/david/Documents/GitHub/cms
git add scripts/prerender_for_actions.js
git commit -m "feat: add standalone prerender script for GitHub Actions"
git push origin main
```

### Paso 4: Verificar Configuración del Backend

Asegurarse de que `backend/.env` tiene:

```bash
# GitHub App
GITHUB_APP_ID=2681636
GITHUB_APP_PRIVATE_KEY_PATH=./github-app-private-key.pem
GITHUB_APP_INSTALLATION_ID=104890890

# Repos frontend
GITHUB_FRONTEND_REPOS=dahemar/cineclub,dahemar/sympaathy-v2
```

Reiniciar backend si es necesario:
```bash
cd backend
pkill -f "node index.js"
node index.js > /tmp/cms-backend.log 2>&1 &
```

## 🧪 Pruebas

### Prueba Manual de Workflow

Trigger manual desde GitHub UI:

1. Ir a `https://github.com/dahemar/cineclub/actions`
2. Click en workflow **"Prerender and Deploy to Pages"**
3. Click **"Run workflow"** → Run
4. Observar logs en tiempo real

O desde CLI:

```bash
gh workflow run prerender-deploy.yml \
  --repo dahemar/cineclub
```

### Prueba End-to-End

1. **Publicar un post** desde el admin (`http://localhost:8000/admin.html`)
2. **Verificar logs del backend**:
   ```bash
   tail -f /tmp/cms-backend.log | grep -E "\[GitHub"
   ```
   Deberías ver:
   ```
   [GitHub App] ✅ Workflow triggered: { repo: 'dahemar/cineclub', reason: 'post-created', ... }
   [GitHub App] ✅ Workflow triggered: { repo: 'dahemar/sympaathy-v2', reason: 'post-created', ... }
   ```

3. **Verificar GitHub Actions**:
   ```bash
   # Ver runs recientes
   gh run list --repo dahemar/cineclub --limit 3
   gh run list --repo dahemar/sympaathy-v2 --limit 3
   
   # Ver logs del último run
   gh run view --repo dahemar/cineclub --log
   ```

4. **Verificar Pages desplegado**:
   ```bash
   curl -sI https://dahemar.github.io/cineclub/ | head -n 5
   curl -sI https://dahemar.github.io/sympaathy-v2/ | head -n 5
   ```

### Script de Monitoreo

```bash
#!/bin/bash
# watch-actions.sh - Monitorea runs en tiempo real

REPOS=("dahemar/cineclub" "dahemar/sympaathy-v2")

while true; do
  clear
  echo "🔍 GitHub Actions Status - $(date)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  for REPO in "${REPOS[@]}"; do
    echo ""
    echo "📦 $REPO"
    gh run list --repo "$REPO" --limit 1 --json status,conclusion,name,headBranch,event,createdAt \
      --jq '.[] | "  Status: \(.status) | Conclusion: \(.conclusion // "N/A") | Event: \(.event) | Branch: \(.headBranch)"'
  done
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Refrescando en 10s... (Ctrl+C para salir)"
  sleep 10
done
```

Usar:
```bash
chmod +x watch-actions.sh
./watch-actions.sh
```

## 📊 Logs y Debugging

### Backend Logs

Los logs del backend muestran cada trigger:

```bash
grep -E "\[GitHub|triggerFrontendRebuild" /tmp/cms-backend.log
```

Salida esperada:
```
[GitHub App] ✅ Installation token obtained (expires at 2026-01-18T15:30:00Z)
[GitHub App] ✅ Workflow triggered: { repo: 'dahemar/cineclub', reason: 'post-created', durationMs: 234, postId: 65 }
[GitHub App] ✅ Workflow triggered: { repo: 'dahemar/sympaathy-v2', reason: 'post-created', durationMs: 198, postId: 65 }
```

### Workflow Logs (GitHub UI)

1. Ir a `https://github.com/dahemar/cineclub/actions`
2. Click en el run más reciente
3. Ver pasos:
   - **Run prerender script**: output del script (posts generados, tamaños)
   - **Verify generated files**: validación JSON
   - **Deploy to GitHub Pages**: status del deploy

### Errores Comunes

#### ❌ "CMS_API_URL not responding"

**Causa**: Backend CMS caído o URL incorrecta.

**Solución**:
```bash
# Verificar que backend está activo
curl -I https://cms-woad-delta.vercel.app/posts?siteId=3&sectionId=21&limit=1

# Si falla, revisar logs de Vercel
vercel logs --follow
```

#### ❌ "posts_bootstrap.json is not valid JSON"

**Causa**: Error en generación de JSON (fetch failed, etc.)

**Solución**:
- Ver logs del paso "Run prerender script" en Actions
- Verificar que CMS_SITE_ID y CMS_SECTION_ID son correctos
- Probar script localmente:
  ```bash
  cd /Users/david/Documents/GitHub/cineclub
  CMS_API_URL=https://cms-woad-delta.vercel.app \
  CMS_SITE_ID=3 \
  CMS_SECTION_ID=21 \
  OUTPUT_DIR=. \
  REPO_TYPE=cineclub \
  node ../cms/scripts/prerender_for_actions.js
  ```

#### ❌ "Ensure GITHUB_TOKEN has permission 'id-token: write'"

**Causa**: Falta el bloque `permissions` en workflow.

**Solución**: Ya incluido en los workflows creados:
```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

#### ❌ "repository_dispatch not triggering workflow"

**Causa**: GitHub App no tiene permiso `Actions: Write`.

**Solución**:
1. Ir a `https://github.com/settings/apps/cms-frontend-rebuild`
2. **Repository permissions** → Actions: **Read and write**
3. **Save changes**
4. Reinstalar App en repos si es necesario

## 🚀 Despliegue a Producción

### Backend en Vercel

1. **Configurar env vars** en Vercel Dashboard:
   ```bash
   GITHUB_APP_ID=2681636
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   GITHUB_APP_INSTALLATION_ID=104890890
   GITHUB_FRONTEND_REPOS=dahemar/cineclub,dahemar/sympaathy-v2
   ```

2. **Deploy**:
   ```bash
   cd /Users/david/Documents/GitHub/cms
   vercel --prod
   ```

3. **Verificar**:
   ```bash
   curl https://cms-woad-delta.vercel.app/github/installation
   ```

### Webhook (Opcional)

Si quieres recibir eventos cuando la App es instalada/desinstalada:

1. **Configurar Webhook URL** en GitHub App:
   - URL: `https://cms-woad-delta.vercel.app/github/webhook`
   - Secret: generar con `openssl rand -hex 32`

2. **Añadir secret a Vercel**:
   ```bash
   GITHUB_WEBHOOK_SECRET=tu_secret_generado
   ```

3. **Verificar entregas** en GitHub App → Recent Deliveries

## 📈 Escalabilidad Multi-Repo

El sistema ya soporta múltiples repos frontend:

```bash
# En backend/.env
GITHUB_FRONTEND_REPOS=dahemar/cineclub,dahemar/sympaathy-v2,dahemar/otro-frontend
```

Para añadir un nuevo frontend:

1. **Crear workflow** `.github/workflows/prerender-deploy.yml` (copiar de cineclub/sympaathy)
2. **Configurar secrets** (CMS_API_URL, CMS_SITE_ID, etc.)
3. **Habilitar Pages** en repo settings
4. **Añadir repo** a `GITHUB_FRONTEND_REPOS` en backend
5. **Probar** con workflow_dispatch manual

## ✅ Checklist Final

- [ ] GitHub App instalada en repos frontend con permisos Actions Write
- [ ] `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID` en backend
- [ ] `GITHUB_FRONTEND_REPOS` lista correcta de repos
- [ ] Workflows commiteados en repos frontend
- [ ] Script `prerender_for_actions.js` commiteado en CMS
- [ ] Secrets configurados en cada repo frontend
- [ ] GitHub Pages habilitado con source "GitHub Actions"
- [ ] Prueba manual exitosa con workflow_dispatch
- [ ] Prueba end-to-end: publicar post → verificar logs → verificar Pages

## 📚 Referencias

- [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) - Crear GitHub App
- [GITHUB_WEBHOOK_TESTING.md](GITHUB_WEBHOOK_TESTING.md) - Testing de webhooks
- [GitHub Actions: repository_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch)
- [GitHub Pages: GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)

---

**Última actualización**: 2026-01-18

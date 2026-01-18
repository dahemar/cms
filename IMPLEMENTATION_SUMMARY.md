# 🚀 Implementación Completa: Prerender en GitHub Actions

## ✅ Implementado

### 📁 Archivos Creados

1. **Script de Prerender para Actions**
   - [`cms/scripts/prerender_for_actions.js`](scripts/prerender_for_actions.js)
   - Standalone, ejecutable desde GitHub Actions
   - Configurable vía env vars (CMS_API_URL, CMS_SITE_ID, etc.)
   - Genera `posts.html` y `posts_bootstrap.json`

2. **Workflows de GitHub Actions**
   - [`cineclub/.github/workflows/prerender-deploy.yml`](/Users/david/Documents/GitHub/cineclub/.github/workflows/prerender-deploy.yml)
     - Escucha `repository_dispatch` y `workflow_dispatch`
     - Genera posts.html + posts_bootstrap.json
     - Despliega a Pages
   - [`sympaathy-v2/.github/workflows/prerender-deploy.yml`](/Users/david/Documents/GitHub/sympaathy-v2/.github/workflows/prerender-deploy.yml)
     - Escucha `repository_dispatch` y `workflow_dispatch`
     - Genera bootstrap completo (ALL sections)
     - Build Vite + despliega a Pages

3. **Scripts de Testing y Monitoreo**
   - [`scripts/watch-actions.sh`](scripts/watch-actions.sh) - Monitorea runs en tiempo real
   - [`scripts/test-prerender-flow.sh`](scripts/test-prerender-flow.sh) - Test end-to-end completo

4. **Documentación**
   - [`GITHUB_ACTIONS_PRERENDER_SETUP.md`](GITHUB_ACTIONS_PRERENDER_SETUP.md) - Guía completa de configuración

### 🔧 Backend (Ya Implementado)

- `backend/github-app.js`: JWT + installation token + repository_dispatch
- `backend/index.js`: `triggerFrontendRebuild()` llamado en create/update/delete posts
- Logs detallados para debugging

## 🎯 Flujo Implementado

```
┌──────────────────┐
│ Admin publica    │
│ post en CMS      │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Backend: POST /posts                 │
│ - Guarda en DB (Prisma)              │
│ - triggerFrontendRebuild()           │
│   - GitHub App: JWT → install token  │
│   - POST /repos/.../dispatches       │
└────────┬─────────────────────────────┘
         │ repository_dispatch
         ▼
┌──────────────────────────────────────┐
│ GitHub Actions (cineclub, sympaathy) │
│ 1. Sparse checkout script CMS       │
│ 2. node prerender_for_actions.js    │
│    - Fetch desde CMS_API_URL         │
│    - Genera posts.html / bootstrap   │
│ 3. npm run build (si Vite)          │
│ 4. Deploy a Vercel (vercel CLI)     │
└────────┬─────────────────────────────┘
         │
         ▼
    🌐 Vercel deployment actualizado
```

**Sin commits en repos frontend**: los artefactos se generan on-the-fly en el runner y se despliegan directamente a Vercel.

## 📋 Próximos Pasos

### 1. Commit y Push de los Archivos

```bash
# En repo CMS
cd /Users/david/Documents/GitHub/cms
git add scripts/prerender_for_actions.js
git add scripts/watch-actions.sh
git add scripts/test-prerender-flow.sh
git add GITHUB_ACTIONS_PRERENDER_SETUP.md
git add IMPLEMENTATION_SUMMARY.md
git commit -m "feat: implement Actions-based prerender without repo commits

- Add prerender_for_actions.js standalone script
- Create workflows for cineclub and sympaathy-v2
- Add monitoring and testing scripts
- Complete documentation"
git push origin main

# En repo cineclub
cd /Users/david/Documents/GitHub/cineclub
git add .github/workflows/prerender-deploy.yml
git commit -m "feat: add Actions-based prerender workflow"
git push origin main

# En repo sympaathy-v2
cd /Users/david/Documents/GitHub/sympaathy-v2
git add .github/workflows/prerender-deploy.yml
git commit -m "feat: add Actions-based prerender workflow"
git push origin main
```

### 2. Configurar Secrets en Repos Frontend

Para **cineclub**:
```bash
gh secret set CMS_API_URL --body "https://cms-woad-delta.vercel.app" --repo dahemar/cineclub
gh secret set CMS_SITE_ID --body "3" --repo dahemar/cineclub
gh secret set CMS_SECTION_ID --body "21" --repo dahemar/cineclub
gh secret set VERCEL_TOKEN --body "YOUR_VERCEL_TOKEN" --repo dahemar/cineclub
```

Para **sympaathy-v2**:
```bash
gh secret set CMS_API_URL --body "https://cms-woad-delta.vercel.app" --repo dahemar/sympaathy-v2
gh secret set CMS_SITE_ID --body "2" --repo dahemar/sympaathy-v2
gh secret set VERCEL_TOKEN --body "YOUR_VERCEL_TOKEN" --repo dahemar/sympaathy-v2
```

**Obtener VERCEL_TOKEN**: https://vercel.com/account/tokens

### 3. Verificar Backend en Producción

Si el backend ya está en Vercel:

```bash
# Verificar env vars
vercel env ls

# Verificar que están configuradas:
# - GITHUB_APP_ID
# - GITHUB_APP_PRIVATE_KEY
# - GITHUB_APP_INSTALLATION_ID
# - GITHUB_FRONTEND_REPOS

# Si faltan, añadir:
vercel env add GITHUB_APP_PRIVATE_KEY
# (pegar contenido de la private key)
```

### 4. Testing

#### Prueba Manual (UI)

1. Ir a https://github.com/dahemar/cineclub/actions
2. Click en workflow "Prerender and Deploy to Pages"
3. Click "Run workflow" → Run
4. Ver logs en tiempo real

#### Prueba Automatizada (CLI)

```bash
cd /Users/david/Documents/GitHub/cms

# Trigger manual
./scripts/test-prerender-flow.sh

# O solo un repo
./scripts/test-prerender-flow.sh --repo cineclub
```

#### Monitoreo Continuo

```bash
# Ver status actual
./scripts/watch-actions.sh

# Auto-refresh cada 10s
./scripts/watch-actions.sh --follow
```

#### Prueba End-to-End

1. Publicar un post desde admin (http://localhost:8000/admin.html)
2. Ver logs del backend:
   ```bash
   tail -f /tmp/cms-backend.log | grep -E "\[GitHub"
   ```
3. Ver runs disparados:
   ```bash
   gh run list --repo dahemar/cineclub --limit 3
   gh run list --repo dahemar/sympaathy-v2 --limit 3
   ```
4. Verificar Vercel deployment:
   ```bash
   curl -I https://cineclub.vercel.app/posts_bootstrap.json
   curl -I https://sympaathy-v2.vercel.app/posts_bootstrap.json
   ```

## 🔍 Debugging

### Ver Logs de Backend

```bash
grep -E "\[GitHub|triggerFrontendRebuild" /tmp/cms-backend.log | tail -n 20
```

Esperado:
```
[GitHub App] ✅ Workflow triggered: { repo: 'dahemar/cineclub', reason: 'post-created', durationMs: 234 }
[GitHub App] ✅ Workflow triggered: { repo: 'dahemar/sympaathy-v2', reason: 'post-created', durationMs: 198 }
```

### Ver Logs de Actions

```bash
# Listar runs
gh run list --repo dahemar/cineclub

# Ver logs del último
gh run view --repo dahemar/cineclub --log

# Ver logs de un run específico
gh run view 12345678 --repo dahemar/cineclub --log
```

### Errores Comunes

Ver [GITHUB_ACTIONS_PRERENDER_SETUP.md#-logs-y-debugging](GITHUB_ACTIONS_PRERENDER_SETUP.md#-logs-y-debugging)

## ✨ Características Implementadas

- ✅ **Sin commits en repos frontend**: prerender on-the-fly en Actions
- ✅ **Multi-repo**: escalable a N frontends via `GITHUB_FRONTEND_REPOS`
- ✅ **Seguridad**: GitHub App con tokens efímeros (no PATs)
- ✅ **Testing**: trigger manual con `workflow_dispatch`
- ✅ **Monitoreo**: scripts de watch y testing automatizado
- ✅ **Logs detallados**: en backend y workflows
- ✅ **Validación**: JSON validation y file checks en workflows
- ✅ **Documentación completa**: setup guide y troubleshooting

## 📚 Referencias

- [GITHUB_ACTIONS_PRERENDER_SETUP.md](GITHUB_ACTIONS_PRERENDER_SETUP.md) - Setup completo
- [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) - Crear GitHub App
- [GITHUB_WEBHOOK_TESTING.md](GITHUB_WEBHOOK_TESTING.md) - Testing webhooks

---

**Estado**: ✅ Implementación completa, pendiente de commit y testing  
**Última actualización**: 2026-01-18

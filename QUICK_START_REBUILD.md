# Quick Start: Auto-Rebuild Setup

## 🎯 Resumen

Sistema implementado para que el frontend se regenere automáticamente al publicar contenido en el CMS.

**Tiempo total de actualización:** ~2-3 minutos desde "Publish" hasta ver cambios en producción.

---

## ✅ Archivos Modificados/Creados

### Frontend (sympaathy-v2)
- ✅ [.github/workflows/update_posts_bootstrap.yml](.github/workflows/update_posts_bootstrap.yml) - Añadido `repository_dispatch`

### Backend (cms)
- ✅ [backend/index.js](backend/index.js) - Añadida función `triggerFrontendRebuild()`
- ✅ [backend/test-github-trigger.js](backend/test-github-trigger.js) - Script de prueba
- ✅ [backend/.env.example](backend/.env.example) - Documentadas nuevas variables
- ✅ [GITHUB_ACTIONS_REBUILD_SETUP.md](GITHUB_ACTIONS_REBUILD_SETUP.md) - Documentación completa

---

## 🚀 Próximos Pasos (5 minutos)

### 1. Crear GitHub Personal Access Token

```bash
# 1. Abre: https://github.com/settings/tokens
# 2. "Generate new token (classic)"
# 3. Selecciona scopes: ✅ repo, ✅ workflow
# 4. Copia el token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. Configurar Variables de Entorno

**En producción (Vercel dashboard):**
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO_OWNER=dahemar
GITHUB_REPO_NAME=sympaathy-v2
```

**En desarrollo local (.env):**
```bash
# Añade a backend/.env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO_OWNER=dahemar
GITHUB_REPO_NAME=sympaathy-v2
```

### 3. Probar el Sistema

**Opción A: Script de prueba (recomendado)**
```bash
cd backend
node test-github-trigger.js
```

Deberías ver:
```
✅ SUCCESS! Workflow triggered.
🎉 If you see a new workflow run, the integration is working!
```

**Opción B: Publicar un post de prueba**
```bash
# 1. Abre el CMS admin
# 2. Crea un post con título "Test Auto-Rebuild"
# 3. Marca "Published"
# 4. Guarda
# 5. Revisa los logs del backend:
#    [GitHub Rebuild] ✅ Triggered successfully
# 6. Abre: https://github.com/dahemar/sympaathy-v2/actions
# 7. Verifica que hay un nuevo workflow run
```

### 4. Verificar en Producción

```bash
# Espera 2-3 minutos y abre:
open https://sympaathy.vercel.app

# O verifica el JSON directamente:
curl -s https://sympaathy.vercel.app/posts_bootstrap.json | jq '.releases | length'
```

---

## 🔍 Comandos de Diagnóstico

### Verificar configuración local
```bash
cd backend
grep GITHUB_ .env
```

### Probar conectividad con GitHub API
```bash
export GITHUB_TOKEN="ghp_xxx"
export REPO="dahemar/sympaathy-v2"

curl -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     https://api.github.com/repos/$REPO
```

### Ver últimos workflows ejecutados
```bash
export GITHUB_TOKEN="ghp_xxx"
export REPO="dahemar/sympaathy-v2"

curl -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/repos/$REPO/actions/runs?per_page=5" \
     | jq '.workflow_runs[] | {id, name, status, conclusion, created_at}'
```

### Verificar workflow en el repo
```bash
cd /Users/david/Documents/GitHub/sympaathy-v2
cat .github/workflows/update_posts_bootstrap.yml | grep -A2 "repository_dispatch"
```

### Probar script de generación de bootstrap localmente
```bash
cd /Users/david/Documents/GitHub/sympaathy-v2
export CMS_API="https://cms-woad-delta.vercel.app"
export CMS_SITE_ID="2"
node scripts/generate_bootstrap.mjs
```

---

## 📊 Logs Esperados

### Backend CMS (al publicar)
```
[Backend POST /posts] ✅ Post created successfully: { id: 123, title: 'Test', published: true }
[GitHub Rebuild] ✅ Triggered successfully: {
  reason: 'post-created',
  repo: 'dahemar/sympaathy-v2',
  durationMs: 423,
  postId: 123,
  postTitle: 'Test'
}
```

### GitHub Actions (workflow)
```
Run node scripts/generate_bootstrap.mjs
✅ wrote public/posts_bootstrap.json (12345 bytes) from https://cms-woad-delta.vercel.app siteId=2

Run git add public/posts_bootstrap.json
[main abc1234] chore: update posts_bootstrap.json [skip ci]
 1 file changed, 1 insertion(+), 1 deletion(-)
```

---

## ⚠️ Troubleshooting Rápido

| Problema | Causa Probable | Solución |
|----------|----------------|----------|
| Workflow no se dispara | Variables de entorno no configuradas | Revisar `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` |
| "Resource not accessible" | Token sin permisos | Regenerar PAT con scopes `repo` + `workflow` |
| Workflow falla en "Generate" | CMS no accesible | Verificar `CMS_API` en secrets del repo |
| Contenido no aparece | Cache del CDN | Esperar 5-10 min o abrir con `?t=timestamp` |
| Test script falla | Token expirado | Regenerar PAT en GitHub |

---

## 🎛️ Configuraciones Opcionales

### Deshabilitar cron (solo trigger manual + CMS)

Editar `.github/workflows/update_posts_bootstrap.yml`:
```yaml
on:
  workflow_dispatch:
  repository_dispatch:
    types: [cms-content-updated]
  # schedule:  # ❌ Comentar esto para deshabilitar cron
  #   - cron: '*/15 * * * *'
```

### Cambiar frecuencia de cron (backup menos agresivo)
```yaml
schedule:
  - cron: '0 */6 * * *'  # Cada 6 horas en vez de cada 15 min
```

---

## 📚 Documentación Completa

Para detalles técnicos completos, ver:
- [GITHUB_ACTIONS_REBUILD_SETUP.md](GITHUB_ACTIONS_REBUILD_SETUP.md)

---

## ✨ Flujo Final

```
1. Usuario publica post en CMS
2. Backend guarda en DB
3. Backend dispara GitHub API (repository_dispatch)
4. GitHub Actions workflow se ejecuta automáticamente
5. Workflow genera nuevo posts_bootstrap.json
6. Workflow hace commit + push
7. Vercel detecta commit y hace auto-deploy
8. Sitio actualizado en ~2-3 minutos
```

---

**Última actualización:** 2026-01-18

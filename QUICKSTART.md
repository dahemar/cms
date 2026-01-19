# 🚀 Quick Start: Activar Prerender en GitHub Actions

## TL;DR

Este flujo permite que cuando publiques un post en el CMS, se dispare automáticamente un rebuild en los frontends (cineclub, sympaathy-v2) **sin comprometer archivos** en los repos frontend. Los artefactos generados se despliegan directamente a **Vercel**.

## ⚡ Activación Rápida (5 minutos)

### 1. Commit de Archivos

```bash
# CMS
cd /Users/david/Documents/GitHub/cms
git add scripts/prerender_for_actions.js \
        scripts/watch-actions.sh \
        scripts/test-prerender-flow.sh \
        GITHUB_ACTIONS_PRERENDER_SETUP.md \
        IMPLEMENTATION_SUMMARY.md \
        QUICKSTART.md
git commit -m "feat: implement Actions-based prerender"
git push

# Cineclub
cd /Users/david/Documents/GitHub/cineclub
git add .github/workflows/prerender-deploy.yml
git commit -m "feat: add prerender workflow"
git push

# Sympaathy-v2
cd /Users/david/Documents/GitHub/sympaathy-v2
git add .github/workflows/prerender-deploy.yml
git commit -m "feat: add prerender workflow"
git push
```

### 2. Configurar Secrets

```bash
# Cineclub
gh secret set CMS_API_URL --body "https://cms-woad-delta.vercel.app" --repo dahemar/cineclub
gh secret set CMS_SITE_ID --body "3" --repo dahemar/cineclub
gh secret set CMS_SECTION_ID --body "21" --repo dahemar/cineclub
gh secret set VERCEL_TOKEN --body "YOUR_VERCEL_TOKEN" --repo dahemar/cineclub

# Sympaathy-v2
gh secret set CMS_API_URL --body "https://cms-woad-delta.vercel.app" --repo dahemar/sympaathy-v2
gh secret set CMS_SITE_ID --body "2" --repo dahemar/sympaathy-v2
gh secret set VERCEL_TOKEN --body "YOUR_VERCEL_TOKEN" --repo dahemar/sympaathy-v2
```

**Obtener VERCEL_TOKEN:**
1. https://vercel.com/account/tokens
2. Create Token → Nombre: "GitHub Actions Deploy" → Scope: Full Account
3. Copiar el token generado

### 3. Prueba Manual

```bash
cd /Users/david/Documents/GitHub/cms
./scripts/test-prerender-flow.sh
```

O desde GitHub UI:
1. https://github.com/dahemar/cineclub/actions
2. Click "Prerender and Deploy to Pages"
3. "Run workflow" → Run

### 4. Verificar

```bash
# Ver runs
gh run list --repo dahemar/cineclub --limit 3

# Ver Vercel deployment (esperar ~1-2 min)
curl -I https://cineclub-theta.vercel.app/posts_bootstrap.json
curl -I https://sympaathy-v2.vercel.app/posts_bootstrap.json
```

## 🎬 Uso Diario

### Publicar un Post

1. Ir a http://localhost:8000/admin.html (o URL producción)
2. Crear/editar post
3. Click **Publish**
4. Backend automáticamente dispara workflows
5. ~2-3 minutos después: Vercel actualizado ✅

### Monitorear Progreso

```bash
# Terminal 1: ver logs backend
tail -f /tmp/cms-backend.log | grep "\[GitHub"

# Terminal 2: watch Actions runs
cd /Users/david/Documents/GitHub/cms
./scripts/watch-actions.sh --follow
```

### Debugging

Si un workflow falla:

```bash
# Ver logs del último run
gh run view --repo dahemar/cineclub --log

# O desde UI
# https://github.com/dahemar/cineclub/actions
```

## 📚 Más Info

- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Resumen completo
- [GITHUB_ACTIONS_PRERENDER_SETUP.md](GITHUB_ACTIONS_PRERENDER_SETUP.md) - Setup detallado
- [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) - Configurar GitHub App

## 🆘 Troubleshooting Rápido

### ❌ "Workflow no se dispara"

Verificar:
```bash
# Backend logs
grep "triggerFrontendRebuild" /tmp/cms-backend.log | tail

# GitHub App permisos
# https://github.com/settings/apps/cms-frontend-rebuild
# → Repository permissions → Actions: Read and write ✓
```

### ❌ "Workflow falla con 'CMS_API_URL not responding'"

```bash
# Verificar backend activo
curl -I https://cms-woad-delta.vercel.app/posts?limit=1

# Si falla, revisar logs Vercel
vercel logs --follow
```

### ❌ "Pages no actualiza"

```bash
# Verificar que workflow completó
gh run list --repo dahemar/cineclub --limit 1

# Si conclusión=success, verificar Vercel deployment
# Vercel dashboard: https://vercel.com/dahemar
# O usar CLI:
vercel ls --token YOUR_VERCEL_TOKEN
```

---

**¿Listo?** → Empezar por [paso 1](#1-commit-de-archivos) ⬆️

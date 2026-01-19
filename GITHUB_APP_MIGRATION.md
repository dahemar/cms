# Migración: PAT → GitHub App (Sin Downtime)

## Objetivo

Migrar del sistema actual de PATs permanentes a GitHub App con tokens efímeros, sin interrumpir el servicio.

## ¿Por qué migrar?

| Aspecto | PAT (Actual) | GitHub App (Nuevo) |
|---------|-------------|-------------------|
| Rotación | Manual cada 90 días | Automática cada ~1 hora |
| Múltiples repos | 1 PAT por repo | 1 App para todos |
| Seguridad | Token permanente expuesto | Tokens temporales + clave privada |
| Escalabilidad | Limitado a 50 repos | Ilimitado |
| Auditabilidad | Como usuario personal | Como bot identificado |

---

## Plan de Migración (5 pasos)

### Fase 1: Setup (sin tocar producción)

#### 1.1 Crear GitHub App

Ver [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) pasos 1-3:
- Crear App en GitHub
- Configurar permisos (Actions: Read & write)
- Descargar clave privada `.pem`
- Instalar App en repos frontend

**⏱️ Tiempo estimado:** 10 minutos

#### 1.2 Probar en local

```bash
cd backend

# Añadir variables de GitHub App a .env (mantener las de PAT también)
cat >> .env << EOF

# GitHub App (new)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_PATH=$(pwd)/cms-frontend-rebuild.*.private-key.pem
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_FRONTEND_REPOS=dahemar/sympaathy-v2
EOF

# Verificar que el backend carga correctamente
node --check index.js

# Ejecutar test
node test-github-app.js
```

**Resultado esperado:**
```
✅ All required variables configured
✅ JWT generated successfully
✅ Installation token obtained
✅ Successfully triggered 1 repo(s)
```

**⏱️ Tiempo estimado:** 5 minutos

---

### Fase 2: Deploy con Fallback (sin downtime)

#### 2.1 Añadir variables de entorno en producción

**En Vercel:**
```
Settings → Environment Variables → Add New

GITHUB_APP_ID = 123456
GITHUB_APP_PRIVATE_KEY = -----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n
GITHUB_APP_INSTALLATION_ID = 12345678
GITHUB_FRONTEND_REPOS = dahemar/sympaathy-v2

# MANTENER las variables de PAT (fallback):
GITHUB_TOKEN = ghp_xxx  # NO eliminar todavía
GITHUB_REPO_OWNER = dahemar
GITHUB_REPO_NAME = sympaathy-v2
```

**⚠️ Importante:**
- Usa el botón "Copy" en Vercel y pega el PEM completo con `\n`
- NO eliminar las variables de PAT todavía (funcionan como fallback)

**⏱️ Tiempo estimado:** 3 minutos

#### 2.2 Commitear y deployar código

```bash
git add backend/github-app.js backend/index.js
git commit -m "feat: add GitHub App support with PAT fallback"
git push
```

Vercel detectará el push y hará auto-deploy.

**⏱️ Tiempo estimado:** 2 minutos + tiempo de build (~1-2 min)

#### 2.3 Verificar logs de producción

Publica un post de prueba en el CMS y revisa los logs:

**Si GitHub App funciona:**
```
[GitHub Rebuild] ✅ Triggered 1 repo(s) via GitHub App
```

**Si GitHub App falla (fallback a PAT):**
```
[GitHub Rebuild] GitHub App failed, falling back to PAT: ...
[GitHub Rebuild] ✅ Triggered successfully (PAT)
```

**⚠️ Si ves el fallback:**
- Verifica que las variables de entorno están correctas en Vercel
- Revisa logs para el error específico
- El servicio sigue funcionando (con PAT) mientras arreglas

**⏱️ Tiempo estimado:** 5 minutos

---

### Fase 3: Validación (confirmar migración exitosa)

#### 3.1 Verificar workflow runs

Abre GitHub Actions:
```
https://github.com/dahemar/sympaathy-v2/actions
```

**Buscar:**
- Run reciente de "Update posts_bootstrap.json"
- Actor: `cms-frontend-rebuild[bot]` (no tu usuario)
- Triggered via `repository_dispatch`

**Si ves esto → Migración exitosa ✅**

#### 3.2 Publicar varios posts de prueba

- Crea 2-3 posts en el CMS
- Marca como "Published"
- Verifica que cada uno dispara un workflow automáticamente

**⏱️ Tiempo estimado:** 10 minutos

---

### Fase 4: Limpieza (opcional, eliminar PAT)

Una vez confirmado que GitHub App funciona al 100%:

#### 4.1 Eliminar variables de PAT en Vercel

```
Settings → Environment Variables → Delete:
  - GITHUB_TOKEN
  - GITHUB_REPO_OWNER
  - GITHUB_REPO_NAME
```

**⚠️ Solo después de confirmar que GitHub App funciona correctamente.**

#### 4.2 Revocar PAT en GitHub

```
https://github.com/settings/tokens
```

Busca el PAT usado para el CMS y click "Delete" o "Revoke".

#### 4.3 Remover código de fallback (opcional)

Si quieres limpiar completamente el código:

```javascript
// backend/index.js - Eliminar la sección de fallback PAT
```

Pero es recomendable **mantener el fallback** por si necesitas revertir rápidamente.

**⏱️ Tiempo estimado:** 5 minutos

---

### Fase 5: Escalar a Múltiples Frontends

#### 5.1 Añadir más repositorios

En Vercel, actualizar `GITHUB_FRONTEND_REPOS`:
```
GITHUB_FRONTEND_REPOS = dahemar/sympaathy-v2,dahemar/cineclub,dahemar/otro-frontend
```

#### 5.2 Instalar App en nuevos repos

Para cada repo nuevo:
```
https://github.com/settings/installations/12345678
→ Configure → Repository access → Add: dahemar/otro-frontend
```

#### 5.3 Verificar workflow en cada repo

Publica un post → verifica que **todos** los repos reciben el trigger.

Logs esperados:
```
[GitHub Rebuild] ✅ Triggered 3 repo(s) via GitHub App
```

**⏱️ Tiempo estimado:** 5 minutos por repo adicional

---

## Rollback Plan (si algo sale mal)

### Escenario 1: GitHub App no funciona en producción

**Síntomas:**
- Workflows no se disparan
- Logs muestran errores de GitHub App

**Acción inmediata:**
1. NO tocar nada — el fallback PAT ya está funcionando
2. Revisar logs de Vercel para identificar el error
3. Corregir variables de entorno si están mal configuradas
4. Si es urgente, eliminar variables de GitHub App temporalmente

**Downtime:** 0 (el PAT sigue funcionando)

### Escenario 2: Se eliminó PAT antes de confirmar GitHub App

**Síntomas:**
- No se disparan workflows
- No hay fallback

**Acción inmediata:**
1. Crear nuevo PAT rápidamente: `https://github.com/settings/tokens`
2. Añadir a Vercel: `GITHUB_TOKEN=ghp_xxx`
3. El sistema se recupera en <5 minutos

**Downtime:** ~5 minutos

### Escenario 3: Clave privada comprometida

**Síntomas:**
- Actividad sospechosa en GitHub Actions
- Alertas de seguridad

**Acción inmediata:**
1. Revocar clave privada: `https://github.com/settings/apps/cms-frontend-rebuild`
2. Generar nueva clave privada
3. Actualizar `GITHUB_APP_PRIVATE_KEY` en Vercel
4. Re-deploy (o esperar auto-deploy en siguiente push)

**Downtime:** ~10 minutos (mientras actualizas)

---

## Checklist de Migración

- [ ] Crear GitHub App
- [ ] Descargar clave privada `.pem`
- [ ] Instalar App en repo(s) frontend
- [ ] Obtener App ID, Installation ID
- [ ] Probar en local con `node test-github-app.js`
- [ ] Añadir variables de GitHub App en Vercel (mantener PAT)
- [ ] Commitear y deployar código
- [ ] Publicar post de prueba y verificar logs
- [ ] Verificar workflow run en GitHub (actor = bot)
- [ ] Repetir prueba 2-3 veces
- [ ] (Opcional) Eliminar variables de PAT en Vercel
- [ ] (Opcional) Revocar PAT en GitHub
- [ ] Documentar en equipo

---

## Tiempos Estimados

| Fase | Duración | Downtime |
|------|----------|----------|
| Setup | 15 min | 0 |
| Deploy con fallback | 10 min | 0 |
| Validación | 15 min | 0 |
| Limpieza | 10 min | 0 |
| **Total** | **~50 min** | **0** |

---

## FAQ

**¿Puedo mantener PAT y GitHub App al mismo tiempo?**  
Sí, el código usa GitHub App primero y hace fallback a PAT si falla. Ideal para migración gradual.

**¿Necesito permisos especiales para crear una GitHub App?**  
Solo necesitas ser admin/owner de tu cuenta de GitHub o de la org donde se instalará.

**¿Qué pasa si expiro el PAT antes de verificar GitHub App?**  
El código hace fallback, pero fallará. Recomendación: mantener PAT activo por 1 semana post-migración.

**¿Los workflows se disparan 2 veces (PAT + GitHub App)?**  
No, el código usa `return` después de GitHub App exitoso. Solo se usa PAT si GitHub App falla.

**¿Cómo sé si GitHub App está funcionando?**  
- Logs: `[GitHub Rebuild] ✅ Triggered X repo(s) via GitHub App`
- GitHub Actions: actor es `cms-frontend-rebuild[bot]` (no tu usuario)

---

## Soporte

Si encuentras problemas:
1. Revisar logs de Vercel/Railway
2. Ejecutar `node test-github-app.js` localmente para diagnosticar
3. Verificar variables de entorno (typos, formato incorrecto)
4. Consultar [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) → Troubleshooting

---

**Creado:** 2026-01-18  
**Última actualización:** 2026-01-18  
**Versión:** 1.0

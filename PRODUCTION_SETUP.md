# Production Setup Guide

Guía para configurar el CMS en producción (Vercel) con GitHub App y prerender automation.

## 1. Variables de Entorno en Vercel

### Paso 1: Acceder a Vercel Dashboard

1. Abre [vercel.com](https://vercel.com)
2. Selecciona el proyecto `cms`
3. Ve a **Settings** → **Environment Variables**

### Paso 2: Configurar Variables Requeridas

#### Variables de Base de Datos

```bash
# Database connection (ya configurada)
DATABASE_URL="postgresql://..."
```

#### Variables de Autenticación

```bash
# JWT & Session secrets (ya configuradas)
JWT_SECRET="..."
SESSION_SECRET="..."
```

#### Variables de GitHub App (NUEVAS)

```bash
# GitHub App ID
GITHUB_APP_ID=2681636

# GitHub App Installation ID (opcional, lo puebla el webhook)
GITHUB_APP_INSTALLATION_ID=104890890

# Webhook Secret (DEBE coincidir con GitHub App settings)
GITHUB_WEBHOOK_SECRET=9f3a1c7e5d2f08a4c6b7e9d1f2a3c4e5b6d7f809a1b2c3d4e5f6a7b8c9d0e1f2

# Private key como string (ver sección siguiente)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# Repos frontend para disparar rebuilds
GITHUB_FRONTEND_REPOS=dahemar/sympaathy-v2,dahemar/cineclub
```

#### Variables de Prerender (NUEVAS)

```bash
# Habilitar prerender automático en mutaciones
PRERENDER_ON_MUTATION=true

# Permitir prerender en producción
PRERENDER_ALLOW_PROD=true

# Debounce para batch prerender (ms)
PRERENDER_DEBOUNCE_MS=500
```

#### Variables de CORS

```bash
# Orígenes permitidos (actualizar con dominios de producción)
ALLOWED_ORIGINS=https://cms-woad-delta.vercel.app,https://dahemar.github.io
```

### Paso 3: Configurar GitHub App Private Key

⚠️ **IMPORTANTE**: En Vercel, el private key debe proporcionarse como **string multilínea**.

#### Opción A: Variable de entorno directa (RECOMENDADO)

1. Lee el archivo local:
   ```bash
   cat backend/cms-app-dhm.2026-01-18.private-key.pem
   ```

2. Copia TODO el contenido (incluido `-----BEGIN RSA PRIVATE KEY-----` y `-----END RSA PRIVATE KEY-----`)

3. En Vercel → Environment Variables:
   - **Name**: `GITHUB_APP_PRIVATE_KEY`
   - **Value**: Pega el contenido completo
   - ⚠️ Asegúrate de que las líneas **NO** tengan espacios extra al inicio/final

4. Guarda la variable

#### Opción B: Base64 encoded (alternativa)

Si Vercel tiene problemas con multiline strings:

```bash
# Encodear en base64
cat backend/cms-app-dhm.2026-01-18.private-key.pem | base64 > key.b64

# Añadir a Vercel como GITHUB_APP_PRIVATE_KEY_B64
# Luego en backend/github-app.js decodificar:
const privateKey = Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY_B64, 'base64').toString('utf-8');
```

#### Opción C: Vercel Secret File (más seguro)

Vercel no soporta archivos secretos directamente, pero puedes usar [Vercel Secrets](https://vercel.com/docs/cli/env):

```bash
# Instalar vercel CLI
npm i -g vercel

# Login
vercel login

# Añadir secret
vercel env add GITHUB_APP_PRIVATE_KEY < backend/cms-app-dhm.2026-01-18.private-key.pem
```

### Paso 4: Redeploy

Después de añadir las variables:

```bash
# Desde local
vercel --prod

# O desde Vercel Dashboard
# Deployments → Redeploy
```

---

## 2. Configurar Webhook en GitHub App

### Paso 1: Acceder a GitHub App Settings

1. Abre: `https://github.com/settings/apps/cms-frontend-rebuild`
2. Scroll a la sección **Webhook**

### Paso 2: Actualizar Webhook URL

```
Webhook URL: https://cms-woad-delta.vercel.app/github/webhook
```

⚠️ **IMPORTANTE**: Debe ser HTTPS (obligatorio por GitHub).

### Paso 3: Configurar Webhook Secret

En **Webhook secret**, pega el mismo valor que usaste en `GITHUB_WEBHOOK_SECRET` de Vercel:

```
9f3a1c7e5d2f08a4c6b7e9d1f2a3c4e5b6d7f809a1b2c3d4e5f6a7b8c9d0e1f2
```

### Paso 4: Activar Webhook

- ✅ Marcar **Active** (checkbox)
- **SSL verification**: Enabled (recomendado)

### Paso 5: Subscribe to Events

Seleccionar:
- ✅ **Installation** (cuando la App es instalada/desinstalada)
- ✅ **Installation repositories** (cuando se añaden/eliminan repos)

### Paso 6: Save Changes

Click **Save changes** al final de la página.

---

## 3. Verificar Instalación

### Paso 1: Verificar Installation ID

Después de instalar la App en tus repos:

```bash
# Local (si tienes el JSON)
cat backend/github_installation.json

# O llamar al endpoint de producción
curl https://cms-woad-delta.vercel.app/github/installation
```

Deberías ver algo como:

```json
{
  "installation_id": 104890890,
  "account": {
    "login": "dahemar",
    "type": "User"
  },
  "repos": [
    "dahemar/sympaathy-v2",
    "dahemar/cineclub"
  ],
  "installed_at": "2026-01-18T..."
}
```

### Paso 2: Probar Webhook Delivery

1. Ve a GitHub App → **Advanced** → **Recent Deliveries**
2. Deberías ver entregas con status **200 OK**
3. Si ves **401 Unauthorized**: revisar que `GITHUB_WEBHOOK_SECRET` coincida
4. Si ves **500 Internal Server Error**: revisar Vercel logs

---

## 4. Test End-to-End

### Paso 1: Publicar un Post

1. Abre: `https://cms-woad-delta.vercel.app/admin.html`
2. Login
3. Crear o editar un post
4. Click **Publish**

### Paso 2: Monitorear Logs Backend

```bash
# Ver logs de Vercel en tiempo real
vercel logs --follow

# O desde Vercel Dashboard
# Project → Deployments → [Latest] → View Function Logs
```

Buscar líneas como:

```
[Prerender] Starting prerender...
[Prerender] ✅ Wrote posts.html and posts_bootstrap.json
[GitHub Rebuild] Triggering rebuild for dahemar/sympaathy-v2
[GitHub Rebuild] Triggering rebuild for dahemar/cineclub
```

### Paso 3: Verificar GitHub Actions

1. Abre: `https://github.com/dahemar/sympaathy-v2/actions`
2. Deberías ver un workflow run reciente con trigger `repository_dispatch`
3. Status esperado: ✅ **Success**
4. Repetir para `dahemar/cineclub`

### Paso 4: Verificar Deploy en Pages

1. Cineclub: `https://dahemar.github.io/cineclub/`
2. Sympaathy: `https://dahemar.github.io/sympaathy-v2/`
3. Confirmar que el post publicado aparece en el frontend

---

## 5. Troubleshooting

### Webhook retorna 401 (Unauthorized)

**Causa**: Secret incorrecto.

**Solución**:
1. Verificar que `GITHUB_WEBHOOK_SECRET` en Vercel == secret en GitHub App
2. Regenerar secret si es necesario:
   ```bash
   openssl rand -hex 32
   ```
3. Actualizar en ambos lugares
4. Redeploy backend

### Webhook retorna 500 (Internal Server Error)

**Causa**: Error en el código backend.

**Solución**:
1. Ver logs de Vercel: `vercel logs`
2. Revisar errores de Prisma, permisos de escritura, etc.
3. Si usa `github_installation.json`, asegurarse de que Vercel puede escribir (usar DB en producción)

### GitHub Actions no se disparan

**Causa**: Falta permissions o installation token inválido.

**Solución**:
1. Verificar que GitHub App tiene permiso **Actions: Write** ✅
2. Verificar que `installation_id` es correcto:
   ```bash
   curl https://cms-woad-delta.vercel.app/github/installation
   ```
3. Revisar logs backend para ver respuestas de `repository_dispatch`

### Prerender no se ejecuta

**Causa**: Variables de entorno faltantes.

**Solución**:
1. Verificar en Vercel:
   - `PRERENDER_ON_MUTATION=true`
   - `PRERENDER_ALLOW_PROD=true`
2. Redeploy después de añadir variables

### Private Key inválida

**Causa**: Formato incorrecto en variable de entorno.

**Solución**:
1. Verificar que el string incluye `-----BEGIN RSA PRIVATE KEY-----` y `-----END RSA PRIVATE KEY-----`
2. Verificar que NO hay espacios extra
3. Probar con base64 encoding si el problema persiste

---

## 6. Configuración Avanzada

### Persistir Instalaciones en Base de Datos

Ver [MULTI_INSTALLATION_MIGRATION.md](MULTI_INSTALLATION_MIGRATION.md) para migrar `github_installation.json` a Prisma.

Ventajas:
- ✅ Soporta múltiples instalaciones
- ✅ Queries por repo
- ✅ No requiere permisos de escritura en filesystem

### Multi-Frontend Dispatch

El backend ya soporta múltiples repos frontend:

```bash
GITHUB_FRONTEND_REPOS=dahemar/sympaathy-v2,dahemar/cineclub,dahemar/otro-repo
```

Cada repo debe tener:
1. Workflow con trigger `repository_dispatch`
2. Event type: `cms-content-updated`
3. Permisos Actions configurados

---

## 7. Checklist de Producción

- [ ] Variables de entorno configuradas en Vercel
- [ ] `GITHUB_APP_PRIVATE_KEY` añadida correctamente
- [ ] Webhook URL apunta a producción
- [ ] Webhook secret coincide en GitHub App y Vercel
- [ ] GitHub App instalada en repos frontend
- [ ] Workflows frontend tienen `repository_dispatch` trigger
- [ ] Permisos Actions: `id-token: write`, `contents: read`, `pages: write`
- [ ] Test end-to-end: publish → prerender → dispatch → deploy
- [ ] Recent Deliveries muestra 200 OK
- [ ] Logs backend muestran prerender y dispatch exitosos
- [ ] Frontend desplegado en Pages con contenido actualizado

---

## 8. Próximos Pasos

1. **Monitoreo**: Configurar alertas en Vercel para errores 5xx
2. **Multi-install**: Migrar a Prisma para soportar múltiples instalaciones
3. **Rollback**: Implementar estrategia de rollback si prerender falla
4. **Rate limiting**: Añadir rate limiting a `/github/webhook` endpoint
5. **Logs estructurados**: Usar un logger como Winston/Pino para mejor debugging

---

📚 **Documentación relacionada:**
- [GITHUB_WEBHOOK_TESTING.md](GITHUB_WEBHOOK_TESTING.md) - Testing local con ngrok
- [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) - Crear GitHub App desde cero
- [GITHUB_APP_MIGRATION.md](GITHUB_APP_MIGRATION.md) - Migrar de PAT a GitHub App

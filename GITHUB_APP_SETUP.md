# GitHub App Setup: Tokens Efímeros y Multi-Frontend

## 🎯 Objetivo

Reemplazar PATs permanentes con tokens de instalación efímeros (~1 hora) que se regeneran automáticamente. Permite escalar a múltiples frontends sin crear PATs individuales.

## Ventajas vs PAT

| Característica | PAT (Personal Access Token) | GitHub App |
|----------------|----------------------------|-----------|
| **Rotación** | Manual (90 días) | Automática (~1 hora) |
| **Escalabilidad** | 1 PAT por repo (max 50) | 1 App para todos los repos |
| **Permisos** | Amplios (repo entero) | Granulares por recurso |
| **Auditabilidad** | Como usuario personal | Como App separada |
| **Revocación** | Manual en Settings | Desinstalar App |
| **Exposición** | Token permanente en env vars | Clave privada + tokens temporales |

---

## Paso 1: Crear GitHub App

### 1.1 Acceder a la UI

```
https://github.com/settings/apps
```

O navega manualmente:
- Settings → Developer settings → GitHub Apps → **New GitHub App**

### 1.2 Configuración Básica

**GitHub App name**
```
cms-frontend-rebuild
```
*(Debe ser único globalmente)*

**Description**
```
Automatically rebuilds frontend sites when CMS content is published
```

**Homepage URL**
```
https://cms-woad-delta.vercel.app
```
*(URL de tu CMS o placeholder si no tienes)*

### 1.3 Callback URL (Opcional)

Si NO usas OAuth flow (solo API):
- Deja **Callback URL** vacío
- Desactiva **Request user authorization (OAuth) during installation**

### 1.4 Webhook (Opcional)

Si quieres recibir eventos push/star/etc del frontend en el CMS:
- **Webhook URL**: `https://cms-woad-delta.vercel.app/webhooks/github`
- **Webhook secret**: genera uno con `openssl rand -hex 20`
- **Active**: ✅

Para el flujo actual (CMS → GitHub), NO es necesario webhook.

### 1.5 Permisos Mínimos

**Repository permissions:**

| Permiso | Nivel | Razón |
|---------|-------|-------|
| **Actions** | Read & write | Disparar workflows con `repository_dispatch` |
| **Contents** | Read & write | (Opcional) Hacer commit de `posts_bootstrap.json` directamente |
| **Metadata** | Read-only | Acceso básico al repo (siempre requerido) |

**Account permissions:**  
*(Dejar todo en blanco o Read-only)*

**Where can this GitHub App be installed?**
- ✅ **Only on this account** (recomendado para uso privado)
- O **Any account** si planeas compartir/vender la App

### 1.6 Crear y Descargar Clave Privada

1. Click **Create GitHub App**
2. En la página de la App recién creada, scroll hasta **Private keys**
3. Click **Generate a private key**
4. Se descarga un archivo `.pem` (ej. `cms-frontend-rebuild.2024-01-18.private-key.pem`)

**⚠️ IMPORTANTE:**
- Guarda el `.pem` de forma segura (no commitear al repo)
- Solo se puede descargar una vez
- Si lo pierdes, genera uno nuevo (revoca el anterior)

---

## Paso 2: Instalar App en Repositorios

### 2.1 Instalar en sympaathy-v2

1. Abre la App: `https://github.com/settings/apps/cms-frontend-rebuild`
2. Click **Install App** (sidebar izquierdo)
3. Selecciona la cuenta/organización (ej. `dahemar`)
4. Selecciona:
   - ✅ **Only select repositories**
   - Añade: `dahemar/sympaathy-v2`
5. Click **Install**

### 2.2 Instalar en Futuros Frontends

Repite el paso 2.1 para cada repo frontend nuevo (ej. `cineclub`, `otro-frontend`).

Alternativamente, edita la instalación existente:
- Settings → Applications → Installed GitHub Apps → `cms-frontend-rebuild` → **Configure**
- Añade más repositorios

### 2.3 Obtener Installation ID

Necesitas el `installation_id` para tu código. Obtenerlo:

**Opción A: Desde la URL**
```
https://github.com/settings/installations/12345678
                                         ^^^^^^^^
```
El número en la URL es tu `installation_id`.

**Opción B: Via API**
```bash
# Requiere un JWT temporal (ver sección siguiente)
curl -H "Authorization: Bearer YOUR_JWT" \
     -H "Accept: application/vnd.github+json" \
     https://api.github.com/app/installations

# Respuesta:
[
  {
    "id": 12345678,
    "account": { "login": "dahemar" },
    "repository_selection": "selected",
    ...
  }
]
```

**Opción C: Desde el webhook (si configuraste)**
El payload del evento `installation.created` incluye `installation.id`.

---

## Paso 3: Configurar Variables de Entorno

### 3.1 Obtener App ID

Abre tu App: `https://github.com/settings/apps/cms-frontend-rebuild`

En la parte superior verás:
```
App ID: 123456
```

### 3.2 Preparar Clave Privada

El archivo `.pem` descargado tiene formato:
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...
-----END RSA PRIVATE KEY-----
```

**Para variables de entorno:**
- Opción A: Pasar la ruta al archivo `.pem`
- Opción B: Convertir a string con `\n` preservado

```bash
# Convertir a string de una línea (para env var)
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' cms-frontend-rebuild.*.private-key.pem
```

### 3.3 Variables Requeridas

**En desarrollo local (`backend/.env`):**
```bash
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_PATH=/absolute/path/to/cms-frontend-rebuild.2024-01-18.private-key.pem
# O alternativamente (si no usas _PATH):
# GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"

GITHUB_APP_INSTALLATION_ID=12345678

# Frontend repos a actualizar (separados por coma)
GITHUB_FRONTEND_REPOS=dahemar/sympaathy-v2,dahemar/cineclub
```

**En producción (Vercel/Railway):**
```bash
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_FRONTEND_REPOS=dahemar/sympaathy-v2,dahemar/cineclub
```

**⚠️ Seguridad:**
- NO commitear `.pem` al repositorio
- En Vercel, usar **Environment Variables** (no expuestas al cliente)
- Añadir `.pem` a `.gitignore`

---

## Paso 4: Código de Integración

El backend necesita:
1. Generar JWT usando App ID + clave privada
2. Intercambiar JWT por installation token
3. Usar installation token para `repository_dispatch`

Ver `backend/github-app.js` para implementación completa.

---

## Paso 5: Probar la Integración

```bash
cd backend
node test-github-app.js
```

Deberías ver:
```
🧪 Testing GitHub App Integration
✅ JWT generated successfully
✅ Installation token obtained (expires in 3600s)
✅ Triggered workflow in dahemar/sympaathy-v2
```

---

## Paso 6: Verificar en GitHub

1. Abre: `https://github.com/dahemar/sympaathy-v2/actions`
2. Busca un nuevo workflow run de `Update posts_bootstrap.json`
3. En los logs, verifica que el actor es `cms-frontend-rebuild[bot]` (no tu usuario)

---

## Flujo Completo

```
┌──────────────────┐
│  CMS Backend     │
│  (Node.js)       │
└────────┬─────────┘
         │
         │ 1. Genera JWT con App ID + clave privada
         ▼
┌──────────────────────────────────────┐
│  GitHub API                          │
│  POST /app/installations/:id/access_tokens │
└────────┬─────────────────────────────┘
         │
         │ 2. Retorna installation token (1 hora TTL)
         ▼
┌──────────────────────────────────────┐
│  POST /repos/:owner/:repo/dispatches │
│  Authorization: Bearer <token>       │
└────────┬─────────────────────────────┘
         │
         │ 3. Dispara workflow con event_type
         ▼
┌──────────────────┐
│  GitHub Actions  │
│  (sympaathy-v2)  │
└────────┬─────────┘
         │
         │ 4. Ejecuta update_posts_bootstrap.yml
         ▼
┌──────────────────┐
│  Vercel Deploy   │
└──────────────────┘
```

---

## Troubleshooting

### Error: "Could not verify JWT"

**Causa:**  
- Clave privada incorrecta
- App ID incorrecto
- Tiempo del sistema desincronizado

**Solución:**
```bash
# Verificar tiempo del sistema
date

# Re-descargar clave privada desde GitHub
# Verificar que el App ID coincide
```

### Error: "Resource not accessible by integration"

**Causa:**  
- La App no tiene permisos `Actions: Read & write`
- La App no está instalada en el repo destino

**Solución:**
1. Verifica permisos: `https://github.com/settings/apps/cms-frontend-rebuild`
2. Verifica instalación: `https://github.com/settings/installations`
3. Re-instala la App si es necesario

### Error: "Installation not found"

**Causa:**  
- `GITHUB_APP_INSTALLATION_ID` incorrecto
- La App fue desinstalada

**Solución:**
```bash
# Obtener installation ID correcto
curl -H "Authorization: Bearer YOUR_JWT" \
     https://api.github.com/app/installations | jq '.[0].id'
```

### Token expira muy rápido

**Causa:**  
- Los installation tokens expiran en ~1 hora (por diseño)

**Solución:**  
- El backend debe regenerar el token en cada request
- NO cachear el installation token por más de 50 minutos
- El código en `github-app.js` ya maneja esto automáticamente

---

## Migración desde PAT

Si ya tienes PATs configurados:

1. Mantén el PAT como fallback:
   ```javascript
   const token = await getGitHubAppToken() || process.env.GITHUB_TOKEN
   ```

2. Prueba la GitHub App en staging primero

3. Una vez verificado, elimina el PAT de env vars

4. Revoca el PAT en GitHub Settings

Ver `GITHUB_APP_MIGRATION.md` para guía detallada.

---

## Mantenimiento

### Rotar Clave Privada

1. Genera nueva clave en `https://github.com/settings/apps/cms-frontend-rebuild`
2. Descarga el nuevo `.pem`
3. Actualiza `GITHUB_APP_PRIVATE_KEY` en Vercel/Railway
4. Revoca la clave antigua (opcional, se recomienda)

Frecuencia recomendada: cada 6-12 meses.

### Monitorear Uso

Dashboard de la App:
```
https://github.com/settings/apps/cms-frontend-rebuild/advanced
```

Aquí puedes ver:
- Requests por hora
- Errores de autenticación
- Instalaciones activas

---

## Documentos Relacionados

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [Authenticating as a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [Installation Access Tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)

---

**Creado:** 2026-01-18  
**Autor:** GitHub Copilot  
**Versión:** 1.0

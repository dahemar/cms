# GitHub Webhook Testing Guide

Guía completa para probar el webhook de GitHub App localmente y en producción.

## Requisitos Previos

- Backend del CMS configurado con `GITHUB_WEBHOOK_SECRET`
- GitHub App creada (ver [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md))
- `ngrok` instalado para pruebas locales (opcional)

## 1. Generar Webhook Secret

```bash
# Generar un secret aleatorio seguro (32 bytes = 64 caracteres hex)
openssl rand -hex 32
```

Añadir a `backend/.env`:

```env
GITHUB_WEBHOOK_SECRET=tu_secret_generado_aqui
```

⚠️ **IMPORTANTE**: Este secret DEBE coincidir con el secret configurado en GitHub App settings.

## 2. Pruebas Locales (Sin ngrok)

### 2.1 Ejecutar el Script de Prueba

```bash
cd backend
node test-webhook.js
```

El script:
- ✅ Genera payloads simulados de eventos `installation` y `installation_repositories`
- ✅ Calcula la firma HMAC SHA-256 correcta
- ✅ Envía POST a `http://localhost:3000/github/webhook`
- ✅ Verifica respuestas 200 OK y 401 Unauthorized (firma inválida)
- ✅ Lee el contenido almacenado vía GET `/github/installation`

### 2.2 Verificar Datos Almacenados

Después de ejecutar el test, revisar el archivo creado:

```bash
cat backend/github_installation.json
```

Deberías ver algo como:

```json
{
  "installation_id": 99999999,
  "account": {
    "login": "test-user",
    "type": "User"
  },
  "installed_at": "2026-01-18T...",
  "repos": ["test-user/test-repo", "test-user/another-repo"]
}
```

### 2.3 Probar con curl Manual

```bash
# Generar payload
PAYLOAD='{"action":"created","installation":{"id":12345678}}'

# Calcular firma (requiere el secret)
SECRET="tu_secret_aqui"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Enviar request
curl -X POST http://localhost:3000/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: installation" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"

# Respuesta esperada: ok (200)
```

## 3. Pruebas con ngrok (URL Pública Temporal)

### 3.1 Instalar ngrok

```bash
# macOS
brew install ngrok

# O descarga desde: https://ngrok.com/download
```

### 3.2 Exponer Backend Localmente

```bash
# Terminal 1: Ejecutar backend
cd backend
node index.js

# Terminal 2: Exponer puerto 3000
ngrok http 3000
```

ngrok mostrará algo como:

```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

⚠️ Copia la URL HTTPS (importante: debe ser HTTPS, no HTTP).

### 3.3 Configurar Webhook en GitHub App

1. Abre tu GitHub App: `https://github.com/settings/apps/cms-frontend-rebuild`
2. Scroll a **Webhook**:
   - **Webhook URL**: `https://abc123.ngrok.io/github/webhook`
   - **Webhook secret**: El secret de tu `.env` (el mismo que usaste en `openssl rand -hex 32`)
   - **Active**: ✅ Activar
3. En **Subscribe to events**, seleccionar:
   - ✅ `Installation` (installation events)
   - ✅ `Installation repositories` (when repos are added/removed)
4. **Save changes**

### 3.4 Probar con "Deliver Test Payload"

1. En la GitHub App settings, scroll a **Recent Deliveries** (parte inferior)
2. Click **Deliver test payload** (o espera a que la App sea instalada/desinstalada)
3. GitHub enviará un payload real a tu ngrok URL

Verifica en:
- **ngrok inspector**: `http://127.0.0.1:4040` (ver requests recibidos)
- **Backend logs**: deben mostrar `[Webhook] Received event=installation`
- **Archivo local**: `backend/github_installation.json` debe contener el `installation.id` real

### 3.5 Depuración con ngrok Inspector

Abre `http://127.0.0.1:4040` en tu navegador:

- Ver todos los requests HTTP recibidos por ngrok
- Inspeccionar headers (incluido `X-Hub-Signature-256`)
- Ver payload completo enviado por GitHub
- Replay requests para depuración

## 4. Producción (Vercel / Railway / etc.)

### 4.1 Configurar Webhook en GitHub App

Una vez desplegado el backend en producción:

1. GitHub App settings → Webhook URL: `https://cms-woad-delta.vercel.app/github/webhook`
2. Secret: mismo valor que `GITHUB_WEBHOOK_SECRET` en las env vars de Vercel
3. Active: ✅

### 4.2 Variables de Entorno en Vercel

```bash
# Vercel Dashboard → Settings → Environment Variables
GITHUB_WEBHOOK_SECRET=tu_secret_aqui
```

O con CLI:

```bash
vercel env add GITHUB_WEBHOOK_SECRET
# Pegar el secret cuando lo pida
```

### 4.3 Verificar Entregas

1. GitHub App → Recent Deliveries
2. Ver status codes:
   - ✅ 200 OK: webhook recibido correctamente
   - ❌ 401 Unauthorized: firma inválida (secret incorrecto)
   - ❌ 500 Internal Server Error: revisar logs de Vercel

## 5. Eventos Soportados

### installation

Disparado cuando:
- La App es **instalada** en una cuenta/organización
- La App es **desinstalada**
- Los permisos de la App son modificados

Payload: `payload.installation.id` → se guarda automáticamente en `backend/github_installation.json`

### installation_repositories

Disparado cuando:
- Se añaden repositorios a la instalación
- Se eliminan repositorios de la instalación

Payload:
- `payload.repositories_added` → se añaden a `repos[]`
- `payload.repositories_removed` → se eliminan de `repos[]`

## 6. Seguridad

### Verificación de Firma

El endpoint `/github/webhook` **SIEMPRE** verifica la firma HMAC:

```javascript
const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(req.body).digest('hex');
if (`sha256=${hmac}` !== req.headers['x-hub-signature-256']) {
  return res.status(401).send('invalid signature');
}
```

Sin firma válida → **401 Unauthorized**

### Rotación de Secret

Si necesitas rotar el webhook secret:

1. Generar nuevo secret: `openssl rand -hex 32`
2. Actualizar en GitHub App settings
3. Actualizar en backend `.env` / Vercel env vars
4. Restart backend (Vercel se redeploy automáticamente)

⚠️ **Durante la rotación**: algunos webhooks pueden fallar (GitHub reintentará automáticamente).

## 7. Multi-Frontend / Multi-Installation

### Futuro: Múltiples Instalaciones

Si planeas instalar la App en múltiples cuentas/organizaciones:

1. Cada instalación tendrá un `installation.id` único
2. El webhook recibirá eventos de **todas** las instalaciones
3. Puedes persistir múltiples installations:

```json
{
  "installations": [
    {
      "installation_id": 12345678,
      "account": "user1",
      "repos": ["user1/repo-a"]
    },
    {
      "installation_id": 87654321,
      "account": "org2",
      "repos": ["org2/repo-b", "org2/repo-c"]
    }
  ]
}
```

4. Seleccionar installation id correcto según el repo al que quieres disparar workflow

## 8. Troubleshooting

### Webhook retorna 401 (Invalid signature)

- ✅ Verificar que `GITHUB_WEBHOOK_SECRET` en backend == secret en GitHub App
- ✅ Verificar que el body NO es parseado como JSON antes de calcular HMAC (debe ser raw)
- ✅ Regenerar secret y actualizar en ambos lugares

### Webhook retorna 500 (Internal Server Error)

- ✅ Revisar logs del backend: `vercel logs` o logs locales
- ✅ Verificar permisos de escritura en `backend/github_installation.json` (o usar DB en prod)

### GitHub dice "We couldn't deliver this payload"

- ✅ Verificar que la URL webhook es HTTPS (obligatorio)
- ✅ Verificar que el backend está accesible públicamente
- ✅ Revisar firewall / security groups (debe permitir GitHub IPs)

### ngrok session expira

ngrok free tier expira la URL cada vez que reinicias. Opciones:

- Pagar por ngrok (URL persistente)
- Usar [localtunnel](https://localtunnel.github.io/www/) (alternativa gratuita)
- Desplegar a Vercel/Railway directamente (recomendado para pruebas frecuentes)

## 9. Comandos de Referencia Rápida

```bash
# Generar secret
openssl rand -hex 32

# Probar webhook localmente
cd backend && node test-webhook.js

# Exponer con ngrok
ngrok http 3000

# Ver installation almacenada
curl http://localhost:3000/github/installation

# Ver logs de Vercel
vercel logs --follow
```

## 10. Próximos Pasos

Una vez verificado que el webhook funciona:

1. ✅ Instalar la GitHub App en los repos de producción
2. ✅ Verificar que `installation.id` se guarda automáticamente
3. ✅ Probar trigger de rebuild: publicar un post → verificar que se dispara workflow
4. ✅ Opcional: migrar persistencia de archivo JSON a base de datos (Prisma)

---

📚 **Documentación relacionada:**
- [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) - Crear GitHub App
- [GITHUB_APP_MIGRATION.md](GITHUB_APP_MIGRATION.md) - Migrar de PAT a App
- [test-webhook.js](backend/test-webhook.js) - Script de pruebas local

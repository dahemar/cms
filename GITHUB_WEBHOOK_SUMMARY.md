# GitHub Webhook Implementation Summary

✅ **Implementación completada** - Webhook seguro para GitHub App configurado

## Archivos Modificados/Creados

### Backend
- ✅ `backend/index.js` - Añadido endpoint `POST /github/webhook` con verificación HMAC
- ✅ `backend/index.js` - Añadido endpoint `GET /github/installation` para inspección
- ✅ `backend/github-app.js` - Añadido fallback para leer installation.id desde archivo
- ✅ `backend/.env.example` - Añadido `GITHUB_WEBHOOK_SECRET`
- ✅ `backend/test-webhook.js` - Script de pruebas local con generación de firmas
- ✅ `backend/github_installation.json` - Archivo de persistencia (se crea automáticamente)

### Documentación
- ✅ `GITHUB_WEBHOOK_TESTING.md` - Guía completa de testing y configuración

## Funcionalidades Implementadas

### 1. Endpoint POST /github/webhook
- ✅ Verifica `X-Hub-Signature-256` con `GITHUB_WEBHOOK_SECRET`
- ✅ Procesa eventos `installation` y `installation_repositories`
- ✅ Persiste `installation.id` en `backend/github_installation.json`
- ✅ Actualiza lista de repos cuando se añaden/eliminan
- ✅ Idempotente (no reescribe si el ID no cambia)
- ✅ Responde 200 OK / 401 Unauthorized / 500 Internal Error

### 2. Endpoint GET /github/installation
- ✅ Devuelve installation data almacenada
- ✅ Incluye: installation_id, account, installed_at, repos[]
- ✅ Útil para debugging y verificación

### 3. Persistencia de Installation ID
- ✅ Archivo JSON local: `backend/github_installation.json`
- ✅ `github-app.js` lee automáticamente si env var no está presente
- ✅ Permisos seguros (0o600)
- ✅ Estructura escalable para múltiples installations futuras

### 4. Test Script Local
- ✅ Genera payloads simulados de installation events
- ✅ Calcula firmas HMAC correctamente
- ✅ Prueba casos válidos e inválidos
- ✅ Verifica datos almacenados vía GET endpoint

## Seguridad

✅ **Verificación de firma obligatoria** - Sin firma válida → 401
✅ **Secret no expuesto** - Solo en .env y GitHub App settings
✅ **Archivo con permisos restrictivos** - chmod 600 en github_installation.json
✅ **Body raw para HMAC** - express.raw middleware para verificación correcta

## Próximos Pasos

### Paso 1: Configurar Secret
```bash
# Generar secret
openssl rand -hex 32

# Añadir a backend/.env
echo "GITHUB_WEBHOOK_SECRET=tu_secret_aqui" >> backend/.env
```

### Paso 2: Probar Localmente
```bash
cd backend
node test-webhook.js
```

Resultado esperado:
- ✅ 3 tests passed (installation, installation_repositories, invalid signature)
- ✅ Archivo `backend/github_installation.json` creado
- ✅ GET /github/installation devuelve datos

### Paso 3: Probar con ngrok (Opcional)
```bash
# Terminal 1
cd backend && node index.js

# Terminal 2
ngrok http 3000
```

Configurar en GitHub App:
- Webhook URL: `https://abc123.ngrok.io/github/webhook`
- Secret: mismo de .env
- Events: installation, installation_repositories

### Paso 4: Desplegar a Producción
```bash
# Vercel
vercel env add GITHUB_WEBHOOK_SECRET
# Pegar el secret

# Deploy
vercel --prod
```

Configurar en GitHub App:
- Webhook URL: `https://cms-woad-delta.vercel.app/github/webhook`

### Paso 5: Instalar la App
1. Ve a tu repo frontend (ej. sympaathy-v2)
2. Settings → Integrations → GitHub Apps
3. Instala "CMS Frontend Rebuild"
4. Selecciona repositorios
5. El webhook recibirá el evento automáticamente
6. Verifica: `curl https://cms-woad-delta.vercel.app/github/installation`

## Testing Checklist

- [ ] Secret generado y configurado en .env
- [ ] Backend ejecutándose localmente
- [ ] `node backend/test-webhook.js` pasa todos los tests
- [ ] Archivo `backend/github_installation.json` creado
- [ ] GET /github/installation devuelve datos
- [ ] ngrok expone webhook públicamente (opcional)
- [ ] GitHub App configurada con webhook URL
- [ ] "Deliver test payload" desde GitHub funciona (200 OK)
- [ ] Secret configurado en Vercel/producción
- [ ] Webhook en producción recibe eventos correctamente
- [ ] Installation ID se guarda automáticamente al instalar App

## Comandos de Referencia

```bash
# Generar secret
openssl rand -hex 32

# Probar localmente
cd backend && node test-webhook.js

# Ver installation almacenada
curl http://localhost:3000/github/installation

# Exponer con ngrok
ngrok http 3000

# Verificar sintaxis
node --check backend/index.js
node --check backend/github-app.js
node --check backend/test-webhook.js

# Ver logs de Vercel
vercel logs --follow
```

## Arquitectura

```
┌─────────────┐
│   GitHub    │
│     App     │
└──────┬──────┘
       │ webhook event (installation, installation_repositories)
       │ X-Hub-Signature-256: sha256=...
       ▼
┌──────────────────────┐
│  POST /github/webhook│ ◄── Verifica firma HMAC
│   (backend/index.js) │
└──────────┬───────────┘
           │ persiste installation.id
           ▼
┌─────────────────────────────┐
│ github_installation.json    │ ◄── Archivo local (o DB en futuro)
│ {                           │
│   "installation_id": 123,   │
│   "repos": ["owner/repo"]   │
│ }                           │
└─────────────┬───────────────┘
              │ leído por
              ▼
┌──────────────────────────────┐
│  github-app.js               │
│  getInstallationToken()      │ ◄── Usa installation.id para obtener token
└──────────────┬───────────────┘
               │ token efímero (~1h)
               ▼
┌──────────────────────────────┐
│  GitHub API                  │
│  POST /repos/.../dispatches  │ ◄── Dispara workflow en frontend
└──────────────────────────────┘
```

## Ventajas de Esta Implementación

✅ **Automático** - No más configurar installation.id manualmente
✅ **Escalable** - Añadir nuevos frontends = solo instalar la App
✅ **Seguro** - Firma verificada, secret rotable, tokens efímeros
✅ **Debuggeable** - Endpoint de inspección, logs, test script
✅ **Idempotente** - Webhooks duplicados no causan problemas
✅ **Multi-frontend ready** - Estructura preparada para múltiples instalaciones

## Troubleshooting

### 401 Unauthorized
- Verificar que `GITHUB_WEBHOOK_SECRET` coincide con GitHub App
- Regenerar secret y actualizar en ambos lados

### 500 Internal Server Error
- Revisar logs: `vercel logs` o consola local
- Verificar permisos de escritura en `backend/github_installation.json`

### Webhook no llega
- Verificar URL es HTTPS (obligatorio)
- Verificar backend está accesible públicamente
- Probar con ngrok primero

### Installation ID no se guarda
- Verificar que evento `installation` está suscrito en GitHub App
- Probar con test script local primero
- Revisar logs del webhook handler

---

📚 **Documentación relacionada:**
- [GITHUB_WEBHOOK_TESTING.md](GITHUB_WEBHOOK_TESTING.md) - Testing completo
- [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md) - Setup inicial
- [GITHUB_APP_MIGRATION.md](GITHUB_APP_MIGRATION.md) - Migración desde PAT

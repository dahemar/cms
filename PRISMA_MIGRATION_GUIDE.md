# Migración a Prisma: GitHub Installations

Esta guía explica cómo migrar los datos de instalación de GitHub App desde `github_installation.json` a la base de datos usando Prisma.

## ¿Por Qué Migrar?

- **Multi-instalación**: soportar múltiples instalaciones de la App en diferentes cuentas/orgs
- **Persistencia**: datos en DB en lugar de archivo local que se puede perder
- **Escalabilidad**: queries eficientes para seleccionar la instalación correcta por repo
- **Producción**: Vercel no persiste archivos entre deployments

## Estado Actual

✅ **Modelo `GitHubInstallation` ya existe** en `prisma/schema.prisma`:

```prisma
model GitHubInstallation {
  id              Int      @id @default(autoincrement())
  installationId  BigInt   @unique
  accountLogin    String
  accountType     String
  repos           Json
  installedAt     DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([installationId])
  @@index([accountLogin])
}
```

✅ **Código adaptado** en `backend/github-app.js` y `backend/index.js` para usar Prisma con fallback a JSON.

## Pasos de Migración

### 1. Verificar Prisma Client Actualizado

```bash
cd /Users/david/Documents/GitHub/cms/backend
npm install @prisma/client
npx prisma generate
```

### 2. Ejecutar Script de Migración

```bash
node /Users/david/Documents/GitHub/cms/scripts/migrate_installations_to_prisma.js
```

El script:
- ✅ Lee `backend/github_installation.json`
- ✅ Crea/actualiza registro en tabla `GitHubInstallation`
- ✅ Renombra archivo original a `github_installation.json.migrated` (backup)

**Salida esperada:**
```
🔄 Migrando instalaciones de GitHub a Prisma...

📄 Datos encontrados:
   Installation ID: 104890890
   Account: dahemar
   Repos: 2

✅ Instalación creada en DB
   ID interno: 1
   Installation ID: 104890890

📦 Archivo original renombrado a:
   /Users/david/Documents/GitHub/cms/backend/github_installation.json.migrated

🎉 Migración completada!
```

### 3. Verificar en DB

```bash
cd backend
npx prisma studio
```

O con query directa:

```bash
cd backend
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.gitHubInstallation.findMany().then(console.log).then(() => prisma.\$disconnect())"
```

### 4. Reiniciar Backend

```bash
# Local
pkill -f "node index.js"
cd backend
node index.js > /tmp/cms-backend.log 2>&1 &

# Producción (Vercel)
vercel --prod
# O via GitHub: git push → auto-deploy
```

### 5. Verificar Endpoint

```bash
# Local
curl http://localhost:3000/github/installation

# Producción
curl https://cms-woad-delta.vercel.app/github/installation
```

**Respuesta esperada:**
```json
{
  "installation_id": "104890890",
  "account": {
    "login": "dahemar",
    "type": "User"
  },
  "repos": ["dahemar/cineclub", "dahemar/sympaathy-v2"],
  "installed_at": "2026-01-18T..."
}
```

## Flujo Post-Migración

### Webhook → Prisma

Cuando GitHub envía un webhook:

```javascript
// backend/index.js
app.post('/github/webhook', async (req, res) => {
  // ...validación HMAC...
  
  if (event === 'installation') {
    await prisma.gitHubInstallation.upsert({
      where: { installationId: BigInt(installation.id) },
      update: { /* ... */ },
      create: { /* ... */ }
    });
  }
});
```

### GetInstallationToken → Prisma

```javascript
// backend/github-app.js
async function getInstallationToken() {
  // 1. Try env var
  let INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;
  
  // 2. Try Prisma DB
  if (!INSTALLATION_ID) {
    const installation = await prisma.gitHubInstallation.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    if (installation) {
      INSTALLATION_ID = installation.installationId.toString();
    }
  }
  
  // 3. Fallback to JSON (legacy)
  // ...
}
```

## Variables de Entorno

### Local (.env)

```bash
# Opcional: si solo tienes una instalación
GITHUB_APP_INSTALLATION_ID=104890890
```

### Producción (Vercel)

Si usas una sola instalación, añadir en Vercel Dashboard:

```bash
GITHUB_APP_INSTALLATION_ID=104890890
```

Esto evita queries innecesarias a la DB.

## Multi-Instalación (Futuro)

Si instalas la App en múltiples cuentas/orgs:

```javascript
// Seleccionar instalación según el repo destino
async function getInstallationForRepo(repoFullName) {
  const installations = await prisma.gitHubInstallation.findMany();
  
  for (const inst of installations) {
    const repos = Array.isArray(inst.repos) ? inst.repos : [];
    if (repos.includes(repoFullName)) {
      return inst.installationId.toString();
    }
  }
  
  throw new Error(`No installation found for repo: ${repoFullName}`);
}
```

## Troubleshooting

### "PrismaClient is unable to run in this browser environment"

Ejecutar en Node.js (backend), no en navegador.

### "Cannot find module '@prisma/client'"

```bash
cd backend
npm install @prisma/client
npx prisma generate
```

### "Invalid `prisma.gitHubInstallation.create()` invocation"

Verificar que el schema está actualizado y migrado:

```bash
npx prisma migrate dev
```

### "No installation data found"

1. Ejecutar script de migración: `node scripts/migrate_installations_to_prisma.js`
2. O recibir webhook de GitHub manualmente (reinstalar App si es necesario)

## Rollback (Si es Necesario)

Si algo falla, rollback temporal:

```bash
# Restaurar archivo JSON
cd backend
mv github_installation.json.migrated github_installation.json

# Reiniciar backend (usará archivo JSON como fallback)
pkill -f "node index.js"
node index.js
```

El código tiene fallback automático a JSON si Prisma falla.

## Verificación Final

Checklist:

- [ ] Script de migración ejecutado exitosamente
- [ ] `github_installation.json.migrated` existe (backup)
- [ ] Query a DB devuelve instalación correcta
- [ ] Endpoint `/github/installation` funciona
- [ ] Publicar post → `repository_dispatch` funciona
- [ ] Workflows se disparan correctamente

---

**Última actualización**: 2026-01-18

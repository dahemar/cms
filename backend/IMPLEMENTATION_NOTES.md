# Notas de Implementación: Ajustes Mínimos para Sesiones

## Cambios Implementados

### 1. CORS Mejorado
- **Antes**: `origin: true` (wildcard) con `credentials: true` - puede causar problemas
- **Ahora**: Función dinámica que permite subdominios de Vercel explícitamente
- **Beneficio**: Evita problemas de CORS con cookies en producción

### 2. Configuración de Cookies
- **Mantenido**: `domain: undefined` (funciona si frontend y backend están en mismo dominio)
- **Nota**: Si necesitas subdominios diferentes, cambiar a `domain: '.vercel.app'`

### 3. Prisma Timeouts Aumentados
- **Agregado**: `connect_timeout=30` y `pool_timeout=30` para serverless
- **Agregado**: `statement_cache_size=0` para evitar problemas de cache en serverless
- **Beneficio**: Reduce timeouts de conexión en cold starts de Vercel

### 4. Tabla Session
- **Estado**: El modelo `Session` ya está en `schema.prisma`
- **Acción requerida**: Ejecutar migración en producción

## Pasos para Completar la Implementación

### Paso 1: Ejecutar Migración en Producción

La tabla Session debe existir en la base de datos de producción. Ejecuta:

```bash
# Opción A: Desde local (conectado a DB de producción)
cd backend
DATABASE_URL=<tu-database-url-de-produccion> npx prisma migrate deploy

# Opción B: Desde Supabase SQL Editor
# Ejecutar el SQL en SESSION_TABLE_MIGRATION.sql
```

### Paso 2: Verificar que la Tabla Existe

```sql
-- En Supabase SQL Editor
SELECT * FROM "Session" LIMIT 1;
```

Si la tabla no existe, ejecuta:

```sql
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
```

### Paso 3: Verificar Cookies en el Navegador

1. Abre DevTools → Application → Cookies
2. Haz login
3. Verifica que aparece `connect.sid` después del login
4. Verifica que tiene:
   - `Secure: true`
   - `SameSite: None`
   - `HttpOnly: true`
   - `Path: /`

### Paso 4: Verificar que las Cookies se Envían

1. Abre DevTools → Network
2. Haz login
3. Busca la petición a `/auth/me`
4. Verifica en Request Headers que aparece: `Cookie: connect.sid=...`

## Si los Ajustes Mínimos No Funcionan

Si después de estos cambios el problema persiste, implementar una de estas soluciones:

### Opción A: Redis/Upstash (Recomendado)

```bash
npm install connect-redis redis
```

Configurar en Vercel:
- Agregar variable `REDIS_URL` desde Upstash

Modificar `backend/index.js`:
```javascript
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });
client.connect().catch(console.error);

app.use(session({
  store: new RedisStore({ client }),
  // ... resto de configuración
}));
```

### Opción B: JWT Stateless

Cambiar de cookies a tokens JWT:
- Login devuelve JWT en respuesta JSON
- Frontend guarda JWT en localStorage o cookie
- Todas las peticiones incluyen `Authorization: Bearer <token>`

## Checklist de Verificación

- [ ] Migración ejecutada en producción
- [ ] Tabla Session existe en base de datos
- [ ] Cookies aparecen en DevTools después del login
- [ ] Cookies se envían en peticiones a `/auth/me`
- [ ] Logs de Vercel muestran que la sesión se guarda correctamente
- [ ] `/auth/me` retorna `authenticated: true` después del login

## Próximos Pasos

1. Hacer deploy de estos cambios
2. Ejecutar migración en producción
3. Probar login y verificar cookies
4. Si no funciona, implementar Redis/Upstash o JWT


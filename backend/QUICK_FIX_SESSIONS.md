# Solución Rápida: Problema de Sesiones

## Estado Actual

- ✅ DATABASE_URL está configurada correctamente (con puerto 6543)
- ❌ Login funciona pero sesión no persiste
- ❓ REDIS_URL probablemente no está configurada

## Soluciones (en orden de prioridad)

### Opción 1: Configurar Redis/Upstash (Recomendado - Más Robusto)

**Pasos:**
1. Ve a https://console.upstash.com/
2. Crea una cuenta (puedes usar GitHub)
3. Crea una base de datos Redis (Free tier)
4. Copia la Redis URL
5. En Vercel → Settings → Environment Variables:
   - Key: `REDIS_URL`
   - Value: `redis://default:password@endpoint:6379`
   - Environment: Production
6. Redeploy

**Ventaja**: Sesiones persisten correctamente en serverless

### Opción 2: Verificar que la Tabla Session Existe

Si no quieres usar Redis, asegúrate de que la tabla Session existe en Supabase:

1. Ve a Supabase → SQL Editor
2. Ejecuta:

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

3. Verifica que se creó:
```sql
SELECT * FROM "Session" LIMIT 1;
```

### Opción 3: Verificar Cookies en el Navegador

1. Abre DevTools (F12)
2. Ve a Application → Cookies
3. Haz login
4. Verifica que aparece `connect.sid` después del login
5. Verifica que tiene:
   - `Secure: true`
   - `SameSite: None`
   - `HttpOnly: true`

Si la cookie NO aparece, el problema es que las cookies no se están guardando.

## Diagnóstico Rápido

### Verificar Logs de Vercel

Después de hacer login, revisa los logs de Vercel para ver:

1. ¿Redis se inicializó?
   - Busca: `[Session Store] ✅ Redis store initialized`
   - O: `[Session Store] ✅ PrismaSessionStore initialized as fallback`

2. ¿La sesión se guardó?
   - Busca: `[Login] ✅ Session saved successfully`
   - Busca: `[Login] ✅ Session verified in store`

3. ¿La cookie se envió?
   - Busca: `[Login] Response sent, Set-Cookie header:`

4. ¿La siguiente petición tiene la cookie?
   - Busca: `[GET /auth/me] Cookies header:`
   - Si dice "No cookies", el problema es que las cookies no se están guardando

## Solución Más Probable

El problema más probable es que **las cookies no se están guardando en el navegador** debido a:

1. **SameSite=None requiere Secure=true** ✅ (ya configurado)
2. **Problema con el dominio** - Puede que necesites `domain: '.vercel.app'`
3. **CORS no está permitiendo las cookies** - Aunque debería estar configurado

## Próximos Pasos

1. **Configura Redis/Upstash** (Opción 1) - Es la solución más robusta
2. O verifica que la tabla Session existe (Opción 2)
3. Revisa los logs de Vercel para ver qué está pasando exactamente



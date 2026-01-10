# Configuración de Redis/Upstash para Sesiones

## ¿Por qué Redis?

Redis es la solución recomendada para sesiones en entornos serverless porque:
- ✅ Persiste entre invocaciones de funciones serverless
- ✅ Muy rápido (in-memory)
- ✅ Optimizado para serverless (Upstash)
- ✅ No requiere migraciones de base de datos
- ✅ Escalable y confiable

## Configuración en Upstash

### Paso 1: Crear Base de Datos en Upstash

1. Ve a [Upstash Console](https://console.upstash.com/)
2. Crea una nueva cuenta o inicia sesión
3. Click en "Create Database"
4. Selecciona:
   - **Type**: Redis
   - **Region**: Elige la región más cercana a tu deployment de Vercel
   - **Plan**: Free tier es suficiente para empezar
5. Click en "Create"

### Paso 2: Obtener URL de Conexión

1. En la página de tu base de datos, ve a "Details"
2. Copia la **REST URL** o **Redis URL**
3. Formato: `redis://default:<password>@<host>:<port>`

### Paso 3: Configurar en Vercel

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega:
   - **Name**: `REDIS_URL`
   - **Value**: La URL que copiaste de Upstash
   - **Environment**: Production (y Preview si quieres)
4. Click en "Save"

### Paso 4: Redeploy

El código ya está configurado para usar Redis automáticamente si `REDIS_URL` está disponible.

```bash
# O desde Vercel dashboard, haz "Redeploy"
```

## Verificación

Después del deploy, los logs deberían mostrar:

```
[Session Store] ✅ Redis store initialized successfully
```

Si Redis no está disponible, usará PrismaSessionStore como fallback:

```
[Session Store] ✅ PrismaSessionStore initialized as fallback
```

## Fallback Automático

El sistema tiene un fallback automático:
1. **Primero intenta Redis** (si `REDIS_URL` está configurado)
2. **Si falla, usa PrismaSessionStore** (si Prisma está disponible)
3. **Si ambos fallan, usa memory store** (no persiste entre invocaciones)

## Costos

- **Upstash Free Tier**: 
  - 10,000 comandos/día
  - 256 MB de storage
  - Suficiente para desarrollo y pequeños proyectos

- **Upstash Paid**: 
  - Desde $0.20/mes
  - Más comandos y storage según necesites

## Troubleshooting

### Error: "Redis connection failed"

1. Verifica que `REDIS_URL` esté configurado en Vercel
2. Verifica que la URL sea correcta (formato: `redis://...`)
3. Verifica que la base de datos esté activa en Upstash
4. Revisa los logs de Vercel para más detalles

### Sesiones no persisten

1. Verifica que Redis se inicializó correctamente (revisa logs)
2. Verifica que las cookies se están guardando (DevTools → Application → Cookies)
3. Verifica que `REDIS_URL` está configurado para el ambiente correcto (Production)

## Alternativa: Vercel KV

Si prefieres usar Vercel KV (similar a Redis pero integrado):

1. Instala: `npm install @vercel/kv`
2. Configura en `vercel.json` o desde dashboard
3. Modifica el código para usar `@vercel/kv` en lugar de `redis`

Pero Upstash Redis es más flexible y funciona en cualquier plataforma.



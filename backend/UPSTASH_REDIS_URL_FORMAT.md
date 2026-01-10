# Formato Correcto de REDIS_URL para Upstash

## ⚠️ Diferencia: REST URL vs Redis URL

Upstash ofrece dos tipos de conexión:

1. **REST URL** (lo que tienes ahora):
   - Formato: `https://liberal-garfish-14371.upstash.io`
   - Se usa con `@upstash/redis` o API REST
   - NO funciona directamente con `connect-redis` + `redis` client

2. **Redis URL** (lo que necesitas):
   - Formato: `redis://default:password@host:port`
   - Se usa con `redis` client estándar
   - SÍ funciona con `connect-redis`

## Cómo Obtener la Redis URL en Upstash

### Opción 1: Desde el Dashboard de Upstash

1. Ve a tu base de datos en https://console.upstash.com/
2. Click en tu base de datos "liberal-garfish-14371"
3. Busca la sección **"Connect"** o **"Details"**
4. Busca **"Redis URL"** o **"Connection String"**
5. Deberías ver algo como:

```
Redis URL:
redis://default:AbCdEf123456@liberal-garfish-14371.upstash.io:6379
```

### Opción 2: Construirla Manualmente

Si solo ves REST URL y REST Token, puedes construir la Redis URL:

1. **Host**: `liberal-garfish-14371.upstash.io` (de tu REST URL)
2. **Password**: El REST TOKEN que tienes (el que está oculto con `********`)
3. **Puerto**: Generalmente `6379` o `6380` (verifica en Upstash)
4. **Usuario**: `default` (siempre es "default" en Upstash)

Formato:
```
redis://default:[TU_REST_TOKEN]@liberal-garfish-14371.upstash.io:6379
```

**Ejemplo:**
```
redis://default:AbCdEf123456@liberal-garfish-14371.upstash.io:6379
```

### Opción 3: Usar REST API (Requiere Cambios en el Código)

Si prefieres usar la REST URL que ya tienes, necesitarías cambiar el código para usar `@upstash/redis` en lugar de `redis` client. Pero es más fácil usar la Redis URL directa.

## Verificación

La URL correcta debe:
- ✅ Empezar con `redis://`
- ✅ Tener `default:` como usuario
- ✅ Tener el password (REST TOKEN)
- ✅ Tener el host (de tu REST URL)
- ✅ Tener el puerto (generalmente 6379)

## Configurar en Vercel

Una vez que tengas la Redis URL completa:

1. Ve a Vercel → Settings → Environment Variables
2. Agrega:
   - **Key**: `REDIS_URL`
   - **Value**: `redis://default:password@host:port` (la URL completa)
   - **Environment**: Production
3. Save
4. Redeploy

## Si No Encuentras la Redis URL

1. Ve a la página de tu base de datos en Upstash
2. Busca pestañas o secciones:
   - "Connect"
   - "Details"  
   - "Connection"
   - "Redis"
3. Busca texto que diga "Redis URL" o "Connection String"
4. Si solo ves REST, el password (REST TOKEN) es el mismo para Redis URL

## Nota Importante

El **REST TOKEN** que tienes es el mismo password que necesitas para la Redis URL. Solo necesitas construir la URL con el formato correcto.



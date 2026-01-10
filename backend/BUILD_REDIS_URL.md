# Construir Redis URL desde REST URL de Upstash

## Tus Datos de Upstash

- **REST URL**: `https://liberal-garfish-14371.upstash.io`
- **REST TOKEN**: `********` (el que tienes oculto)

## Construir la Redis URL

Con esos datos, la Redis URL sería:

```
redis://default:[TU_REST_TOKEN]@liberal-garfish-14371.upstash.io:6379
```

**Componentes:**
- `redis://` - Protocolo Redis
- `default` - Usuario (siempre "default" en Upstash)
- `[TU_REST_TOKEN]` - Tu REST TOKEN (el password oculto)
- `liberal-garfish-14371.upstash.io` - Host (sin https://)
- `6379` - Puerto (puede ser 6379 o 6380, verifica en Upstash)

## Pasos

1. Ve a tu base de datos en Upstash: https://console.upstash.com/
2. Click en "liberal-garfish-14371"
3. Busca la sección "Connect" o "Details"
4. Busca "Redis URL" o "Connection String"
5. Si la encuentras, cópiala directamente
6. Si no, construye la URL con el formato de arriba usando tu REST TOKEN

## Verificar el Puerto

El puerto puede ser:
- `6379` (más común)
- `6380` (alternativo)

Para verificar:
1. En Upstash, busca "Port" o "Redis Port"
2. O prueba primero con `6379`, si no funciona prueba con `6380`

## Ejemplo Completo

Si tu REST TOKEN es `AbCdEf123456`, la URL sería:

```
redis://default:AbCdEf123456@liberal-garfish-14371.upstash.io:6379
```

## Configurar en Vercel

1. Ve a Vercel → Settings → Environment Variables
2. Agrega:
   - **Key**: `REDIS_URL`
   - **Value**: `redis://default:TU_REST_TOKEN@liberal-garfish-14371.upstash.io:6379`
   - **Environment**: Production
3. Save
4. Redeploy

## Alternativa: Usar REST API Directamente

Si prefieres usar la REST URL directamente, necesitaríamos cambiar el código para usar `@upstash/redis` en lugar de `redis` client. Pero es más fácil usar la Redis URL.



# URL Correcta de DATABASE_URL para Vercel/Serverless

## ⚠️ Importante: NO uses puerto 5432 para Serverless

Para Vercel/serverless, **NO** uses la conexión directa (puerto 5432). Usa **Connection Pooling** (puerto 6543).

## URL Correcta para Serverless (Vercel)

### Formato:

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

### Componentes:

1. **Usuario**: `postgres.[PROJECT-REF]`
   - No solo `postgres`, sino `postgres.` seguido de tu Reference ID
   - Ejemplo: `postgres.abcdefghijklmnop`

2. **Contraseña**: La que aparece en Database Settings
   - Puedes resetearla si no la recuerdas

3. **Host**: `aws-0-[REGION].pooler.supabase.com`
   - **NO** uses `<project-ref>.supabase.co`
   - Usa `pooler.supabase.com` con la región
   - Ejemplo: `aws-0-us-east-1.pooler.supabase.com`

4. **Base de datos**: `postgres`

5. **Puerto**: `6543` ⚠️ **NO 5432**
   - 5432 = conexión directa (se agota en serverless)
   - 6543 = connection pooling (optimizado para serverless)

6. **Parámetros**:
   - `?pgbouncer=true` - Habilita connection pooling
   - `&sslmode=require` - SSL obligatorio

## Ejemplo Completo

```
postgresql://postgres.abcdefghijklmnop:MiPassword123@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

## Cómo Obtener Cada Parte

### 1. PROJECT-REF (Reference ID)
- Ve a: **Settings** → **General**
- Busca: **"Reference ID"**
- Ejemplo: `abcdefghijklmnop`

### 2. PASSWORD
- Ve a: **Settings** → **Database**
- Busca: **"Database password"**
- O click en **"Reset database password"** si no la recuerdas

### 3. REGION
- Ve a: **Settings** → **General**
- Busca: **"Region"**
- Ejemplo: `us-east-1`, `eu-west-1`, etc.

## Diferencia: Directa vs Pooling

### ❌ Conexión Directa (NO para serverless)
```
postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres?sslmode=require
```
- Puerto: `5432`
- Host: `db.xxxxx.supabase.co`
- **Problema**: Se agotan las conexiones en serverless
- **Resultado**: Errores de "connection pool exhausted"

### ✅ Connection Pooling (Correcto para serverless)
```
postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```
- Puerto: `6543`
- Host: `aws-0-[REGION].pooler.supabase.com`
- Tiene `?pgbouncer=true`
- **Ventaja**: Maneja mejor las conexiones en serverless
- **Resultado**: Funciona correctamente en Vercel

## Verificación Rápida

Tu URL debe tener:
- ✅ `pooler.supabase.com` (no `supabase.co`)
- ✅ Puerto `6543` (no `5432`)
- ✅ `postgres.` seguido de Reference ID (no solo `postgres`)
- ✅ `?pgbouncer=true`
- ✅ `&sslmode=require`

## Configurar en Vercel

1. Ve a tu proyecto en Vercel
2. **Settings** → **Environment Variables**
3. Busca o crea:
   - **Key**: `DATABASE_URL`
   - **Value**: La URL completa con el formato correcto
   - **Environment**: Production (y Preview)
4. **Save**
5. **Redeploy**

## Si Ya Tienes DATABASE_URL Configurada

Si ya tienes una DATABASE_URL con puerto 5432, **cámbiala** a la versión con pooling (6543):

**Antes:**
```
postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres?sslmode=require
```

**Después:**
```
postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

## Troubleshooting

### Error: "connection pool exhausted"
- **Causa**: Estás usando puerto 5432 (conexión directa)
- **Solución**: Cambia a puerto 6543 con `?pgbouncer=true`

### Error: "SSL required"
- **Causa**: Falta `&sslmode=require`
- **Solución**: Agrega `&sslmode=require` al final de la URL

### Error: "authentication failed"
- **Causa**: Password incorrecta o formato de usuario incorrecto
- **Solución**: 
  - Verifica que el usuario sea `postgres.[REFERENCE-ID]` (no solo `postgres`)
  - Verifica que la contraseña sea correcta

---

**Resumen**: Para Vercel/serverless, SIEMPRE usa connection pooling (puerto 6543) con `pgbouncer=true`.


# Cómo Obtener la URL de Conexión de Supabase

## Ubicación de la Connection String

La URL de conexión de Supabase **NO** está en "Database Settings". Está en otra sección:

### Opción 1: Desde Database Settings (Connection Pooling)

1. En la página que estás viendo (Database Settings)
2. Busca la sección **"Connection pooling configuration"**
3. Verás pestañas o secciones como:
   - **"Connection string"** (esta es la que necesitas)
   - **"Session mode"**
   - **"Transaction mode"**

4. Click en la pestaña **"Connection string"** o busca el texto que dice:
   ```
   Connection string: postgresql://postgres:[YOUR-PASSWORD]@...
   ```

### Opción 2: Desde Project Settings

1. Ve a **Settings** (icono de engranaje en el menú lateral)
2. Click en **"Database"** en el menú izquierdo
3. Busca la sección **"Connection string"** o **"Connection info"**
4. Verás algo como:

```
Connection string
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Opción 3: Connection Pooling (Recomendado para Serverless)

Para Vercel/serverless, usa la **Connection Pooling URL**:

1. En Database Settings, busca **"Connection pooling"**
2. Verás diferentes modos:
   - **Session mode**: `postgresql://postgres.xxxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - **Transaction mode**: Similar pero con diferentes parámetros

3. **Para serverless (Vercel), usa Session mode**:
   ```
   postgresql://postgres.xxxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

## Formato de la URL

La URL de Supabase tiene este formato:

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Componentes:**
- `postgres.[PROJECT-REF]` - Tu referencia de proyecto
- `[PASSWORD]` - La contraseña de la base de datos (la que puedes resetear en Database Settings)
- `aws-0-[REGION]` - La región de tu proyecto
- `6543` - Puerto para connection pooling (recomendado)
- `postgres` - Nombre de la base de datos
- `?pgbouncer=true` - Habilita connection pooling (necesario para serverless)

## Pasos Detallados

### Paso 1: Obtener la Contraseña

1. En la página que estás viendo (Database Settings)
2. Busca **"Database password"**
3. Si no la recuerdas, click en **"Reset database password"**
4. Copia la contraseña (la necesitarás para la URL)

### Paso 2: Encontrar la Connection String

1. En la misma página, scroll hacia abajo
2. Busca la sección **"Connection string"** o **"Connection info"**
3. O ve a: **Settings** → **Database** → **Connection string**

### Paso 3: Construir la URL Completa

Si solo ves partes de la URL, constrúyela así:

```
postgresql://postgres.[PROJECT-REF]:[TU_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Ejemplo:**
```
postgresql://postgres.abcdefghijklmnop:MiPassword123@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

### Paso 4: Obtener PROJECT-REF y REGION

Si no ves la URL completa:

1. Ve a **Settings** → **General**
2. Busca **"Reference ID"** (este es tu PROJECT-REF)
3. Busca **"Region"** (ej: `us-east-1`, `eu-west-1`)

## Diferencia: Direct Connection vs Connection Pooling

### Direct Connection (NO recomendado para serverless)
```
postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```
- Puerto: `5432`
- No tiene `pooler` en la URL
- **Problema**: Puede agotar conexiones en serverless

### Connection Pooling (Recomendado para Vercel)
```
postgresql://postgres.xxxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
- Puerto: `6543`
- Tiene `pooler` en la URL
- Tiene `?pgbouncer=true`
- **Ventaja**: Maneja mejor las conexiones en serverless

## Configurar en Vercel

Una vez que tengas la URL completa:

1. Ve a tu proyecto en Vercel
2. **Settings** → **Environment Variables**
3. Busca o crea:
   - **Key**: `DATABASE_URL`
   - **Value**: La URL completa con tu password
   - **Environment**: Production (y Preview si quieres)
4. Click en **"Save"**
5. **Redeploy** tu proyecto

## Verificación

Después del deploy, los logs de Vercel deberían mostrar:

```
[Prisma] ✅ PrismaClient initialized
```

Si ves errores de conexión, verifica:
1. Que la contraseña sea correcta
2. Que uses la URL de connection pooling (puerto 6543)
3. Que la URL tenga `?pgbouncer=true`

## Nota Importante

- **NUNCA** compartas tu contraseña de base de datos públicamente
- La URL contiene la contraseña, así que trátala como información sensible
- Si la compartes por error, resetea la contraseña inmediatamente

---

**Tip**: Si no encuentras la Connection String en Database Settings, ve a **Settings** → **Database** y busca en la parte superior de la página.


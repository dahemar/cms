# Cómo Obtener la URL de Redis en Upstash

## ⚠️ Importante: Upstash ≠ Supabase

- **Supabase**: Base de datos PostgreSQL (ya la tienes configurada como `DATABASE_URL`)
- **Upstash**: Base de datos Redis para sesiones (necesitas crear una nueva)

## Pasos para Obtener la URL de Redis

### Paso 1: Crear Cuenta en Upstash

1. Ve a https://console.upstash.com/
2. Click en "Sign Up" o "Log In"
3. Puedes usar GitHub, Google, o email

### Paso 2: Crear Base de Datos Redis

1. Una vez dentro del dashboard, click en **"Create Database"**
2. Completa el formulario:
   - **Name**: `cms-sessions` (o el nombre que prefieras)
   - **Type**: Selecciona **"Redis"**
   - **Region**: Elige la región más cercana a tu deployment de Vercel
     - Si tu Vercel está en US East, elige `us-east-1`
     - Si está en EU, elige `eu-west-1`
   - **Plan**: Selecciona **"Free"** (suficiente para empezar)
3. Click en **"Create"**

### Paso 3: Obtener la URL de Conexión

Una vez creada la base de datos:

1. Ve a la página de detalles de tu base de datos
2. Busca la sección **"REST API"** o **"Connect"**
3. Verás algo como:

```
Endpoint: https://your-db-name.upstash.io
Password: your-password-here
```

4. La **Redis URL** tiene este formato:
   ```
   redis://default:TU_PASSWORD@TU_ENDPOINT:6379
   ```

   O si usas REST API:
   ```
   https://TU_ENDPOINT
   ```

### Paso 4: Formato Correcto de la URL

Para `connect-redis`, necesitas la URL en formato Redis:

```
redis://default:password123@cms-sessions-12345.upstash.io:6379
```

**Componentes:**
- `redis://` - Protocolo
- `default` - Usuario (Upstash usa "default")
- `password123` - Tu password (cópialo de Upstash)
- `cms-sessions-12345.upstash.io` - Tu endpoint
- `6379` - Puerto (puede variar, verifica en Upstash)

### Paso 5: Copiar la URL Completa

En Upstash, normalmente puedes:
1. Click en **"Connect"** o **"Details"**
2. Busca **"Redis URL"** o **"Connection String"**
3. Copia la URL completa

Si solo ves el endpoint y password por separado, construye la URL así:
```
redis://default:TU_PASSWORD@TU_ENDPOINT:6379
```

## Ejemplo Visual

En Upstash verás algo como:

```
Database: cms-sessions
Type: Redis
Region: us-east-1

Connection Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Endpoint: cms-sessions-abc123.upstash.io
Port: 6379
Password: xyz789password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Redis URL:
redis://default:xyz789password@cms-sessions-abc123.upstash.io:6379
```

## Configurar en Vercel

Una vez que tengas la URL:

1. Ve a tu proyecto en Vercel
2. **Settings** → **Environment Variables**
3. Click en **"Add New"**
4. Completa:
   - **Key**: `REDIS_URL`
   - **Value**: `redis://default:password@endpoint:6379` (la URL completa)
   - **Environment**: Selecciona **Production** (y **Preview** si quieres)
5. Click en **"Save"**
6. **Redeploy** tu proyecto

## Verificación

Después del deploy, los logs de Vercel deberían mostrar:

```
[Session Store] ✅ Redis store initialized successfully
```

Si ves esto, ¡Redis está funcionando! 🎉

## Troubleshooting

### Error: "Redis connection failed"

1. Verifica que la URL esté completa y correcta
2. Verifica que el password no tenga espacios o caracteres especiales mal escapados
3. Verifica que la base de datos esté activa en Upstash
4. Verifica que el puerto sea correcto (puede ser 6379 o otro)

### No encuentro la URL en Upstash

1. Ve a la página de tu base de datos
2. Busca el botón **"Connect"** o **"Details"**
3. Si solo ves REST API, puedes usar REST URL pero necesitarás ajustar el código
4. Para Redis directo, busca **"Redis URL"** o **"Connection String"**

## Alternativa: Usar REST API de Upstash

Si prefieres usar REST API en lugar de Redis directo:

1. Copia la **REST URL** de Upstash
2. Copia el **Token** (REST Token)
3. La URL sería: `https://TU_ENDPOINT`
4. Necesitarías ajustar el código para usar REST API

Pero es más fácil usar la Redis URL directa.

---

**Nota**: Upstash tiene un tier gratuito generoso (10,000 comandos/día) que es suficiente para desarrollo y proyectos pequeños.


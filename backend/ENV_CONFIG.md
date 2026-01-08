# Configuración de Variables de Entorno

Crea un archivo `.env` en `backend/` con el siguiente contenido:

```bash
# Database Configuration
# Obtén esta URL desde Supabase: Settings → Database → Connection string (Session Pooler)
DATABASE_URL="postgresql://postgres:TU_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"

# Session Secret (REQUERIDO EN PRODUCCIÓN)
# Genera uno seguro con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# NUNCA compartas este valor ni lo subas a git
SESSION_SECRET="1a69203c75b44d849cf7f6b36f2729d19d15ce555a711b6c5dbd9d07e2bfba7ef4a9a20e9f6987477275164378127e7313889f0949ff1e7e1fbbc77f60180144"

# Environment (development | production)
NODE_ENV="development"

# CORS Configuration (PRODUCCIÓN)
# Lista de orígenes permitidos separados por comas
# Ejemplo: ALLOWED_ORIGINS="https://tudominio.com,https://www.tudominio.com"
# En desarrollo, dejar vacío o comentado para permitir cualquier origen
# ALLOWED_ORIGINS="https://tudominio.com"

# Cookie Security (PRODUCCIÓN)
# Si estás usando HTTPS, deja esto como "true" (default en producción)
# Si estás en desarrollo sin HTTPS, esto debe ser "false"
# COOKIE_SECURE="true"
```

## Para Producción

1. **SESSION_SECRET**: Genera uno nuevo y único:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **NODE_ENV**: Cambia a `"production"`

3. **ALLOWED_ORIGINS**: Especifica tus dominios:
   ```bash
   ALLOWED_ORIGINS="https://tudominio.com,https://www.tudominio.com"
   ```

4. **COOKIE_SECURE**: Se activa automáticamente cuando `NODE_ENV=production` (requiere HTTPS)


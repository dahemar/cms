### Configuración de Supabase (DATABASE_URL)

1) En Supabase: **Settings → Database → Connection string**

2) Si ves el mensaje **“Not IPv4 compatible”**, significa que tu conexión “Direct” es **solo IPv6**.  
En redes/entornos IPv4 necesitas usar el **Session Pooler** (Pooler settings).

3) Copia la URI:

`postgresql://user:password@host:5432/dbname`

4) En este backend, crea un archivo **`.env`** (en la carpeta `backend/`) con:

`DATABASE_URL="postgresql://..."`

> Nota: `.env` está ignorado por git a propósito (no se commitean secretos).

### Recomendación práctica (Supabase + Pooler)

- Usa la connection string de **Session Pooler** como `DATABASE_URL` (suele ser puerto 6543).
- Asegura SSL:
  - agrega `?sslmode=require`
- Si la string menciona PgBouncer / pooler, agrega:
  - `&pgbouncer=true`

Ejemplo (reemplaza host/usuario/password por los tuyos):

`DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_POOLER_HOST:6543/postgres?sslmode=require&pgbouncer=true"`

Opcional (si tienes Direct URL con IPv6/IPv4 add-on) para migraciones:

`DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_DIRECT_HOST:5432/postgres?sslmode=require"`



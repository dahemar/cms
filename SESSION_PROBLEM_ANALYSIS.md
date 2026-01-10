# Análisis Técnico: Problema de Sesiones en Producción (Vercel)

## Resumen Ejecutivo

**Problema**: Las sesiones de usuario no persisten después del login en producción (Vercel), mientras que funcionan correctamente en desarrollo local.

**Síntoma Principal**: 
- Usuario hace login exitoso → recibe respuesta `200 OK` con `{ message: "Login successful", user: {...}, sessionId: "..." }`
- Inmediatamente después, al verificar sesión con `GET /auth/me` → recibe `{ authenticated: false }`
- Mensaje de error mostrado: "Login successful but session not active. Please try again."

**Estado**: El problema ocurre **solo en producción (Vercel)**, no en desarrollo local.

---

## Arquitectura del Sistema

### Stack Tecnológico
- **Backend**: Node.js + Express.js
- **Base de Datos**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Sesiones**: `express-session` con store personalizado `PrismaSessionStore`
- **Deployment**: Vercel (Serverless Functions)
- **Frontend Admin**: HTML estático servido desde el mismo dominio que el backend

### Flujo de Autenticación

1. **Login** (`POST /auth/login`):
   ```javascript
   // Usuario envía { email, password }
   // Backend:
   - Valida credenciales
   - Crea sesión: req.session.userId = user.id
   - Guarda sesión: await req.session.save()
   - Verifica que se guardó en store
   - Responde: { message: "Login successful", user: {...}, sessionId: "..." }
   ```

2. **Verificación de Sesión** (`GET /auth/me`):
   ```javascript
   // Frontend hace fetch inmediatamente después del login
   // Backend:
   - Lee req.session.userId
   - Si existe → busca usuario en DB → responde { authenticated: true, user: {...} }
   - Si no existe → responde { authenticated: false }
   ```

---

## Configuración Actual

### Express Session Middleware

```javascript
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-secret",
    store: sessionStore || undefined, // PrismaSessionStore o memoria
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction, // true en Vercel (HTTPS)
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
      sameSite: isProduction ? "none" : "lax", // "none" en producción
      domain: undefined, // NO establecido
      path: "/",
    },
    name: 'connect.sid',
  })
);
```

### CORS Configuration

```javascript
app.use(
  cors({
    origin: allowedOrigins, // true (wildcard) en producción
    credentials: true, // CRÍTICO para cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
  })
);
```

### PrismaSessionStore

Store personalizado que guarda sesiones en tabla `Session` de PostgreSQL:

```javascript
class PrismaSessionStore extends EventEmitter {
  async get(sessionId, callback) {
    // Busca en tabla Session
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    // Retorna datos parseados o null
  }
  
  async set(sessionId, sessionData, callback) {
    // Guarda en tabla Session usando upsert
    await this.prisma.session.upsert({ ... });
  }
}
```

### Schema de Base de Datos (Prisma)

```prisma
model Session {
  id        String   @id // sessionId
  data      String   // JSON stringified session data
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([expiresAt])
}
```

---

## Diferencias: Local vs Producción

### Desarrollo Local
- **Admin Panel**: `http://localhost:8000` (servidor HTTP simple)
- **Backend API**: `http://localhost:3000` (Express)
- **Dominios**: Diferentes puertos, mismo dominio (`localhost`)
- **HTTPS**: No (HTTP)
- **Cookies**: `sameSite: "lax"`, `secure: false`
- **Resultado**: ✅ **Funciona correctamente**

### Producción (Vercel)
- **Admin Panel**: `https://cms-xxx.vercel.app` (servido como archivos estáticos)
- **Backend API**: `https://cms-xxx.vercel.app` (Serverless Functions)
- **Dominios**: Mismo dominio y puerto
- **HTTPS**: Sí (requerido por Vercel)
- **Cookies**: `sameSite: "none"`, `secure: true`
- **Resultado**: ❌ **No funciona - sesión no persiste**

---

## Evidencia y Logs

### Logs del Backend (Login Exitoso)

```
[Login] Setting session data: { userId: 2, userEmail: "...", isAdmin: false, sessionID: "..." }
[Login] ✅ Session saved successfully
[Login] Session ID: PH3RMEYaYEc6xmVJMet0769wd4ZQAiqP
[Login] ✅ Session verified in store, userId: 2
[Login] Response sent, Set-Cookie header: connect.sid=...; Path=/; HttpOnly; Secure; SameSite=None
```

### Logs del Backend (/auth/me - Inmediatamente Después)

```
[GET /auth/me] Session ID: PH3RMEYaYEc6xmVJMet0769wd4ZQAiqP
[GET /auth/me] Session exists: true
[GET /auth/me] Session data: { userId: undefined, userEmail: undefined, isAdmin: undefined }
[GET /auth/me] Cookies header: No cookies
[GET /auth/me] ⚠️ Session ID exists but no session data, attempting to load from store...
[GET /auth/me] ⚠️ Session NOT found in store for sessionID: PH3RMEYaYEc6xmVJMet0769wd4ZQAiqP
[GET /auth/me] Returning authenticated: false
```

### Observaciones Clave

1. **El login guarda la sesión correctamente**:
   - `req.session.save()` se ejecuta sin errores
   - La verificación en store confirma que se guardó: `userId: 2`
   - El header `Set-Cookie` se envía en la respuesta

2. **La siguiente petición no tiene la cookie**:
   - `Cookies header: No cookies` ← **PROBLEMA CRÍTICO**
   - El `sessionID` existe pero viene de una nueva sesión (express-session genera uno nuevo si no hay cookie)
   - La sesión no se encuentra en el store

3. **La tabla Session puede no existir**:
   - Logs muestran: `Error checking Session table: Invalid prisma.$queryRaw() invocation: Timed out fetching a new connection from the connection pool`
   - O: `Session table does NOT exist!`

---

## Hipótesis sobre la Causa Raíz

### Hipótesis 1: Cookies No Se Están Guardando en el Navegador

**Evidencia**:
- `Set-Cookie` header se envía correctamente desde el servidor
- Pero `Cookies header: No cookies` en la siguiente petición
- Esto sugiere que el navegador **no está guardando la cookie**

**Posibles Causas**:
1. **SameSite=None requiere Secure=true** ✅ (ya configurado)
2. **Problema con dominio de cookie**: `domain: undefined` puede no funcionar en Vercel
3. **Problema con CORS**: Aunque `credentials: true` está configurado, puede haber un problema de preflight
4. **Problema con Vercel Serverless**: Las funciones serverless pueden tener problemas con cookies entre invocaciones

### Hipótesis 2: Tabla Session No Existe en Producción

**Evidencia**:
- Logs muestran errores al verificar/crear la tabla Session
- El código intenta crear la tabla automáticamente pero puede fallar silenciosamente
- PrismaSessionStore falla al guardar si la tabla no existe

**Posibles Causas**:
1. **Migración no ejecutada**: La tabla Session no está en el schema de Prisma o no se migró
2. **Permisos de base de datos**: El usuario de DB no tiene permisos para crear tablas
3. **Connection pool timeout**: Supabase puede tener límites de conexión que impiden crear la tabla

### Hipótesis 3: Problema con Serverless Functions de Vercel

**Evidencia**:
- Vercel usa funciones serverless que se ejecutan en contenedores efímeros
- Cada invocación puede ser un contenedor diferente
- Las cookies pueden no persistir entre invocaciones si hay problemas de configuración

**Posibles Causas**:
1. **Cold start**: La primera invocación puede no tener acceso completo a la base de datos
2. **Timeouts**: Las operaciones de DB pueden estar timing out en serverless
3. **Memory store fallback**: Si PrismaSessionStore falla, puede estar usando memory store que no persiste entre invocaciones

### Hipótesis 4: Problema con CORS y Credentials

**Evidencia**:
- Aunque `credentials: true` está configurado, puede haber problemas con:
  - Preflight requests (OPTIONS)
  - Headers de respuesta CORS
  - Origen de la petición

**Posibles Causas**:
1. **Origin header**: El navegador puede no estar enviando el header `Origin` correctamente
2. **CORS preflight**: Las peticiones OPTIONS pueden no estar configuradas correctamente
3. **Wildcard origin**: `origin: true` puede no funcionar correctamente con `credentials: true`

---

## Intentos de Solución Realizados

### 1. Configuración de Cookies
- ✅ Cambiado `domain` de `process.env.COOKIE_DOMAIN || undefined` a `undefined` explícito
- ✅ Verificado que `secure: true` y `sameSite: "none"` están configurados en producción
- ✅ Agregado `name: 'connect.sid'` explícito

### 2. Creación Automática de Tabla Session
- ✅ Agregado código para crear tabla Session automáticamente al iniciar servidor
- ✅ Usa `process.nextTick` para no bloquear el inicio
- ✅ Usa `$executeRawUnsafe` para crear la tabla si no existe

### 3. Fallback en PrismaSessionStore
- ✅ Agregado fallback a raw SQL queries si el modelo Prisma no está disponible
- ✅ Manejo de errores mejorado para no crashear si la tabla no existe

### 4. Logging Detallado
- ✅ Logging extensivo en `/auth/login` y `/auth/me`
- ✅ Logging de headers de request y response
- ✅ Logging de estado de sesión y store

### 5. Verificación de Sesión
- ✅ Código para intentar recuperar sesión del store si `req.session` está vacío
- ✅ Verificación de existencia de tabla Session antes de usar store

**Resultado**: Ninguno de estos intentos ha resuelto el problema.

---

## Información Técnica Adicional

### Variables de Entorno en Producción

```bash
NODE_ENV=production
SESSION_SECRET=<generado-seguro>
DATABASE_URL=postgresql://... (Supabase connection string)
ALLOWED_ORIGINS= (no configurado, usa wildcard)
```

### Estructura de Archivos en Vercel

```
/vercel/output/
  ├── backend/
  │   ├── index.js (serverless function handler)
  │   ├── node_modules/
  │   └── prisma/
  └── admin/
      ├── login.html
      └── admin.html
```

### Configuración de Vercel (vercel.json)

```json
{
  "builds": [
    {
      "src": "backend/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/admin/(.*)",
      "dest": "/admin/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/backend/index.js"
    }
  ]
}
```

---

## Preguntas Clave para Investigación

1. **¿La cookie se está guardando en el navegador?**
   - Verificar en DevTools → Application → Cookies
   - Verificar si aparece `connect.sid` después del login

2. **¿La tabla Session existe en la base de datos de producción?**
   - Ejecutar: `SELECT * FROM "Session" LIMIT 1;` en Supabase
   - Verificar si hay registros después de un login

3. **¿Las cookies se están enviando en las peticiones?**
   - Verificar en DevTools → Network → Request Headers
   - Verificar si `Cookie: connect.sid=...` aparece en peticiones a `/auth/me`

4. **¿Hay errores de CORS?**
   - Verificar en DevTools → Console
   - Verificar si hay errores de preflight (OPTIONS)

5. **¿El PrismaSessionStore está funcionando?**
   - Verificar logs de Vercel para errores de Prisma
   - Verificar si hay timeouts de conexión a la base de datos

---

## Soluciones Potenciales a Explorar

### Solución 1: Usar Redis para Sesiones (Recomendado para Serverless)

**Ventajas**:
- Redis es ideal para serverless (persistencia entre invocaciones)
- Mejor rendimiento que PostgreSQL para sesiones
- Soporte nativo en Vercel (Upstash Redis)

**Implementación**:
```javascript
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });

app.use(session({
  store: new RedisStore({ client }),
  // ... resto de configuración
}));
```

### Solución 2: Usar JWT en lugar de Cookies

**Ventajas**:
- No depende de cookies del navegador
- Funciona perfectamente en serverless
- Stateless (no requiere store)

**Implementación**:
```javascript
// Login
const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
res.json({ token, user });

// Verificación
const decoded = jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
```

### Solución 3: Asegurar que la Tabla Session Existe

**Implementación**:
1. Crear migración de Prisma para la tabla Session
2. Ejecutar `npx prisma migrate deploy` en producción
3. Verificar que la tabla existe antes de iniciar el servidor

### Solución 4: Configurar CORS Correctamente

**Implementación**:
```javascript
// En lugar de wildcard, especificar orígenes explícitos
const allowedOrigins = [
  'https://cms-xxx.vercel.app',
  'https://cms-xxx-davids-projects-1f1aa011.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

### Solución 5: Usar Vercel KV (Key-Value Store)

**Ventajas**:
- Integración nativa con Vercel
- Optimizado para serverless
- Similar a Redis pero más simple

**Implementación**:
```javascript
const { kv } = require('@vercel/kv');

// Guardar sesión
await kv.set(`session:${sessionId}`, sessionData, { ex: 86400 });

// Leer sesión
const sessionData = await kv.get(`session:${sessionId}`);
```

---

## Conclusión

El problema es **multifactorial** y probablemente involucra:

1. **Cookies no se están guardando en el navegador** (evidencia más fuerte)
2. **Tabla Session puede no existir o no ser accesible** en producción
3. **Problemas inherentes de serverless** con sesiones basadas en cookies

**Recomendación**: Implementar **Solución 1 (Redis)** o **Solución 2 (JWT)** para serverless, ya que las sesiones basadas en cookies con store de base de datos tienen problemas conocidos en entornos serverless.

---

## Referencias Técnicas

- [Express Session Documentation](https://github.com/expressjs/session)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [SameSite Cookie Attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [CORS with Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#requests_with_credentials)
- [Prisma with Serverless](https://www.prisma.io/docs/guides/deployment/serverless)

---

**Última actualización**: 2026-01-09
**Versión del código**: commit `36be46f`


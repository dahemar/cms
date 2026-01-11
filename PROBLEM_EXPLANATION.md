# Problema Técnico: Errores Alternantes en Vercel Serverless

## Contexto

Tenemos una aplicación Node.js/Express desplegada en **Vercel como función serverless**. La aplicación es un CMS headless con autenticación JWT y sesiones, usando Prisma ORM con Supabase (PostgreSQL).

## Síntomas

Estamos experimentando **dos errores que alternan**:

1. **Error en frontend**: `Error: Unexpected token 'A', "A server e"... is not valid JSON`
   - Esto indica que el servidor está devolviendo **HTML** (probablemente la página de error de Vercel que comienza con "A server error occurred") en lugar de JSON
   - Ocurre en endpoints como `/auth/me`, `/auth/login`, y `PUT /posts/:id`

2. **Error en frontend**: `Error: Failed to update post` (500)
   - El servidor devuelve un 500, pero a veces también devuelve HTML en lugar de JSON

## Arquitectura

- **Backend**: Express.js en Vercel serverless functions
- **Base de datos**: Supabase (PostgreSQL) con Prisma ORM
- **Autenticación**: JWT + express-session
- **Deployment**: Vercel (serverless, cada request puede ejecutarse en una instancia nueva)

## Código Relevante

### Endpoint Problemático: `PUT /posts/:id`

```javascript
app.put("/posts/:id", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    // ... validaciones ...
    
    // Transacción crítica para actualizar bloques
    if (blocks !== undefined) {
      post = await prisma.$transaction(async (tx) => {
        await tx.postBlock.deleteMany({ where: { postId: id } });
        return tx.post.update({
          where: { id },
          data: updateData,
          include: { tags: true, section: true, blocks: { orderBy: { order: "asc" } } },
        });
      }, { timeout: 20000 });
    }
    
    // ... más código ...
    
    await logAuditEvent(req, "post_updated", "post", post.id, { ... });
    res.json(post);
  } catch (err) {
    console.error("[Backend PUT /posts/:id] ERROR in catch:", { ... });
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: "Failed to update post", ... });
    }
  }
});
```

### Middlewares de Error Global

```javascript
// Middleware 404
app.use((req, res) => {
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/login')) {
    console.error(`[404] Route not found: ${req.method} ${req.path}`);
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({ error: "Route not found", path: req.path, method: req.method });
  }
});

// Middleware de error global
app.use((err, req, res, next) => {
  console.error('[Global Error Handler] Unhandled error:', { ... });
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json');
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
      path: req.path,
      method: req.method,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
});

// IMPORTANTE: module.exports debe ir DESPUÉS de todos los middlewares
module.exports = app;
```

### Inicialización de Prisma

```javascript
let prisma;
try {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[Prisma] ⚠️ DATABASE_URL not set, database operations will fail");
    prisma = null;
  } else {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
      datasources: { db: { url: databaseUrl } },
    });
  }
} catch (error) {
  console.error("[Prisma] ❌ Error initializing Prisma:", error);
  prisma = null;
}
```

## Lo Que Hemos Intentado

1. ✅ **Mover middlewares de error antes de `module.exports`**: Para asegurar que se ejecuten en Vercel serverless
2. ✅ **Añadir verificaciones de Prisma**: En todos los endpoints para evitar errores cuando `prisma === null`
3. ✅ **Envolver transacciones en try-catch**: Con logging detallado
4. ✅ **Verificar `res.headersSent`**: Antes de enviar respuestas
5. ✅ **Establecer `Content-Type: application/json`**: Explícitamente en todos los errores
6. ✅ **Mejorar `logAuditEvent`**: Añadir verificación de Prisma y mejor manejo de errores
7. ✅ **Añadir try-catch en endpoints de autenticación**: `/auth/me` y `/auth/login`

## Hipótesis Sobre la Causa

### Hipótesis 1: Error Ocurre Antes de Middlewares
El error puede estar ocurriendo **antes** de que se ejecuten los middlewares de error, posiblemente:
- En la inicialización del módulo (cuando Vercel carga la función)
- En un middleware que se ejecuta antes de los middlewares de error
- En la inicialización de Prisma o alguna dependencia

### Hipótesis 2: Error en Transacción de Prisma
La transacción `prisma.$transaction` puede estar fallando de una manera que no se captura correctamente:
- Timeout de la transacción
- Error de conexión a Supabase
- Constraint violation que no se maneja correctamente

### Hipótesis 3: Error Después de Enviar Respuesta
Un error puede estar ocurriendo **después** de que se envía `res.json(post)`, causando que Vercel devuelva su página de error HTML:
- Error en `logAuditEvent` después de enviar la respuesta
- Error en invalidación de cache
- Error asíncrono no capturado

### Hipótesis 4: Problema con Vercel Serverless
En entornos serverless, cada request puede ejecutarse en una instancia nueva:
- Prisma puede no estar inicializado correctamente en algunas instancias
- Variables de entorno pueden no estar disponibles
- Timeouts de Vercel pueden estar cortando la ejecución

## Preguntas Específicas

1. **¿Cómo podemos asegurar que TODOS los errores devuelvan JSON en lugar de HTML en Vercel serverless?**
2. **¿Hay alguna forma de capturar errores que ocurren durante la inicialización del módulo en Vercel?**
3. **¿Cómo podemos debuggear mejor estos errores intermitentes en producción?**
4. **¿Hay algún problema conocido con Prisma + Supabase + Vercel que cause estos problemas?**
5. **¿Deberíamos usar un wrapper alrededor de `module.exports = app` para capturar todos los errores?**

## Información Adicional

- **Logs de Vercel**: Los logs muestran errores pero a veces no son claros sobre la causa raíz
- **Comportamiento intermitente**: Los errores no ocurren siempre, lo que sugiere un problema de timing o estado
- **Local funciona**: El código funciona correctamente en desarrollo local
- **Error específico**: El mensaje "A server e..." sugiere que Vercel está devolviendo su página de error HTML por defecto

## Código del Endpoint Completo

El endpoint `PUT /posts/:id` realiza:
1. Validaciones de entrada
2. Verificación de permisos
3. Transacción de Prisma para actualizar bloques (si hay bloques)
4. Actualización de thumbnail (si aplica)
5. Invalidación de cache
6. Log de auditoría
7. Respuesta JSON

Todos estos pasos están envueltos en try-catch, pero aún así a veces se devuelve HTML.

## Necesitamos

Una solución que garantice que **NUNCA** se devuelva HTML, solo JSON, incluso si:
- Hay un error no capturado
- La transacción de Prisma falla
- Hay un error después de enviar la respuesta
- Hay un problema con la inicialización


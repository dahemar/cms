console.log("[Init] ========== SERVER INITIALIZATION START ==========");
console.log("[Init] Timestamp:", new Date().toISOString());
console.log("[Init] Node version:", process.version);
console.log("[Init] NODE_ENV:", process.env.NODE_ENV);

// Cargar dotenv solo si existe (opcional, Vercel ya tiene las variables de entorno)
try {
  console.log("[Init] Loading dotenv...");
  require("dotenv").config();
  console.log("[Init] ✅ dotenv loaded");
} catch (error) {
  // dotenv no es crítico, continuar sin él
  console.log("[Init] ⚠️ dotenv not available, using environment variables");
}

console.log("[Init] Loading dependencies...");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const passport = require("passport");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
console.log("[Init] ✅ Basic dependencies loaded");

console.log("[Init] Loading Prisma...");
const { PrismaClient } = require("@prisma/client");
console.log("[Init] ✅ PrismaClient imported");

console.log("[Init] Loading email service...");
const { sendVerificationEmail, sendPasswordResetEmail } = require("./emailService");
console.log("[Init] ✅ Email service loaded");

console.log("[Init] Loading profiles registry...");
let getProfileByName, listProfiles, syncProfilesToDb;
try {
  const registry = require("./profiles/registry");
  getProfileByName = registry.getProfileByName;
  listProfiles = registry.listProfiles;
  syncProfilesToDb = registry.syncProfilesToDb;
  console.log("[Init] ✅ Profiles registry loaded");
} catch (error) {
  console.error("[Init] ❌ Error loading profiles registry:", error.message);
  console.error("[Init] Error stack:", error.stack);
  // Crear funciones stub para evitar crashes
  getProfileByName = () => null;
  listProfiles = () => [];
  syncProfilesToDb = async () => 0;
  console.log("[Init] ⚠️ Using stub functions for profiles");
}

console.log("[Init] Loading session stores...");
let PrismaSessionStore;
let RedisStore;
let redis;

// Intentar cargar Redis (preferido para serverless)
try {
  const redis = require("redis");
  RedisStore = require("connect-redis").default;
  if (!RedisStore) {
    // Para versiones más antiguas de connect-redis
    RedisStore = require("connect-redis")(session);
  }
  console.log("[Init] ✅ Redis dependencies loaded");
} catch (error) {
  console.log("[Init] ⚠️ Redis not available, will use PrismaSessionStore");
  console.log("[Init] Error:", error.message);
}

// Cargar PrismaSessionStore como fallback
try {
  PrismaSessionStore = require("./PrismaSessionStore");
  console.log("[Init] ✅ PrismaSessionStore loaded");
} catch (error) {
  console.log("[Init] ⚠️ PrismaSessionStore not available");
}

console.log("[Init] Creating Express app...");
const app = express();
console.log("[Init] ✅ Express app created");

// Inicializar Prisma con manejo de errores
let prisma;
let sessionStore;

try {
  // Ajustar DATABASE_URL para serverless: aumentar timeouts
  let databaseUrl = process.env.DATABASE_URL;
  if (isProduction && databaseUrl) {
    try {
      // Asegurar que los timeouts estén configurados para serverless
      const urlObj = new URL(databaseUrl);
      urlObj.searchParams.set('connect_timeout', '30');
      urlObj.searchParams.set('pool_timeout', '30');
      urlObj.searchParams.set('statement_cache_size', '0'); // Desactivar cache para serverless
      databaseUrl = urlObj.toString();
      console.log("[Prisma] ✅ DATABASE_URL adjusted for serverless");
    } catch (urlError) {
      console.warn("[Prisma] ⚠️ Could not parse DATABASE_URL, using original:", urlError.message);
      // Si hay error parseando la URL, usar la original
      databaseUrl = process.env.DATABASE_URL;
    }
  }
  
  if (!databaseUrl) {
    console.error("[Prisma] ❌ DATABASE_URL is not set!");
    // No lanzar error aquí, permitir que la app inicie y devolver error JSON en los endpoints
    console.warn("[Prisma] ⚠️ DATABASE_URL not set, database operations will fail");
  }
  
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  console.log("[Prisma] ✅ PrismaClient initialized");
  
  // Intentar crear la tabla Session si no existe (crítico para sesiones en producción)
  // Ejecutar de forma asíncrona sin bloquear el inicio del servidor
  process.nextTick(async () => {
    try {
      // Verificar si la tabla existe intentando hacer una query
      await prisma.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
      console.log("[Session Table] ✅ Session table exists");
    } catch (error) {
      if (error.code === 'P2021' || error.message?.includes('does not exist') || (error.message?.includes('relation') && error.message?.includes('does not exist'))) {
        console.log("[Session Table] ⚠️ Session table does not exist, creating it...");
        try {
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Session" (
                "id" TEXT NOT NULL,
                "data" TEXT NOT NULL,
                "expiresAt" TIMESTAMP(3) NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
            );
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
          `);
          console.log("[Session Table] ✅ Session table created successfully!");
        } catch (createError) {
          console.error("[Session Table] ❌ Failed to create Session table:", createError.message);
          console.error("[Session Table] Error code:", createError.code);
          console.error("[Session Table] Sessions will not persist. Please create the table manually.");
        }
      } else {
        console.error("[Session Table] ⚠️ Error checking Session table:", error.message);
        console.error("[Session Table] Error code:", error.code);
      }
    }
  });
  
  // Inicializar session store: Redis (preferido) o Prisma (fallback)
  // Redis es ideal para serverless porque persiste entre invocaciones
  
  // Construir Redis URL desde variables de entorno de Upstash si están disponibles
  let redisUrl = process.env.REDIS_URL;
  if (!redisUrl && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    // Construir Redis URL desde REST URL y TOKEN de Upstash
    const restUrl = process.env.UPSTASH_REDIS_REST_URL.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    // Upstash puede usar puerto 6379 o 6380, intentar 6379 primero
    const port = process.env.UPSTASH_REDIS_PORT || '6379';
    redisUrl = `redis://default:${encodeURIComponent(token)}@${restUrl}:${port}`;
    console.log("[Session Store] ✅ Constructed Redis URL from UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
    console.log("[Session Store] Redis URL host:", restUrl);
    console.log("[Session Store] Redis URL port:", port);
  }
  
  if (RedisStore && redisUrl) {
    try {
      console.log("[Session Store] Attempting to initialize Redis store...");
      console.log("[Session Store] Redis URL constructed (first 50 chars):", redisUrl.substring(0, 50) + "...");
      const redisClient = require("redis");
      redis = redisClient.createClient({ 
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error("[Session Store] ❌ Max reconnection attempts reached");
              return new Error("Max reconnection attempts reached");
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });
      
      redis.on('error', (err) => {
        console.error("[Session Store] ❌ Redis client error:", err.message);
      });
      
      redis.on('connect', () => {
        console.log("[Session Store] ✅ Redis client connected");
      });
      
      redis.on('ready', () => {
        console.log("[Session Store] ✅ Redis client ready");
      });
      
      // Conectar Redis (no bloqueante, async)
      redis.connect().then(() => {
        console.log("[Session Store] ✅ Redis connection established");
      }).catch((err) => {
        console.error("[Session Store] ⚠️ Redis connection failed:", err.message);
        console.error("[Session Store] Error details:", {
          code: err.code,
          message: err.message
        });
        console.log("[Session Store] Will try PrismaSessionStore as fallback");
        sessionStore = undefined;
        redis = undefined;
      });
      
      // Crear RedisStore - la API puede variar según la versión
      // El store puede funcionar incluso si la conexión aún no está lista
      try {
        sessionStore = new RedisStore({ 
          client: redis,
          prefix: "sess:",
        });
        console.log("[Session Store] ✅ Redis store created (connection may still be establishing)");
      } catch (storeError) {
        // Intentar con la API antigua de connect-redis
        try {
          sessionStore = new RedisStore(session, { 
            client: redis,
            prefix: "sess:",
          });
          console.log("[Session Store] ✅ Redis store created with legacy API");
        } catch (legacyError) {
          console.error("[Session Store] ❌ Failed to create RedisStore:", legacyError.message);
          throw legacyError;
        }
      }
    } catch (error) {
      console.error("[Session Store] ⚠️ Error initializing Redis store:", error.message);
      console.error("[Session Store] Error stack:", error.stack);
      console.log("[Session Store] Will try PrismaSessionStore as fallback");
      sessionStore = undefined;
      redis = undefined;
    }
  }
  
  // Fallback a PrismaSessionStore si Redis no está disponible
  if (!sessionStore && PrismaSessionStore && prisma) {
    try {
      sessionStore = new PrismaSessionStore(prisma);
      console.log("[Session Store] ✅ PrismaSessionStore initialized as fallback");
    } catch (error) {
      console.error("[Session Store] ⚠️ Error initializing PrismaSessionStore:", error.message);
      console.error("[Session Store] Will use memory store as fallback");
      sessionStore = undefined;
    }
  }
  
  if (!sessionStore) {
    console.log("[Session Store] ⚠️ No persistent store available, using memory store");
    console.log("[Session Store] ⚠️ WARNING: Sessions will not persist between serverless invocations!");
    sessionStore = undefined;
  }
} catch (error) {
  console.error("[Prisma] ❌ Error initializing PrismaClient:", error);
  console.error("[Prisma] Error message:", error.message);
  console.error("[Prisma] Error code:", error.code);
  console.error("[Prisma] DATABASE_URL present:", !!process.env.DATABASE_URL);
  console.error("[Prisma] Stack:", error.stack);
  // Intentar inicializar Prisma sin modificar la URL si falló
  try {
    console.log("[Prisma] ⚠️ Retrying with original DATABASE_URL...");
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
    });
    console.log("[Prisma] ✅ PrismaClient initialized with fallback");
  } catch (fallbackError) {
    console.error("[Prisma] ❌ Fallback initialization also failed:", fallbackError.message);
    // No lanzar el error aquí, dejar que el servidor intente iniciar
    // Prisma se inicializará cuando se necesite
    prisma = null;
    sessionStore = undefined;
  }
}

// Profiles are read-only and loaded from disk (backend/profiles/*.json).
// We keep a DB mirror so sites can reference a profile via FK, but disk remains the source of truth.
// Ejecutar de forma asíncrona sin bloquear el inicio del servidor
// Usar process.nextTick para asegurar que se ejecute después de que el módulo esté completamente cargado
process.nextTick(() => {
  if (prisma) {
    syncProfilesToDb(prisma)
      .then((count) => {
        console.log(`[Profiles] ✅ Synced ${count} frontend profile(s) from disk`);
      })
      .catch((err) => {
        console.warn(
          "[Profiles] ⚠️ Failed to sync profiles from disk (server will continue):",
          err?.message || err
        );
      });
  }
});

// Configuración de entorno
const isProduction = process.env.NODE_ENV === "production";

// CORS: En producción, evitar wildcard cuando credentials: true
// Usar función dinámica para permitir subdominios de Vercel
let corsOptions;
if (isProduction) {
  if (process.env.ALLOWED_ORIGINS) {
    const allowedOriginsList = process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
    corsOptions = {
      origin: allowedOriginsList,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Set-Cookie'],
    };
    console.log("[Init] CORS allowed origins (explicit):", allowedOriginsList);
  } else {
    // En Vercel, permitir todos los subdominios de vercel.app dinámicamente
    corsOptions = {
      origin: (origin, callback) => {
        // Permitir requests sin origin (ej: Postman, curl, server-to-server)
        if (!origin) {
          console.log("[CORS] Request without origin, allowing");
          return callback(null, true);
        }
        console.log("[CORS] Checking origin:", origin);
        // Permitir cualquier subdominio de vercel.app, localhost, o cualquier dominio de Vercel
        if (origin.includes('.vercel.app') || 
            origin.includes('localhost') || 
            origin.includes('127.0.0.1') ||
            origin.endsWith('.vercel.app')) {
          console.log("[CORS] Origin allowed:", origin);
          return callback(null, true);
        }
        console.log("[CORS] Origin blocked:", origin);
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Set-Cookie'],
    };
    console.log("[Init] CORS configured with dynamic origin function (Vercel)");
  }
} else {
  corsOptions = {
    origin: true, // En desarrollo, permitir cualquier origen
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
  };
  console.log("[Init] CORS configured for development (all origins)");
}

// Validar que SESSION_SECRET esté configurado en producción
if (isProduction && !process.env.SESSION_SECRET) {
  console.error(
    "ERROR: SESSION_SECRET must be set in production. Add it to your .env file."
  );
  console.error("WARNING: Server will continue but sessions may not work correctly.");
  // NO hacer process.exit(1) en Vercel, solo loguear el error
}

// Configurar CORS con credenciales para sesiones
console.log("[Init] Setting up CORS and body parsers...");
try {
  // Aplicar CORS middleware
  app.use(cors(corsOptions));
  
  // Manejar preflight requests explícitamente
  // El middleware de CORS debería manejar esto, pero lo reforzamos para asegurar que funcione
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      // Aplicar CORS manualmente para preflight
      const origin = req.headers.origin;
      let allowOrigin = false;
      
      if (origin) {
        // Si ALLOWED_ORIGINS está configurada, verificar contra la lista
        if (isProduction && process.env.ALLOWED_ORIGINS) {
          const allowedOriginsList = process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
          allowOrigin = allowedOriginsList.includes(origin);
        } else {
          // Si no está configurada, permitir cualquier subdominio de vercel.app
          allowOrigin = origin.includes('.vercel.app') || 
                       origin.includes('localhost') || 
                       origin.includes('127.0.0.1') ||
                       origin.endsWith('.vercel.app');
        }
        
        if (allowOrigin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
        }
      }
      return res.status(204).end();
    }
    next();
  });
  
  console.log("[Init] ✅ CORS configured with credentials support");
  
  // Aumentar límite del body parser para permitir imágenes base64 grandes
  app.use(express.json({ limit: '50mb' })); // Para parsear JSON en POST/PUT
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  console.log("[Init] ✅ Body parsers configured");
} catch (error) {
  console.error("[Init] ❌ Error setting up CORS/body parsers:", error.message);
  console.error("[Init] Error stack:", error.stack);
  // Continuar sin estos middlewares si fallan
}

// IMPORTANTE: express-session DEBE estar ANTES de Passport
// Configurar sesiones
console.log("[Init] Setting up session middleware...");
const sessionSecret = process.env.SESSION_SECRET || (() => {
  if (isProduction) {
    console.error(
      "ERROR: SESSION_SECRET must be set in production. Add it to your .env file."
    );
    console.error("WARNING: Using a default secret (NOT SECURE). Sessions may not work correctly.");
    // NO hacer process.exit(1) en Vercel, usar un valor por defecto
    return "default-production-secret-CHANGE-THIS";
  }
  // Solo en desarrollo, usar un valor por defecto (NO SEGURO)
  console.warn(
    "⚠️  WARNING: Using default SESSION_SECRET. Set SESSION_SECRET in .env for production!"
  );
  return "default-dev-secret-change-in-production";
})();

// Aplicar middleware de sesión SIEMPRE (no dentro de try-catch para asegurar que se aplique)
app.use(
  session({
    secret: sessionSecret,
    store: sessionStore || undefined, // Usar Prisma para almacenamiento persistente (fallback a memoria si falla)
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction, // true en producción (requiere HTTPS) - siempre true en Vercel
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
      // sameSite: "none" es necesario cuando frontend y backend están en diferentes dominios
      // Requiere secure: true (que ya está configurado en producción)
      sameSite: isProduction ? "none" : "lax", // "none" para cross-site, "lax" para mismo dominio
      // NO establecer domain explícitamente - algunos navegadores rechazan cookies con domain cuando sameSite=none
      domain: undefined, // undefined = dominio actual (funciona mejor con sameSite=none)
      path: "/", // Asegurar que la cookie se aplica a todas las rutas
    },
    name: 'connect.sid', // Nombre explícito de la cookie de sesión
    // Asegurar que la cookie se envía en todas las respuestas
    rolling: true, // Renovar la cookie en cada request
  })
);
console.log("[Init] ✅ Session middleware configured");

// Inicializar Passport (DESPUÉS de express-session)
console.log("[Init] Setting up Passport...");
try {
  app.use(passport.initialize());
  app.use(passport.session());
  console.log("[Init] ✅ Passport configured");
} catch (error) {
  console.error("[Init] ❌ Error setting up Passport:", error.message);
  console.error("[Init] Error stack:", error.stack);
}

// Configurar Passport para serializar/deserializar usuarios
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, isAdmin: true, emailVerified: true },
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});


// ==================== CACHE DE CONTENIDO ====================
// Cache simple en memoria (en producción, usar Redis)
const contentCache = new Map();
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 300000; // 5 minutos por defecto

function getCacheKey(endpoint, params) {
  return `${endpoint}:${JSON.stringify(params)}`;
}

function getCached(key) {
  const cached = contentCache.get(key);
  if (!cached) return null;
  
  // Verificar si el cache ha expirado
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    contentCache.delete(key);
    return null;
  }
  
  return cached.data;
}

function setCache(key, data) {
  contentCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

function invalidateCache(pattern) {
  // Invalidar cache por patrón (ej: "posts:*" invalida todos los posts)
  if (pattern.includes('*')) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of contentCache.keys()) {
      if (regex.test(key)) {
        contentCache.delete(key);
      }
    }
  } else {
    contentCache.delete(pattern);
  }
}

// Limpiar cache expirado periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of contentCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      contentCache.delete(key);
    }
  }
}, 60000); // Cada minuto

// ==================== SISTEMA DE AUDITORÍA ====================
async function logAuditEvent(req, action, resource = null, resourceId = null, details = null) {
  try {
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId || req.session?.userId || null;
    const siteId = req.siteId || null;
    const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        siteId,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // No fallar si el logging falla, solo loguear el error
    console.error("[Audit] Failed to log event:", error);
  }
}

// Middleware de auditoría para acciones importantes
function auditMiddleware(action, getResource = null, getResourceId = null, getDetails = null) {
  return async (req, res, next) => {
    // Ejecutar la acción primero
    await next();
    
    // Si la respuesta fue exitosa, registrar en auditoría
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const resource = getResource ? getResource(req, res) : null;
      const resourceId = getResourceId ? getResourceId(req, res) : null;
      const details = getDetails ? getDetails(req, res) : null;
      
      await logAuditEvent(req, action, resource, resourceId, details);
    }
  };
}

// ==================== RATE LIMITING ====================
// Helper para obtener IP real desde headers (soporta Vercel/proxies)
function getRealIP(req) {
  // En Vercel, usar x-forwarded-for o x-vercel-forwarded-for
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for puede contener múltiples IPs, tomar la primera
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || 'unknown';
}

// Rate limiting para endpoints públicos (más permisivo)
const publicRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (reduced for development)
  max: 200, // Aumentar límite para desarrollo
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIP,
});

// Rate limiting para endpoints de autenticación (más estricto)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos de login por ventana
  message: { error: "Too many authentication attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // No contar requests exitosos
  keyGenerator: getRealIP,
});

// Rate limiting para endpoints de admin (moderado)
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // 200 requests por ventana
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIP,
});

const path = require("path");

// Health check endpoint (sin dependencias de Prisma)
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    prisma: prisma ? "initialized" : "not initialized"
  });
});

// Serve admin HTML files
app.get("/admin", (req, res) => {
  try {
    res.sendFile(path.join(__dirname, "../admin/admin.html"));
  } catch (error) {
    console.error("[Admin] Error serving admin.html:", error);
    res.status(500).send("Error loading admin panel");
  }
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../admin/admin.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../admin/login.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../admin/login.html"));
});

// Serve admin static assets
app.use("/admin", express.static(path.join(__dirname, "../admin")));

// Root route - redirect to admin panel
app.get("/", (req, res) => {
  res.redirect("/admin");
});

app.get("/api/pages", (req, res) => {
  res.json([
    { id: 1, title: "Home", body: "Welcome to my site" },
    { id: 2, title: "About", body: "This is a demo CMS" },
  ]);
});
  try {
    // Solo permitir a admins
    const userId = req.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true }
    });

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Only admins can execute this action" });
    }

    console.log("[POST /api/admin/update-sites-and-user] Executing update script...");

    const bcrypt = require("bcrypt");

    // 1. Actualizar nombre del sitio "test-frontend" a "cineclube"
    const testFrontendSite = await prisma.site.findFirst({
      where: {
        OR: [
          { slug: "test-frontend" },
          { slug: { contains: "test-frontend" } }
        ]
      }
    });

    let results = {};

    if (testFrontendSite) {
      const updatedSite1 = await prisma.site.update({
        where: { id: testFrontendSite.id },
        data: { name: "cineclube" }
      });
      results.testFrontend = { updated: true, newName: updatedSite1.name, id: updatedSite1.id };
      console.log(`✅ Updated site "${testFrontendSite.slug}" name to: "${updatedSite1.name}"`);
    } else {
      results.testFrontend = { updated: false, message: "Site not found" };
      console.log("⚠️  Site 'test-frontend' not found");
    }

    // 2. Actualizar nombre del sitio "react-frontend" a "sympaathy"
    const reactFrontendSite = await prisma.site.findFirst({
      where: {
        OR: [
          { slug: "react-frontend" },
          { slug: { contains: "react-frontend" } },
          { name: { contains: "React" } }
        ]
      }
    });

    if (reactFrontendSite) {
      const updatedSite2 = await prisma.site.update({
        where: { id: reactFrontendSite.id },
        data: { name: "sympaathy" }
      });
      results.reactFrontend = { updated: true, newName: updatedSite2.name, id: updatedSite2.id };
      console.log(`✅ Updated site "${reactFrontendSite.slug}" name to: "${updatedSite2.name}"`);
    } else {
      results.reactFrontend = { updated: false, message: "Site not found" };
      console.log("⚠️  Site 'react-frontend' not found");
    }

    // 3. Buscar el sitio cineclube (por ID 3 o por nombre)
    const cineclubeSite = await prisma.site.findFirst({
      where: {
        OR: [
          { id: 3 },
          { slug: "test-frontend" },
          { name: { contains: "cineclube" } }
        ]
      }
    });

    if (!cineclubeSite) {
      return res.status(404).json({ error: "Cineclube site not found", results });
    }

    // 4. Crear o actualizar usuario neuzaaneuza@gmail.com
    const userEmail = "neuzaaneuza@gmail.com";
    let user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      const password = "neuzaneuza";
      const hashedPassword = await bcrypt.hash(password, 10);
      
      user = await prisma.user.create({
        data: {
          email: userEmail,
          password: hashedPassword,
          isAdmin: false,
          emailVerified: false
        }
      });
      results.user = { created: true, email: userEmail, id: user.id };
      console.log(`✅ Created user: ${userEmail}`);
    } else {
      const password = "neuzaneuza";
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          isAdmin: false
        }
      });
      results.user = { updated: true, email: userEmail, id: user.id };
      console.log(`✅ Updated user: ${userEmail}`);
    }

    // 5. Asignar usuario al sitio cineclube
    await prisma.userSite.upsert({
      where: {
        userId_siteId: {
          userId: user.id,
          siteId: cineclubeSite.id
        }
      },
      create: {
        userId: user.id,
        siteId: cineclubeSite.id
      },
      update: {}
    });

    results.userSite = { assigned: true, siteId: cineclubeSite.id, siteName: cineclubeSite.name };

    console.log(`✅ Assigned user ${userEmail} to site "${cineclubeSite.name}" (id=${cineclubeSite.id})`);

    res.json({
      success: true,
      message: "Sites updated and user created/updated successfully",
      results
    });
  } catch (err) {
    console.error("[POST /api/admin/update-sites-and-user] ERROR:", err);
    res.status(500).json({ error: "Failed to update sites and user", message: err.message });
  }
});

// Helper: generar token aleatorio seguro
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

// Helper: generar slug desde título
function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remover caracteres especiales
    .replace(/[\s_-]+/g, "-") // Reemplazar espacios/guiones con un solo guion
    .replace(/^-+|-+$/g, ""); // Remover guiones al inicio/final
}

// Helper: generar slug único (añade número si ya existe) dentro de un sitio
async function generateUniqueSlug(baseSlug, siteId) {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.post.findUnique({
      where: { siteId_slug: { siteId: siteId, slug: slug } },
    });
    
    if (!existing) {
      return slug; // Slug único encontrado
    }
    
    // Si existe, añadir un número al final
    slug = `${baseSlug}-${counter}`;
    counter++;
    
    // Prevenir loops infinitos (máximo 1000 intentos)
    if (counter > 1000) {
      // Si llegamos aquí, usar timestamp como fallback
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }
  
  return slug;
}

// Helper: convertir URL de Imgur (álbum/post) a URL directa de imagen
function convertImgurUrl(url) {
  // URLs directas de Imgur (i.imgur.com) ya están bien
  if (url.includes("i.imgur.com")) {
    return url;
  }

  // Convertir URLs de Imgur a URL directa
  // Ejemplo: https://imgur.com/9S1xRRy -> https://i.imgur.com/9S1xRRy.jpg (POST INDIVIDUAL - FUNCIONA)
  // Ejemplo: https://imgur.com/a/nwSCQCJ -> https://i.imgur.com/nwSCQCJ.jpg (ÁLBUM - puede fallar)
  // Ejemplo: https://imgur.com/gallery/abc123 -> https://i.imgur.com/abc123.jpg

  const imgurPatterns = [
    /imgur\.com\/([a-zA-Z0-9]+)$/, // Post individual: /ID (sin /a/ ni /gallery/) - PRIORIDAD
    /imgur\.com\/a\/([a-zA-Z0-9]+)/, // Álbum: /a/ID
    /imgur\.com\/gallery\/([a-zA-Z0-9]+)/, // Gallery: /gallery/ID
  ];

  for (const pattern of imgurPatterns) {
    const match = url.match(pattern);
    if (match) {
      const imageId = match[1];
      // Intentar con .jpg primero (formato más común)
      return `https://i.imgur.com/${imageId}.jpg`;
    }
  }

  // Si no coincide con ningún patrón, devolver la URL original
  return url;
}

// Helper: extraer ID de YouTube de diferentes formatos de URL
function extractYouTubeId(url) {
  if (!url) return null;

  // Diferentes formatos de URLs de YouTube:
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
  // https://youtube.com/watch?v=VIDEO_ID

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Helper: validar y normalizar URL de YouTube
function validateYouTubeUrl(url) {
  if (!url || url.trim() === "") {
    return { valid: true, error: null, videoId: null }; // URL opcional
  }

  try {
    const urlObj = new URL(url);
    // Verificar que sea HTTPS o HTTP
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return { valid: false, error: "URL must use HTTP or HTTPS", videoId: null };
    }

    // Extraer ID de YouTube
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return { valid: false, error: "Invalid YouTube URL. Supported formats: youtube.com/watch?v=ID or youtu.be/ID", videoId: null };
    }

    // Normalizar a URL de embed
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    return { valid: true, error: null, videoId, embedUrl };
  } catch (err) {
      return { valid: false, error: "Invalid URL", videoId: null };
  }
}

// Helper: extraer ID de Vimeo de diferentes formatos de URL
function extractVimeoId(url) {
  if (!url) return null;

  // Diferentes formatos de URLs de Vimeo:
  // https://vimeo.com/VIDEO_ID
  // https://vimeo.com/channels/CHANNEL/VIDEO_ID
  // https://vimeo.com/groups/GROUP/videos/VIDEO_ID
  // https://player.vimeo.com/video/VIDEO_ID

  const patterns = [
    /vimeo\.com\/(?:channels\/[^\/]+\/|groups\/[^\/]+\/videos\/|)(\d+)/, // Cualquier formato de vimeo.com
    /player\.vimeo\.com\/video\/(\d+)/, // URL directa del player
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Helper: validar y normalizar URL de Vimeo
function validateVimeoUrl(url) {
  if (!url || url.trim() === "") {
    return { valid: true, error: null, videoId: null }; // URL opcional
  }

  try {
    const urlObj = new URL(url);
    // Verificar que sea HTTPS o HTTP
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return { valid: false, error: "URL must use HTTP or HTTPS", videoId: null };
    }

    // Extraer ID de Vimeo
    const videoId = extractVimeoId(url);
    if (!videoId) {
      return { valid: false, error: "Invalid Vimeo URL. Supported formats: vimeo.com/VIDEO_ID or player.vimeo.com/video/VIDEO_ID", videoId: null };
    }

    // Normalizar a URL de embed
    const embedUrl = `https://player.vimeo.com/video/${videoId}`;
    return { valid: true, error: null, videoId, embedUrl };
  } catch (err) {
      return { valid: false, error: "Invalid URL", videoId: null };
  }
}

// Helper: validar URL de imagen (opcional, permite cualquier URL válida)
function validateImageUrl(url) {
  if (!url || url.trim() === "") {
    return { valid: true, error: null, convertedUrl: null }; // URL opcional
  }

  try {
    const urlObj = new URL(url);
    // Verificar que sea HTTPS o HTTP
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return { valid: false, error: "La URL debe usar HTTP o HTTPS", convertedUrl: null };
    }

    // Convertir URLs de Imgur si es necesario
    let finalUrl = url;
    if (url.includes("imgur.com") && !url.includes("i.imgur.com")) {
      finalUrl = convertImgurUrl(url);
      console.log(`Imgur URL converted: ${url} -> ${finalUrl}`);
    }

    // Validar extensiones comunes de imagen (opcional, pero recomendado)
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
    if (!imageExtensions.test(new URL(finalUrl).pathname)) {
      // No es un error crítico, solo una advertencia
      console.warn(`Image URL without common extension: ${finalUrl}`);
    }

    return { valid: true, error: null, convertedUrl: finalUrl };
  } catch (err) {
      return { valid: false, error: "Invalid URL", convertedUrl: null };
  }
}

// Middleware: Resolver sitio desde el dominio (Host header)
// Si ya hay siteId en query/body (admin panel), lo usa directamente
// Si no, resuelve desde el dominio (frontend público)
async function resolveSiteFromDomain(req, res, next) {
  try {
    console.log(`[resolveSiteFromDomain] ========== INICIO ==========`);
    console.log(`[resolveSiteFromDomain] URL: ${req.method} ${req.url}`);
    console.log(`[resolveSiteFromDomain] Query params:`, req.query);
    console.log(`[resolveSiteFromDomain] Body:`, req.body);
    
    // Si ya hay siteId en query params o body (admin panel), usarlo directamente
    const siteIdFromQuery = req.query && req.query.siteId ? parseInt(req.query.siteId) : null;
    const siteIdFromBody = req.body && req.body.siteId ? parseInt(req.body.siteId) : null;
    const siteId = siteIdFromQuery || siteIdFromBody;
    
    console.log(`[resolveSiteFromDomain] siteIdFromQuery: ${siteIdFromQuery}, siteIdFromBody: ${siteIdFromBody}, final siteId: ${siteId}`);
    
    if (siteId && !isNaN(siteId)) {
      console.log(`[resolveSiteFromDomain] Using siteId from query/body: ${siteId}`);
      // Verificar que el sitio existe
      const site = await prisma.site.findUnique({
        where: { id: siteId },
      });
      
      if (!site) {
        console.error(`[resolveSiteFromDomain] Site not found with id: ${siteId}`);
        return res.status(404).json({ error: `Site not found with id: ${siteId}` });
      }
      
      req.siteId = siteId;
      req.site = site;
      console.log(`[resolveSiteFromDomain] Site resolved: ${site.name} (id: ${siteId})`);
      console.log(`[resolveSiteFromDomain] ========== FIN (query/body) ==========`);
      return next();
    }
    
    console.log(`[resolveSiteFromDomain] No siteId in query/body, resolving from domain...`);
    
    // Si no hay siteId, resolver desde el dominio (frontend público)
    const host = req.get('host') || req.headers.host;
    
    if (!host) {
      return res.status(400).json({ error: "Host header is required when siteId is not provided" });
    }

    // Normalizar el dominio (remover puerto si existe)
    let domain = host.split(':')[0]; // Remover puerto (ej: localhost:8001 -> localhost)
    
    // En desarrollo, manejar localhost de manera especial
    // Si es localhost, buscar un sitio con domain = null o usar el dominio de desarrollo configurado
    if (domain === 'localhost' || domain === '127.0.0.1') {
      // Opción 1: Buscar sitio con domain = null (sitio por defecto para desarrollo)
      let site = await prisma.site.findFirst({
        where: { domain: null },
      });
      
      // Opción 2: Si no hay sitio con domain null, usar DEV_DOMAIN de .env
      if (!site && process.env.DEV_DOMAIN) {
        site = await prisma.site.findFirst({
          where: { domain: process.env.DEV_DOMAIN },
        });
      }
      
      // Opción 3: Si aún no hay sitio, usar el primer sitio disponible (fallback)
      if (!site) {
        site = await prisma.site.findFirst({
          orderBy: { id: 'asc' },
        });
      }
      
      if (!site) {
        return res.status(404).json({ error: "No site found for development. Please create a site first." });
      }
      
      req.siteId = site.id;
      req.site = site;
      console.log(`[resolveSiteFromDomain] Site resolved from localhost: ${site.name} (id: ${site.id})`);
      return next();
    }
    
    // En producción: buscar sitio por dominio exacto
    console.log(`[resolveSiteFromDomain] Looking for site with domain: ${domain}`);
    const site = await prisma.site.findFirst({
      where: { domain: domain },
    });
    
    if (!site) {
      console.error(`[resolveSiteFromDomain] Site not found for domain: ${domain}`);
      return res.status(404).json({ 
        error: `Site not found for domain: ${domain}. Please configure the site domain in the admin panel.` 
      });
    }
    
    req.siteId = site.id;
    req.site = site;
    console.log(`[resolveSiteFromDomain] Site resolved from domain: ${site.name} (id: ${site.id})`);
    next();
  } catch (err) {
    console.error("[resolveSiteFromDomain] ERROR:", err);
    console.error("[resolveSiteFromDomain] Error stack:", err.stack);
    res.status(500).json({ 
      error: "Failed to resolve site from domain",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

// Middleware de autenticación
// Middleware de autenticación (usa JWT o sesión como fallback)
function requireAuth(req, res, next) {
  // Intentar obtener userId de JWT primero
  let userId = req.userId; // De verifyJWT middleware si fue llamado antes
  
  // Si no hay JWT, intentar verificar JWT del header (SIEMPRE verificar primero)
  const authHeader = req.headers.authorization;
  if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      req.userId = userId;
      req.userEmail = decoded.email;
      req.isAdmin = decoded.isAdmin || false;
    } catch (jwtError) {
      // JWT inválido, continuar con fallback a sesión
    }
  }
  
  // Fallback a sesión si no hay JWT
  if (!userId && req.session && req.session.userId) {
    userId = req.session.userId;
    req.userId = userId;
    req.userEmail = req.session.userEmail;
    req.isAdmin = req.session.isAdmin || false;
  }
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }
  
  return next();
}

// Middleware de autenticación por sitio (usa JWT o sesión)
async function requireSiteAuth(req, res, next) {
  // Obtener userId de JWT o sesión
  let userId = req.userId; // De verifyJWT middleware
  
  // Fallback a sesión si no hay JWT
  if (!userId && req.session && req.session.userId) {
    userId = req.session.userId;
  }
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }

  const siteId = req.body.siteId || req.query.siteId || req.params.siteId;
  
  if (!siteId) {
    return res.status(400).json({ error: "siteId is required" });
  }

  // Verificar que el usuario tenga acceso al sitio
  const userSite = await prisma.userSite.findUnique({
    where: {
      userId_siteId: {
        userId: userId,
        siteId: parseInt(siteId),
      },
    },
  });

  if (!userSite) {
    return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
  }

  // Añadir siteId al request para uso posterior
  req.siteId = parseInt(siteId);
  next();
}

// ==================== AUTENTICACIÓN ====================

// Configuración JWT
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "default-jwt-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

// Middleware para verificar JWT
function verifyJWT(req, res, next) {
  // Intentar obtener token del header Authorization
  const authHeader = req.headers.authorization;
  let token = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  } else if (req.query.token) {
    token = req.query.token;
  }
  
  if (!token) {
    // Si no hay token, intentar usar sesión como fallback
    if (req.session && req.session.userId) {
      req.userId = req.session.userId;
      req.userEmail = req.session.userEmail;
      req.isAdmin = req.session.isAdmin;
      return next();
    }
    return res.status(401).json({ error: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.isAdmin = decoded.isAdmin || false;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: "Invalid token" });
    }
    return res.status(401).json({ error: "Token verification failed" });
  }
}

// POST /auth/register - Registrar nuevo usuario
app.post("/auth/register", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Verificar si el email ya existe
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hashear password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario (emailVerified = false por defecto)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        emailVerified: false,
      },
    });

    // Generar token de verificación
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expira en 24 horas

    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Enviar email de verificación
    try {
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:8000";
      await sendVerificationEmail(email, token, baseUrl);
    } catch (emailError) {
      console.error("[Register] Failed to send verification email:", emailError);
      // No fallar el registro si el email falla, pero loguear el error
    }

    // Crear sesión (pero el usuario no está verificado aún)
    req.session.userId = user.id;
    req.session.userEmail = user.email;

    // Registrar en auditoría
    await logAuditEvent(req, "user_registered", "user", user.id, { email: user.email });

    res.status(201).json({
      message: "User registered successfully. Please check your email to verify your account.",
      user: { id: user.id, email: user.email, emailVerified: false },
      requiresVerification: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// POST /auth/login - Iniciar sesión
app.post("/auth/login", async (req, res) => {
  // Asegurar que siempre devolvemos JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Verificar que Prisma esté inicializado
    if (!prisma) {
      console.error("[Login] ❌ Prisma not initialized");
      console.error("[Login] DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "NOT SET");
      // Intentar inicializar Prisma si no está inicializado
      try {
        console.log("[Login] ⚠️ Attempting to initialize Prisma...");
        prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
        });
        await prisma.$connect();
        console.log("[Login] ✅ Prisma initialized successfully");
      } catch (initError) {
        console.error("[Login] ❌ Failed to initialize Prisma:", initError.message);
        return res.status(500).json({ 
          error: "Database connection not available",
          message: "Failed to initialize database connection. Please check server logs."
        });
      }
    }
    
    // Verificar conexión a la base de datos
    try {
      await prisma.$connect();
    } catch (connectError) {
      console.error("[Login] ❌ Failed to connect to database:", connectError.message);
      return res.status(500).json({ 
        error: "Database connection failed",
        message: connectError.message
      });
    }
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Si el usuario no tiene contraseña, no permitir login con contraseña
    if (!user.password) {
      return res.status(401).json({ 
        error: "This account does not have a password set. Please contact an administrator." 
      });
    }

    // Verificar password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verificar si el email está verificado (opcional, puedes hacerlo requerido)
    if (!user.emailVerified) {
      return res.status(403).json({ 
        error: "Email not verified. Please check your email and verify your account.",
        requiresVerification: true,
      });
    }

    // Crear sesión
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.isAdmin = user.isAdmin || false;
    
    console.log("[Login] Setting session data:", {
      userId: user.id,
      userEmail: user.email,
      isAdmin: user.isAdmin,
      sessionID: req.sessionID,
      cookie: req.session.cookie
    });
    
    // Guardar sesión explícitamente antes de enviar respuesta (crítico en serverless)
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error("[Login] ❌ Error saving session:", err);
          console.error("[Login] Session save error details:", {
            message: err.message,
            stack: err.stack,
            code: err.code
          });
          return reject(err);
        }
        console.log("[Login] ✅ Session saved successfully");
        console.log("[Login] Session ID:", req.sessionID);
        console.log("[Login] Session cookie will be set:", {
          secure: req.session.cookie.secure,
          sameSite: req.session.cookie.sameSite,
          httpOnly: req.session.cookie.httpOnly,
          maxAge: req.session.cookie.maxAge
        });
        resolve();
      });
    });
    
    // Verificar que la sesión se guardó correctamente
    try {
      if (sessionStore && typeof sessionStore.get === 'function') {
        await new Promise((resolve, reject) => {
          sessionStore.get(req.sessionID, (err, sessionData) => {
            if (err) {
              console.error("[Login] ❌ Error verifying session in store:", err);
              return reject(err);
            }
            if (sessionData) {
              console.log("[Login] ✅ Session verified in store, userId:", sessionData.userId);
            } else {
              console.warn("[Login] ⚠️ Session not found in store after save!");
            }
            resolve();
          });
        });
      }
    } catch (verifyErr) {
      console.error("[Login] ⚠️ Error verifying session (non-critical):", verifyErr);
    }
    
    // Generar JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        isAdmin: user.isAdmin || false,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    console.log("[Login] ✅ JWT token generated");
    
    // También mantener sesión como fallback (opcional)
    try {
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.isAdmin = user.isAdmin || false;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.warn("[Login] ⚠️ Session save failed (non-critical with JWT):", err.message);
          } else {
            console.log("[Login] ✅ Session also saved (fallback)");
          }
          resolve();
        });
      });
    } catch (sessionErr) {
      console.warn("[Login] ⚠️ Session save error (non-critical with JWT):", sessionErr.message);
    }
    
    res.json({
      message: "Login successful",
      token: token, // JWT token
      user: { id: user.id, email: user.email, emailVerified: user.emailVerified, isAdmin: user.isAdmin || false },
      expiresIn: JWT_EXPIRES_IN,
    });
    
    console.log("[Login] ✅ Login response sent with JWT token");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to login" });
  }
});

// POST /auth/logout - Cerrar sesión
app.post("/auth/logout", async (req, res) => {
  const userId = req.session?.userId;
  req.session.destroy(async (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    // Registrar en auditoría
    if (userId) {
      await logAuditEvent(req, "logout", "user", userId);
    }
    res.json({ message: "Logout successful" });
  });
});

// GET /auth/me - Obtener usuario actual (usa JWT o sesión como fallback)
app.get("/auth/me", async (req, res) => {
  console.log("[GET /auth/me] Checking authentication...");
  
  let userId = null;
  let userEmail = null;
  let isAdmin = false;
  
  // Intentar obtener usuario desde JWT primero
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userEmail = decoded.email;
      isAdmin = decoded.isAdmin || false;
      console.log("[GET /auth/me] ✅ Authenticated via JWT, userId:", userId);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        console.log("[GET /auth/me] ⚠️ JWT token expired");
      } else if (jwtError.name === 'JsonWebTokenError') {
        console.log("[GET /auth/me] ⚠️ Invalid JWT token");
      } else {
        console.log("[GET /auth/me] ⚠️ JWT verification error:", jwtError.message);
      }
    }
  }
  
  // Fallback a sesión si JWT no está disponible
  if (!userId && req.session && req.session.userId) {
    userId = req.session.userId;
    userEmail = req.session.userEmail;
    isAdmin = req.session.isAdmin || false;
    console.log("[GET /auth/me] ✅ Authenticated via session (fallback), userId:", userId);
  }
  
  // Si tenemos userId, buscar usuario en la base de datos
  if (userId) {
    try {
      if (!prisma) {
        return res.status(500).json({ error: "Database connection not available" });
      }
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, isAdmin: true, emailVerified: true },
      });
      
      if (user) {
        console.log("[GET /auth/me] ✅ User found:", user.email);
        return res.json({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            isAdmin: user.isAdmin,
            emailVerified: user.emailVerified,
          },
        });
      } else {
        console.log("[GET /auth/me] ⚠️ User not found in database for userId:", userId);
      }
    } catch (err) {
      console.error("[GET /auth/me] ❌ Error fetching user:", err);
      return res.status(500).json({ error: "Error fetching user" });
    }
  }
  
  console.log("[GET /auth/me] ⚠️ Not authenticated");
  return res.json({ authenticated: false });
});

// GET /auth/verify-email - Verificar email con token
app.get("/auth/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    // Buscar token de verificación
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationToken) {
      return res.status(400).json({ error: "Invalid verification token" });
    }

    // Verificar si el token ha expirado
    if (new Date() > verificationToken.expiresAt) {
      // Eliminar token expirado
      await prisma.emailVerificationToken.delete({
        where: { id: verificationToken.id },
      });
      return res.status(400).json({ error: "Verification token has expired" });
    }

    // Verificar el email del usuario
    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true },
    });

    // Eliminar el token usado
    await prisma.emailVerificationToken.delete({
      where: { id: verificationToken.id },
    });

    res.json({
      message: "Email verified successfully",
      user: {
        id: verificationToken.user.id,
        email: verificationToken.user.email,
        emailVerified: true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify email" });
  }
});

// POST /auth/resend-verification - Reenviar email de verificación
// Puede ser usado autenticado (con session) o sin autenticar (con email)
app.post("/auth/resend-verification", async (req, res) => {
  try {
    let user;

    // Si hay sesión, usar el usuario de la sesión
    if (req.session && req.session.userId) {
      user = await prisma.user.findUnique({
        where: { id: req.session.userId },
      });
    } else {
      // Si no hay sesión, permitir solicitar por email
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required when not authenticated" });
      }
      user = await prisma.user.findUnique({
        where: { email },
      });
    }

    if (!user) {
      // Por seguridad, no revelar si el email existe o no
      return res.json({ 
        message: "If an account with that email exists and is not verified, a verification email has been sent." 
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    // Eliminar tokens de verificación anteriores
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    // Generar nuevo token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Enviar email
    try {
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:8000";
      await sendVerificationEmail(user.email, token, baseUrl);
      res.json({ message: "Verification email sent successfully" });
    } catch (emailError) {
      console.error("[Resend Verification] Failed to send email:", emailError);
      // En desarrollo, mostrar el token en los logs
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] Verification token for ${user.email}: ${token}`);
        console.log(`[DEV] Verification URL: ${baseUrl}/verify-email?token=${token}`);
      }
      res.status(500).json({ error: "Failed to send verification email" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resend verification email" });
  }
});

// POST /auth/forgot-password - Solicitar reset de contraseña
app.post("/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Por seguridad, siempre devolver éxito aunque el email no exista
    if (!user) {
      return res.json({ 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    }

    // Si el usuario no tiene contraseña (es OAuth), no permitir reset
    if (!user.password) {
      return res.json({ 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    }

    // Eliminar tokens de reset anteriores
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Generar nuevo token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Expira en 1 hora

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Enviar email
    try {
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:8000";
      await sendPasswordResetEmail(user.email, token, baseUrl);
      res.json({ 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    } catch (emailError) {
      console.error("[Forgot Password] Failed to send email:", emailError);
      res.status(500).json({ error: "Failed to send password reset email" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// POST /auth/reset-password - Resetear contraseña con token
app.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Buscar token de reset
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    // Verificar si el token ha expirado
    if (new Date() > resetToken.expiresAt) {
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
      return res.status(400).json({ error: "Reset token has expired" });
    }

    // Verificar si el token ya fue usado
    if (resetToken.used) {
      return res.status(400).json({ error: "Reset token has already been used" });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Actualizar contraseña del usuario
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    // Marcar token como usado
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});


// GET /auth/verify - Verificar si un email está registrado (solo para desarrollo, requiere auth)
app.get("/auth/verify/:email", requireAuth, async (req, res) => {
  try {
    const { email } = req.params;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, createdAt: true }, // No devolver password
    });

    if (user) {
      return res.json({
        exists: true,
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    }

    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify user" });
  }
});

// GET /posts - Solo posts publicados (para frontend público)
// GET /posts - Posts publicados (para frontend público) con búsqueda, filtrado y paginación
app.get("/posts", publicRateLimiter, resolveSiteFromDomain, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        error:
          "DATABASE_URL is not set. Create backend/.env with DATABASE_URL from Supabase and restart the server.",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const tagId = req.query.tagId ? parseInt(req.query.tagId) : null;
    const type = req.query.type || null;
    const sectionId = req.query.sectionId ? parseInt(req.query.sectionId) : null;
    const slug = req.query.slug || null; // Búsqueda por slug (para posts individuales)
    
    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;
    
    if (!siteId) {
      console.error("[GET /posts] ERROR: siteId is not set by middleware");
      return res.status(500).json({ error: "Site ID not resolved. Please check server configuration." });
    }
    
    // Si se busca por slug, devolver solo ese post
    if (slug) {
      const post = await prisma.post.findFirst({
        where: {
          slug: slug,
          siteId: siteId,
          published: true,
        },
        include: {
          tags: true,
          section: true,
          blocks: {
            orderBy: { order: "asc" },
          },
        },
      });
      
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      return res.json({ posts: [post], pagination: { page: 1, limit: 1, total: 1, totalPages: 1 } });
    }
    
    // Intentar obtener del cache (solo para posts publicados sin búsqueda)
    const cacheKey = getCacheKey("posts", { siteId, page, limit, search, tagId, type, sectionId });
    if (!search && !tagId && !type) { // Solo cachear queries simples
      const cached = getCached(cacheKey);
      if (cached) {
        console.log("[GET /posts] Cache hit:", cacheKey);
        return res.json(cached);
      }
    }
    
    // Construir filtros
    const where = {
      published: true,
      siteId: siteId, // Filtrar por sitio
    };
    
    // Búsqueda por título o contenido
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }
    
    // Filtro por tag
    if (tagId) {
      where.tags = {
        some: {
          id: tagId,
        },
      };
    }
    
    // Filtro por tipo
    if (type) {
      where.type = type;
    }
    
    // Filtro por sección
    if (sectionId) {
      where.sectionId = sectionId;
    }
    
    // Obtener posts con relaciones
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          tags: true,
          section: true,
          blocks: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);
    
    const result = {
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
    
    // Guardar en cache (solo para queries simples)
    if (!search && !tagId && !type) {
      setCache(cacheKey, result);
    }
    
    res.json(result);
  } catch (err) {
    console.error("[GET /posts] ERROR:", err);
    console.error("[GET /posts] Error stack:", err.stack);
    res.status(500).json({
      error:
        "Database query failed. Check backend/.env DATABASE_URL (Supabase). If Supabase says 'Not IPv4 compatible', use the Session Pooler connection string. Then run `npx prisma migrate dev --name init`, `node seed.js`, and restart the server.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// GET /posts/all - Todos los posts (incluyendo borradores) - Para admin con búsqueda, filtrado y paginación
app.get("/posts/all", adminRateLimiter, requireAuth, resolveSiteFromDomain, async (req, res) => {
  try {
    console.log("[GET /posts/all] ========== INICIO ==========");
    console.log("[GET /posts/all] Query params:", req.query);
    console.log("[GET /posts/all] req.userId:", req.userId);
    console.log("[GET /posts/all] req.isAdmin:", req.isAdmin);
    console.log("[GET /posts/all] req.siteId:", req.siteId);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const published = req.query.published !== undefined ? req.query.published === "true" : null;
    const tagId = req.query.tagId ? parseInt(req.query.tagId) : null;
    const type = req.query.type || null;
    const sectionId = req.query.sectionId ? parseInt(req.query.sectionId) : null;
    
    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;
    
    if (!siteId) {
      console.error("[GET /posts/all] ERROR: siteId is not set by middleware");
      return res.status(500).json({ error: "Site ID not resolved. Please check server configuration." });
    }
    
    const userId = req.userId; // Usar req.userId (de JWT o sesión)
    const isAdmin = req.isAdmin || false; // Usar req.isAdmin (de JWT o sesión)
    
    if (!userId) {
      console.error("[GET /posts/all] ERROR: User not authenticated");
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    console.log("[GET /posts/all] User found:", { id: userId, isAdmin: isAdmin });

    // Verificar que el usuario tenga acceso al sitio (o sea admin)
    if (!isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
      }
    }
    
    // Construir filtros
    const where = {
      siteId: siteId, // Filtrar por sitio
    };
    
    // Filtro por estado de publicación
    if (published !== null) {
      where.published = published;
    }
    
    // Búsqueda por título o contenido
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }
    
    // Filtro por tag
    if (tagId) {
      where.tags = {
        some: {
          id: tagId,
        },
      };
    }
    
    // Filtro por tipo
    if (type) {
      where.type = type;
    }
    
    // Filtro por sección
    if (sectionId) {
      where.sectionId = sectionId;
    }
    
    console.log("[GET /posts/all] Where clause:", JSON.stringify(where, null, 2));
    
    // Obtener posts con relaciones
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          tags: true,
          section: true,
          blocks: {
            orderBy: { order: "asc" },
          },
          thumbnail: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              description: true,
              order: true,
            },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);
    
    console.log("[GET /posts/all] Posts found:", posts.length, "Total:", total);
    console.log("[GET /posts/all] ========== FIN ==========");
    
    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[GET /posts/all] ERROR:", err);
    console.error("[GET /posts/all] Error stack:", err.stack);
    console.error("[GET /posts/all] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
    });
    res.status(500).json({ 
      error: "Failed to fetch posts",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// POST /posts - Crear nuevo post
app.post("/posts", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    console.log("[Backend POST /posts] ========== INICIO CREAR POST ==========");
    console.log("[Backend POST /posts] Request body:", {
      title: req.body.title,
      contentLength: req.body.content ? req.body.content.length : 0,
      contentPreview: req.body.content ? req.body.content.substring(0, 200) + "..." : "sin contenido",
      published: req.body.published,
      slug: req.body.slug,
      hasTitle: !!req.body.title,
      hasContent: !!req.body.content
    });

    const { 
      title, 
      content, // Contenido legacy (HTML) - opcional si se usan bloques
      published = false, 
      order = 0,
      slug, 
      tagIds, 
      type = "blog", 
      sectionId, 
      metadata,
      // Campos predefinidos
      subtitle,
      summary,
      author,
      featuredImageUrl,
      // Bloques flexibles
      blocks,
      // Datos de thumbnail (para secciones de tipo "thumbnails")
      thumbnailData
    } = req.body;

    if (!title) {
      console.error("[Backend POST /posts] ERROR: Missing required field: title");
      return res.status(400).json({ error: "Title is required" });
    }
    
    // Para compatibilidad: si no hay bloques, se requiere content (legacy)
    if ((!blocks || blocks.length === 0) && !content) {
      console.error("[Backend POST /posts] ERROR: Missing content. Either content or blocks are required");
      return res.status(400).json({ error: "Either content or blocks are required" });
    }

    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;

    // Verificar que el usuario tenga acceso al sitio
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });

    if (!userSite) {
      return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
    }

    console.log("[Backend POST /posts] ✅ Required fields present");

    // Generar slug único si no se proporciona
    let postSlug;
    if (slug) {
      // Si el usuario proporciona un slug, verificar que sea único
      const existing = await prisma.post.findUnique({
        where: { slug },
      });
      if (existing) {
        console.error("[Backend POST /posts] ERROR: Provided slug already exists:", slug);
        return res.status(400).json({ error: "Slug already exists. Please choose a different slug." });
      }
      postSlug = slug;
    } else {
      // Generar slug único automáticamente
      const baseSlug = generateSlug(title);
      console.log("[Backend POST /posts] Generating unique slug from:", baseSlug);
      postSlug = await generateUniqueSlug(baseSlug, siteId);
      if (postSlug !== baseSlug) {
        console.log("[Backend POST /posts] Base slug already existed, using unique slug:", postSlug);
      }
    }

    // Validar tagIds si se proporcionan
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const tags = await prisma.tag.findMany({
        where: { id: { in: tagIds.map(id => parseInt(id)) } },
      });
      if (tags.length !== tagIds.length) {
        return res.status(400).json({ error: "One or more tags not found" });
      }
    }

    // Validar sectionId si se proporciona y obtener su postType y template
    let finalType = type;
    let sectionTemplate = null;
    let sectionDetailSectionId = null;
    let sectionSchemaKey = null;
    if (sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: parseInt(sectionId) },
        select: {
          id: true,
          postType: true,
          blockTemplate: true,
          schemaKey: true,
          detailSectionId: true,
        },
      });
      if (!section) {
        return res.status(400).json({ error: "Section not found" });
      }
      // Usar el postType de la sección automáticamente
      finalType = section.postType || "blog";
      // Obtener el template si existe
      sectionTemplate = section.blockTemplate;
      sectionSchemaKey = section.schemaKey || null;
      // Para thumbnails, ya no usamos detailSectionId - los posts de detalle van en la misma sección
    }

    // Validación del contrato (si aplica): si la sección tiene schemaKey y el profile define allowedBlocks,
    // bloquear requests con tipos de bloque no permitidos.
    if (blocks && Array.isArray(blocks) && blocks.length > 0 && sectionSchemaKey) {
      const allowedBlocks = await getAllowedBlocksForSectionSchema(siteId, sectionSchemaKey);
      if (allowedBlocks) {
        const result = validateBlocksAllowed(blocks, allowedBlocks);
        if (!result.ok) {
          return res.status(400).json({
            error: `Invalid block type(s) for schema "${sectionSchemaKey}".`,
            invalidBlockTypes: result.invalid,
            allowedBlocks,
          });
        }
      }
    }

    console.log("[Backend POST /posts] Creando post en base de datos con datos:", {
      title: title,
      slug: postSlug,
      contentLength: content.length,
      contentPreview: content.substring(0, 200) + (content.length > 200 ? "..." : ""),
      published: Boolean(published),
      order: parseInt(order) || 0,
      type: finalType,
      sectionId: sectionId || null,
      tagIds: tagIds || [],
      metadata: metadata || null,
      hasTemplate: !!sectionTemplate,
      hasBlocks: !!(blocks && Array.isArray(blocks) && blocks.length > 0),
    });

    // Preparar datos del post
    const postData = {
      title,
      slug: postSlug,
      type: finalType,
      content: content || "", // Mantener para compatibilidad
      published: Boolean(published),
      order: parseInt(order) || 0,
      siteId: siteId,
      sectionId: sectionId ? parseInt(sectionId) : null,
      metadata: metadata || null,
      // Campos predefinidos
      subtitle: subtitle || null,
      summary: summary || null,
      author: author || null,
      featuredImageUrl: featuredImageUrl || null,
      tags: {
        connect: tagIds ? tagIds.map(id => ({ id: parseInt(id) })) : [],
      },
    };

    // Determinar qué bloques usar:
    // 1. Si el cliente proporciona bloques, usar esos (puede haber editado el template)
    // 2. Si no hay bloques pero hay template, generar bloques desde el template
    // 3. Si no hay ni bloques ni template, crear post sin bloques (libertad total)
    let blocksToCreate = [];
    
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      // Usar bloques proporcionados por el cliente
      blocksToCreate = blocks;
      console.log("[Backend POST /posts] Using provided blocks:", blocksToCreate.length);
    } else if (sectionTemplate && sectionTemplate.blocks && Array.isArray(sectionTemplate.blocks)) {
      // Generar bloques desde el template
      blocksToCreate = generateBlocksFromTemplate(sectionTemplate);
      console.log("[Backend POST /posts] Generated blocks from template:", blocksToCreate.length);
    }
    
    // Si hay bloques para crear, añadirlos
    if (blocksToCreate.length > 0) {
      postData.blocks = {
        create: blocksToCreate.map((block, index) => ({
          type: block.type,
          content: block.content || null,
          order: block.order !== undefined ? block.order : index,
          metadata: block.metadata || null,
        })),
      };
    }

    const post = await prisma.post.create({
      data: postData,
      include: {
        tags: true,
        section: true,
        blocks: {
          orderBy: { order: "asc" },
        },
      },
    });

    console.log("[Backend POST /posts] ✅ Post created successfully:", {
      id: post.id,
      title: post.title,
      slug: post.slug,
      contentLength: post.content.length,
      published: post.published
    });
    
    // Si la sección es de tipo "thumbnails" y se proporciona thumbnailData, crear el thumbnail
    let thumbnail = null;
    if (finalType === "thumbnails" && thumbnailData) {
      try {
        // Obtener el orden más alto de los thumbnails existentes en esta sección
        const maxOrderThumbnail = await prisma.thumbnail.findFirst({
          where: {
            sectionId: parseInt(sectionId),
            siteId: siteId,
          },
          orderBy: { order: "desc" },
        });
        const nextOrder = maxOrderThumbnail ? maxOrderThumbnail.order + 1 : 0;
        
        // Crear el post de detalle en la misma sección "thumbnails" usando el blockTemplate
        let detailPostId = null;
        if (sectionTemplate && sectionTemplate.blocks && Array.isArray(sectionTemplate.blocks)) {
          // Generar bloques desde el template de la sección thumbnails
          const detailBlocks = generateBlocksFromTemplate(sectionTemplate);
          
          // Crear el post de detalle en la misma sección
          const detailPost = await prisma.post.create({
            data: {
              title: title, // Usar el mismo título
              slug: await generateUniqueSlug(generateSlug(title + "-detail"), siteId),
              type: finalType, // Usar el mismo tipo que la sección (thumbnails)
              content: "",
              published: published,
              siteId: siteId,
              sectionId: parseInt(sectionId), // Misma sección que el thumbnail
              blocks: {
                create: detailBlocks.map((block, index) => ({
                  type: block.type,
                  content: block.content || null,
                  order: block.order !== undefined ? block.order : index,
                  metadata: block.metadata || null,
                })),
              },
            },
          });
          detailPostId = detailPost.id;
          console.log("[Backend POST /posts] ✅ Detail post created in same section:", detailPost.id);
        }
        
        // Crear el thumbnail
        thumbnail = await prisma.thumbnail.create({
          data: {
            title: title,
            imageUrl: thumbnailData.imageUrl,
            description: thumbnailData.description || null,
            sectionId: parseInt(sectionId),
            siteId: siteId,
            detailPostId: detailPostId,
            order: nextOrder,
          },
        });
        console.log("[Backend POST /posts] ✅ Thumbnail created:", thumbnail.id);
      } catch (err) {
        console.error("[Backend POST /posts] ERROR creating thumbnail:", err);
        // No fallar el request si falla la creación del thumbnail
      }
    }
    
    console.log("[Backend POST /posts] ========== FIN CREAR POST ==========");

    // Invalidar cache de posts para este sitio
    invalidateCache(`posts:*siteId:${siteId}*`);
    
    // Registrar en auditoría
    await logAuditEvent(req, "post_created", "post", post.id, {
      title: post.title,
      slug: post.slug,
      published: post.published,
    });

    // Incluir el thumbnail en la respuesta si existe
    const response = { ...post };
    if (thumbnail) {
      response.thumbnail = thumbnail;
    }
    
    res.status(201).json(response);
  } catch (err) {
    console.error("[Backend POST /posts] ERROR in catch:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    res.status(500).json({ error: "Failed to create post" });
  }
});

// PUT /posts/:id - Editar post existente
app.put("/posts/:id", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { 
      title, 
      content, // Contenido legacy - opcional si se usan bloques
      published, 
      order,
      slug, 
      tagIds, 
      type, 
      sectionId, 
      metadata,
      // Campos predefinidos
      subtitle,
      summary,
      author,
      featuredImageUrl,
      // Bloques flexibles
      blocks,
      // Datos de thumbnail (para secciones de tipo "thumbnails")
      thumbnailData
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;

    // Verificar que el post existe y pertenece al sitio
    const existing = await prisma.post.findUnique({ 
      where: { id },
      include: { site: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (existing.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar que el usuario tenga acceso al sitio
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });

    if (!userSite) {
      return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
    }

    // Generar slug si no se proporciona o si cambió el título
    const postSlug = slug || generateSlug(title);

    // Si el slug cambió, verificar que no esté en uso por otro post del mismo sitio
    if (postSlug !== existing.slug) {
      const slugExists = await prisma.post.findUnique({
        where: { siteId_slug: { siteId: siteId, slug: postSlug } },
      });
      if (slugExists) {
        return res.status(400).json({ error: "Slug already exists" });
      }
    }

    // Validar tagIds si se proporcionan
    if (tagIds !== undefined && Array.isArray(tagIds) && tagIds.length > 0) {
      const tags = await prisma.tag.findMany({
        where: { id: { in: tagIds.map(id => parseInt(id)) } },
      });
      if (tags.length !== tagIds.length) {
        return res.status(400).json({ error: "One or more tags not found" });
      }
    }

    // Validar sectionId si se proporciona y obtener su postType
    let finalType = type !== undefined ? type : existing.type;
    let sectionSchemaKey = null;
    if (sectionId !== undefined) {
      if (sectionId === null || sectionId === "") {
        // Eliminar sección - mantener el tipo actual
      } else {
        const section = await prisma.section.findUnique({
          where: { id: parseInt(sectionId) },
          select: { id: true, postType: true, schemaKey: true },
        });
        if (!section) {
          return res.status(400).json({ error: "Section not found" });
        }
        // Si se cambia la sección, usar el postType de la nueva sección
        if (parseInt(sectionId) !== existing.sectionId) {
          finalType = section.postType || "blog";
        }
        sectionSchemaKey = section.schemaKey || null;
      }
    }

    // Si no vino sectionId en el request, usar el schemaKey de la sección actual del post (si existe)
    if (sectionId === undefined && existing.sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: existing.sectionId },
        select: { schemaKey: true },
      });
      sectionSchemaKey = section?.schemaKey || null;
    }

    // Validación del contrato (si aplica): si la sección tiene schemaKey y el profile define allowedBlocks,
    // bloquear requests con tipos de bloque no permitidos.
    if (blocks && Array.isArray(blocks) && blocks.length > 0 && sectionSchemaKey) {
      const allowedBlocks = await getAllowedBlocksForSectionSchema(siteId, sectionSchemaKey);
      if (allowedBlocks) {
        const result = validateBlocksAllowed(blocks, allowedBlocks);
        if (!result.ok) {
          return res.status(400).json({
            error: `Invalid block type(s) for schema "${sectionSchemaKey}".`,
            invalidBlockTypes: result.invalid,
            allowedBlocks,
          });
        }
      }
    }

    // Preparar datos de actualización
    const updateData = {
      title,
      slug: postSlug,
      type: finalType,
      content: content !== undefined ? content : existing.content,
      published: published !== undefined ? Boolean(published) : existing.published,
      order: order !== undefined ? parseInt(order) : existing.order,
      sectionId: sectionId !== undefined ? (sectionId === null || sectionId === "" ? null : parseInt(sectionId)) : undefined,
      metadata: metadata !== undefined ? metadata : existing.metadata,
      // Campos predefinidos
      subtitle: subtitle !== undefined ? subtitle : existing.subtitle,
      summary: summary !== undefined ? summary : existing.summary,
      author: author !== undefined ? author : existing.author,
      featuredImageUrl: featuredImageUrl !== undefined ? featuredImageUrl : existing.featuredImageUrl,
      tags: tagIds !== undefined ? {
        set: tagIds.map(id => ({ id: parseInt(id) })),
      } : undefined,
    };

    // Si se proporcionan bloques, reemplazar todos los bloques existentes
    if (blocks !== undefined) {
      // Eliminar bloques existentes
      await prisma.postBlock.deleteMany({
        where: { postId: id },
      });
      
      // Crear nuevos bloques si se proporcionaron
      if (Array.isArray(blocks) && blocks.length > 0) {
        updateData.blocks = {
          create: blocks.map((block, index) => ({
            type: block.type,
            content: block.content || null,
            order: block.order !== undefined ? block.order : index,
            metadata: block.metadata || null,
          })),
        };
      }
    }

    const post = await prisma.post.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
        section: true,
        blocks: {
          orderBy: { order: "asc" },
        },
      },
    });

    // Si la sección es de tipo "thumbnails" y se proporciona thumbnailData, actualizar el thumbnail
    if (thumbnailData && finalType === "thumbnails") {
      try {
        // Buscar el thumbnail asociado a este post (a través de detailPostId)
        const thumbnail = await prisma.thumbnail.findFirst({
          where: {
            detailPostId: id,
            siteId: siteId,
          },
        });
        
        if (thumbnail) {
          // Actualizar el thumbnail existente
          await prisma.thumbnail.update({
            where: { id: thumbnail.id },
            data: {
              title: title,
              imageUrl: thumbnailData.imageUrl,
              description: thumbnailData.description || null,
            },
          });
          console.log("[Backend PUT /posts/:id] ✅ Thumbnail updated:", thumbnail.id);
        } else {
          // Si no existe, crear uno nuevo (puede pasar si se cambió el tipo de sección)
          const section = await prisma.section.findUnique({
            where: { id: parseInt(sectionId || existing.sectionId) },
          });
          
          if (section && section.postType === "thumbnails") {
            const maxOrderThumbnail = await prisma.thumbnail.findFirst({
              where: {
                sectionId: section.id,
                siteId: siteId,
              },
              orderBy: { order: "desc" },
            });
            const nextOrder = maxOrderThumbnail ? maxOrderThumbnail.order + 1 : 0;
            
            await prisma.thumbnail.create({
              data: {
                title: title,
                imageUrl: thumbnailData.imageUrl,
                description: thumbnailData.description || null,
                sectionId: section.id,
                siteId: siteId,
                detailPostId: id,
                order: nextOrder,
              },
            });
            console.log("[Backend PUT /posts/:id] ✅ Thumbnail created for existing post");
          }
        }
      } catch (err) {
        console.error("[Backend PUT /posts/:id] ERROR updating thumbnail:", err);
        // No fallar el request si falla la actualización del thumbnail
      }
    }
    
    // Invalidar cache de posts para este sitio
    console.log(`[PUT /posts/:id] Invalidating cache for siteId: ${siteId}`);
    invalidateCache(`posts:*siteId:${siteId}*`);
    // También invalidar cache más general para asegurar que se actualice
    invalidateCache(`posts:*`);
    console.log(`[PUT /posts/:id] Cache invalidated`);
    
    // Registrar en auditoría
    await logAuditEvent(req, "post_updated", "post", post.id, {
      title: post.title,
      slug: post.slug,
      published: post.published,
      changes: {
        titleChanged: title !== existing.title,
        publishedChanged: published !== undefined && published !== existing.published,
      },
    });

    res.json(post);
  } catch (err) {
    console.error("[Backend PUT /posts/:id] ERROR in catch:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code,
      postId: req.params.id,
      siteId: req.siteId,
      userId: req.userId
    });
    res.status(500).json({ 
      error: "Failed to update post",
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// DELETE /posts/:id - Eliminar post
app.delete("/posts/:id", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;

    const existing = await prisma.post.findUnique({ 
      where: { id },
      include: { site: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (existing.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar que el usuario tenga acceso al sitio (o sea admin)
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
      }
    }

    // Guardar información antes de eliminar para auditoría
    const postInfo = {
      id: existing.id,
      title: existing.title,
      slug: existing.slug,
    };

    await prisma.post.delete({ where: { id } });

    // Invalidar cache de posts para este sitio
    invalidateCache(`posts:*siteId:${siteId}*`);
    
    // Registrar en auditoría
    await logAuditEvent(req, "post_deleted", "post", postInfo.id, {
      title: postInfo.title,
      slug: postInfo.slug,
    });

    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// ==================== POST BLOCKS ====================

// GET /posts/:postId/blocks - Obtener todos los bloques de un post
app.get("/posts/:postId/blocks", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const siteId = req.siteId;

    // Verificar que el post existe y pertenece al sitio
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { site: true },
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const blocks = await prisma.postBlock.findMany({
      where: { postId },
      orderBy: { order: "asc" },
    });

    res.json(blocks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch blocks" });
  }
});

// POST /posts/:postId/blocks - Crear un nuevo bloque
app.post("/posts/:postId/blocks", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const { type, content, order, metadata } = req.body;
    const siteId = req.siteId;

    if (!type) {
      return res.status(400).json({ error: "Block type is required" });
    }

    // Verificar que el post existe y pertenece al sitio
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { site: true },
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Si no se proporciona order, usar el siguiente disponible
    let blockOrder = order;
    if (blockOrder === undefined) {
      const maxOrder = await prisma.postBlock.findFirst({
        where: { postId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      blockOrder = maxOrder ? maxOrder.order + 1 : 0;
    }

    const block = await prisma.postBlock.create({
      data: {
        postId,
        type,
        content: content || null,
        order: blockOrder,
        metadata: metadata || null,
      },
    });

    // Invalidar cache
    invalidateCache(`posts:*siteId:${siteId}*`);

    res.status(201).json(block);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create block" });
  }
});

// PUT /posts/:postId/blocks/:blockId - Actualizar un bloque
app.put("/posts/:postId/blocks/:blockId", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const blockId = parseInt(req.params.blockId);
    const { type, content, order, metadata } = req.body;
    const siteId = req.siteId;

    // Verificar que el bloque existe y pertenece al post
    const block = await prisma.postBlock.findUnique({
      where: { id: blockId },
      include: { post: true },
    });

    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }

    if (block.postId !== postId) {
      return res.status(400).json({ error: "Block does not belong to this post" });
    }

    if (block.post.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const updatedBlock = await prisma.postBlock.update({
      where: { id: blockId },
      data: {
        type: type !== undefined ? type : block.type,
        content: content !== undefined ? content : block.content,
        order: order !== undefined ? order : block.order,
        metadata: metadata !== undefined ? metadata : block.metadata,
      },
    });

    // Invalidar cache
    invalidateCache(`posts:*siteId:${siteId}*`);

    res.json(updatedBlock);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update block" });
  }
});

// DELETE /posts/:postId/blocks/:blockId - Eliminar un bloque
app.delete("/posts/:postId/blocks/:blockId", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const blockId = parseInt(req.params.blockId);
    const siteId = req.siteId;

    // Verificar que el bloque existe y pertenece al post
    const block = await prisma.postBlock.findUnique({
      where: { id: blockId },
      include: { post: true },
    });

    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }

    if (block.postId !== postId) {
      return res.status(400).json({ error: "Block does not belong to this post" });
    }

    if (block.post.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    await prisma.postBlock.delete({
      where: { id: blockId },
    });

    // Invalidar cache
    invalidateCache(`posts:*siteId:${siteId}*`);

    res.json({ message: "Block deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete block" });
  }
});

// PUT /posts/:postId/blocks/reorder - Reordenar bloques
app.put("/posts/:postId/blocks/reorder", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const { blockIds } = req.body; // Array de IDs en el nuevo orden
    const siteId = req.siteId;

    if (!Array.isArray(blockIds)) {
      return res.status(400).json({ error: "blockIds must be an array" });
    }

    // Verificar que el post existe y pertenece al sitio
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { site: true },
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.siteId !== siteId) {
      return res.status(403).json({ error: "Post does not belong to this site" });
    }

    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Actualizar el order de cada bloque
    await Promise.all(
      blockIds.map((blockId, index) =>
        prisma.postBlock.update({
          where: { id: parseInt(blockId) },
          data: { order: index },
        })
      )
    );

    // Invalidar cache
    invalidateCache(`posts:*siteId:${siteId}*`);

    res.json({ message: "Blocks reordered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reorder blocks" });
  }
});

// ==================== TAGS ====================

// GET /tags - Obtener todos los tags (filtrados por siteId)
app.get("/tags", publicRateLimiter, resolveSiteFromDomain, async (req, res) => {
  try {
    console.log("[GET /tags] ========== INICIO ==========");
    console.log("[GET /tags] Query params:", req.query);
    console.log("[GET /tags] req.siteId:", req.siteId);
    
    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;
    
    if (!siteId) {
      console.error("[GET /tags] ERROR: siteId is not set by middleware");
      return res.status(500).json({ error: "Site ID not resolved. Please check server configuration." });
    }

    console.log("[GET /tags] Fetching tags for siteId:", siteId);
    
    const tags = await prisma.tag.findMany({
      where: { siteId: siteId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
    
    console.log("[GET /tags] Tags found:", tags.length);
    console.log("[GET /tags] ========== FIN ==========");
    
    res.json(tags);
  } catch (err) {
    console.error("[GET /tags] ERROR:", err);
    console.error("[GET /tags] Error stack:", err.stack);
    console.error("[GET /tags] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
    });
    res.status(500).json({ 
      error: "Failed to fetch tags",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// POST /tags - Crear nuevo tag
app.post("/tags", resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Tag name is required" });
    }

    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;

    // Verificar que el usuario tenga acceso al sitio
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });

    if (!userSite) {
      return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
    }

    const slug = generateSlug(name);
    // Generar slug único dentro del sitio
    let uniqueSlug = slug;
    let counter = 1;
    while (true) {
      const existing = await prisma.tag.findUnique({
        where: { siteId_slug: { siteId: siteId, slug: uniqueSlug } },
      });
      if (!existing) break;
      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        slug: uniqueSlug,
        siteId: siteId,
      },
    });

    res.status(201).json(tag);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Tag name already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

// DELETE /tags/:id - Eliminar tag
app.delete("/tags/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Tag not found" });
    }

    await prisma.tag.delete({ where: { id } });

    res.json({ message: "Tag deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

// ==================== THUMBNAILS ====================

// GET /thumbnails - Obtener thumbnails de una sección
app.get("/thumbnails", publicRateLimiter, resolveSiteFromDomain, async (req, res) => {
  try {
    const sectionId = req.query.sectionId ? parseInt(req.query.sectionId) : null;
    const siteId = req.siteId;
    
    if (!siteId) {
      return res.status(500).json({ error: "Site ID not resolved" });
    }
    
    if (!sectionId) {
      return res.status(400).json({ error: "sectionId is required" });
    }
    
    const thumbnails = await prisma.thumbnail.findMany({
      where: {
        sectionId: sectionId,
        siteId: siteId,
      },
      include: {
        detailPost: {
          include: {
            blocks: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
      orderBy: { order: "asc" },
    });
    
    res.json(thumbnails);
  } catch (err) {
    console.error("[GET /thumbnails] ERROR:", err);
    res.status(500).json({ error: "Failed to fetch thumbnails" });
  }
});

// POST /thumbnails - Crear nueva miniatura (y automáticamente crear post de detalle)
app.post("/thumbnails", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const { title, imageUrl, description, sectionId, order = 0 } = req.body;
    const siteId = req.siteId;
    
    if (!title || !imageUrl || !sectionId) {
      return res.status(400).json({ error: "title, imageUrl, and sectionId are required" });
    }
    
    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });
    
    if (!userSite) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Obtener la sección para verificar que existe y obtener la sección de detalles
    const section = await prisma.section.findUnique({
      where: { id: parseInt(sectionId) },
      include: {
        detailSection: {
          include: {
            blockTemplate: true,
          },
        },
      },
    });
    
    if (!section || section.siteId !== siteId) {
      return res.status(404).json({ error: "Section not found" });
    }
    
    // Crear el thumbnail
    const thumbnail = await prisma.thumbnail.create({
      data: {
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        description: description ? description.trim() : null,
        sectionId: parseInt(sectionId),
        siteId: siteId,
        order: parseInt(order),
      },
    });
    
    // Si la sección tiene una sección de detalles configurada, crear el post automáticamente
    let detailPost = null;
    if (section.detailSection) {
      const detailSection = section.detailSection;
      
      // Generar slug único para el post de detalle
      const baseSlug = generateSlug(title);
      let postSlug = baseSlug;
      let counter = 1;
      while (true) {
        const existing = await prisma.post.findUnique({
          where: { siteId_slug: { siteId: siteId, slug: postSlug } },
        });
        if (!existing) break;
        postSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      // Generar bloques desde el template de la sección de detalles
      let blocksToCreate = [];
      if (detailSection.blockTemplate && detailSection.blockTemplate.blocks) {
        blocksToCreate = generateBlocksFromTemplate(detailSection.blockTemplate);
      }
      
      // Crear el post de detalle
      const postData = {
        title: title.trim(),
        slug: postSlug,
        type: detailSection.postType || "blog",
        content: "",
        published: false, // Por defecto no publicado hasta que el cliente lo edite
        siteId: siteId,
        sectionId: detailSection.id,
        blocks: {
          create: blocksToCreate.map((block, index) => ({
            type: block.type,
            content: block.content || null,
            order: block.order !== undefined ? block.order : index,
            metadata: block.metadata || null,
          })),
        },
      };
      
      detailPost = await prisma.post.create({
        data: postData,
        include: {
          blocks: {
            orderBy: { order: "asc" },
          },
        },
      });
      
      // Actualizar el thumbnail con el detailPostId
      await prisma.thumbnail.update({
        where: { id: thumbnail.id },
        data: { detailPostId: detailPost.id },
      });
      
      // Registrar en auditoría
      await logAuditEvent(req, "thumbnail_created", "thumbnail", thumbnail.id, {
        title: thumbnail.title,
        sectionId: sectionId,
        detailPostId: detailPost.id,
      });
    } else {
      // Registrar en auditoría sin post de detalle
      await logAuditEvent(req, "thumbnail_created", "thumbnail", thumbnail.id, {
        title: thumbnail.title,
        sectionId: sectionId,
      });
    }
    
    // Invalidar cache
    invalidateCache(`thumbnails:*siteId:${siteId}*`);
    invalidateCache(`posts:*siteId:${siteId}*`);
    
    // Devolver el thumbnail con el post de detalle
    const thumbnailWithDetail = await prisma.thumbnail.findUnique({
      where: { id: thumbnail.id },
      include: {
        detailPost: {
          include: {
            blocks: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });
    
    res.status(201).json(thumbnailWithDetail);
  } catch (err) {
    console.error("[POST /thumbnails] ERROR:", err);
    res.status(500).json({ error: "Failed to create thumbnail" });
  }
});

// PUT /thumbnails/reorder - Reordenar thumbnails (DEBE IR ANTES DE /thumbnails/:id)
app.put("/thumbnails/reorder", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    console.log("[PUT /thumbnails/reorder] ========== INICIO ==========");
    console.log("[PUT /thumbnails/reorder] Request body:", req.body);
    
    const { thumbnailIds } = req.body; // Array de IDs en el nuevo orden
    const siteId = req.siteId;
    
    if (!Array.isArray(thumbnailIds)) {
      console.error("[PUT /thumbnails/reorder] ERROR: thumbnailIds is not an array");
      return res.status(400).json({ error: "thumbnailIds must be an array" });
    }
    
    if (thumbnailIds.length === 0) {
      console.error("[PUT /thumbnails/reorder] ERROR: thumbnailIds array is empty");
      return res.status(400).json({ error: "thumbnailIds array cannot be empty" });
    }
    
    console.log("[PUT /thumbnails/reorder] Site ID:", siteId);
    console.log("[PUT /thumbnails/reorder] Thumbnail IDs:", thumbnailIds);
    
    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });
    
    if (!userSite) {
      console.error("[PUT /thumbnails/reorder] ERROR: Access denied - userSite not found");
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Verificar que todos los thumbnails existen y pertenecen al sitio
    const thumbnails = await prisma.thumbnail.findMany({
      where: {
        id: { in: thumbnailIds.map(id => parseInt(id)) },
        siteId: siteId,
      },
    });
    
    if (thumbnails.length !== thumbnailIds.length) {
      console.error("[PUT /thumbnails/reorder] ERROR: Some thumbnails not found or don't belong to site");
      console.error("[PUT /thumbnails/reorder] Found:", thumbnails.length, "Expected:", thumbnailIds.length);
      return res.status(400).json({ error: "One or more thumbnails not found or don't belong to this site" });
    }
    
    console.log("[PUT /thumbnails/reorder] Found", thumbnails.length, "thumbnails to reorder");
    
    // Actualizar el orden de cada thumbnail
    await Promise.all(
      thumbnailIds.map(async (thumbnailId, index) => {
        const id = parseInt(thumbnailId);
        if (isNaN(id)) {
          throw new Error(`Invalid thumbnail ID: ${thumbnailId}`);
        }
        console.log("[PUT /thumbnails/reorder] Updating thumbnail", id, "to order", index);
        return prisma.thumbnail.update({
          where: { id: id },
          data: { order: index },
        });
      })
    );
    
    console.log("[PUT /thumbnails/reorder] ✅ All thumbnails updated successfully");
    
    // Invalidar cache
    invalidateCache(`thumbnails:*siteId:${siteId}*`);
    
    // Registrar en auditoría
    await logAuditEvent(req, "thumbnails_reordered", "thumbnail", null, {
      count: thumbnailIds.length,
    });
    
    console.log("[PUT /thumbnails/reorder] ========== FIN ==========");
    res.json({ message: "Thumbnails reordered successfully" });
  } catch (err) {
    console.error("[PUT /thumbnails/reorder] ERROR:", err);
    console.error("[PUT /thumbnails/reorder] Error stack:", err.stack);
    res.status(500).json({ error: "Failed to reorder thumbnails", details: err.message });
  }
});

// PUT /thumbnails/:id - Actualizar miniatura
app.put("/thumbnails/:id", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, imageUrl, description, order } = req.body;
    const siteId = req.siteId;
    
    const existing = await prisma.thumbnail.findUnique({
      where: { id },
      include: { detailPost: true },
    });
    
    if (!existing || existing.siteId !== siteId) {
      return res.status(404).json({ error: "Thumbnail not found" });
    }
    
    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });
    
    if (!userSite) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Actualizar el thumbnail
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (order !== undefined) updateData.order = parseInt(order);
    
    // Si cambió el título y hay un post de detalle, actualizar también el título del post
    if (title !== undefined && title !== existing.title && existing.detailPost) {
      await prisma.post.update({
        where: { id: existing.detailPost.id },
        data: { title: title.trim() },
      });
    }
    
    const thumbnail = await prisma.thumbnail.update({
      where: { id },
      data: updateData,
      include: {
        detailPost: {
          include: {
            blocks: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });
    
    // Invalidar cache
    invalidateCache(`thumbnails:*siteId:${siteId}*`);
    invalidateCache(`posts:*siteId:${siteId}*`);
    
    // Registrar en auditoría
    await logAuditEvent(req, "thumbnail_updated", "thumbnail", thumbnail.id, {
      title: thumbnail.title,
    });
    
    res.json(thumbnail);
  } catch (err) {
    console.error("[PUT /thumbnails/:id] ERROR:", err);
    res.status(500).json({ error: "Failed to update thumbnail" });
  }
});

// DELETE /thumbnails/:id - Eliminar miniatura (y opcionalmente el post de detalle)
app.delete("/thumbnails/:id", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { deleteDetailPost = false } = req.query; // Query param para decidir si eliminar el post
    const siteId = req.siteId;
    
    const existing = await prisma.thumbnail.findUnique({
      where: { id },
      include: { detailPost: true },
    });
    
    if (!existing || existing.siteId !== siteId) {
      return res.status(404).json({ error: "Thumbnail not found" });
    }
    
    // Verificar permisos
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: siteId,
        },
      },
    });
    
    if (!userSite) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Si se solicita, eliminar el post de detalle
    if (deleteDetailPost === "true" && existing.detailPost) {
      await prisma.post.delete({
        where: { id: existing.detailPost.id },
      });
    }
    
    // Eliminar el thumbnail
    await prisma.thumbnail.delete({
      where: { id },
    });
    
    // Invalidar cache
    invalidateCache(`thumbnails:*siteId:${siteId}*`);
    invalidateCache(`posts:*siteId:${siteId}*`);
    
    // Registrar en auditoría
    await logAuditEvent(req, "thumbnail_deleted", "thumbnail", id, {
      title: existing.title,
      deletedDetailPost: deleteDetailPost === "true",
    });
    
    res.json({ message: "Thumbnail deleted successfully" });
  } catch (err) {
    console.error("[DELETE /thumbnails/:id] ERROR:", err);
    res.status(500).json({ error: "Failed to delete thumbnail" });
  }
});

// GET /thumbnails/:id/detail - Obtener el post de detalle asociado
app.get("/thumbnails/:id/detail", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const thumbnail = await prisma.thumbnail.findUnique({
      where: { id },
      include: {
        detailPost: {
          include: {
            blocks: {
              orderBy: { order: "asc" },
            },
            section: true,
            tags: true,
          },
        },
        section: true,
      },
    });
    
    if (!thumbnail) {
      return res.status(404).json({ error: "Thumbnail not found" });
    }
    
    if (!thumbnail.detailPost) {
      return res.status(404).json({ error: "Detail post not found for this thumbnail" });
    }
    
    res.json(thumbnail.detailPost);
  } catch (err) {
    console.error("[GET /thumbnails/:id/detail] ERROR:", err);
    res.status(500).json({ error: "Failed to fetch detail post" });
  }
});

// ==================== SECCIONES ====================

// Tipos de post predefinidos (definidos por el desarrollador)
// El cliente solo puede elegir entre estos tipos al crear secciones
const AVAILABLE_POST_TYPES = [
  { value: "blog", label: "Blog" },
  { value: "noticia", label: "Noticia" },
  { value: "producto", label: "Producto" },
  { value: "landing", label: "Landing" },
  { value: "page", label: "Page" },
  { value: "project", label: "Project" },
  { value: "service", label: "Service" },
  { value: "homeBlock", label: "Home Block" },
  { value: "slideshow", label: "Slideshow" },
  { value: "thumbnails", label: "Thumbnails" }, // Sección de miniaturas
  { value: "detailPage", label: "Detail Page" }, // Páginas de detalle para thumbnails
];

// GET /post-types - Obtener tipos de post disponibles
app.get("/post-types", async (req, res) => {
  try {
    res.json(AVAILABLE_POST_TYPES);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch post types" });
  }
});

// Helper: validar que el tipo de post sea válido
function isValidPostType(postType) {
  return AVAILABLE_POST_TYPES.some(type => type.value === postType);
}

// ==================== FRONTEND PROFILE VALIDATION (read-only) ====================

async function getAllowedBlocksForSectionSchema(siteId, schemaKey) {
  if (!siteId || !schemaKey) return null;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { frontendProfile: true },
  });
  if (!site || !site.frontendProfile) return null;

  const diskProfile = getProfileByName(site.frontendProfile.name);
  if (!diskProfile) return null;

  const schema = diskProfile.sectionSchemas?.[schemaKey];
  if (!schema) return null;

  return Array.isArray(schema.allowedBlocks) ? schema.allowedBlocks : null;
}

function validateBlocksAllowed(blocks, allowedBlocks) {
  if (!allowedBlocks || !Array.isArray(allowedBlocks)) return { ok: true, invalid: [] };
  if (!blocks || !Array.isArray(blocks)) return { ok: true, invalid: [] };

  const invalid = [];
  for (const b of blocks) {
    const t = b?.type;
    if (!t || typeof t !== "string") {
      invalid.push(String(t));
      continue;
    }
    if (!allowedBlocks.includes(t)) {
      invalid.push(t);
    }
  }

  return { ok: invalid.length === 0, invalid: Array.from(new Set(invalid)) };
}

// Helper: generar slug único para secciones (dentro de un sitio)
async function generateUniqueSectionSlug(baseSlug, siteId) {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await prisma.section.findUnique({
      where: { siteId_slug: { siteId: siteId, slug: slug } },
    });
    
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// GET /sections - Obtener todas las secciones (con jerarquía, filtradas por siteId)
app.get("/sections", publicRateLimiter, resolveSiteFromDomain, async (req, res) => {
  try {
    console.log("[GET /sections] ========== INICIO ==========");
    console.log("[GET /sections] Query params:", req.query);
    console.log("[GET /sections] req.siteId:", req.siteId);
    
    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;
    
    if (!siteId) {
      console.error("[GET /sections] ERROR: siteId is not set by middleware");
      return res.status(500).json({ error: "Site ID not resolved. Please check server configuration." });
    }

    console.log("[GET /sections] Fetching sections for siteId:", siteId);
    
    const sections = await prisma.section.findMany({
      where: { 
        siteId: siteId,
        postType: { not: "detailPage" } // Excluir secciones de tipo "detailPage" del frontend
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        parent: true,
        children: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
        },
        _count: {
          select: { posts: true },
        },
      },
    });
    
    console.log("[GET /sections] Sections found:", sections.length);
    console.log("[GET /sections] ========== FIN ==========");
    
    res.json(sections);
  } catch (err) {
    console.error("[GET /sections] ERROR:", err);
    console.error("[GET /sections] Error stack:", err.stack);
    console.error("[GET /sections] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
    });
    res.status(500).json({ 
      error: "Failed to fetch sections",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// GET /sections/:id/template - Obtener el template de bloques de una sección
app.get("/sections/:id/template", requireAuth, async (req, res) => {
  try {
    console.log("[GET /sections/:id/template] ========== INICIO ==========");
    console.log("[GET /sections/:id/template] Request params:", req.params);
    console.log("[GET /sections/:id/template] req.userId:", req.userId);
    
    // Cargar usuario usando req.userId (de JWT o sesión)
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isAdmin: true },
    });
    
    if (!user) {
      console.error("[GET /sections/:id/template] User not found");
      return res.status(401).json({ error: "User not found" });
    }
    
    console.log("[GET /sections/:id/template] User:", user.id, "isAdmin:", user.isAdmin);
    
    const sectionId = parseInt(req.params.id);
    console.log("[GET /sections/:id/template] Parsed sectionId:", sectionId);
    
    if (!sectionId || isNaN(sectionId)) {
      console.error("[GET /sections/:id/template] Invalid section ID");
      return res.status(400).json({ error: "Invalid section ID" });
    }
    
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        name: true,
        postType: true,
        blockTemplate: true,
        siteId: true,
      },
    });
    
    if (!section) {
      console.error("[GET /sections/:id/template] Section not found");
      return res.status(404).json({ error: "Section not found" });
    }
    
    console.log("[GET /sections/:id/template] Section found:", section.name, "siteId:", section.siteId);
    
    // Verificar permisos del usuario
    if (!user.isAdmin) {
      const userSite = await prisma.userSite.findFirst({
        where: {
          userId: user.id,
          siteId: section.siteId,
        },
      });
      
      if (!userSite) {
        console.error("[GET /sections/:id/template] Access denied - user not assigned to site");
        return res.status(403).json({ error: "Access denied to this section" });
      }
    }
    
    console.log("[GET /sections/:id/template] Access granted, returning template");
    console.log("[GET /sections/:id/template] blockTemplate:", section.blockTemplate ? "exists" : "null");
    
    // Si no hay template, devolver null (libertad total)
    res.json({
      sectionId: section.id,
      sectionName: section.name,
      postType: section.postType,
      blockTemplate: section.blockTemplate,
    });
  } catch (err) {
    console.error("[GET /sections/:id/template] ERROR:", err);
    console.error("[GET /sections/:id/template] Error stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch section template" });
  }
});

// Helper: Generar bloques desde un template
function generateBlocksFromTemplate(template) {
  if (!template || !Array.isArray(template.blocks)) {
    return [];
  }
  
  return template.blocks.map((blockDef, index) => {
    const baseBlock = {
      type: blockDef.type,
      content: "",
      order: index,
      metadata: {
        required: blockDef.required || false,
        width: blockDef.width || "full",
      },
    };
    
    // Configuración específica por tipo de bloque
    switch (blockDef.type) {
      case "slideshow":
        baseBlock.content = "";
        baseBlock.metadata = {
          ...baseBlock.metadata,
          images: [],
          slideshowConfig: blockDef.settings || {
            showArrows: true,
            autoplay: false,
            interval: 3,
          },
        };
        break;
      case "text":
        baseBlock.content = "";
        baseBlock.metadata = {
          ...baseBlock.metadata,
        };
        break;
      case "image":
        baseBlock.content = "";
        baseBlock.metadata = {
          ...baseBlock.metadata,
          caption: "",
        };
        break;
      case "video":
        baseBlock.content = "";
        baseBlock.metadata = {
          ...baseBlock.metadata,
        };
        break;
      case "link":
        baseBlock.content = "";
        baseBlock.metadata = {
          ...baseBlock.metadata,
        };
        break;
      case "embed_instagram":
      case "embed_soundcloud":
        baseBlock.content = "";
        baseBlock.metadata = {
          ...baseBlock.metadata,
        };
        break;
      default:
        // Para tipos personalizados, usar configuración por defecto
        baseBlock.content = "";
    }
    
    return baseBlock;
  });
}

// POST /sections - Crear nueva sección
app.post("/sections", adminRateLimiter, resolveSiteFromDomain, requireAuth, async (req, res) => {
  try {
    const { name, slug, description, parentId, order = 0, postType, schemaKey } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Section name is required" });
    }

    // siteId viene del middleware resolveSiteFromDomain
    const siteId = req.siteId;

    // Verificar permisos: admin o usuario asignado al sitio
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });
      if (!userSite) {
        return res
          .status(403)
          .json({ error: "Access denied. You don't have permission to access this site." });
      }
    }

    // Derivar template/postType desde schemaKey (source of truth: disk) si aplica
    let finalPostType = postType || "blog";
    let finalSchemaKey = schemaKey || null;
    let blockTemplate = null;

    if (finalSchemaKey) {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        include: { frontendProfile: true },
      });

      if (!site) return res.status(404).json({ error: "Site not found" });
      if (!site.frontendProfile) {
        return res.status(400).json({
          error: "Site has no frontend profile assigned. Cannot create section from schemaKey.",
        });
      }

      const diskProfile = getProfileByName(site.frontendProfile.name);
      if (!diskProfile) {
        return res.status(500).json({
          error: `Frontend profile "${site.frontendProfile.name}" not found on disk (backend/profiles).`,
        });
      }

      const schema = diskProfile.sectionSchemas?.[finalSchemaKey];
      if (!schema) {
        return res.status(400).json({
          error: `Schema "${finalSchemaKey}" not found in frontend profile "${diskProfile.name}"`,
        });
      }

      blockTemplate = schema.defaultTemplate
        ? JSON.parse(JSON.stringify(schema.defaultTemplate))
        : null;
      finalPostType = schema.postType || "blog";
    }

    // Validar que el tipo de post sea uno de los permitidos
    if (!isValidPostType(finalPostType)) {
      return res.status(400).json({
        error: `Invalid post type. Allowed types: ${AVAILABLE_POST_TYPES.map((t) => t.value).join(", ")}`,
      });
    }

    // Validar parentId si se proporciona
    if (parentId) {
      const parent = await prisma.section.findUnique({
        where: { id: parseInt(parentId) },
      });
      if (!parent || parent.siteId !== siteId) {
        return res.status(400).json({ error: "Parent section not found or belongs to a different site" });
      }
    }

    const baseSlug =
      slug && String(slug).trim() !== "" ? String(slug).trim() : generateSlug(name);
    const uniqueSlug = await generateUniqueSectionSlug(baseSlug, siteId);

    const section = await prisma.section.create({
      data: {
        name: name.trim(),
        slug: uniqueSlug,
        description: description || null,
        postType: finalPostType,
        schemaKey: finalSchemaKey,
        blockTemplate: blockTemplate,
        siteId: siteId,
        parentId: parentId ? parseInt(parentId) : null,
        order: parseInt(order),
      },
      include: {
        parent: true,
        children: true,
      },
    });

    res.status(201).json(section);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Section slug already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create section" });
  }
});

// PUT /sections/:id - Actualizar sección
app.put("/sections/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, parentId, order, postType } = req.body;

    const existing = await prisma.section.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Section not found" });
    }

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Section name is required" });
    }

    // Validar que el tipo de post sea uno de los permitidos (si se proporciona)
    if (postType !== undefined && !isValidPostType(postType)) {
      return res.status(400).json({ 
        error: `Invalid post type. Allowed types: ${AVAILABLE_POST_TYPES.map(t => t.value).join(", ")}` 
      });
    }

    // Validar parentId si se proporciona (no puede ser el mismo id)
    if (parentId !== undefined) {
      if (parentId === null || parentId === "") {
        // Eliminar parent
      } else {
        if (parseInt(parentId) === id) {
          return res.status(400).json({ error: "Section cannot be its own parent" });
        }
        const parent = await prisma.section.findUnique({
          where: { id: parseInt(parentId) },
        });
        if (!parent) {
          return res.status(400).json({ error: "Parent section not found" });
        }
      }
    }

    const slug = name !== existing.name ? generateSlug(name) : existing.slug;
    const uniqueSlug = name !== existing.name ? await generateUniqueSectionSlug(slug, existing.siteId) : existing.slug;

    const section = await prisma.section.update({
      where: { id },
      data: {
        name: name.trim(),
        slug: uniqueSlug,
        description: description !== undefined ? description : existing.description,
        postType: postType !== undefined ? postType : existing.postType,
        parentId: parentId !== undefined ? (parentId === null || parentId === "" ? null : parseInt(parentId)) : existing.parentId,
        order: order !== undefined ? parseInt(order) : existing.order,
      },
      include: {
        parent: true,
        children: true,
      },
    });

    res.json(section);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Section slug already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to update section" });
  }
});

// DELETE /sections/:id - Eliminar sección
app.delete("/sections/:id", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.section.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Permisos: admin o usuario asignado al site de la sección
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: existing.siteId,
          },
        },
      });
      if (!userSite) {
        return res.status(403).json({ error: "Access denied. You don't have permission to delete this section." });
      }
    }

    // Verificar si tiene hijos
    const children = await prisma.section.findMany({
      where: { parentId: id },
    });
    if (children.length > 0) {
      return res.status(400).json({ 
        error: "Cannot delete section with child sections. Delete or move child sections first." 
      });
    }

    await prisma.section.delete({ where: { id } });

    res.json({ message: "Section deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete section" });
  }
});

// ==================== SITES ====================

// GET /sites - Obtener todos los sitios a los que el usuario tiene acceso
app.get("/sites", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    console.log("[GET /sites] ========== START ==========");
    const userId = req.userId; // Usar req.userId (de JWT o sesión)
    const isAdmin = req.isAdmin || false; // Usar req.isAdmin (de JWT o sesión)
    
    console.log("[GET /sites] userId:", userId, "isAdmin:", isAdmin);
    console.log("[GET /sites] req.userId:", req.userId, "req.isAdmin:", req.isAdmin);
    console.log("[GET /sites] req.session:", req.session ? { userId: req.session.userId, isAdmin: req.session.isAdmin } : "no session");

    if (!userId) {
      console.error("[GET /sites] ERROR: User ID not found");
      return res.status(401).json({ error: "User ID not found" });
    }

    // Asegurar que userId es un número entero
    const userIdInt = parseInt(userId);
    if (isNaN(userIdInt)) {
      console.error("[GET /sites] ERROR: Invalid userId type:", typeof userId, userId);
      return res.status(400).json({ error: "Invalid user ID" });
    }

    let sites;
    if (isAdmin) {
      console.log("[GET /sites] Fetching all sites (admin)");
      // Si es admin, devolver todos los sitios
      sites = await prisma.site.findMany({
        include: {
          config: true,
          frontendProfile: true,
          _count: {
            select: { posts: true, sections: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      console.log("[GET /sites] Found", sites.length, "sites (admin)");
    } else {
      console.log("[GET /sites] Fetching user sites for userId:", userIdInt);
      // Si no es admin, solo sus sitios
      const userSites = await prisma.userSite.findMany({
        where: { userId: userIdInt },
        include: {
          site: {
            include: {
              config: true,
              frontendProfile: true,
              _count: {
                select: { posts: true, sections: true },
              },
            },
          },
        },
      });
      sites = userSites.map(us => us.site);
      console.log("[GET /sites] Found", sites.length, "sites for user");
    }

    console.log("[GET /sites] ========== SUCCESS ==========");
    res.json(sites);
  } catch (err) {
    console.error("[GET /sites] ========== ERROR ==========");
    console.error("[GET /sites] ERROR:", err);
    console.error("[GET /sites] Error stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch sites" });
  }
});

// GET /sites/:id - Obtener un sitio específico
app.get("/sites/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Verificar si el usuario es admin
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    // Si no es admin, verificar que tenga acceso al sitio
    if (!user || !user.isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: id,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
      }
    }

    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        config: true,
        _count: {
          select: { posts: true, sections: true },
        },
      },
    });

    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    res.json(site);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch site" });
  }
});

// GET /sites/:id/config - Obtener configuración de un sitio (público, para frontend)
app.get("/sites/:id/config", publicRateLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        config: true,
      },
    });

    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    res.json(site.config || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch site config" });
  }
});

// PUT /sites/:id/config - Actualizar configuración de un sitio
app.put("/sites/:id/config", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { themeColor, logoUrl, font, customCSS } = req.body;

    // Verificar que el usuario tenga acceso
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const userSite = await prisma.userSite.findUnique({
      where: {
        userId_siteId: {
          userId: userId,
          siteId: id,
        },
      },
    });

    if (!userSite) {
      return res.status(403).json({ error: "Access denied. You don't have permission to access this site." });
    }

    // Actualizar o crear configuración
    const config = await prisma.siteConfig.upsert({
      where: { siteId: id },
      update: {
        themeColor: themeColor !== undefined ? themeColor : undefined,
        logoUrl: logoUrl !== undefined ? logoUrl : undefined,
        font: font !== undefined ? font : undefined,
        customCSS: customCSS !== undefined ? customCSS : undefined,
      },
      create: {
        siteId: id,
        themeColor: themeColor || null,
        logoUrl: logoUrl || null,
        font: font || null,
        customCSS: customCSS || null,
      },
    });

    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update site config" });
  }
});

// ==================== AUDITORÍA ====================

// GET /audit-logs - Obtener logs de auditoría (solo admins)
app.get("/audit-logs", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Only administrators can view audit logs" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const action = req.query.action || null;
    const resource = req.query.resource || null;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const siteId = req.query.siteId ? parseInt(req.query.siteId) : null;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    // Construir filtros
    const where = {};
    
    if (action) {
      where.action = action;
    }
    
    if (resource) {
      where.resource = resource;
    }
    
    if (userId) {
      where.userId = userId;
    }
    
    if (siteId) {
      where.siteId = siteId;
    }
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true },
          },
          site: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// GET /audit-logs/stats - Estadísticas de auditoría (solo admins)
app.get("/audit-logs/stats", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Only administrators can view audit statistics" });
    }

    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const [totalLogs, logsLast24h, topActions, topUsers] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({
        where: { createdAt: { gte: last24Hours } },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ["userId"],
        _count: { userId: true },
        where: { userId: { not: null } },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      }),
    ]);

    // Obtener información de usuarios para topUsers
    const topUsersWithInfo = await Promise.all(
      topUsers.map(async (item) => {
        const user = await prisma.user.findUnique({
          where: { id: item.userId },
          select: { id: true, email: true },
        });
        return {
          user,
          count: item._count.userId,
        };
      })
    );

    res.json({
      totalLogs,
      logsLast24h,
      topActions: topActions.map(item => ({
        action: item.action,
        count: item._count.action,
      })),
      topUsers: topUsersWithInfo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch audit statistics" });
  }
});

// ==================== FRONTEND PROFILES ====================

// GET /frontend-profiles - Listar todos los profiles (solo admins)
app.get("/frontend-profiles", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Only administrators can view frontend profiles" });
    }

    // Read-only source of truth: backend/profiles/*.json
    const profiles = listProfiles().map((p) => ({
      name: p.name,
      description: p.description,
      version: p.version,
      deprecated: Boolean(p.deprecated),
      source: "disk",
    }));

    res.json(profiles);
  } catch (err) {
    console.error("[GET /frontend-profiles] ERROR:", err);
    res.status(500).json({ error: "Failed to fetch frontend profiles" });
  }
});

// GET /frontend-profiles/:id - Obtener un profile específico
app.get("/frontend-profiles/:id", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    // Usar req.userId (de JWT o sesión) en lugar de req.session.userId
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Only administrators can view frontend profiles" });
    }

    // Read-only source of truth: backend/profiles/*.json
    // Accept either numeric id (legacy) or profile name.
    const raw = req.params.id;
    let profileName = raw;

    if (/^\d+$/.test(raw)) {
      const dbProfile = await prisma.frontendProfile.findUnique({
        where: { id: parseInt(raw) },
        select: { name: true },
      });
      if (!dbProfile) {
        return res.status(404).json({ error: "Frontend profile not found" });
      }
      profileName = dbProfile.name;
    }

    const profile = getProfileByName(profileName);
    if (!profile) {
      return res.status(404).json({ error: `Frontend profile "${profileName}" not found on disk` });
    }

    res.json({
      name: profile.name,
      description: profile.description,
      version: profile.version,
      deprecated: Boolean(profile.deprecated),
      sectionSchemas: profile.sectionSchemas,
      source: "disk",
    });
  } catch (err) {
    console.error("[GET /frontend-profiles/:id] ERROR:", err);
    res.status(500).json({ error: "Failed to fetch frontend profile" });
  }
});

// GET /sites/:id/frontend-profile - Obtener el profile de un site y sus schemas disponibles
app.get("/sites/:id/frontend-profile", adminRateLimiter, requireAuth, async (req, res) => {
  try {
    console.log("[GET /sites/:id/frontend-profile] ========== START ==========");
    const siteId = parseInt(req.params.id);
    const userId = req.userId; // Usar req.userId (de JWT o sesión)
    const isAdmin = req.isAdmin || false; // Usar req.isAdmin (de JWT o sesión)
    
    console.log("[GET /sites/:id/frontend-profile] siteId:", siteId, "userId:", userId, "isAdmin:", isAdmin);

    if (!userId) {
      console.error("[GET /sites/:id/frontend-profile] ERROR: User ID not found");
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }

    // Verificar permisos
    if (!isAdmin) {
      const userSite = await prisma.userSite.findUnique({
        where: {
          userId_siteId: {
            userId: userId,
            siteId: siteId,
          },
        },
      });

      if (!userSite) {
        return res.status(403).json({ error: "Access denied to this site" });
      }
    }

    console.log("[GET /sites/:id/frontend-profile] Fetching site from database...");
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        frontendProfile: true,
      },
    });

    if (!site) {
      console.error("[GET /sites/:id/frontend-profile] ERROR: Site not found with id:", siteId);
      return res.status(404).json({ error: "Site not found" });
    }

    console.log("[GET /sites/:id/frontend-profile] Site found:", site.name, "FrontendProfile:", site.frontendProfile?.name || "null");

    if (!site.frontendProfile) {
      console.log("[GET /sites/:id/frontend-profile] No frontend profile assigned, returning free mode");
      return res.json({
        siteId: site.id,
        siteName: site.name,
        frontendProfile: null,
        sectionSchemas: null,
        message: "This site has no frontend profile assigned (free mode)",
      });
    }

    // Source of truth: disk profiles. DB is just for assignment.
    console.log("[GET /sites/:id/frontend-profile] Looking for profile on disk:", site.frontendProfile.name);
    const diskProfile = getProfileByName(site.frontendProfile.name);
    if (!diskProfile) {
      console.error("[GET /sites/:id/frontend-profile] ERROR: Profile not found on disk:", site.frontendProfile.name);
      return res.status(500).json({
        error: `Frontend profile "${site.frontendProfile.name}" is assigned to this site but not found on disk (backend/profiles).`,
      });
    }
    
    console.log("[GET /sites/:id/frontend-profile] Profile found on disk:", diskProfile.name);

    // Extraer los schemas disponibles
    const sectionSchemas = diskProfile.sectionSchemas || {};
    const schemasList = Object.keys(sectionSchemas).map(key => ({
      key: key,
      label: sectionSchemas[key].label || key,
      postType: sectionSchemas[key].postType || "blog",
      allowedBlocks: sectionSchemas[key].allowedBlocks || [],
      allowReorder: sectionSchemas[key].allowReorder !== false,
    }));

    console.log("[GET /sites/:id/frontend-profile] Returning response with", schemasList.length, "schemas");
    res.json({
      siteId: site.id,
      siteName: site.name,
      frontendProfile: {
        id: site.frontendProfile.id,
        name: site.frontendProfile.name,
        description: site.frontendProfile.description,
        version: site.frontendProfile.version,
      },
      sectionSchemas: schemasList,
    });
    console.log("[GET /sites/:id/frontend-profile] ========== SUCCESS ==========");
  } catch (err) {
    console.error("[GET /sites/:id/frontend-profile] ========== ERROR ==========");
    console.error("[GET /sites/:id/frontend-profile] ERROR:", err);
    console.error("[GET /sites/:id/frontend-profile] Error stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch site frontend profile" });
  }
});


// Middleware 404 - Debe ir ANTES del middleware de errores
// Asegurar que todas las rutas no encontradas devuelvan JSON, no HTML
app.use((req, res) => {
  // Solo devolver 404 JSON si la ruta no es para archivos estáticos
  // Las rutas estáticas (admin, login) son manejadas por Vercel
  if (!req.path.startsWith('/admin') && !req.path.startsWith('/login')) {
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({ 
      error: "Not found",
      message: `Route ${req.method} ${req.path} not found`
    });
  } else {
    // Para rutas de admin/login, dejar que Vercel las maneje
    res.status(404).send("Not found");
  }
});

// Manejo de errores global para evitar crashes
app.use((err, req, res, next) => {
  console.error("[Error Handler] Unhandled error:", err);
  console.error("[Error Handler] Stack:", err.stack);
  console.error("[Error Handler] Request:", req.method, req.path);
  
  // Asegurar que siempre devolvemos JSON, no HTML
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json');
    res.status(err.status || 500).json({ 
      error: err.message || "Internal server error",
      message: process.env.NODE_ENV === "production" ? "An error occurred" : err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack })
    });
  }
});

// Export handler for Vercel serverless
module.exports = app;

// Only listen if running locally (not in Vercel)
if (process.env.VERCEL !== "1" && !process.env.VERCEL_ENV) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Cache TTL: ${CACHE_TTL}ms (${CACHE_TTL / 1000}s)`);
    console.log(`Rate limiting enabled for public, auth, and admin endpoints`);
  });
}



// Prisma-based session store for express-session
// Compatible with Vercel serverless functions

const EventEmitter = require('events');

class PrismaSessionStore extends EventEmitter {
  constructor(prisma) {
    super();
    if (!prisma) {
      throw new Error("PrismaClient instance is required");
    }
    this.prisma = prisma;
  }

  async get(sessionId, callback) {
    try {
      console.log('[PrismaSessionStore] Getting session:', sessionId);
      
      // Intentar usar el modelo Session si está disponible
      try {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
        });

        if (!session) {
          console.log('[PrismaSessionStore] Session not found:', sessionId);
          return callback(null, null);
        }

        // Check if session has expired
        if (session.expiresAt < new Date()) {
          console.log('[PrismaSessionStore] Session expired:', sessionId);
          await this.destroy(sessionId);
          return callback(null, null);
        }

        // Parse session data
        const data = JSON.parse(session.data);
        console.log('[PrismaSessionStore] Session retrieved successfully, userId:', data.userId);
        callback(null, data);
      } catch (modelError) {
        // Si el modelo no existe, intentar usar $queryRaw directamente
        if (modelError.code === 'P2021' || modelError.message?.includes('does not exist') || modelError.message?.includes('Unknown arg')) {
          console.log('[PrismaSessionStore] Model not available, using raw query...');
          const result = await this.prisma.$queryRaw`
            SELECT * FROM "Session" WHERE "id" = ${sessionId} AND "expiresAt" > NOW()
          `;
          
          if (!result || result.length === 0) {
            console.log('[PrismaSessionStore] Session not found:', sessionId);
            return callback(null, null);
          }
          
          const session = result[0];
          const data = JSON.parse(session.data);
          console.log('[PrismaSessionStore] Session retrieved successfully via raw query, userId:', data.userId);
          callback(null, data);
        } else {
          throw modelError;
        }
      }
    } catch (error) {
      // Si la tabla no existe aún, retornar null en lugar de crashear
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        console.warn('[PrismaSessionStore] ⚠️ Session table does not exist yet:', error.message);
        console.warn('[PrismaSessionStore] Please run: npx prisma migrate deploy');
        return callback(null, null);
      }
      console.error('[PrismaSessionStore] ❌ Error getting session:', error);
      callback(error);
    }
  }

  async set(sessionId, sessionData, callback) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + (sessionData.cookie?.maxAge || 24 * 60 * 60 * 1000));

      console.log('[PrismaSessionStore] Saving session:', sessionId, 'userId:', sessionData.userId);
      
      // Intentar usar el modelo Session si está disponible
      try {
        await this.prisma.session.upsert({
          where: { id: sessionId },
          create: {
            id: sessionId,
            data: JSON.stringify(sessionData),
            expiresAt,
          },
          update: {
            data: JSON.stringify(sessionData),
            expiresAt,
          },
        });
        console.log('[PrismaSessionStore] ✅ Session saved successfully:', sessionId);
        callback(null);
      } catch (modelError) {
        // Si el modelo no existe, intentar usar $executeRaw directamente
        if (modelError.code === 'P2021' || modelError.message?.includes('does not exist') || modelError.message?.includes('Unknown arg')) {
          console.log('[PrismaSessionStore] Model not available, using raw query...');
          const dataStr = JSON.stringify(sessionData);
          const expiresAtStr = expiresAt.toISOString();
          await this.prisma.$executeRawUnsafe(`
            INSERT INTO "Session" ("id", "data", "expiresAt", "createdAt")
            VALUES ('${sessionId.replace(/'/g, "''")}', '${dataStr.replace(/'/g, "''")}', '${expiresAtStr}', NOW())
            ON CONFLICT ("id") DO UPDATE SET
              "data" = EXCLUDED."data",
              "expiresAt" = EXCLUDED."expiresAt"
          `);
          console.log('[PrismaSessionStore] ✅ Session saved successfully via raw query:', sessionId);
          callback(null);
        } else {
          throw modelError;
        }
      }
    } catch (error) {
      // Si la tabla no existe aún, loguear warning pero no crashear
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        console.error('[PrismaSessionStore] ❌ Session table does not exist yet:', error.message);
        console.error('[PrismaSessionStore] This is a CRITICAL error - sessions will not persist!');
        console.error('[PrismaSessionStore] Please run: npx prisma migrate deploy');
        return callback(null); // Continuar sin guardar sesión (pero esto causará problemas)
      }
      console.error('[PrismaSessionStore] ❌ Error setting session:', error);
      console.error('[PrismaSessionStore] Error details:', {
        code: error.code,
        message: error.message,
        meta: error.meta
      });
      callback(error);
    }
  }

  async destroy(sessionId, callback) {
    try {
      await this.prisma.session.deleteMany({
        where: { id: sessionId },
      });
      if (callback) callback(null);
    } catch (error) {
      // Si la tabla no existe, simplemente continuar
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        if (callback) callback(null);
        return;
      }
      if (callback) callback(error);
    }
  }

  async all(callback) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          expiresAt: {
            gte: new Date(),
          },
        },
      });

      const result = {};
      for (const session of sessions) {
        result[session.id] = JSON.parse(session.data);
      }
      callback(null, result);
    } catch (error) {
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        return callback(null, {});
      }
      callback(error);
    }
  }

  async length(callback) {
    try {
      const count = await this.prisma.session.count({
        where: {
          expiresAt: {
            gte: new Date(),
          },
        },
      });
      callback(null, count);
    } catch (error) {
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        return callback(null, 0);
      }
      callback(error);
    }
  }

  async clear(callback) {
    try {
      await this.prisma.session.deleteMany({});
      if (callback) callback(null);
    } catch (error) {
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        if (callback) callback(null);
        return;
      }
      if (callback) callback(error);
    }
  }

  async touch(sessionId, sessionData, callback) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + (sessionData.cookie?.maxAge || 24 * 60 * 60 * 1000));

      await this.prisma.session.updateMany({
        where: { id: sessionId },
        data: {
          expiresAt,
        },
      });

      callback(null);
    } catch (error) {
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        return callback(null);
      }
      callback(error);
    }
  }
}

module.exports = PrismaSessionStore;


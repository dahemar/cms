// Prisma-based session store for express-session
// Compatible with Vercel serverless functions

const { PrismaClient } = require("@prisma/client");

class PrismaSessionStore {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async get(sessionId, callback) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return callback(null, null);
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        await this.destroy(sessionId);
        return callback(null, null);
      }

      // Parse session data
      const data = JSON.parse(session.data);
      callback(null, data);
    } catch (error) {
      callback(error);
    }
  }

  async set(sessionId, sessionData, callback) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + (sessionData.cookie?.maxAge || 24 * 60 * 60 * 1000));

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

      callback(null);
    } catch (error) {
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
      callback(error);
    }
  }

  async clear(callback) {
    try {
      await this.prisma.session.deleteMany({});
      if (callback) callback(null);
    } catch (error) {
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
      callback(error);
    }
  }
}

module.exports = PrismaSessionStore;


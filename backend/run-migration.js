require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function runMigration() {
  try {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, "prisma/migrations/20250106120000_add_session_store/migration.sql"),
      "utf8"
    );

    console.log("Executing migration...");
    
    // Split by semicolon and execute each command separately
    const commands = migrationSQL
      .split(";")
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith("--"));

    for (const command of commands) {
      if (command.trim()) {
        try {
          await prisma.$executeRawUnsafe(command);
          console.log(`✅ Executed: ${command.substring(0, 50)}...`);
        } catch (err) {
          if (err.message?.includes("already exists")) {
            console.log(`⚠️  Already exists: ${command.substring(0, 50)}...`);
          } else {
            throw err;
          }
        }
      }
    }
    
    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();


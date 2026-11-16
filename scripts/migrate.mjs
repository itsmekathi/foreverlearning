// Applies database migrations (drizzle/*.sql). Runs automatically on Vercel via `vercel-build`,
// so tables are created as soon as a database is connected from Vercel → Storage.
// If no database is connected yet, it warns and lets the build continue.
import { existsSync } from "node:fs";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

if (existsSync(".env.local")) config({ path: ".env.local" });

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.warn(
    "\n⚠  No database connected — skipping migrations.\n" +
      "   Vercel → your project → Storage → Create Database → Neon → Connect, then redeploy.\n",
  );
  process.exit(0);
}

await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
console.log("✓ Database migrations applied");

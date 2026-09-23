import "dotenv/config";
import { defineConfig } from "prisma/config";

// The app talks to Neon through the pooled host at runtime (src/lib/db.ts).
// Migrations need a direct connection, which is the same URL without "-pooler".
// process.env (not env()) so `prisma generate` still works where the variable is absent.
const pooled = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: pooled?.replace("-pooler.", ".") },
});

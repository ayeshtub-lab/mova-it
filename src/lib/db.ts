import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One client per server process. In dev, hot reload would otherwise open a new
// pool on every edit and exhaust Neon's connections (the sarma3i outage lesson).
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

// Neon's URL says sslmode=require, which pg already treats as verify-full (and warns on
// every connection that this will change). Ask for verify-full explicitly: same strict
// certificate check, no warning, and no silent downgrade when pg changes the meaning.
const strictSsl = (url: string | undefined) => url?.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, "$1verify-full");

function createClient() {
  const adapter = new PrismaPg({ connectionString: strictSsl(process.env.DATABASE_URL) });
  return new PrismaClient({ adapter });
}

export const db = globalForDb.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;

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
  // Limits on waiting (2026-11-10): pg's defaults wait for ever — for a free connection and for an
  // answer. On 10/11 the database stalled for a moment and every request on that server instance
  // waited until Vercel cut it at 300 s: the home page hung 5 minutes (20:56) and the 30-minute cron
  // twice (19:30, 20:00), with nothing to do. Now a stalled request fails within seconds and the next
  // one gets a fresh connection. (query_timeout is kept on the client: Neon's pooler refuses a
  // statement_timeout sent at connection time.)
  const adapter = new PrismaPg({
    connectionString: strictSsl(process.env.DATABASE_URL),
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForDb.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;

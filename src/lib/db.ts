import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One client per server process. In dev, hot reload would otherwise open a new
// pool on every edit and exhaust Neon's connections (the sarma3i outage lesson).
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForDb.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;

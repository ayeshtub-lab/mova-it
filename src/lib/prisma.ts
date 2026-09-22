import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

export const pool = globalForDb.pool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

// دالة مساعدة لتنفيذ استعلامات SQL بسهولة تامة
export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}
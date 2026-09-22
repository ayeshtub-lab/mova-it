import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await pool.connect();

  try {
    // التأكد من إنشاء جدول الشواهد لو مش موجود
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Witness" (
        id SERIAL PRIMARY KEY,
        "momentId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // تسجيل الشاهد
    await client.query(
      `INSERT INTO "Witness" ("momentId", "createdAt") VALUES ($1, NOW())`,
      [id]
    );

    return NextResponse.json({ success: true, message: "Witness recorded successfully" });
  } catch (error) {
    console.error("Error in witness API:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  } finally {
    client.release();
  }
}
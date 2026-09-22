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
    const body = await request.json();
    const { angleText } = body;

    if (!angleText || !angleText.trim()) {
      return NextResponse.json({ success: false, message: "Angle text is required" }, { status: 400 });
    }

    // التأكد من إنشاء الجدول لو مش موجود، ثم إدخال الزاوية
    await client.query(`
      CREATE TABLE IF NOT EXISTS "WitnessAngle" (
        id SERIAL PRIMARY KEY,
        "momentId" INTEGER NOT NULL,
        "angleText" TEXT NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    const result = await client.query(
      `INSERT INTO "WitnessAngle" ("momentId", "angleText", "createdAt") VALUES ($1, $2, NOW()) RETURNING *`,
      [id, angleText]
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error adding angle:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  } finally {
    client.release();
  }
}
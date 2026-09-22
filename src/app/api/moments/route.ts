import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// جلب كل اللحظات (GET)
export async function GET() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM "Moment" ORDER BY "createdAt" DESC LIMIT 20`
    );

    // تنسيق النتائج لتتوافق مع ما تتوقعه الصفحة الرئيسية
    const formattedMoments = result.rows.map((row) => ({
      ...row,
      areaName: row.areaName || row.areacode, // احتياطاً لو كان اسم العمود مختلفاً قليلاً
      _count: { witnesses: 1 }, // عداد افتراضي مؤقت للشهود
    }));

    return NextResponse.json({ success: true, data: formattedMoments }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching moments:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// إنشاء لحظة جديدة (POST)
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { title, city, areaName, whyNowReason, missingPiece } = body;

    if (!title || !city || !areaName) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const query = `
      INSERT INTO "Moment" (title, city, "areaName", "whyNowReason", "missingPiece", "createdAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id;
    `;

    const values = [
      title,
      city,
      areaName,
      whyNowReason || 'Recently reported',
      missingPiece || null,
    ];

    const result = await client.query(query, values);

    return NextResponse.json(
      { success: true, id: result.rows[0].id },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating moment:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Sparkles, Clock, ArrowLeft } from "lucide-react";
import { Pool } from "pg";
import WitnessSection from "./WitnessSection";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MomentDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  const client = await pool.connect();
  try {
    // 1. جلب اللحظة
    const result = await client.query(
      `SELECT * FROM "Moment" WHERE id::text = $1 LIMIT 1`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      notFound();
    }

    const moment = result.rows[0];

    // 2. جلب زوايا الشواهد (مع حماية آمنة لو الجدول غير موجود بعد)
    let initialAngles = [];
    try {
      const anglesResult = await client.query(
        `SELECT * FROM "WitnessAngle" WHERE "momentId"::text = $1 ORDER BY "createdAt" DESC`,
        [id]
      );
      initialAngles = anglesResult.rows;
    } catch {
      initialAngles = []; // إذا الجدول مش منشأ بقاعدة البيانات، نتجاهل الخطأ ونرجع قائمة فارغة
    }

    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 flex flex-col items-center">
        <div className="w-full max-w-xl space-y-6">
          {/* زر العودة */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl transition-all">
              <ArrowLeft className="w-4 h-4" />
              Back to Live Feed
            </Link>
          </div>

          {/* صندوق اللحظة الرئيسي */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 text-indigo-400 font-medium bg-indigo-950/50 px-2.5 py-1 rounded-full border border-indigo-900/40">
                <Sparkles className="w-3.5 h-3.5" />
                Live Moment
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {moment.createdAt ? new Date(moment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
              </span>
            </div>

            <h1 className="text-lg sm:text-xl font-bold text-slate-100 leading-snug">
              {moment.title || moment.content}
            </h1>

            {(moment.locationName || moment.city) && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800/60 w-fit">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>{moment.city ? `${moment.city} — ${moment.areaName || ''}` : moment.locationName}</span>
              </div>
            )}
          </div>

          {/* مكون التفاعل والشواهد */}
          <WitnessSection momentId={moment.id} initialAngles={initialAngles} />
        </div>
      </main>
    );
  } finally {
    client.release();
  }
}
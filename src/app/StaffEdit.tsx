"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MomentDetails, type MomentDetailsLabels } from "@/app/MomentDetails";

// Zawmo's own accounts (admins — src/lib/staff.ts) fix what search engines show on someone
// else's public page: a moment's title and description, or a shot's title and line. Folded
// away under one button, so the page looks as everyone sees it. (Arabic only: it is for the team.)
const box = "flex flex-col gap-2 rounded-3xl border-2 border-dashed border-secondary/50 bg-secondary-soft/40 p-3";
const summary = "cursor-pointer list-none text-sm font-extrabold text-secondary [&::-webkit-details-marker]:hidden";

export function StaffMomentEdit({ code, title, description, labels }: { code: string; title: string; description: string | null; labels: MomentDetailsLabels }) {
  return (
    <details className={box}>
      <summary className={summary}>✏️ تعديل العنوان والوصف (صلاحية زاومو)</summary>
      <MomentDetails code={code} initial={{ title, description }} labels={labels} />
    </details>
  );
}

export function StaffShotEdit({ id, title, text }: { id: string; title: string; text: string | null }) {
  const router = useRouter();
  const [t, setT] = useState(title);
  const [d, setD] = useState(text ?? "");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const input = "min-h-11 w-full rounded-2xl border border-line bg-background px-3 font-normal outline-none focus:border-accent";

  async function save() {
    setState("busy");
    const res = await fetch(`/api/angles/${id}/seo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t, text: d }) }).catch(() => null);
    setState(res?.ok ? "saved" : "failed");
    if (res?.ok) router.refresh();
  }

  return (
    <details className={box}>
      <summary className={summary}>✏️ تعديل عنوان اللقطة ووصفها (صلاحية زاومو)</summary>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        العنوان (اللي بيطلع بجوجل)
        <input value={t} maxLength={90} onChange={(e) => setT(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        الوصف (مع #الهاشتاغات)
        <textarea value={d} maxLength={400} rows={4} onChange={(e) => setD(e.target.value)} className={`${input} resize-y py-2`} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={state === "busy" || !t.trim()} className="min-h-10 rounded-full bg-secondary px-4 text-sm font-bold text-white disabled:opacity-60">
          احفظ
        </button>
        {state === "saved" && <span className="text-sm text-secondary">✓ انحفظ</span>}
        {state === "failed" && (
          <span role="alert" className="text-sm font-semibold text-accent-ink">
            ما انحفظ، جرّب كمان مرة
          </span>
        )}
      </div>
    </details>
  );
}

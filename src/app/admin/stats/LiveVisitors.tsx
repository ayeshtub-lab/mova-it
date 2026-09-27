"use client";

import { useEffect, useState } from "react";

type Online = {
  now: { total: number; members: number; visitors: number };
  today: { visitors: number; members: number };
  names: string[];
  pages: { path: string; count: number }[];
  at: string;
};

const EVERY_MS = 10_000;
const num = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
// Readable page names for the common paths.
const pageName = (path: string) =>
  path === "/" ? "الرئيسية" : path === "/discover" ? "اكتشف" : path === "/new" ? "لحظة جديدة" : path === "/inbox" ? "الوارد" : path.startsWith("/m/") ? `لحظة ${path.slice(3)}` : path.startsWith("/u/") ? "صفحة شخص" : path.startsWith("/admin") ? "لوحة التحكم" : path;

// «على الموقع الآن»: who has Zawmo open, refreshed every 10 seconds while this page is on screen.
export function LiveVisitors() {
  const [data, setData] = useState<Online | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/admin/online", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        setData(await res.json());
        setFailed(false);
      } else setFailed(true);
    };
    load();
    const timer = setInterval(load, EVERY_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const tiles = data
    ? ([
        ["🟢", "الآن على الموقع", data.now.total],
        ["👤", "أعضاء الآن", data.now.members],
        ["👀", "زوار الآن", data.now.visitors],
        ["📅", "زوار اليوم", data.today.visitors],
        ["🙋", "أعضاء اليوم", data.today.members],
      ] as const)
    : [];

  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-emerald-500/40 bg-background p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-extrabold">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </span>
          على الموقع الآن
        </h2>
        <span className="text-xs text-muted">{failed ? "تعذّر التحديث، نعيد المحاولة…" : "يتحدّث كل ١٠ ثوانٍ"}</span>
      </div>

      {!data ? (
        <p className="text-sm text-muted">جاري التحميل…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {tiles.map(([icon, label, value], i) => (
              <div key={label} className={`flex flex-col gap-1 rounded-2xl bg-surface p-3 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
                <span className="text-xs text-muted">
                  {icon} {label}
                </span>
                <span className={`font-extrabold tabular-nums ${i === 0 ? "text-4xl text-emerald-600 dark:text-emerald-400" : "text-2xl"}`}>{num(value)}</span>
              </div>
            ))}
          </div>
          {data.names.length > 0 && (
            <p className="text-sm">
              <span className="font-bold">الأعضاء الآن: </span>
              <span className="text-muted">{data.names.join("، ")}</span>
            </p>
          )}
          {data.pages.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {data.pages.map((p) => (
                <li key={p.path} className="rounded-full bg-surface px-3 py-1 font-semibold">
                  {pageName(p.path)} · {num(p.count)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

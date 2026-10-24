"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CardFont, CardKind } from "@/lib/card-styles";
import type { Dictionary } from "@/i18n/server";
import { cardStep } from "@/lib/funnel";
import { CardEditor } from "./CardEditor";

// «➕ اعمل بطاقة» with no picture yet (his ask, 2026-10-24): one from the phone — it stays there, the
// card is drawn on it right here — or one of Zawmo's public photos (its own editor page, with lines
// written for it and «انشرها عامة»).
export function CardStart({
  shots,
  fonts,
  kinds,
  labels,
}: {
  shots: string[];
  fonts: Record<CardFont, string>;
  kinds: Exclude<CardKind, "other">[];
  labels: Dictionary["card"];
}) {
  const [own, setOwn] = useState<string | null>(null);
  useEffect(() => cardStep("opened"), []);
  useEffect(() => () => void (own && URL.revokeObjectURL(own)), [own]);

  if (own)
    return (
      <CardEditor
        key={own}
        picture={{ image: own, by: null, shotId: null }}
        fonts={fonts}
        kinds={kinds}
        canPublish={false}
        signIn={null}
        labels={labels}
        onOtherPicture={() => setOwn(null)}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95">
        {labels.fromPhone}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setOwn(URL.createObjectURL(file));
          }}
        />
      </label>
      <p className="-mt-2 text-center text-xs text-muted">{labels.fromPhoneHint}</p>
      <h2 className="text-base font-extrabold">{labels.fromZawmo}</h2>
      <ul className="grid grid-cols-3 gap-1.5">
        {shots.map((id, i) => (
          <li key={id}>
            <Link href={`/card/new?shot=${id}`} className="block overflow-hidden rounded-xl bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- the shot's fixed address */}
              <img src={`/i/${id}-small.jpg`} alt="" loading={i < 9 ? "eager" : "lazy"} className="aspect-square w-full object-cover" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

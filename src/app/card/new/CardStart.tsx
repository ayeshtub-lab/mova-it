"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { CardFont, CardKind } from "@/lib/card-styles";
import type { Dictionary } from "@/i18n/server";
import { SCENES, type Scene } from "@/lib/scenes";
import { cardStep } from "@/lib/funnel";
import { CardEditor } from "./CardEditor";

// «➕ اعمل بطاقة» with no picture yet (his asks, 2026-10-24): one of Zawmo's public photos — many,
// varied, by what they show — or, for members, one from the phone: it stays there, the card is drawn
// on it right here. A visitor is asked to sign in for that.
export function CardStart({
  shots,
  fonts,
  kinds,
  member,
  signIn,
  labels,
  sceneLabels,
}: {
  shots: { id: string; scene: Scene | null }[];
  fonts: Record<CardFont, string>;
  kinds: Exclude<CardKind, "other">[];
  member: boolean;
  signIn: ReactNode;
  labels: Dictionary["card"];
  sceneLabels: Record<Scene, string>;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  useEffect(() => cardStep("opened"), []);
  useEffect(() => () => void (own && URL.revokeObjectURL(own)), [own]);

  if (own)
    return (
      <CardEditor
        key={own}
        picture={{ image: own, by: null, shotId: null }}
        fonts={fonts}
        kinds={kinds}
        member={member}
        signIn={signIn}
        labels={labels}
        onOtherPicture={() => setOwn(null)}
      />
    );
  // The scenes there are at least three photos of, the most first.
  const counts = new Map<Scene, number>();
  for (const s of shots) if (s.scene && s.scene !== "other") counts.set(s.scene, (counts.get(s.scene) ?? 0) + 1);
  const scenes = [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const shown = scene ? shots.filter((s) => s.scene === scene) : shots;
  return (
    <div className="flex flex-col gap-4">
      {member ? (
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
      ) : (
        <button type="button" onClick={() => setAsk(true)} className="min-h-14 rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95">
          {labels.fromPhone}
        </button>
      )}
      {ask && !member ? (
        <section className="-mt-1 flex flex-col gap-2 rounded-3xl border-2 border-accent/40 bg-accent/5 p-4 text-center">
          <p className="font-extrabold">{labels.ownSignIn}</p>
          {signIn}
        </section>
      ) : (
        <p className="-mt-2 text-center text-xs text-muted">{labels.fromPhoneHint}</p>
      )}
      <h2 className="text-base font-extrabold">{labels.fromZawmo}</h2>
      {scenes.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <button type="button" onClick={() => setScene(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${scene ? "bg-surface" : "bg-accent text-white"}`}>
            {labels.allScenes}
          </button>
          {scenes.map((s) => (
            <button key={s} type="button" onClick={() => setScene(s)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${scene === s ? "bg-accent text-white" : "bg-surface"}`}>
              {SCENES[s].emoji} {sceneLabels[s]}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-3 gap-1.5">
        {shown.map((s, i) => (
          <li key={s.id}>
            <Link href={`/card/new?shot=${s.id}`} className="block overflow-hidden rounded-xl bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- the shot's fixed address */}
              <img src={`/i/${s.id}-small.jpg`} alt="" loading={i < 9 ? "eager" : "lazy"} className="aspect-square w-full object-cover" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

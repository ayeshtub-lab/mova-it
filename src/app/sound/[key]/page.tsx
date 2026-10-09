import { plain } from "@/lib/clip";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { isQuran, SOUND_CATEGORIES, soundByKey, soundFile, soundName } from "@/lib/sounds";
import { soundShots, soundUses } from "@/server/sounds";
import { userSound } from "@/server/user-sounds";
import { PlaySound, SharedSwitch, UseSoundButton, WithdrawSound } from "./UseSound";

export async function generateMetadata({ params }: PageProps<"/sound/[key]">): Promise<Metadata> {
  const sound = soundByKey((await params).key);
  if (!sound) return {};
  const locale = await getLocale();
  const t = (await getDictionary(locale)).sounds;
  // A person's sound: its own name — and in search only while it is live and for everyone.
  const people = sound.cat === "people" ? await userSound(sound.key) : null;
  if (sound.cat === "people" && (people?.status !== "public" || !people.shared)) return { robots: { index: false } };
  const name = people?.name ?? soundName(sound, locale);
  const title = (isQuran(sound) ? t.metaTitleQuran : t.metaTitle).replace("{name}", name);
  const description = t.metaDescription.replace("{name}", name).replace("{cat}", t.cats[sound.cat]);
  // Its link shared anywhere shows a shot made with it (the newest public one).
  const [shot] = await soundShots(null, sound.key, 1);
  const images = shot ? [`/i/${shot.id}.jpg`] : undefined;
  return { title, description, alternates: { canonical: `/sound/${sound.key}` }, openGraph: { title, description, type: "website", images } };
}

// A sound's page (the spinning disc in the viewer leads here): listen, who made it and
// under which license, how many shots use it, its public shots, and «Use this sound».
export default async function SoundPage({ params }: PageProps<"/sound/[key]">) {
  const sound = soundByKey((await params).key);
  if (!sound) notFound();
  // «🎤 صوتك»: a person's sound has its own name and owner; gone once withdrawn or blocked, and a
  // «🔒 خاص» one is only its owner's to see.
  const people = sound.cat === "people" ? await userSound(sound.key) : null;
  if (sound.cat === "people" && people?.status !== "public") notFound();
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (people && !people.shared && user?.id !== people.owner.id) notFound();
  const [dict, uses, shots] = await Promise.all([getDictionary(locale), soundUses(sound.key), soundShots(user, sound.key)]);
  const t = dict.sounds;
  const cat = SOUND_CATEGORIES.find((c) => c.key === sound.cat)!;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 pb-16 text-center">
        <PlaySound src={soundFile(sound.key)} labels={{ play: t.preview, stop: t.stop }} />
        <div className="flex flex-col items-center gap-1">
          <p className="w-fit rounded-full bg-surface px-3 py-1 text-xs font-bold text-muted">
            {cat.emoji} {t.cats[sound.cat]}
            {isQuran(sound) || people ? "" : ` · ${t.library}`}
          </p>
          <h1 className="text-3xl font-extrabold">{people ? `🎤 ${people.name}` : `${isQuran(sound) ? "" : "🎵 "}${soundName(sound, locale)}`}</h1>
          {people ? (
            <p className="text-sm text-muted">
              <Link href={`/u/${people.owner.id}`} className="font-bold text-secondary underline-offset-4 hover:underline">
                {t.originalBy.replace("{name}", people.owner.displayName)}
              </Link>
            </p>
          ) : (
            <p className="text-sm text-muted">{sound.credit ? (isQuran(sound) ? t.recitedBy : t.by).replace("{author}", sound.credit.author) : t.byZawmo}</p>
          )}
          {sound.credit && (
            <p className="text-xs text-muted">
              {t.license.replace("{license}", sound.credit.license)} ·{" "}
              <a href={sound.credit.url} target="_blank" rel="noopener noreferrer" className="font-bold text-secondary underline-offset-4 hover:underline">
                {t.source}
              </a>
            </p>
          )}
          <p className="text-sm font-bold">{t.uses.replace("{n}", new Intl.NumberFormat(locale).format(uses))}</p>
        </div>
        {user ? <UseSoundButton soundKey={sound.key} label={t.useThis} /> : null}
        {user && <p className="-mt-3 text-xs text-muted">{t.useHint}</p>}
        {people && user?.id === people.owner.id && (
          <SharedSwitch
            soundKey={people.key}
            shared={people.shared}
            labels={{ isShared: dict.sounds.own.isShared, isPrivate: dict.sounds.own.isPrivate, makeShared: dict.sounds.own.makeShared, makePrivate: dict.sounds.own.makePrivate }}
          />
        )}
        {people && user?.id === people.owner.id && <WithdrawSound soundKey={people.key} labels={{ withdraw: t.withdraw, confirm: t.withdrawConfirm }} />}

        {shots.length ? (
          <ul className="grid w-full grid-cols-3 gap-1.5">
            {shots.map((s) => (
              <li key={s.id}>
                <Link href={`/m/${s.momentCode}#angle-${s.id}`} className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface">
                  {s.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={s.coverUrl} alt={plain(`${s.label} — ${soundName(sound, locale)}`)} loading="lazy" className="size-full object-cover" />
                  )}
                  {s.mediaType === "VIDEO" && <span aria-hidden="true" className="absolute end-1.5 top-1.5 rounded-full bg-black/50 px-1.5 text-xs text-white">▶</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="w-full rounded-3xl bg-surface p-6 text-muted">{t.empty}</p>
        )}
      </main>
    </div>
  );
}

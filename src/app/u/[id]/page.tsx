import { alternatesFor } from "@/i18n/alternates";
import { CONTACT_EMAIL } from "@/lib/site";
import type { Metadata } from "next";
import { VerifiedBadge } from "@/app/VerifiedBadge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { SettingToggle } from "./SettingToggle";
import { getProfile, ProfileError, setDisplayName } from "@/server/profile";
import { publicAuthor } from "@/server/seo";
import { JsonLd } from "@/app/JsonLd";
import { CANONICAL_HOST } from "@/lib/hosts";
import { isCurator } from "@/server/sound-resolve";
import { AvatarEditor } from "./AvatarEditor";
import { FollowButton } from "./FollowButton";
import { NameEditor, type RenameState } from "./NameEditor";
import { ProfileTabs } from "./ProfileTabs";
import { MessageButton } from "./MessageButton";

// What a member's page says about them to search engines: their public shots and where.
function authorLine(name: string, author: Awaited<ReturnType<typeof publicAuthor>>, locale: string) {
  const n = author.shots.toLocaleString(locale === "ar" ? "ar-EG" : "en");
  const where = author.places.slice(0, 3).join(locale === "ar" ? "، " : ", ");
  return locale === "ar"
    ? `صور ولحظات ${name} على زاومو: ${n} لقطة حقيقية${where ? ` من ${where}` : ""}.`
    : `${name}'s photos and moments on Zawmo: ${n} real shots${where ? ` from ${where}` : ""}.`;
}

export async function generateMetadata({ params }: PageProps<"/u/[id]">): Promise<Metadata> {
  const id = (await params).id;
  const profile = await getProfile(await getCurrentUser(), id);
  if (!profile) return {};
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const title = profile.displayName === dict.meta.brand ? dict.meta.brand : `${profile.displayName} · ${dict.meta.brand}`;
  // Indexed only with a public shot: someone who shares nothing publicly stays out of search.
  const author = await publicAuthor(id);
  if (!author.shots) return { title, robots: { index: false } };
  const description = authorLine(profile.displayName, author, locale);
  return { title, description, alternates: await alternatesFor(`/u/${id}`), openGraph: { title, description, type: "profile", siteName: dict.meta.brand } };
}

async function rename(_prev: RenameState, formData: FormData): Promise<RenameState> {
  "use server";
  const user = await getCurrentUser();
  if (!user) return { error: true };
  try {
    await setDisplayName(user, formData.get("displayName"));
  } catch (error) {
    if (error instanceof ProfileError) return { error: true };
    throw error;
  }
  revalidatePath(`/u/${user.id}`);
  return { saved: Date.now() };
}

export default async function ProfilePage({ params }: PageProps<"/u/[id]">) {
  const { id } = await params;
  const [viewer, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const profile = await getProfile(viewer, id);
  if (!profile) notFound();
  const dict = await getDictionary(locale);
  const t = dict.profile;
  const initial = [...profile.displayName][0] ?? "?";
  // Who they are, for search engines (a page with public shots only — see generateMetadata).
  const author = await publicAuthor(id);
  const site = `https://${CANONICAL_HOST}`;
  const structured = author.shots
    ? {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        url: `${site}/u/${id}`,
        ...(author.updatedAt ? { dateModified: author.updatedAt.toISOString() } : {}),
        mainEntity: {
          "@type": "Person",
          "@id": `${site}/u/${id}#person`,
          name: profile.displayName,
          url: `${site}/u/${id}`,
          description: authorLine(profile.displayName, author, locale),
          ...(profile.avatarUrl ? { image: profile.avatarUrl } : {}),
          ...(author.places.length ? { homeLocation: { "@type": "Place", name: author.places[0] } } : {}),
          interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/WriteAction", userInteractionCount: author.shots }],
        },
      }
    : null;
  const avatar = (
    <span className="block rounded-full bg-gradient-to-br from-brand-red via-moment to-brand-blue p-1">
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- profile photo (Google, or uploaded)
        <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-24 rounded-full border-4 border-background object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-24 items-center justify-center rounded-full border-4 border-background bg-surface text-4xl font-extrabold">
          {initial}
        </span>
      )}
    </span>
  );

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      {structured && <JsonLd data={structured} />}
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <section className="flex flex-col items-center gap-3 text-center">
          {profile.isMe ? (
            <AvatarEditor labels={{ change: t.changePhoto, saving: t.photoSaving, failed: t.photoFailed, blocked: t.photoBlocked }}>
              {avatar}
            </AvatarEditor>
          ) : (
            avatar
          )}

          {profile.isMe ? (
            <NameEditor
              name={profile.displayName}
              googleName={profile.googleName && profile.googleName !== profile.displayName ? profile.googleName : null}
              action={rename}
              labels={{ edit: t.editName, save: t.save, cancel: t.cancel, useGoogle: t.useGoogle, error: t.nameError, label: dict.guest.nameLabel }}
            />
          ) : (
            <h1 className="text-2xl font-extrabold">{profile.displayName}</h1>
          )}
          {profile.verified && (
            <p className="-mt-1 flex items-center gap-1.5 text-sm font-bold text-[#1463e0] dark:text-[#5aa9ff]">
              <VerifiedBadge label={dict.verified.badge} className="size-5" />
              {dict.verified.official}
            </p>
          )}

          <div className="grid w-full max-w-sm grid-cols-4 gap-1.5">
            {(
              [
                [profile.shots.length, t.shots, null],
                [profile.followers, t.followers, "followers"],
                [profile.following, t.following, "following"],
                [profile.likesReceived, t.likesReceived, null],
              ] as const
            ).map(([n, label, list]) => {
              const inner = (
                <>
                  <span className="truncate text-xs text-muted">{label}</span>
                  <span className="text-xl font-extrabold">{new Intl.NumberFormat(locale, { notation: "compact" }).format(n)}</span>
                </>
              );
              const box = "flex min-w-0 flex-col-reverse items-center rounded-2xl bg-surface px-1 py-2";
              // Followers and following open the list of people.
              return list ? (
                <Link key={label} href={`/u/${profile.id}/${list}`} className={`${box} transition-colors hover:bg-line`}>
                  {inner}
                </Link>
              ) : (
                <div key={label} className={box}>
                  {inner}
                </div>
              );
            })}
          </div>

          {profile.canFollow && (
            <FollowButton userId={profile.id} initial={profile.isFollowing} labels={{ follow: t.follow, unfollow: t.unfollow, isFollowing: t.isFollowing, failed: t.failed }} />
          )}
          {!profile.isMe && (
            <MessageButton userId={profile.id} label="💬 رسالة" failed="لا يمكن المراسلة" />
          )}
          {profile.isAdmin && (
            <Link href="/admin" className="text-sm font-bold text-secondary underline-offset-4 hover:underline">
              {t.admin}
            </Link>
          )}
        </section>

        <ProfileTabs
          shots={profile.shots}
          moments={profile.moments.map((m) => ({ ...m, lastActivityAt: m.lastActivityAt.toISOString() }))}
          likes={profile.likes}
          saved={profile.saved}
          labels={{
            shots: t.shots,
            moments: t.moments,
            likes: t.likes,
            emptyShots: t.emptyShots,
            emptyMoments: t.emptyMoments,
            emptyLikes: t.emptyLikes,
            likesPrivate: t.likesPrivate,
            saved: t.saved,
            emptySaved: t.emptySaved,
            savedPrivate: t.savedPrivate,
            seenBy: dict.viewer.seenBy,
            isNew: dict.viewer.isNew,
          }}
        />
        {profile.isMe && viewer && !viewer.isGuest && (
          <>
            <SettingToggle initial={viewer.allowJoins} endpoint="/api/me/allow-joins" icon="🤝" labels={dict.allowJoins} />
            <SettingToggle initial={viewer.dailyVideo} endpoint="/api/me/daily-video" icon="🎬" labels={dict.dailyVideo} />
          </>
        )}
        {/* The library's curators (admins, «منسّق المكتبة»): their page for sorting members' sounds. */}
        {profile.isMe && isCurator(viewer) && (
          <Link href="/admin/sounds" className="flex min-h-11 items-center justify-center self-center rounded-full bg-secondary-soft px-5 text-sm font-extrabold text-secondary">
            🎵 تنسيق المكتبة
          </Link>
        )}
        {profile.isMe && (
          <Link href="/account/delete" className="self-center text-xs font-bold text-muted underline-offset-4 hover:text-accent-ink hover:underline">
            {dict.deleteAccount.link}
          </Link>
        )}
        {/* The site's links, here too: inside the app the footer is gone. */}
        {profile.isMe && (
          <p className="self-center text-xs text-muted">
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              {dict.footer.privacy}
            </Link>
            <span className="mx-2" aria-hidden>
              ·
            </span>
            <Link href="/terms" className="underline-offset-4 hover:underline">
              {dict.footer.terms}
            </Link>
            <span className="mx-2" aria-hidden>
              ·
            </span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-4 hover:underline">
              {dict.footer.contact}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}

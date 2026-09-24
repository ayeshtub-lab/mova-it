import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile, ProfileError, setDisplayName } from "@/server/profile";
import { FollowButton } from "./FollowButton";
import { NameEditor, type RenameState } from "./NameEditor";
import { ProfileTabs } from "./ProfileTabs";

export async function generateMetadata({ params }: PageProps<"/u/[id]">): Promise<Metadata> {
  const profile = await getProfile(await getCurrentUser(), (await params).id);
  return profile ? { title: `${profile.displayName} · Zawmo`, robots: { index: false } } : {};
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

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <section className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full bg-gradient-to-br from-brand-red via-moment to-brand-blue p-1">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
              <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-24 rounded-full border-4 border-background object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-24 items-center justify-center rounded-full border-4 border-background bg-surface text-4xl font-extrabold">
                {initial}
              </span>
            )}
          </span>

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

          <dl className="flex gap-8">
            {(
              [
                [profile.shots.length, t.shots],
                [profile.followers, t.followers],
                [profile.following, t.following],
              ] as const
            ).map(([n, label]) => (
              <div key={label} className="flex flex-col-reverse items-center">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-xl font-extrabold">{n}</dd>
              </div>
            ))}
          </dl>

          {profile.canFollow && (
            <FollowButton userId={profile.id} initial={profile.isFollowing} labels={{ follow: t.follow, unfollow: t.unfollow, isFollowing: t.isFollowing, failed: t.failed }} />
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
          labels={{
            shots: t.shots,
            moments: t.moments,
            likes: t.likes,
            emptyShots: t.emptyShots,
            emptyMoments: t.emptyMoments,
            emptyLikes: t.emptyLikes,
            likesPrivate: t.likesPrivate,
            viewsPrivate: t.viewsPrivate,
            seenBy: dict.viewer.seenBy,
          }}
        />
      </main>
    </div>
  );
}

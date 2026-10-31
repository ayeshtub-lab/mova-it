"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/server/google";
import { getLocale } from "@/i18n/server";
import { setDisplayName } from "@/server/profile";
import { unnamedGuest } from "@/lib/guest-name";
import { allowedFor } from "@/server/rate-limit";
import { cleanDisplayName, endSession, getCurrentUser, startGuestSession } from "@/lib/session";

export type GuestFormState = { error?: "name" | "server" } | undefined;

export async function continueAsGuest(_prev: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const name = cleanDisplayName(formData.get("displayName"));
  if (!name) return { error: "name" };
  try {
    const current = await getCurrentUser();
    // A quiet guest (hearts before a name, src/server/quiet-guest.ts) keeps their account: named now.
    if (current && unnamedGuest(current)) {
      await setDisplayName(current, name);
      revalidatePath("/", "layout");
    } else if (current) {
      // Already signed in: keep the existing account instead of creating another.
      return undefined;
    } else {
      // Many new guest accounts from one network is a script, not people.
      if (!(await allowedFor("guest", await headers()))) return { error: "server" };
      await startGuestSession(name, await getLocale());
    }
  } catch (error) {
    console.error("continueAsGuest failed", error);
    return { error: "server" };
  }
  // Outside try/catch: redirect() works by throwing.
  const next = formData.get("next");
  if (typeof next === "string" && next) redirect(safeReturnTo(next));
  return undefined;
}

export async function signOut() {
  await endSession();
}

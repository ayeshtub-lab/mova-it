"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/server/google";
import { getLocale } from "@/i18n/server";
import { allowedFor } from "@/server/rate-limit";
import { cleanDisplayName, endSession, getCurrentUser, startGuestSession } from "@/lib/session";

export type GuestFormState = { error?: "name" | "server" } | undefined;

export async function continueAsGuest(_prev: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const name = cleanDisplayName(formData.get("displayName"));
  if (!name) return { error: "name" };
  try {
    // Already signed in: keep the existing account instead of creating another.
    if (await getCurrentUser()) return undefined;
    // Many new guest accounts from one network is a script, not people.
    if (!(await allowedFor("guest", await headers()))) return { error: "server" };
    await startGuestSession(name, await getLocale());
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

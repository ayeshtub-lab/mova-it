"use server";

import { getLocale } from "@/i18n/server";
import { cleanDisplayName, endSession, getCurrentUser, startGuestSession } from "@/lib/session";

export type GuestFormState = { error?: "name" | "server" } | undefined;

export async function continueAsGuest(_prev: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const name = cleanDisplayName(formData.get("displayName"));
  if (!name) return { error: "name" };
  try {
    // Already signed in: keep the existing account instead of creating another.
    if (await getCurrentUser()) return undefined;
    await startGuestSession(name, await getLocale());
  } catch (error) {
    console.error("continueAsGuest failed", error);
    return { error: "server" };
  }
  return undefined;
}

export async function signOut() {
  await endSession();
}

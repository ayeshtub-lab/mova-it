"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { inLocale, isLocale, localeCookie, PATH_HEADER } from "./config";

// The language button: remembered (so that language's plain links follow), and the same page in
// that language at its own address (/m/X ↔ /en/m/X — 2026-10-21).
export async function setLocale(formData: FormData) {
  const value = formData.get("locale")?.toString();
  if (!isLocale(value)) return;
  (await cookies()).set(localeCookie, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const here = (await headers()).get(PATH_HEADER) ?? "/";
  redirect(inLocale(here, value));
}

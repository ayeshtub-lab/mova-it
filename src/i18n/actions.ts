"use server";

import { cookies } from "next/headers";
import { isLocale, localeCookie } from "./config";

export async function setLocale(formData: FormData) {
  const value = formData.get("locale")?.toString();
  if (!isLocale(value)) return;
  (await cookies()).set(localeCookie, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

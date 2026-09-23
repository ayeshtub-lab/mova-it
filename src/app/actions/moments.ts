"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { createMoment, MomentError } from "@/server/moments";

export type CreateMomentState = { error?: "title" | "place" | "server" } | undefined;

export async function createMomentAction(_prev: CreateMomentState, formData: FormData): Promise<CreateMomentState> {
  const user = await getCurrentUser();
  if (!user) return { error: "server" };

  let code: string;
  try {
    const moment = await createMoment(user, {
      title: formData.get("title"),
      placeName: formData.get("placeName"),
      // Only these two are offered in the form; anything else falls back to friends.
      visibility: formData.get("visibility") === "LINK" ? "LINK" : "FRIENDS",
    });
    code = moment.code;
  } catch (error) {
    if (error instanceof MomentError && error.code === "invalid_title") return { error: "title" };
    if (error instanceof MomentError && error.code === "invalid_place") return { error: "place" };
    console.error("createMomentAction failed", error);
    return { error: "server" };
  }
  // Outside try/catch: redirect() works by throwing.
  redirect(`/m/${code}`);
}

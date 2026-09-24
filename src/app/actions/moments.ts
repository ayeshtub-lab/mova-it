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
      // The form offers these three (PUBLIC to official accounts only — createMoment
      // refuses it for guests); anything else falls back to friends.
      visibility: ["LINK", "PUBLIC"].includes(String(formData.get("visibility"))) ? String(formData.get("visibility")) : "FRIENDS",
    });
    code = moment.code;
  } catch (error) {
    if (error instanceof MomentError && error.code === "invalid_title") return { error: "title" };
    if (error instanceof MomentError && error.code === "invalid_place") return { error: "place" };
    if (error instanceof MomentError && error.code === "official_required") return { error: "server" };
    console.error("createMomentAction failed", error);
    return { error: "server" };
  }
  // Outside try/catch: redirect() works by throwing.
  redirect(`/m/${code}`);
}

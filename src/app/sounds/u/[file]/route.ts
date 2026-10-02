import { userSound } from "@/server/user-sounds";
import { viewUrl } from "@/server/media";

// zawmo.com/sounds/u/KEY.mp3 — a people's sound (src/server/user-sounds.ts): forwards to the
// file's short-lived link while it is public.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const key = /^(u[0-9a-f]{12})\.mp3$/.exec((await params).file)?.[1];
  const sound = key ? await userSound(key) : null;
  const url = sound?.status === "public" && sound.path ? await viewUrl(sound.path) : null;
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } });
}

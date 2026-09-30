import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser, startGuestSession } from "@/lib/session";
import { createMoment } from "@/server/moments";
import { allowedFor } from "@/server/rate-limit";

// «📸 جرّب بكبسة» on the ad landing (src/app/start/QuickStart.tsx): no name, no form. The first
// photo starts it all — a guest account (named «ضيف ٤٢١٧» until they say their name) and a new
// story or moment to put it in. A route, not a Server Action: an action that sets the session
// cookie makes Next re-render /start, which sends signed-in people on — mid-upload.
// Body: { kind: "STORY" | "EVERYDAY" }. Answers { code }.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const kind = body?.kind === "EVERYDAY" ? "EVERYDAY" : "STORY";
    const locale = await getLocale();
    const dict = await getDictionary(locale);
    let user = await getCurrentUser();
    if (!user) {
      // Many new guest accounts from one network is a script, not people.
      if (!(await allowedFor("guest", request.headers))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      user = await startGuestSession(`${dict.start.guestName} ${randomInt(1000, 10000)}`, locale);
    }
    const moment = await createMoment(user, { title: "", untitled: dict.create.untitled, kind, visibility: "FRIENDS" });
    return NextResponse.json({ code: moment.code });
  } catch (error) {
    console.error("quick start failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

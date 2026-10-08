import { NextResponse } from "next/server";

// «شارك لزاومو» from the gallery (the manifest's share_target) is handled by the service worker
// (public/sw.js), which keeps the files. Here only when it wasn't running yet (the very first
// share before Zawmo was ever opened): the new-moment page says to share once more.
export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/new?shared=0", request.url), 303);
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/new", request.url), 303);
}

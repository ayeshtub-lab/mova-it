import { NextResponse } from "next/server";
import { INSTALL_PLATFORMS, INSTALL_STEPS, recordInstall, type InstallPlatform, type InstallStep } from "@/server/install";

// «📲 ثبّت زاومو» steps (src/app/InstallPrompt.tsx): only counted, nothing personal.
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const platform = params.get("platform");
  const step = params.get("step");
  if (INSTALL_PLATFORMS.includes(platform as InstallPlatform) && step && step in INSTALL_STEPS) {
    await recordInstall(platform as InstallPlatform, step as InstallStep).catch((error) => console.error("install count failed", error));
  }
  return new NextResponse(null, { status: 204 });
}

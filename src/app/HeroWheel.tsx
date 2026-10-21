import { DemoWheel } from "@/app/DemoWheel";
import { LiveWheel } from "@/app/LiveWheel";
import { getDictionary, getLocale } from "@/i18n/server";
import { plural } from "@/i18n/plural";
import { visitorWheel } from "@/server/discover";
import { inEnglish } from "@/server/localize";

// The hero wheel for visitors (home and ad landings): real public shots once Zawmo has
// four or more to show, else the illustration — never an empty wheel.
export async function HeroWheel({ className, openLabel }: { className?: string; openLabel: string }) {
  const shots = await visitorWheel().catch((error) => {
    console.error("wheel shots failed", error);
    return [];
  });
  if (shots.length < 4) return <DemoWheel className={className} />;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  // «١٥ زاوية» written here, on the server, so the page and the browser agree on it.
  const named = inEnglish(shots, locale).map((s) => ({ ...s, anglesLabel: plural(locale, dict.plurals.angles, s.angles) }));
  // Eight moments at once, swapping all the while from the pool (his call, 2026-10-17: fuller, always
  // fresh) — six or four while Zawmo has fewer moments with a clear name.
  const slices = named.length >= 8 ? 8 : named.length >= 6 ? 6 : 4;
  return <LiveWheel shots={named} slices={slices} className={className} openLabel={openLabel} exploreLabel={dict.nav.discover} />;
}

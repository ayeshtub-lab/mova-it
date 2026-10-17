import { DemoWheel } from "@/app/DemoWheel";
import { LiveWheel } from "@/app/LiveWheel";
import { getDictionary, getLocale } from "@/i18n/server";
import { plural } from "@/i18n/plural";
import { visitorWheel } from "@/server/discover";

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
  const named = shots.map((s) => ({ ...s, anglesLabel: plural(locale, dict.plurals.angles, s.angles) }));
  return <LiveWheel shots={named} className={className} openLabel={openLabel} exploreLabel={dict.nav.discover} />;
}

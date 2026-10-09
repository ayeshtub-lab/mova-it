import { DemoWheel } from "@/app/DemoWheel";
import { LiveWheel } from "@/app/LiveWheel";
import { visitorWheel } from "@/server/discover";

// The hero wheel for visitors (home and ad landings): real public shots once Zawmo has
// four or more to show, else the illustration — never an empty wheel.
export async function HeroWheel({ className, openLabel }: { className?: string; openLabel: string }) {
  const shots = await visitorWheel().catch((error) => {
    console.error("wheel shots failed", error);
    return [];
  });
  return shots.length >= 4 ? <LiveWheel shots={shots} className={className} openLabel={openLabel} /> : <DemoWheel className={className} />;
}

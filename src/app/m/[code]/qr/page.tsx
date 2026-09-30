import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Logo } from "@/app/Logo";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { CANONICAL_HOST } from "@/lib/hosts";
import { getCurrentUser } from "@/lib/session";
import { getMomentView } from "@/server/moments";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// «📸 امسح وضيف صورك»: a card for the tables at a wedding or a party. Its code opens the
// moment through the short link (zawmo.com/CODE), marked ?src=qr so the guests who join
// from it show in «من وين إجوا». On paper: four cards on an A4 page, to cut.
export default async function QrCardPage({ params }: PageProps<"/m/[code]/qr">) {
  const { code } = await params;
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const view = await getMomentView(code, user);
  if (!view || view.kind === "STORY" || view.kind === "DAILY") notFound();
  const dict = await getDictionary(locale);
  const t = dict.qr;
  const short = `${CANONICAL_HOST}/${view.code}`;
  // Plain SVG in the page: sharp at any print size, nothing to load.
  const svg = await QRCode.toString(`https://${short}?src=qr`, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });

  const card = (key: number) => (
    <div
      key={key}
      className={`flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line bg-white p-6 text-center text-[#111] print:max-w-none print:rounded-none print:border print:p-[6mm] ${key ? "hidden print:flex" : ""}`}
    >
      <Logo locale={locale} />
      <p className="text-xl font-extrabold leading-snug">{view.title}</p>
      <div className="w-48 print:w-[52mm]" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-lg font-extrabold leading-snug">{t.scan}</p>
      <p className="text-xs leading-relaxed text-[#555]">{t.sub}</p>
      <p className="text-xs text-[#555]">
        {t.orOpen}{" "}
        <span dir="ltr" className="font-bold text-[#111]">
          {short}
        </span>
      </p>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8 print:p-0">
      <div className="print:hidden">
        <SiteHeader locale={locale} dict={dict} />
      </div>
      <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 pb-16 print:max-w-none print:pb-0">
        <div className="grid w-full place-items-center gap-4 print:grid-cols-2 print:gap-0">{[0, 1, 2, 3].map(card)}</div>
        <PrintButton label={t.print} />
        <p className="text-center text-sm leading-relaxed text-muted print:hidden">{t.hint}</p>
        <Link href={`/m/${view.code}`} className="text-sm font-bold text-muted underline underline-offset-4 print:hidden">
          {t.back}
        </Link>
      </main>
    </div>
  );
}

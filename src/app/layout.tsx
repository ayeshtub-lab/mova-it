import { chatUnread } from "@/server/conversations";
import type { Metadata } from "next";
import Link from "next/link";
import { Cairo, Syne } from "next/font/google";
import { dirOf } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { CANONICAL_HOST } from "@/lib/hosts";
import { CONTACT_EMAIL } from "@/lib/site";
import { ActivityPing } from "./ActivityPing";
import { PresencePing } from "./PresencePing";
import { BottomNav } from "./BottomNav";
import { FreshVersion } from "@/app/FreshVersion";
import { AppShell } from "@/app/AppShell";
import { InstallPrompt } from "@/app/InstallPrompt";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

// Latin display face, used only for the zawmo wordmark.
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  // Absolute links in previews (WhatsApp, social) always point at zawmo.com.
  return {
    metadataBase: new URL(`https://${CANONICAL_HOST}`),
    title: dict.meta.title,
    description: dict.meta.description,
    openGraph: { siteName: dict.meta.brand, type: "website", locale: locale === "ar" ? "ar_AR" : "en_US" },
    // Big pictures and full video previews in results — what Google Discover asks for.
    robots: { googleBot: { "max-image-preview": "large", "max-video-preview": -1, "max-snippet": -1 } },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const user = await getCurrentUser();
  // Conversations with something new (the number on «الدردشة»).
  const chatNew = user ? await chatUnread(user).catch(() => 0) : 0;
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${cairo.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* Android's «can be installed» can come before the page is interactive: kept for
            «📲 ثبّت زاومو» (src/app/InstallPrompt.tsx), and the browser's own banner held back. */}
        <script
          dangerouslySetInnerHTML={{ __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__zawmoInstall=e})" }}
        />
        <FreshVersion />
        <AppShell />
        {children}
        {user && <ActivityPing userId={user.id} />}
        <PresencePing />
        <InstallPrompt labels={dict.install} aboveNav={!!user} />
        {/* The website's footer (hidden inside the app: its links are on your own profile). */}
        <footer className={`site-footer px-4 py-6 text-center text-xs text-muted print:hidden ${user ? "pb-28 sm:pb-6" : ""}`}>
          <Link href="/album" className="font-bold underline-offset-4 hover:underline">
            {dict.footer.album}
          </Link>
          <span className="mx-2" aria-hidden>·</span>
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            {dict.footer.privacy}
          </Link>
          <span className="mx-2" aria-hidden>·</span>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            {dict.footer.terms}
          </Link>
          <span className="mx-2" aria-hidden>·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-4 hover:underline">
            {dict.footer.contact}
          </a>
        </footer>
        {user && (
          <BottomNav
            meHref={user.isGuest ? "/#save" : `/u/${user.id}`}
            chatUnread={chatNew}
            labels={{ ...dict.nav, me: user.isGuest ? dict.nav.account : dict.nav.me }}
          />
        )}
      </body>
    </html>
  );
}

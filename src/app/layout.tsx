import type { Metadata } from "next";
import Link from "next/link";
import { Cairo, Syne } from "next/font/google";
import { dirOf } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
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
  const dict = await getDictionary(await getLocale());
  return { title: dict.meta.title, description: dict.meta.description };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${cairo.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <footer className="px-4 py-6 text-center text-xs text-muted">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            {dict.footer.privacy}
          </Link>
        </footer>
      </body>
    </html>
  );
}

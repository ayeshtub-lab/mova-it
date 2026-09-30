import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/app/JsonLd";
import { Showcase } from "@/app/Showcase";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { CANONICAL_HOST } from "@/lib/hosts";
import { publicShowcase } from "@/server/discover";

// «اجمع صور مناسبتك من كل الضيوف برابط واحد»: the page for people searching how to collect
// a wedding's, a graduation's or a party's photos from everyone who was there. Every
// statement here must stay true to what Zawmo does — the limits (30 shots each, videos up
// to 40 seconds, photos up to 2048 px) are the real ones (src/lib/media-client.ts,
// src/server/angles.ts).

type Content = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  cta: string;
  stepsTitle: string;
  steps: [string, string][];
  videoTitle: string;
  videoText: string;
  usesTitle: string;
  uses: [string, string][];
  privacyTitle: string;
  privacy: string[];
  privacyNote: string;
  compareTitle: string;
  compareHead: [string, string, string];
  compare: [string, string, string][];
  examplesTitle: string;
  examplesMore: string;
  faqTitle: string;
  faq: [string, string][];
  guides: [string, string][];
};

const CONTENT: Record<"ar" | "en", Content> = {
  ar: {
    metaTitle: "اجمع صور مناسبتك من كل الضيوف برابط واحد — عرس، تخرج، حفلة | زاومو",
    metaDescription:
      "بدل ما تضيع صور العرس والحفلة بين محادثات واتساب: أنشئ لحظة على زاومو، شارك رابطها، وكل ضيف يضيف صوره وفيديوهاته من جواله بدون تحميل تطبيق. وبتحصل على فيديو جاهز من كل الزوايا.",
    h1: "اجمع صور مناسبتك من كل الضيوف برابط واحد",
    intro: [
      "بكل عرس وتخرج وحفلة، الصور الحلوة بتكون بجوالات الضيوف، مش عند المصوّر بس. وبعد المناسبة بتتوزع على عشرات المحادثات، ونصها ما بيوصلك أبدًا.",
      "زاومو بيجمعها بمكان واحد: رابط واحد بتبعته للكل، وكل واحد بيضيف لقطاته من جواله. مجانًا، وبدون تحميل تطبيق.",
    ],
    cta: "📸 أنشئ لحظة مناسبتك الآن، مجانًا",
    stepsTitle: "كيف يعمل؟ ٣ خطوات",
    steps: [
      ["أنشئ لحظة باسم مناسبتك", "مثل «عرس محمد وسارة» أو «تخرج دفعة ٢٠٢٦»."],
      ["شارك الرابط", "بقروب الواتساب، أو اطبعه كرمز QR على طاولات الضيوف."],
      ["كل ضيف يفتح الرابط ويضيف صوره وفيديوهاته", "باسمه، بدون تسجيل. كل ضيف يقدر يضيف لحد ٣٠ لقطة."],
    ],
    videoTitle: "الإشي اللي ما بتلاقيه بألبوم عادي: فيديو من كل الزوايا",
    videoText:
      "لما الضيوف يضيفوا لقطاتهم، زاومو بيرتبها حسب وقت التصوير وبيطلّع فيديو احترافي جاهز: انتقالات ناعمة، وألوان محسّنة، وموسيقى، وعنوان مناسبتك بالبداية. نفس اللحظة، من عيون كل اللي كانوا فيها.",
    usesTitle: "وين بينفع؟",
    uses: [
      ["💍 الأعراس والخطوبات", "كل صور المعازيم بمكان واحد، والعروسين بيشوفوا العرس من زوايا ما شافوها."],
      ["🎓 التخرج", "ألبوم للدفعة كاملة بدل ما كل واحد يحتفظ بصوره لحاله."],
      ["🧳 الرحلات والطلعات", "كل واحد صوّر من مكانه، والفيديو بيجمعهم."],
      ["🎂 أعياد الميلاد واللمّات العائلية", "صور العيلة كلها برابط واحد بيضل."],
    ],
    privacyTitle: "خصوصيتك بإيدك",
    privacy: ["👥 أصحابي: الافتراضي.", "🔗 من معه الرابط: مناسب للأعراس.", "🌍 للكل: بتظهر للناس، وبعد فحص تلقائي للمحتوى."],
    privacyNote: "لحظات الأعراس والمناسبات الخاصة ما بتظهر بمحركات البحث أبدًا.",
    compareTitle: "ليش مش واتساب؟",
    compareHead: ["", "واتساب", "زاومو"],
    compare: [
      ["وين الصور؟", "متفرقة بين محادثات", "كلها برابط واحد"],
      ["الترتيب", "حسب وقت الإرسال", "حسب وقت التصوير"],
      ["الجودة", "بيضغط الصور افتراضيًا", "جودة عالية (لحد ٢٠٤٨ بكسل)"],
      ["فيديو جاهز من كل الزوايا", "❌", "✅"],
    ],
    examplesTitle: "شوف لحظات حقيقية على زاومو",
    examplesMore: "شوف أكثر",
    faqTitle: "أسئلة شائعة",
    faq: [
      ["هل الضيوف لازم يسجلوا أو ينزّلوا تطبيق؟", "لا. بيفتحوا الرابط بالمتصفح، بيكتبوا اسمهم، وبيضيفوا صورهم."],
      ["كم صورة بيقدر يضيف كل ضيف؟", "لحد ٣٠ لقطة لكل شخص باللحظة الوحدة، صور أو فيديوهات."],
      ["هل في حد لطول الفيديو؟", "كل فيديو لحد ٤٠ ثانية. والأطول بنعرض عليك تبعت أول ٤٠ ثانية منه."],
      ["مين بيشوف الفيديو الجاهز؟", "صاحب اللحظة وكل مين ضاف زاوية."],
      ["هل زاومو مجاني؟", "نعم."],
    ],
    guides: [
      ["🏗️ وثّق مراحل بناء بيتك مع الوقت", "/guide/house"],
      ["🌱 وثّق نمو نبتة من البذرة", "/guide/plant"],
    ],
  },
  en: {
    metaTitle: "Collect your event's photos from every guest with one link — weddings, graduations, parties | Zawmo",
    metaDescription:
      "Instead of losing your wedding or party photos across chats: start a moment on Zawmo, share its link, and every guest adds their photos and videos from their phone — no app to download. You also get a ready video from every angle.",
    h1: "Collect your event's photos from every guest with one link",
    intro: [
      "At every wedding, graduation and party, the best photos are on the guests' phones, not just the photographer's. Afterwards they scatter across dozens of chats, and half of them never reach you.",
      "Zawmo gathers them in one place: one link you send to everyone, and each person adds their shots from their phone. Free, and no app to download.",
    ],
    cta: "📸 Start your event's moment now — free",
    stepsTitle: "How it works, in 3 steps",
    steps: [
      ["Start a moment named after your event", "Like “Mohammad & Sara's wedding” or “Class of 2026”."],
      ["Share the link", "In the group chat, or print it as a QR code on the guests' tables."],
      ["Each guest opens the link and adds their photos and videos", "Under their name, no sign-up. Each guest can add up to 30 shots."],
    ],
    videoTitle: "What a normal album can't do: a video from every angle",
    videoText:
      "As guests add their shots, Zawmo puts them in the order they were taken and makes a ready, polished video: smooth transitions, enhanced colours, music, and your event's name at the start. The same moment, through the eyes of everyone who was there.",
    usesTitle: "Where it works",
    uses: [
      ["💍 Weddings and engagements", "Every guest's photos in one place — the couple sees their day from angles they never saw."],
      ["🎓 Graduations", "One album for the whole class, instead of everyone keeping their photos to themselves."],
      ["🧳 Trips and outings", "Everyone shot from where they stood; the video brings it together."],
      ["🎂 Birthdays and family gatherings", "All the family's photos behind one link that lasts."],
    ],
    privacyTitle: "Your privacy, your choice",
    privacy: ["👥 Friends: the default.", "🔗 Only people with the link: good for weddings.", "🌍 Everyone: shown publicly, after an automatic content check."],
    privacyNote: "Wedding and private event moments never appear in search engines.",
    compareTitle: "Why not WhatsApp?",
    compareHead: ["", "WhatsApp", "Zawmo"],
    compare: [
      ["Where are the photos?", "Scattered across chats", "All behind one link"],
      ["Order", "By when they were sent", "By when they were taken"],
      ["Quality", "Compresses photos by default", "High quality (up to 2048 px)"],
      ["Ready video from every angle", "❌", "✅"],
    ],
    examplesTitle: "Real moments on Zawmo",
    examplesMore: "See more",
    faqTitle: "Questions",
    faq: [
      ["Do guests need to sign up or download an app?", "No. They open the link in their browser, write their name, and add their photos."],
      ["How many photos can each guest add?", "Up to 30 shots per person in one moment — photos or videos."],
      ["Is there a video length limit?", "Each video can be up to 40 seconds. For a longer one, we offer to send its first 40 seconds."],
      ["Who sees the ready video?", "The moment's owner and everyone who added an angle."],
      ["Is Zawmo free?", "Yes."],
    ],
    guides: [
      ["🏗️ Document your house being built, over time", "/guide/house"],
      ["🌱 Document a plant growing from seed", "/guide/plant"],
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const c = CONTENT[await getLocale()];
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: { canonical: "/album" },
    openGraph: { title: c.h1, description: c.metaDescription, type: "website" },
  };
}

const site = `https://${CANONICAL_HOST}`;

export default async function AlbumPage() {
  const locale = await getLocale();
  const [dict, shots] = await Promise.all([getDictionary(locale), publicShowcase(12)]);
  const c = CONTENT[locale];
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${site}/album`, url: `${site}/album`, name: c.h1, description: c.metaDescription, inLanguage: locale, isPartOf: { "@id": `${site}/#website` } },
      {
        "@type": "WebApplication",
        name: "زاومو",
        alternateName: "Zawmo",
        url: site,
        applicationCategory: "PhotographyApplication",
        operatingSystem: "Web, Android, iOS",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${site}/#org` },
      },
    ],
  };
  const cta = (
    <Link href="/start?kind=moment" className="flex min-h-14 items-center justify-center rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95">
      {c.cta}
    </Link>
  );

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{c.h1}</h1>
          {c.intro.map((p) => (
            <p key={p} className="leading-relaxed text-muted">
              {p}
            </p>
          ))}
          {cta}
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{c.stepsTitle}</h2>
          <ol className="flex flex-col gap-2">
            {c.steps.map(([title, text], i) => (
              <li key={title} className="flex gap-3 rounded-2xl bg-surface p-4">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-extrabold text-white">
                  {(i + 1).toLocaleString(locale)}
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong>{title}</strong>
                  <span className="text-sm text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-2 rounded-3xl border-2 border-accent/40 bg-accent-soft/40 p-5">
          <h2 className="text-xl font-extrabold">🎬 {c.videoTitle}</h2>
          <p className="leading-relaxed">{c.videoText}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{c.usesTitle}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {c.uses.map(([title, text]) => (
              <li key={title} className="flex flex-col gap-1 rounded-2xl bg-surface p-4">
                <strong>{title}</strong>
                <span className="text-sm text-muted">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-extrabold">{c.privacyTitle}</h2>
          <ul className="flex flex-col gap-1">
            {c.privacy.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="text-sm font-bold text-muted">{c.privacyNote}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{c.compareTitle}</h2>
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  {c.compareHead.map((h, i) => (
                    <th key={i} scope="col" className="p-3 text-start font-extrabold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.compare.map(([row, a, b]) => (
                  <tr key={row} className="border-t border-line">
                    <th scope="row" className="p-3 text-start font-bold">
                      {row}
                    </th>
                    <td className="p-3 text-muted">{a}</td>
                    <td className="p-3 font-bold">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Showcase shots={shots} labels={{ title: c.examplesTitle, more: c.examplesMore }} />
        {cta}

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-extrabold">{c.faqTitle}</h2>
          {c.faq.map(([q, a]) => (
            <details key={q} className="rounded-2xl bg-surface px-4 py-3">
              <summary className="cursor-pointer font-bold">{q}</summary>
              <p className="mt-2 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </section>

        <nav className="flex flex-col gap-2 text-center text-sm font-bold">
          {c.guides.map(([label, href]) => (
            <Link key={href} href={href} className="underline underline-offset-4">
              {label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

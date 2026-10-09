import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/site";

// Child safety standards (CSAE): Google Play asks every social app for a public page like this.
// Every line must match what Zawmo actually does (the automatic check blocks «minor_safety»,
// reports, blocking, removal) — update it, and UPDATED, when that changes. Read with /terms.

const UPDATED = { ar: "٩ أكتوبر ٢٠٢٦", en: "October 9, 2026" };

type Section = { title: string; items: string[] };

const CONTENT: Record<"ar" | "en", { title: string; intro: string; updated: string; sections: Section[]; contact: string; terms: string }> = {
  ar: {
    title: "معايير سلامة الأطفال",
    updated: "آخر تحديث",
    intro:
      "زاومو لا يتسامح أبدًا مع أي استغلال أو اعتداء جنسي على الأطفال (CSAE)، ولا مع أي مادة تصوّر ذلك (CSAM). هذه الصفحة تشرح قواعدنا وما نفعله لحماية الأطفال.",
    sections: [
      {
        title: "الممنوع منعًا تامًا",
        items: [
          "أي صورة أو فيديو أو كتابة أو صوت فيها اعتداء جنسي على طفل أو استغلاله، أو تُظهر طفلًا بشكل جنسي.",
          "استدراج الأطفال أو التقرّب منهم بنية الإيذاء، أو طلب صور منهم، أو محاولة نقلهم إلى تواصل خاص لهذا الغرض.",
          "الترويج لأي محتوى أو مكان أو شخص يستغل الأطفال.",
        ],
      },
      {
        title: "كيف نحمي الأطفال",
        items: [
          "زاومو لمن عمره ١٣ سنة فأكثر.",
          "كل صورة وفيديو يُفحص تلقائيًا عند رفعه، وأي محتوى فيه شبهة استغلال لطفل يُحجب فورًا ويُحال لفريقنا. واللحظات العامة لا يظهر فيها شيء لم يُفحص.",
          "لا يستطيع أحد مراسلتك من العدم: الرسائل الخاصة في زاومو ردود قصيرة على لحظة، فقط بين أشخاص يشتركون في لحظة واحدة، ومن داخل المحادثة تستطيع حظر الطرف الآخر فتنتهي فورًا. وصاحب كل لحظة يختار من يراها.",
          "زر التبليغ موجود على كل لقطة وكل تعليق، وتستطيع حظر أي شخص فلا يصل إليك.",
        ],
      },
      {
        title: "ماذا نفعل عند أي بلاغ",
        items: [
          "نراجع بلاغات سلامة الأطفال أولًا وبأسرع وقت.",
          "نحذف المحتوى المخالف ونوقف الحساب الذي نشره نهائيًا.",
          "نبلّغ السلطات المختصة بما يلزمه القانون، ومنها المركز الوطني للأطفال المفقودين والمستغَلّين (NCMEC) عند وجود مواد اعتداء جنسي على الأطفال، ونتعاون مع جهات إنفاذ القانون.",
        ],
      },
      {
        title: "كيف تبلّغ",
        items: [
          "داخل زاومو: اضغط «تبليغ» على اللقطة أو التعليق، واكتب أنه يخص سلامة طفل.",
          "أو راسلنا مباشرة على البريد أدناه مع رابط اللقطة أو الحساب.",
          "إذا كان طفل في خطر الآن، اتصل بالشرطة أو بخط حماية الطفل في بلدك فورًا.",
        ],
      },
    ],
    contact: "مسؤول سلامة الأطفال في زاومو:",
    terms: "شروط الاستخدام",
  },
  en: {
    title: "Child safety standards",
    updated: "Last updated",
    intro:
      "Zawmo has zero tolerance for child sexual abuse and exploitation (CSAE) and for any material depicting it (CSAM). This page sets out our rules and what we do to protect children.",
    sections: [
      {
        title: "Strictly forbidden",
        items: [
          "Any photo, video, text or audio showing the sexual abuse or exploitation of a child, or showing a child in a sexualised way.",
          "Grooming: approaching children with intent to harm, asking them for images, or trying to move them into private contact for that purpose.",
          "Promoting any content, place or person that exploits children.",
        ],
      },
      {
        title: "How we protect children",
        items: [
          "Zawmo is for people aged 13 and over.",
          "Every photo and video is checked automatically on upload; anything suggesting the exploitation of a child is blocked at once and sent to our team. Nothing unchecked ever appears in a public moment.",
          "No one can message you out of the blue: private messages in Zawmo are short replies about a moment, only between people who share a moment, and you can block the other person from inside the conversation, which ends it at once. Each moment's owner chooses who sees it.",
          "Every shot and comment has a report button, and you can block anyone so they can no longer reach you.",
        ],
      },
      {
        title: "What we do with a report",
        items: [
          "Child-safety reports are reviewed first and as fast as possible.",
          "We remove the violating content and permanently close the account that posted it.",
          "We report to the competent authorities as the law requires — including the National Center for Missing & Exploited Children (NCMEC) for child sexual abuse material — and cooperate with law enforcement.",
        ],
      },
      {
        title: "How to report",
        items: [
          "In Zawmo: tap «Report» on the shot or comment and say it concerns a child's safety.",
          "Or email us directly at the address below with a link to the shot or account.",
          "If a child is in danger right now, call the police or your local child-protection line immediately.",
        ],
      },
    ],
    contact: "Zawmo's child-safety contact:",
    terms: "Terms of use",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${CONTENT[locale].title} · ${locale === "ar" ? "زاومو" : "Zawmo"}`, description: CONTENT[locale].intro.slice(0, 160), alternates: { canonical: "/child-safety" } };
}

export default async function ChildSafetyPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const c = CONTENT[locale];

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold">{c.title}</h1>
          <p className="text-sm text-muted">
            {c.updated}: {UPDATED[locale]}
          </p>
          <p className="text-lg leading-relaxed">{c.intro}</p>
        </header>

        {c.sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="text-xl font-extrabold">{s.title}</h2>
            <ul className="flex list-disc flex-col gap-1.5 ps-5 leading-relaxed text-muted marker:text-accent">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <p className="rounded-2xl bg-surface p-4">
          {c.contact}{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className="font-bold text-accent-ink underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
        </p>
        <div className="flex flex-wrap gap-4 text-sm font-bold">
          <Link href="/terms" className="text-secondary underline-offset-4 hover:underline">
            {c.terms}
          </Link>
          <Link href="/" className="text-secondary underline-offset-4 hover:underline">
            ← {locale === "ar" ? "زاومو" : "Zawmo"}
          </Link>
        </div>
      </main>
    </div>
  );
}

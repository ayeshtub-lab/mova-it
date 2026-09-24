import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";

// Privacy policy. Every statement here must match what the code actually does —
// update this page (and UPDATED) whenever data handling changes.

const CONTACT_EMAIL = "ayeshcom44@gmail.com";
const UPDATED = { ar: "٢٤ سبتمبر ٢٠٢٦", en: "September 24, 2026" };

type Section = { title: string; items: string[] };

const CONTENT: Record<"ar" | "en", { title: string; intro: string; updated: string; sections: Section[]; contact: string }> = {
  ar: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث",
    intro:
      "زاومو مكان لمشاركة اللحظات مع من كانوا معك. هذه الصفحة تشرح بوضوح ما نحفظه عنك، ولماذا، ومن يراه، وكيف تتحكم فيه.",
    sections: [
      {
        title: "ما نحفظه",
        items: [
          "الاسم الذي تكتبه لنفسك.",
          "إذا دخلت بحساب Google: رقم حسابك في Google، وإيميلك، واسمك وصورتك في Google. الإيميل لا يظهر لأي مستخدم آخر.",
          "ما تضيفه أنت: الصور والفيديوهات ووقت التقاطها، وعناوين اللحظات، والتعليقات، والإعجابات، ورسائل الوارد، ومن تتابعه.",
          "ما يُسجَّل أثناء الاستخدام: من شاهد لقطاتك (العدد يظهر لك وحدك)، والبلاغات، ومن حظرتهم.",
        ],
      },
      {
        title: "ما لا نجمعه",
        items: [
          "لا نطلب موقعك الجغرافي، ولا جهات الاتصال في جوالك، ولا رقم هاتفك.",
          "لا نستخدم إعلانات، ولا أدوات تتبّع، ولا نبيع بياناتك لأي جهة.",
        ],
      },
      {
        title: "صورك وفيديوهاتك",
        items: [
          "الصور يُعاد تجهيزها على جهازك قبل الرفع، فتُزال منها البيانات المخفية مثل مكان التصوير.",
          "الفيديو يُحفظ كما هو، وقد يحتوي بيانات من جهازك. نحن لا نقرؤها ولا نعرضها.",
          "الملفات محفوظة بشكل خاص وغير منشورة على الإنترنت. تُعرض فقط لمن يحق له رؤيتها، عبر روابط مؤقتة تنتهي خلال ٣٠ دقيقة.",
        ],
      },
      {
        title: "من يرى ماذا",
        items: [
          "أنت تختار لكل لحظة: «أصحابي» (من شاركوك لحظات من قبل) أو «فقط من معه الرابط».",
          "لحظات «فقط من معه الرابط» لا تظهر في صفحتك الشخصية لأي شخص ليس فيها.",
          "من لم يُضف زاوية للحظة يرى أول زاوية فقط، إلى أن يشارك.",
          "إعجاباتك وعدد مشاهدات لقطاتك يظهران لك وحدك.",
          "من تحظره لا يرى تعليقاتك ولا صفحتك، ولا يستطيع مراسلتك.",
        ],
      },
      {
        title: "كيف نستخدم بياناتك",
        items: [
          "فقط لتشغيل زاومو: عرض لحظاتك لمن اخترتهم، وصنع المونتاج، وإرسال ما تشاركه لأصحابك.",
          "لحماية المستخدمين: مراجعة البلاغات وإخفاء المحتوى المخالف.",
          "كل صورة أو فيديو يُفحص تلقائيًا عند رفعه، وما يخالف القواعد (مثل المحتوى الجنسي أو العنف الدموي) يُخفى ويراجعه فريقنا.",
        ],
      },
      {
        title: "الخدمات التي نعتمد عليها",
        items: [
          "Vercel: استضافة الموقع وتخزين الصور والفيديوهات.",
          "Neon: قاعدة البيانات.",
          "Google: تسجيل الدخول، إذا اخترته.",
          "Google Gemini: الفحص التلقائي للصور والفيديوهات. تُرسل الصورة (أو لقطات من الفيديو) للفحص فقط، ولا يستخدمها Google لتدريب نماذجه.",
          "هذه الخدمات تحفظ البيانات نيابة عنا، ولا يحق لها استخدامها لأغراضها الخاصة.",
        ],
      },
      {
        title: "ملفات تعريف الارتباط (الكوكيز)",
        items: ["نستخدم كوكيز أساسية فقط: واحد لإبقائك مسجّل الدخول، وواحد لتذكّر لغتك. لا كوكيز إعلانية أو تحليلية."],
      },
      {
        title: "مدة الاحتفاظ",
        items: [
          "اللقطات تختفي بعد ٢٤ ساعة، إلا إذا صارت اللحظة دائمة.",
          "تستطيع حذف لقطاتك وتعليقاتك في أي وقت، فيُحذف الملف معها.",
          "لحذف حسابك كاملًا، راسلنا وسنحذفه خلال ٣٠ يومًا.",
        ],
      },
      {
        title: "حقوقك",
        items: ["تعديل اسمك من صفحتك الشخصية.", "حذف ما نشرته.", "طلب نسخة من بياناتك أو حذف حسابك، بمراسلتنا."],
      },
      {
        title: "الأطفال",
        items: ["زاومو ليس موجّهًا لمن هم دون ١٣ سنة."],
      },
      {
        title: "التغييرات",
        items: ["إذا غيّرنا هذه السياسة سنحدّث هذه الصفحة وتاريخها، وسننبّهك داخل الموقع إذا كان التغيير مهمًا."],
      },
    ],
    contact: "لأي سؤال أو طلب:",
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated",
    intro:
      "Zawmo is a place to share moments with the people who were there. This page explains plainly what we keep about you, why, who sees it, and how you control it.",
    sections: [
      {
        title: "What we keep",
        items: [
          "The name you give yourself.",
          "If you sign in with Google: your Google account ID, your email, and your Google name and photo. Your email is never shown to other users.",
          "What you add: photos and videos and when they were taken, moment titles, comments, likes, inbox messages, and who you follow.",
          "What is recorded as you use it: who viewed your shots (only you see the count), reports, and who you blocked.",
        ],
      },
      {
        title: "What we don't collect",
        items: [
          "We don't ask for your location, your phone contacts, or your phone number.",
          "No ads, no tracking tools, and we never sell your data.",
        ],
      },
      {
        title: "Your photos and videos",
        items: [
          "Photos are re-processed on your device before upload, which removes hidden data such as where they were taken.",
          "Videos are stored as uploaded and may contain data from your device. We don't read or display it.",
          "Files are stored privately, not published on the web. They are shown only to people allowed to see them, through temporary links that expire within 30 minutes.",
        ],
      },
      {
        title: "Who sees what",
        items: [
          "You choose for each moment: \"Friends\" (people you've shared moments with) or \"Only people with the link\".",
          "Link-only moments never appear on your profile to anyone who isn't in them.",
          "Until someone adds an angle to a moment, they see only its first angle.",
          "Your likes and your shots' view counts are visible only to you.",
          "People you block can't see your comments or profile, and can't message you.",
        ],
      },
      {
        title: "How we use your data",
        items: [
          "Only to run Zawmo: showing your moments to the people you chose, making montages, and delivering what you share to your friends.",
          "To keep people safe: reviewing reports and hiding content that breaks the rules.",
          "Every photo and video is checked automatically when uploaded; anything that breaks the rules (such as sexual content or graphic violence) is hidden and reviewed by our team.",
        ],
      },
      {
        title: "Services we rely on",
        items: [
          "Vercel: hosting, and storage for photos and videos.",
          "Neon: the database.",
          "Google: sign-in, if you choose it.",
          "Google Gemini: the automatic check of photos and videos. The image (or a few frames of a video) is sent only to be checked, and Google does not use it to train its models.",
          "These services store data on our behalf and may not use it for their own purposes.",
        ],
      },
      {
        title: "Cookies",
        items: ["Essential cookies only: one keeps you signed in, one remembers your language. No advertising or analytics cookies."],
      },
      {
        title: "How long we keep things",
        items: [
          "Shots disappear after 24 hours unless the moment becomes permanent.",
          "You can delete your shots and comments at any time, and the file is deleted with them.",
          "To delete your whole account, email us and we'll delete it within 30 days.",
        ],
      },
      {
        title: "Your rights",
        items: ["Change your name from your profile.", "Delete what you posted.", "Ask for a copy of your data or for your account to be deleted, by emailing us."],
      },
      {
        title: "Children",
        items: ["Zawmo is not intended for anyone under 13."],
      },
      {
        title: "Changes",
        items: ["If we change this policy we'll update this page and its date, and let you know in the app if the change matters."],
      },
    ],
    contact: "Questions or requests:",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${CONTENT[locale].title} · ${locale === "ar" ? "زاومو" : "Zawmo"}` };
}

export default async function PrivacyPage() {
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
        <Link href="/" className="self-start text-sm font-bold text-secondary underline-offset-4 hover:underline">
          ← {locale === "ar" ? "زاومو" : "Zawmo"}
        </Link>
      </main>
    </div>
  );
}

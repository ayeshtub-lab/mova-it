import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/site";

// Terms of use. Plain words, and every rule here must match what the site actually does
// (the automatic check, «صوّر معك», montages, places, account deletion…). Update this page
// (and UPDATED) whenever those change. Read with the privacy page (/privacy).

const UPDATED = { ar: "٢٨ سبتمبر ٢٠٢٦", en: "September 28, 2026" };

type Section = { title: string; items: string[] };

const CONTENT: Record<"ar" | "en", { title: string; intro: string; updated: string; sections: Section[]; contact: string; privacy: string }> = {
  ar: {
    title: "شروط الاستخدام",
    updated: "آخر تحديث",
    intro:
      "أهلًا بك في زاومو: مكان تجمع فيه الناس زوايا نفس اللحظة. باستخدامك زاومو أنت توافق على هذه الشروط. كتبناها بكلام بسيط، واقرأها مع سياسة الخصوصية.",
    sections: [
      {
        title: "من يستخدم زاومو",
        items: [
          "زاومو لمن عمره ١٣ سنة فأكثر.",
          "تستطيع الدخول كزائر باسم فقط، أو بحساب Google. بعض الأشياء (مثل الإضافة للحظات «للكل») للحسابات الرسمية بـ Google فقط.",
          "أنت مسؤول عن حسابك وعمّا تنشره منه.",
        ],
      },
      {
        title: "لقطاتك ملكك",
        items: [
          "الصور والفيديوهات والكتابة التي تضيفها تبقى ملكك.",
          "عندما تنشرها، تسمح لزاومو بحفظها وعرضها لمن اخترتهم، وبتجهيزها لذلك: تصغيرها، وتحويل الفيديو لجودات تناسب كل جهاز، وفحصها تلقائيًا، واستخدامها في فيديو اللحظة (المونتاج)، ومقارنتها بلقطات قريبة لاقتراح «صوّر معك». لا نستخدمها لأي غرض آخر، ولا نبيعها.",
          "تستطيع حذف أي لقطة في أي وقت، فتُحذف ملفاتها، ويُعاد صنع فيديو اللحظة بدونها.",
        ],
      },
      {
        title: "من يرى ماذا",
        items: [
          "أنت تختار لكل لحظة: «أصحابي» أو «فقط من معه الرابط» أو «للكل». لقطات لحظات «للكل» يراها الجميع، وقد تظهر في «اكتشف» وصفحات الأماكن.",
          "من معه رابط لحظة يستطيع مشاركته مع غيره، فاختر بعناية ما تضعه في لحظات الرابط.",
          "إذا أضفت لقطتك للحظة غيرك عبر «صوّر معك»، تصبح جزءًا من لحظته العامة. صاحب اللحظة يستطيع إرجاعها («شيلها») فتعود للحظة خاصة بك دون أن تُحذف.",
        ],
      },
      {
        title: "ما لا يُسمح به",
        items: [
          "المحتوى الجنسي أو العاري، وأي محتوى يستغل الأطفال بأي شكل.",
          "العنف الدموي، والتحريض، ورموز الكراهية أو الإرهاب، والتشجيع على إيذاء النفس.",
          "التنمّر والتحرّش والتهديد، أو نشر معلومات خاصة عن أحد (مثل عنوانه أو رقمه).",
          "تصوير الناس في أماكنهم الخاصة دون إذنهم، أو نشر لقطة لشخص طلب منك حذفها.",
          "انتحال شخصية أحد، أو نشر ما لا تملك حق نشره من صور أو موسيقى أو غيرها.",
          "الإزعاج والسبام، أو استخدام برامج آلية، أو محاولة تعطيل الموقع أو اختراقه أو تجاوز حدوده.",
        ],
      },
      {
        title: "كيف نحافظ على زاومو نظيفًا",
        items: [
          "كل صورة وفيديو يُفحص تلقائيًا عند رفعه، وما يخالف القواعد يُخفى ويراجعه فريقنا.",
          "تستطيع التبليغ عن أي لقطة أو تعليق، وحظر أي شخص.",
          "قد نحذف ما يخالف هذه الشروط، أو نوقف حسابًا يخالفها، خصوصًا عند التكرار أو الخطورة. إن رأيت أننا أخطأنا، راسلنا.",
          "لطلب حذف لقطة تظهر فيها ولم تنشرها أنت، بلّغ عنها أو راسلنا.",
        ],
      },
      {
        title: "الأماكن",
        items: [
          "قد يظهر اسم المدينة أو القرية على لقطاتك العامة، ولا نحفظ إحداثيات أبدًا. تستطيع إزالة المكان من أي لقطة لك.",
          "صفحات الأماكن تعرض لقطات عامة فقط، ولا أرقام لمكان فيه أقل من ٢٠ شخصًا.",
        ],
      },
      {
        title: "الأصوات والمحتوى المرفق",
        items: [
          "الأصوات المتاحة داخل زاومو للاستخدام مع لقطاتك داخل زاومو فقط.",
          "لا ترفع موسيقى أو مقاطع لا تملك حق استخدامها.",
        ],
      },
      {
        title: "الخدمة كما هي",
        items: [
          "نعمل لتكون زاومو متاحة وآمنة دائمًا، لكن قد تتوقف أحيانًا للصيانة أو لأعطال خارجة عن إرادتنا.",
          "قد نغيّر ميزات زاومو أو نضيف أو نزيل بعضها مع الوقت.",
          "احتفظ بنسخة من صورك المهمة على جهازك أيضًا.",
          "في حدود ما يسمح به القانون، لا نتحمّل مسؤولية أضرار غير مباشرة ناتجة عن استخدام الخدمة أو توقفها.",
        ],
      },
      {
        title: "المزايا المدفوعة",
        items: ["زاومو مجاني الآن. إن أضفنا مزايا مدفوعة (مثل «تحت الأضواء» للإعلانات المحلية) فستكون لها شروط واضحة تُعرض قبل الدفع، مع احترام قواعد الخصوصية نفسها."],
      },
      {
        title: "إنهاء الاستخدام",
        items: [
          "تستطيع حذف حسابك بنفسك في أي وقت (صفحتك ← «حذف حسابي»)، فيُحذف مع لقطاتك وملفاتك.",
          "قد نوقف حسابًا يخالف هذه الشروط.",
        ],
      },
      {
        title: "التغييرات",
        items: ["إذا غيّرنا هذه الشروط سنحدّث هذه الصفحة وتاريخها، وننبّهك داخل الموقع إذا كان التغيير مهمًا. استمرارك في استخدام زاومو بعدها يعني موافقتك عليها."],
      },
    ],
    contact: "لأي سؤال أو اعتراض:",
    privacy: "سياسة الخصوصية",
  },
  en: {
    title: "Terms of Use",
    updated: "Last updated",
    intro:
      "Welcome to Zawmo — a place where people gather every angle of the same moment. By using Zawmo you agree to these terms. We wrote them in plain words; read them with the privacy policy.",
    sections: [
      {
        title: "Who can use Zawmo",
        items: [
          "Zawmo is for people aged 13 and over.",
          "You can join as a guest with just a name, or with a Google account. Some things (like adding to “Everyone” moments) need an official Google account.",
          "You are responsible for your account and for what you post from it.",
        ],
      },
      {
        title: "Your shots are yours",
        items: [
          "The photos, videos and writing you add stay yours.",
          "When you publish them, you allow Zawmo to store them and show them to the people you chose, and to prepare them for that: making small copies, converting videos to qualities that suit each device, checking them automatically, using them in the moment's video (montage), and comparing them with nearby shots to suggest “Shoot together”. We use them for nothing else, and never sell them.",
          "You can delete any shot at any time; its files are deleted and the moment's video is remade without it.",
        ],
      },
      {
        title: "Who sees what",
        items: [
          "You choose for each moment: “Friends”, “Only people with the link” or “Everyone”. Shots in “Everyone” moments are seen by everyone and may appear in Discover and on place pages.",
          "Anyone with a moment's link can share it on, so choose carefully what you put in link moments.",
          "If you add your shot to someone else's moment with “Shoot together”, it becomes part of their public moment. Its owner can give it back (“Remove it”): it returns to a moment of your own and is not deleted.",
        ],
      },
      {
        title: "What's not allowed",
        items: [
          "Sexual or nude content, and anything exploiting children in any way.",
          "Graphic violence, incitement, hate or terror symbols, and encouraging self-harm.",
          "Bullying, harassment and threats, or sharing someone's private information (like their address or number).",
          "Filming people in private places without their permission, or posting a shot of someone who asked you to remove it.",
          "Impersonating anyone, or posting photos, music or anything else you don't have the right to post.",
          "Spam, automated tools, or trying to disrupt, break into or get around the limits of the site.",
        ],
      },
      {
        title: "How we keep Zawmo clean",
        items: [
          "Every photo and video is checked automatically on upload; anything that breaks the rules is hidden and reviewed by our team.",
          "You can report any shot or comment, and block anyone.",
          "We may remove what breaks these terms, or suspend an account that does, especially when it's repeated or serious. If you think we got it wrong, write to us.",
          "To ask for a shot you appear in (that you didn't post) to be removed, report it or write to us.",
        ],
      },
      {
        title: "Places",
        items: [
          "The city or village may show on your public shots; we never store coordinates. You can remove the place from any of your shots.",
          "Place pages show public shots only, and no numbers for a place with fewer than 20 people.",
        ],
      },
      {
        title: "Sounds and attached content",
        items: ["The sounds offered in Zawmo are for use with your shots inside Zawmo only.", "Don't upload music or clips you don't have the right to use."],
      },
      {
        title: "The service as it is",
        items: [
          "We work to keep Zawmo available and safe, but it may sometimes stop for maintenance or for problems beyond our control.",
          "We may change Zawmo's features, or add or remove some over time.",
          "Keep a copy of your important photos on your device too.",
          "To the extent the law allows, we are not liable for indirect damage from using the service or from it being unavailable.",
        ],
      },
      {
        title: "Paid features",
        items: ["Zawmo is free now. If we add paid features (like “Spotlight” for local ads), they will come with clear terms shown before payment, under the same privacy rules."],
      },
      {
        title: "Ending",
        items: ["You can delete your account yourself at any time (your page → “Delete my account”); it goes with your shots and files.", "We may suspend an account that breaks these terms."],
      },
      {
        title: "Changes",
        items: ["If we change these terms we'll update this page and its date, and let you know in the app if the change matters. Using Zawmo after that means you accept them."],
      },
    ],
    contact: "Questions or objections:",
    privacy: "Privacy policy",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${CONTENT[locale].title} · ${locale === "ar" ? "زاومو" : "Zawmo"}`, description: CONTENT[locale].intro.slice(0, 160), alternates: { canonical: "/terms" } };
}

export default async function TermsPage() {
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
          <Link href="/privacy" className="text-secondary underline-offset-4 hover:underline">
            {c.privacy}
          </Link>
          <Link href="/" className="text-secondary underline-offset-4 hover:underline">
            ← {locale === "ar" ? "زاومو" : "Zawmo"}
          </Link>
        </div>
      </main>
    </div>
  );
}

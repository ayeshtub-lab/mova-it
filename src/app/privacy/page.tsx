import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/site";

// Privacy policy. Every statement here must match what the code actually does —
// update this page (and UPDATED) whenever data handling changes.

const UPDATED = { ar: "٢٨ سبتمبر ٢٠٢٦", en: "September 28, 2026" };

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
          "لا نتتبّع مكانك، ولا نطلب جهات الاتصال ولا رقم هاتفك. لا نطلب إذن الموقع إلا إذا ضغطت أنت «📍 مكاني»، وحتى وقتها يحوّل جوالك الموقع لاسم البلدة، والإحداثيات لا تصلنا.",
          "لا نستخدم إعلانات، ولا أدوات تتبّع، ولا نبيع بياناتك لأي جهة.",
        ],
      },
      {
        title: "صورك وفيديوهاتك",
        items: [
          "الصور يُعاد تجهيزها على جهازك قبل الرفع، فتُزال منها كل البيانات المخفية، ومنها إحداثيات مكان التصوير.",
          "الفيديو يُحفظ كما هو، وقد يحتوي بيانات من جهازك. نحن لا نقرؤها ولا نعرضها.",
          "الملفات محفوظة بشكل خاص وغير منشورة على الإنترنت. تُعرض فقط لمن يحق له رؤيتها، عبر روابط مؤقتة تنتهي خلال ٣٠ دقيقة.",
        ],
      },
      {
        title: "مكان اللقطة 📍",
        items: [
          "إذا كانت صورتك تحمل مكان تصويرها، يعرف جوالك منه اسم المدينة أو القرية أو الحي (مثل «بيت لحم»)، وهذا الاسم فقط يُرسل إلينا. الإحداثيات نفسها لا تغادر جوالك أبدًا ولا نحفظها.",
          "يظهر اسم المكان على لقطاتك في اللحظات العامة، وفي صفحة ذلك المكان (مثل zawmo.com/p/بيت-لحم). علامة «✓ موثّق» تعني أن المكان جاء من الصورة نفسها.",
          "تستطيع إزالة المكان من أي لقطة لك في أي وقت: «✨ عدّل» ← «شيل المكان».",
          "لقطات لحظات «أصحابي» و«فقط من معه الرابط» لا تظهر أبدًا في صفحات الأماكن.",
          "لا نعرض عدد الأشخاص في مكان فيه أقل من ٢٠ شخصًا، ولا نبيع أو نشارك بيانات الأماكن مع أي جهة. إن عرضنا يومًا إعلانات لمكان ما، فالمعلن يرى أرقامًا مجمّعة فقط، لا أسماء.",
          "عند الرفع نعرف من شبكة الإنترنت اسم البلدة التقريبية (وغالبًا تكون أكبر مدينة قريبة)، ونحفظ اسم البلدة فقط مع اللقطة، لنقترح «صوّر معك». لا يظهر لأحد أبدًا، ولا نحفظ عنوان الشبكة.",
        ],
      },
      {
        title: "من يرى ماذا",
        items: [
          "أنت تختار لكل لحظة: «أصحابي» (من شاركوك لحظات من قبل) أو «فقط من معه الرابط» أو «للكل».",
          "لحظات «للكل» تظهر في «اكتشف» لكل مستخدمي زاومو المسجلين بحساب Google، وتظهر كل زواياها. لا يضيف إليها إلا أصحاب الحسابات الرسمية، ولا تظهر فيها إلا الصور التي اجتازت الفحص التلقائي.",
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
          "الفحص نفسه يسمّي مشهد اللقطة بكلمة واحدة (غروب، مطر، عرس…)، ويقرأ الأسماء الظاهرة فيها كيافطة محل أو اسم مكان معروف. إذا صوّر غيرك نفس المشهد قريبًا منك وبنفس الوقت في لحظة عامة، نقترح عليك أن تضيف لقطتك إليها («صوّر معك»). ولنعرف إن كانت نفس اللحظة، نعرض صورتك بجانب لقطات عامة حديثة على نفس الفحص التلقائي ليقارنها. الاقتراح لك وحدك، وأنت تقرّر. وتستطيع من صفحتك إيقاف انضمام الآخرين للحظاتك.",
        ],
      },
      {
        title: "الخدمات التي نعتمد عليها",
        items: [
          "Vercel: استضافة الموقع وتخزين الصور والفيديوهات.",
          "Neon: قاعدة البيانات.",
          "Cloudflare Stream: تجهيز الفيديوهات وعرضها بجودة تناسب سرعة الإنترنت على كل جهاز. الفيديوهات خاصة هناك أيضًا، وتُعرض فقط عبر روابط مؤقتة لمن يحق له رؤيتها.",
          "Google: تسجيل الدخول، إذا اخترته.",
          "Google Gemini: الفحص التلقائي للصور والفيديوهات. تُرسل الصورة (أو لقطات من الفيديو) للفحص فقط، ولا يستخدمها Google لتدريب نماذجه.",
          "Sentry (خوادمه في ألمانيا): تنبيهنا بالأعطال لنصلحها. يصله نوع الخطأ والصفحة ونوع المتصفح فقط، بلا أسماء ولا عناوين شبكة ولا كوكيز.",
          "قائمة الأماكن من بيانات مفتوحة: Wikidata، و GeoNames، و© مساهمو OpenStreetMap.",
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
          "لقطاتك تبقى محفوظة، لتبقى ذكرياتك، حتى تحذفها أنت أو تحذف حسابك.",
          "تستطيع حذف لقطاتك وتعليقاتك في أي وقت، فيُحذف الملف معها.",
          "تستطيع حذف حسابك بنفسك في أي وقت (صفحتك ← «حذف حسابي»، أو zawmo.com/account/delete)، فيُحذف فورًا مع لقطاتك وملفاتك.",
        ],
      },
      {
        title: "حقوقك",
        items: ["تعديل اسمك من صفحتك الشخصية.", "حذف ما نشرته.", "حذف حسابك بنفسك، أو طلب نسخة من بياناتك بمراسلتنا."],
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
          "We don't track where you are, and we don't ask for your contacts or phone number. We ask for location only when you tap “📍 Where I am”, and even then your phone turns it into a town name; the coordinates never reach us.",
          "No ads, no tracking tools, and we never sell your data.",
        ],
      },
      {
        title: "Your photos and videos",
        items: [
          "Photos are re-processed on your device before upload, which removes all hidden data, including the coordinates of where they were taken.",
          "Videos are stored as uploaded and may contain data from your device. We don't read or display it.",
          "Files are stored privately, not published on the web. They are shown only to people allowed to see them, through temporary links that expire within 30 minutes.",
        ],
      },
      {
        title: "Where a shot was taken 📍",
        items: [
          "If your photo carries where it was taken, your phone turns that into the name of the city, village or neighbourhood (e.g. “Bethlehem”), and only that name is sent to us. The coordinates themselves never leave your phone and are never stored.",
          "The place name shows on your shots in public moments and on that place's page (e.g. zawmo.com/p/بيت-لحم). “✓ Verified” means the place came from the photo itself.",
          "You can remove the place from any of your shots at any time: “✨ Edit” → “Remove place”.",
          "Shots in Friends and link-only moments never appear on place pages.",
          "We never show how many people are in a place with fewer than 20, and we never sell or share place data. If we ever show ads for a place, advertisers see totals only, never names.",
          "When you upload, your internet connection tells us an approximate town (often just the nearest big city). We keep only that town's name with the shot, to suggest “Shoot together”. It is never shown to anyone, and your network address is not kept.",
        ],
      },
      {
        title: "Who sees what",
        items: [
          "You choose for each moment: \"Friends\" (people you've shared moments with), \"Only people with the link\", or \"Everyone\".",
          "\"Everyone\" moments appear in Discover for every Zawmo user signed in with Google, with all their angles. Only official accounts can add to them, and only photos that passed the automatic check are shown.",
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
          "The same check names the shot's scene in one word (sunset, rain, wedding…) and reads names visible in it, such as a shop sign or a well-known place. If someone else shot the same scene near you at the same time in a public moment, we suggest adding your shot to it (“Shoot together”). To tell whether it's the same moment, the same automatic check compares your picture with recent public shots. Only you see the suggestion, and you decide. From your page you can stop others joining your moments.",
        ],
      },
      {
        title: "Services we rely on",
        items: [
          "Vercel: hosting, and storage for photos and videos.",
          "Neon: the database.",
          "Cloudflare Stream: preparing videos and playing them at a quality that suits each device's connection. Videos are private there too, shown only through temporary links to people allowed to see them.",
          "Google: sign-in, if you choose it.",
          "Google Gemini: the automatic check of photos and videos. The image (or a few frames of a video) is sent only to be checked, and Google does not use it to train its models.",
          "Sentry (servers in Germany): alerts us to errors so we can fix them. It receives the error, the page and the browser type only: no names, network addresses or cookies.",
          "The list of places comes from open data: Wikidata, GeoNames, and © OpenStreetMap contributors.",
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
          "Your shots are kept, so your memories stay, until you delete them or your account.",
          "You can delete your shots and comments at any time, and the file is deleted with them.",
          "You can delete your account yourself at any time (your page → “Delete my account”, or zawmo.com/account/delete); it goes right away, with your shots and files.",
        ],
      },
      {
        title: "Your rights",
        items: ["Change your name from your profile.", "Delete what you posted.", "Delete your account yourself, or ask for a copy of your data by emailing us."],
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

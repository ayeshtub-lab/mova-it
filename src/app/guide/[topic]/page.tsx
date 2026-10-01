import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { NEW_VISIT_HEADER } from "@/lib/source";
import { recordLanding } from "@/server/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { StoryDemo } from "@/app/start/StoryDemo";
import { getDictionary, getLocale } from "@/i18n/server";
import { plural } from "@/i18n/plural";
import { CANONICAL_HOST } from "@/lib/hosts";
import { MAX_REMINDERS, publicStories } from "@/server/stories";

// «مع الوقت» guides for what people search for: documenting a house being built, a plant
// growing. Each answers the question itself (the stages, how to shoot them) and shows how
// Zawmo turns the shots into a video. Every statement about Zawmo must stay true: a story is
// its owner's alone, up to 300 shots, a video from 3 shots (40 of them spread from first to
// last), a reminder a week after the last shot, at most MAX_REMINDERS times
// (src/server/stories.ts, src/server/montage/index.ts, src/server/angles.ts).

type Guide = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  demo: "house" | "plant";
  cta: string;
  stagesTitle: string;
  stages: [string, string][];
  tipsTitle: string;
  tips: string[];
  howTitle: string;
  how: string[];
  examplesTitle: string;
  faqTitle: string;
  faq: [string, string][];
  other: { href: string; label: string };
};

type Topic = "house" | "plant";

const r = MAX_REMINDERS;

const GUIDES: Record<Topic, Record<"ar" | "en", Guide>> = {
  house: {
    ar: {
      metaTitle: "توثيق مراحل بناء البيت بالصور — من الأساس للسكن، بفيديو جاهز | زاومو",
      metaDescription:
        "كيف توثّق بناء بيتك مرحلة بمرحلة: شو تصوّر بكل مرحلة، ومن وين، وكل قديش. وزاومو بيرتب لقطاتك بتواريخها وبيطلّعلك فيديو بيمرّ فيه البناء قدامك.",
      h1: "وثّق مراحل بناء بيتك بالصور، من الأساس للسكن",
      intro:
        "بناء البيت بياخذ شهور، وأحيانًا سنين. وبعد ما تسكن، بتنسى كيف كانت الأرض، ووين كانت الأعمدة، وكيف طلع السقف. مع «مع الوقت» بزاومو، بتصوّر لقطة كل فترة من نفس المكان، وزاومو بيرتبها بتواريخها وبيطلّعلك فيديو بيمرّ فيه البناء كله قدامك بدقيقة.",
      demo: "house",
      cta: "🏗️ ابدأ قصة بيتك الآن، مجانًا",
      stagesTitle: "المراحل اللي بتستاهل لقطة",
      stages: [
        ["الأرض قبل الحفر", "هاي اللقطة اللي كل الناس بتندم إنها ما صوّرتها."],
        ["الحفر والأساسات", "صوّر الحفرة كاملة، ولقطة للحديد قبل الصبّ."],
        ["الأعمدة والجسور", "من نفس الزاوية اللي صوّرت منها الأرض."],
        ["صبّة السقف", "بكل طابق. فيديو قصير يوم الصبّة بيطلع حلو كثير."],
        ["البناء بالحجر أو الطوب", "لقطة كل أسبوع بتورجي الجدران وهي بتطلع."],
        ["التمديدات", "صوّر مسارات الكهرباء والماء قبل ما تتسكّر، بتحتاجها بعدين."],
        ["القصارة والبلاط", "صوّر من جوّا كمان، مش بس الواجهة."],
        ["الدهان والتشطيب", "الألوان والتفاصيل الأخيرة."],
        ["يوم السكن", "آخر لقطة بالقصة، ومن نفس مكان أول لقطة."],
      ],
      tipsTitle: "كيف تصوّر ليبان الفرق",
      tips: [
        "اختار نقطة ثابتة وصوّر منها كل مرة: جنب عمود كهرباء، أو من باب الجيران، أو من زاوية الشارع.",
        "حاول تصوّر بنفس وقت النهار تقريبًا، عشان الإضاءة ما تتغيّر كثير.",
        "لقطة كل أسبوع، أو مع كل مرحلة جديدة. أكثر من هيك مش ضروري.",
        "فعّل «🕐 ختم الساعة» على اللقطة، ليظهر التاريخ عليها.",
        "صوّر من جوّا كمان: نفس الغرفة، من نفس الباب.",
      ],
      howTitle: "كيف بتشتغل بزاومو",
      how: [
        "ابدأ قصة «🌱 مع الوقت» باسم بيتك، مثل «بيت العيلة بالخليل».",
        "صوّر أول لقطة اليوم، من الجوال مباشرة، بدون تحميل تطبيق.",
        `ارجع لنفس المكان كل فترة وضيف لقطة. وإذا مرّ أسبوع بدون لقطة، زاومو بيذكّرك (لحد ${r} مرات).`,
        "من ٣ لقطات بيصير لقصتك فيديو، بيتحدّث لحاله مع كل لقطة جديدة.",
      ],
      examplesTitle: "قصص حقيقية على زاومو",
      faqTitle: "أسئلة شائعة",
      faq: [
        ["مين بيقدر يضيف لقطات لقصتي؟", "أنت بس. قصة «مع الوقت» إلك لحالك، والناس بيقدروا يشوفوها حسب اللي بتختاره."],
        ["كم لقطة بقدر أضيف؟", "لحد ٣٠٠ لقطة بالقصة. والفيديو بياخذ لحد ٤٠ منها، موزّعة من أول لقطة لآخرها."],
        ["بيذكّرني زاومو أصوّر؟", `آه، بعد أسبوع من آخر لقطة، لحد ${r} مرات. ومع كل لقطة جديدة بيرجع يبلّش من الأول.`],
        ["مين بيشوف قصتي؟", "أنت بتختار: أصحابك، أو اللي معه الرابط، أو الكل."],
        ["هل هو مجاني؟", "نعم."],
      ],
      other: { href: "/guide/plant", label: "🌱 كمان: وثّق نمو نبتة من البذرة" },
    },
    en: {
      metaTitle: "Document building your house in photos — from foundations to moving in | Zawmo",
      metaDescription:
        "How to document your house being built, stage by stage: what to shoot, from where, and how often. Zawmo puts your shots in date order and makes a video of the whole build.",
      h1: "Document your house being built, from foundations to moving in",
      intro:
        "Building a house takes months, sometimes years. Once you move in, you forget what the land looked like, where the columns stood, how the roof went up. With Zawmo's “Over time” you take a shot now and then from the same spot, and Zawmo puts them in date order and makes a video of the whole build.",
      demo: "house",
      cta: "🏗️ Start your house's story — free",
      stagesTitle: "Stages worth a shot",
      stages: [
        ["The land before digging", "The shot everyone regrets not taking."],
        ["Digging and foundations", "The whole pit, and the steel before the pour."],
        ["Columns and beams", "From the same angle as the land."],
        ["Pouring the roof", "Every floor. A short video on pour day looks great."],
        ["Stone or block walls", "A weekly shot shows the walls rising."],
        ["Wiring and plumbing", "Before it's covered — you'll need it later."],
        ["Plaster and tiles", "Shoot inside too, not just the front."],
        ["Paint and finishing", "The colours and last details."],
        ["Moving-in day", "The last shot of the story — from the spot of the first one."],
      ],
      tipsTitle: "How to shoot so the change shows",
      tips: [
        "Pick a fixed spot and shoot from it every time: by a lamp post, a neighbour's gate, a street corner.",
        "Shoot at about the same time of day, so the light stays similar.",
        "A shot a week, or one per new stage, is plenty.",
        "Turn on the “🕐 time stamp” so the date shows on the shot.",
        "Shoot inside too: the same room, from the same door.",
      ],
      howTitle: "How it works on Zawmo",
      how: [
        "Start an “🌱 Over time” story named after your house.",
        "Take the first shot today, straight from your phone — no app to download.",
        `Come back to the same spot now and then. If a week passes without a shot, Zawmo reminds you (up to ${r} times).`,
        "From 3 shots your story has a video, which updates itself with every new shot.",
      ],
      examplesTitle: "Real stories on Zawmo",
      faqTitle: "Questions",
      faq: [
        ["Who can add shots to my story?", "Only you. An “Over time” story is yours alone; others see it as you choose."],
        ["How many shots can I add?", "Up to 300 in a story. The video uses up to 40 of them, spread from the first to the latest."],
        ["Does Zawmo remind me?", `Yes, a week after your last shot, up to ${r} times — starting over with every new shot.`],
        ["Who sees my story?", "You choose: your friends, people with the link, or everyone."],
        ["Is it free?", "Yes."],
      ],
      other: { href: "/guide/plant", label: "🌱 Also: document a plant growing from seed" },
    },
  },
  plant: {
    ar: {
      metaTitle: "توثيق نمو نبتة بالصور يومًا بيوم — فيديو تايم لابس جاهز | زاومو",
      metaDescription:
        "كيف توثّق نمو نبتتك من البذرة لأول ثمرة: شو تصوّر، وكل قديش، وكيف يبان الفرق. وزاومو بيحوّل لقطاتك لفيديو بيكبر فيه النبات قدامك.",
      h1: "وثّق نمو نبتتك بالصور، من البذرة لأول ثمرة",
      intro:
        "النبتة بتتغيّر كل يوم، بس التغيير بطيء لدرجة إنك ما بتلاحظه. مع «مع الوقت» بزاومو، بتصوّرها كل فترة من نفس المكان، وزاومو بيرتب اللقطات بتواريخها وبيطلّعلك فيديو بتشوف فيه النبتة وهي بتكبر، مثل التايم لابس.",
      demo: "plant",
      cta: "🌱 ابدأ قصة نبتتك الآن، مجانًا",
      stagesTitle: "المراحل اللي بتستاهل لقطة",
      stages: [
        ["يوم الزراعة", "البذرة أو الشتلة بالأصيص أو بالأرض."],
        ["الإنبات", "أول ما يطلع إشي من التراب. بهاي الفترة التغيير سريع، فصوّر كل يوم أو يومين."],
        ["أول ورقتين", "لقطة قريبة بتطلع حلوة كثير."],
        ["النمو", "لقطة كل أسبوع بتورجي الساق والأوراق وهي بتكبر."],
        ["التزهير", "صوّر أول زهرة لحالها."],
        ["الثمر أو الحصاد", "آخر لقطة بالقصة، وبتكون أحلاها."],
      ],
      tipsTitle: "كيف تصوّر ليبان الفرق",
      tips: [
        "خلّي الأصيص بنفس المكان، وصوّر من نفس الزاوية والمسافة كل مرة.",
        "حط جنبها إشي ثابت للمقارنة، مثل فنجان أو مسطرة، ليبان قديش كبرت.",
        "صوّر بنفس الإضاءة تقريبًا، وأحسن إشي ضو النهار.",
        "بالأول كل يوم أو يومين لأنه التغيير سريع، وبعدين مرة بالأسبوع.",
        "فعّل «🕐 ختم الساعة» ليظهر التاريخ على كل لقطة.",
      ],
      howTitle: "كيف بتشتغل بزاومو",
      how: [
        "ابدأ قصة «🌱 مع الوقت» باسم نبتتك، مثل «ريحانة البلكونة».",
        "صوّر أول لقطة اليوم، من الجوال مباشرة، بدون تحميل تطبيق.",
        `ضيف لقطة كل فترة. وإذا مرّ أسبوع بدون لقطة، زاومو بيذكّرك (لحد ${r} مرات).`,
        "من ٣ لقطات بيصير لقصتك فيديو، بيتحدّث لحاله مع كل لقطة جديدة.",
      ],
      examplesTitle: "قصص حقيقية على زاومو",
      faqTitle: "أسئلة شائعة",
      faq: [
        ["مين بيقدر يضيف لقطات لقصتي؟", "أنت بس. قصة «مع الوقت» إلك لحالك، والناس بيقدروا يشوفوها حسب اللي بتختاره."],
        ["كم لقطة بقدر أضيف؟", "لحد ٣٠٠ لقطة بالقصة. والفيديو بياخذ لحد ٤٠ منها، موزّعة من أول لقطة لآخرها."],
        ["بيذكّرني زاومو أصوّر؟", `آه، بعد أسبوع من آخر لقطة، لحد ${r} مرات. ومع كل لقطة جديدة بيرجع يبلّش من الأول.`],
        ["بقدر أوثّق أكثر من نبتة؟", "آه، كل نبتة بقصة لحالها."],
        ["هل هو مجاني؟", "نعم."],
      ],
      other: { href: "/guide/house", label: "🏗️ كمان: وثّق مراحل بناء بيتك" },
    },
    en: {
      metaTitle: "Document a plant growing in photos, day by day — a ready time-lapse video | Zawmo",
      metaDescription:
        "How to document your plant from seed to first fruit: what to shoot, how often, and how to make the change show. Zawmo turns your shots into a video of it growing.",
      h1: "Document your plant growing, from seed to first fruit",
      intro:
        "A plant changes every day, but so slowly you never notice. With Zawmo's “Over time” you shoot it now and then from the same spot, and Zawmo puts the shots in date order and makes a video of it growing, like a time-lapse.",
      demo: "plant",
      cta: "🌱 Start your plant's story — free",
      stagesTitle: "Stages worth a shot",
      stages: [
        ["Planting day", "The seed or seedling in its pot or the ground."],
        ["Sprouting", "The first thing out of the soil. Change is fast now — shoot every day or two."],
        ["The first two leaves", "A close shot looks lovely."],
        ["Growing", "A weekly shot shows the stem and leaves getting bigger."],
        ["Flowering", "Shoot the first flower on its own."],
        ["Fruit or harvest", "The last shot of the story, and the best."],
      ],
      tipsTitle: "How to shoot so the change shows",
      tips: [
        "Keep the pot in the same place and shoot from the same angle and distance.",
        "Put something fixed beside it, like a cup or a ruler, so its growth shows.",
        "Shoot in similar light — daylight is best.",
        "Every day or two at first, when change is fast; then once a week.",
        "Turn on the “🕐 time stamp” so each shot shows its date.",
      ],
      howTitle: "How it works on Zawmo",
      how: [
        "Start an “🌱 Over time” story named after your plant.",
        "Take the first shot today, straight from your phone — no app to download.",
        `Add a shot now and then. If a week passes without one, Zawmo reminds you (up to ${r} times).`,
        "From 3 shots your story has a video, which updates itself with every new shot.",
      ],
      examplesTitle: "Real stories on Zawmo",
      faqTitle: "Questions",
      faq: [
        ["Who can add shots to my story?", "Only you. An “Over time” story is yours alone; others see it as you choose."],
        ["How many shots can I add?", "Up to 300 in a story. The video uses up to 40 of them, spread from the first to the latest."],
        ["Does Zawmo remind me?", `Yes, a week after your last shot, up to ${r} times — starting over with every new shot.`],
        ["Can I document more than one plant?", "Yes, each plant in its own story."],
        ["Is it free?", "Yes."],
      ],
      other: { href: "/guide/house", label: "🏗️ Also: document your house being built" },
    },
  },
};

const isTopic = (t: string): t is Topic => t === "house" || t === "plant";

export function generateStaticParams() {
  return [{ topic: "house" }, { topic: "plant" }];
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/guide/[topic]">): Promise<Metadata> {
  const { topic } = await params;
  if (!isTopic(topic)) return {};
  const g = GUIDES[topic][await getLocale()];
  return {
    title: g.metaTitle,
    description: g.metaDescription,
    alternates: { canonical: `/guide/${topic}` },
    openGraph: { title: g.h1, description: g.metaDescription, type: "article", images: [{ url: `/start/ad-${g.demo}.jpg` }] },
  };
}

export default async function GuidePage({ params }: PageProps<"/guide/[topic]">) {
  const { topic } = await params;
  if (!isTopic(topic)) notFound();
  // A new arrival from an ad, YouTube or another site (src/proxy.ts marks it): counted in
  // «📣 من وين إجوا», like the ad landing page, to set against the clicks.
  const arrival = (await headers()).get(NEW_VISIT_HEADER);
  if (arrival) after(() => recordLanding(arrival.slice(0, 40)).catch((error) => console.error("landing count failed", error)));
  const locale = await getLocale();
  const [dict, stories] = await Promise.all([getDictionary(locale), publicStories(6)]);
  const g = GUIDES[topic][locale];
  const site = `https://${CANONICAL_HOST}`;
  const url = `${site}/guide/${topic}`;
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        url,
        headline: g.h1,
        description: g.metaDescription,
        inLanguage: locale,
        image: `${site}/start/ad-${g.demo}.jpg`,
        author: { "@id": `${site}/#org` },
        publisher: { "@id": `${site}/#org` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: dict.meta.brand, item: site },
          { "@type": "ListItem", position: 2, name: g.h1, item: url },
        ],
      },
    ],
  };
  const cta = (
    <Link href="/start" className="flex min-h-14 items-center justify-center rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95">
      {g.cta}
    </Link>
  );

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{g.h1}</h1>
          <p className="leading-relaxed text-muted">{g.intro}</p>
          <div className="mx-auto w-full max-w-xs">
            <StoryDemo src={`/start/ad-${g.demo}.mp4`} poster={`/start/ad-${g.demo}.jpg`} label={dict.start.demoLabel} soundLabel={dict.start.sound} />
          </div>
          {cta}
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{g.stagesTitle}</h2>
          <ol className="flex flex-col gap-2">
            {g.stages.map(([title, text], i) => (
              <li key={title} className="flex gap-3 rounded-2xl bg-surface p-4">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-extrabold text-white">
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

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{g.tipsTitle}</h2>
          <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed">
            {g.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border-2 border-accent/40 bg-accent-soft/40 p-5">
          <h2 className="text-xl font-extrabold">🎬 {g.howTitle}</h2>
          <ol className="flex list-decimal flex-col gap-2 ps-5 leading-relaxed">
            {g.how.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {cta}
        </section>

        {stories.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl font-extrabold">{g.examplesTitle}</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stories.map((s) => (
                <li key={s.code}>
                  <Link href={`/m/${s.code}`} className="flex flex-col overflow-hidden rounded-2xl bg-surface hover:bg-line">
                    {s.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img src={s.coverUrl} alt={s.title} loading="lazy" className="aspect-square w-full object-cover" />
                    )}
                    <span className="flex flex-col gap-0.5 p-3">
                      <strong className="line-clamp-2 text-sm">{s.title}</strong>
                      <span className="text-xs text-muted">{plural(locale, dict.plurals.shots, s.shots)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-extrabold">{g.faqTitle}</h2>
          {g.faq.map(([q, a]) => (
            <details key={q} className="rounded-2xl bg-surface px-4 py-3">
              <summary className="cursor-pointer font-bold">{q}</summary>
              <p className="mt-2 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </section>

        <nav className="flex flex-col gap-2 text-center text-sm font-bold">
          <Link href={g.other.href} className="underline underline-offset-4">
            {g.other.label}
          </Link>
          <Link href="/album" className="underline underline-offset-4">
            {dict.footer.album}
          </Link>
        </nav>
      </main>
    </div>
  );
}

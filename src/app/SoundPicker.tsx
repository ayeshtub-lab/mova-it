"use client";

import { useEffect, useRef, useState } from "react";
import { AddSound, type OwnSoundLabels } from "@/app/AddSound";
import { lyricsOf } from "@/lib/lyrics";
import { isSolemn, SOUND_CATEGORIES, SOUNDS, soundByKey, soundFile, soundName, type SoundCategory } from "@/lib/sounds";

export type SoundLabels = {
  title: string;
  none: string;
  cats: Record<SoundCategory, string>;
  preview: string;
  stop: string;
  chosen: string;
  muteOriginal: string;
  solemnNote: string;
  save: string;
  cancel: string;
  peopleEmpty?: string;
  peopleBy?: string;
  lyrics?: string;
  // «➕ أضف صوتك» (and why a sound was not added)
  own?: OwnSoundLabels;
  whyCopyright?: string;
  whyMusic?: string;
  whyOffensive?: string;
  whyFailed?: string;
  whyNoAudio?: string;
};

// A bottom sheet over the page: browse the library by category, listen, pick one (or
// none). For a video, choose whether its own sound is muted under it — always muted
// under remembrance. «➕ أضف صوتك» adds a sound of your own (recorded or a file), for
// everyone or «🔒 خاص» — shown in «🎤 من الناس», a private one in its own colour.
export function SoundPicker({
  locale,
  labels,
  initialKey,
  initialMute = false,
  initialLyrics = true,
  lyricsToggle = false,
  isVideo = false,
  busy = false,
  onSave,
  onClose,
}: {
  locale: string;
  labels: SoundLabels;
  initialKey: string | null;
  initialMute?: boolean;
  initialLyrics?: boolean;
  lyricsToggle?: boolean; // a shot's sound: its words («📝») may be turned off
  isVideo?: boolean;
  busy?: boolean;
  onSave: (key: string | null, muteOriginal: boolean, lyrics: boolean) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [mute, setMute] = useState(initialMute);
  const [lyrics, setLyrics] = useState(initialLyrics);
  const [cat, setCat] = useState<SoundCategory>(soundByKey(initialKey)?.cat ?? SOUND_CATEGORIES[0].key);
  const [playing, setPlaying] = useState<string | null>(null);
  // «🎤 من الناس»: fetched when the tab is first opened.
  const [people, setPeople] = useState<{ key: string; name: string; author: string; seconds: number; mine?: boolean; shared?: boolean }[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (cat !== "people" || people) return;
    fetch("/api/sounds/people")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople, () => setPeople([]));
  }, [cat, people]);
  const rows =
    cat === "people"
      ? (people ?? []).map((p) => ({
          key: p.key,
          name: p.name,
          sub: p.mine ? (p.shared ? (labels.own?.mineTag ?? null) : (labels.own?.privateTag ?? null)) : (labels.peopleBy ?? "{name}").replace("{name}", p.author),
          seconds: p.seconds,
          private: !!p.mine && p.shared === false,
          mine: !!p.mine,
        }))
      : SOUNDS.filter((s) => s.cat === cat).map((s) => ({ key: s.key, name: soundName(s, locale), sub: null as string | null, seconds: s.seconds, private: false, mine: false }));
  const audio = useRef<HTMLAudioElement | null>(null);
  const solemn = isSolemn(soundByKey(key));
  const [changing, setChanging] = useState<string | null>(null);

  // Your own sound, right here: everyone ↔ «🔒 خاص», or delete it.
  async function setShared(soundKey: string, shared: boolean) {
    setChanging(soundKey);
    const res = await fetch(`/api/sounds/${soundKey}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ shared }) }).catch(() => null);
    setChanging(null);
    if (res?.ok) setPeople((list) => list?.map((p) => (p.key === soundKey ? { ...p, shared } : p)) ?? null);
  }
  async function remove(soundKey: string) {
    if (!window.confirm(labels.own?.deleteConfirm ?? "?")) return;
    setChanging(soundKey);
    const res = await fetch(`/api/sounds/${soundKey}`, { method: "DELETE" }).catch(() => null);
    setChanging(null);
    if (!res?.ok) return;
    setPeople((list) => list?.filter((p) => p.key !== soundKey) ?? null);
    if (key === soundKey) setKey(null);
  }

  useEffect(() => () => audio.current?.pause(), []);

  function preview(k: string) {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.onended = () => setPlaying(null);
    }
    if (playing === k) {
      audio.current.pause();
      return setPlaying(null);
    }
    audio.current.src = soundFile(k);
    audio.current.play().catch(() => {});
    setPlaying(k);
  }

  function close() {
    audio.current?.pause();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={close}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-background text-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-extrabold">{labels.title}</h2>
          <button type="button" onClick={close} aria-label={labels.cancel} className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
            <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div role="tablist" className="flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
          {SOUND_CATEGORIES.map((c) => (
            <button
              key={c.key}
              role="tab"
              type="button"
              aria-selected={cat === c.key}
              onClick={() => setCat(c.key)}
              className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-bold ${cat === c.key ? "bg-foreground text-background" : "bg-surface text-muted"}`}
            >
              {c.emoji} {labels.cats[c.key]}
            </button>
          ))}
          {labels.own && (
            <button type="button" onClick={() => setAdding(true)} className="min-h-9 shrink-0 rounded-full border-2 border-accent px-3.5 text-sm font-extrabold text-accent-ink">
              {labels.own.add}
            </button>
          )}
        </div>

        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-5 py-2">
          <li>
            <button
              type="button"
              onClick={() => setKey(null)}
              aria-pressed={key === null}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border-2 px-3 text-start font-bold ${key === null ? "border-accent bg-accent-soft/40" : "border-line"}`}
            >
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-surface">🔇</span>
              {labels.none}
            </button>
          </li>
          {cat === "people" && labels.own && (
            <li>
              <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-dashed border-accent px-3 font-extrabold text-accent-ink">
                {labels.own.add}
              </button>
            </li>
          )}
          {cat === "people" && people?.length === 0 && <li className="rounded-2xl bg-surface p-4 text-sm text-muted">{labels.peopleEmpty}</li>}
          {rows.map((s) => {
            const on = key === s.key;
            return (
              <li key={s.key} className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3 ${on ? "border-accent bg-accent-soft/40" : s.private ? "border-violet-400/70 bg-violet-500/10" : "border-line"}`}>
                <button
                  type="button"
                  onClick={() => preview(s.key)}
                  aria-label={playing === s.key ? labels.stop : labels.preview}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
                >
                  <svg viewBox="0 0 24 24" className="size-4 fill-current">
                    <path d={playing === s.key ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} />
                  </svg>
                </button>
                <button type="button" onClick={() => setKey(s.key)} aria-pressed={on} className="flex min-h-11 flex-1 items-center justify-between gap-2 text-start">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold leading-snug">{s.name}</span>
                    {s.sub && <span className={`truncate text-xs ${s.private ? "font-bold text-violet-600 dark:text-violet-300" : "text-muted"}`}>{s.sub}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{on ? labels.chosen : `${Math.round(s.seconds)}″`}</span>
                </button>
                {s.mine && labels.own && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={changing === s.key}
                      onClick={() => setShared(s.key, s.private)}
                      aria-label={s.private ? labels.own.makeShared : labels.own.makePrivate}
                      title={s.private ? labels.own.makeShared : labels.own.makePrivate}
                      className="flex size-9 items-center justify-center rounded-full bg-background text-base shadow-sm disabled:opacity-40"
                    >
                      {s.private ? "🔒" : "👥"}
                    </button>
                    <button
                      type="button"
                      disabled={changing === s.key}
                      onClick={() => remove(s.key)}
                      aria-label={labels.own.deleteLabel}
                      title={labels.own.deleteLabel}
                      className="flex size-9 items-center justify-center rounded-full bg-background text-base shadow-sm disabled:opacity-40"
                    >
                      🗑
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-col gap-2 border-t border-line px-5 py-3">
          {lyricsToggle && labels.lyrics && lyricsOf(key) && (
            <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={lyrics} onChange={(e) => setLyrics(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              {labels.lyrics}
            </label>
          )}
          {isVideo && key && (
            <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={solemn || mute} disabled={solemn} onChange={(e) => setMute(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              {solemn ? labels.solemnNote : labels.muteOriginal}
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              audio.current?.pause();
              onSave(key, solemn || mute, lyrics);
            }}
            className="min-h-12 rounded-full bg-accent px-5 font-extrabold text-white disabled:opacity-60"
          >
            {labels.save}
          </button>
        </footer>
      </section>
      {adding && labels.own && (
        <AddSound
          labels={labels.own}
          why={{ whyCopyright: labels.whyCopyright ?? "", whyMusic: labels.whyMusic ?? "", whyOffensive: labels.whyOffensive ?? "", whyFailed: labels.whyFailed ?? "", whyNoAudio: labels.whyNoAudio ?? "" }}
          onAdded={(sound) => {
            // Ready: it shows under «🎤 من الناس», chosen.
            setAdding(false);
            setPeople(null);
            setCat("people");
            setKey(sound.key);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

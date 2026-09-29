"use client";

import { useEffect, useId, useRef, useState } from "react";
import { placeAt } from "@/lib/places-client";

export type PlaceOption = { id: string; name: string; context: string | null };

// A place box with suggestions from Zawmo's list («بيتل» → بيت لحم، محافظة بيت لحم).
// Picking one sends its id (placeId); typing something else is fine too — the server still
// recognises a plain name («ارطاس»), and keeps anything else as a spot («برك سليمان»).
export function PlaceField({
  textName = "placeName",
  idName = "placeId",
  placeholder,
  className,
  onPick,
  initial = null,
  here,
}: {
  textName?: string;
  idName?: string;
  placeholder: string;
  className: string;
  onPick?: (place: PlaceOption | null) => void;
  initial?: PlaceOption | null; // a pre-filled guess, changed or cleared freely
  // «📍 مكاني»: the phone's position, asked only when tapped, turned into a town on the phone.
  here?: { label: string; why: string; finding: string; denied: string; blocked: string; outside: string; approx: string };
}) {
  const [text, setText] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<PlaceOption | null>(initial);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const [locating, setLocating] = useState(false);
  const [hereNote, setHereNote] = useState<string | null>(null);

  async function useHere() {
    if (!here || !navigator.geolocation) return setHereNote(here?.denied ?? null);
    setLocating(true);
    setHereNote(null);
    // Blocked in the browser (asked before and refused, or turned off in its settings): the
    // phone won't ask again, so the note says where to turn it back on.
    let blocked = false;
    const pos = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          blocked = error.code === error.PERMISSION_DENIED;
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 },
      ),
    );
    // The coordinates stay here: only the place id they point to is looked up.
    const id = pos ? await placeAt(pos.coords.latitude, pos.coords.longitude) : null;
    const res = id ? await fetch(`/api/places?id=${encodeURIComponent(id)}`).catch(() => null) : null;
    const found = res?.ok ? ((await res.json()) as { places: PlaceOption[] }).places[0] : null;
    setLocating(false);
    if (!found) return setHereNote(pos ? here.outside : blocked ? here.blocked : here.denied);
    pick(found);
    // "Approximate location" on the phone (km-wide): the village may be a neighbour's.
    if (pos && pos.coords.accuracy > 1500) setHereNote(here.approx);
  }
  const seq = useRef(0);

  useEffect(() => {
    if (picked && picked.name === text) return;
    const q = text.trim();
    if (q.length < 2) return; // too short: nothing is shown (see `shown`)
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`).catch(() => null);
      const body = res?.ok ? ((await res.json()) as { places: PlaceOption[] }) : null;
      if (mine !== seq.current) return; // a newer search is on its way
      setOptions(body?.places ?? []);
      setActive(-1);
    }, 180);
    return () => clearTimeout(timer);
  }, [text, picked]);

  function pick(p: PlaceOption) {
    setPicked(p);
    setText(p.name);
    setOpen(false);
    onPick?.(p);
  }

  const shown = open && text.trim().length >= 2 && options.length > 0 && !(picked && picked.name === text);
  return (
    <div className="relative">
      <input
        name={textName}
        value={text}
        maxLength={60}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (picked) {
            setPicked(null);
            onPick?.(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      <input type="hidden" name={idName} value={picked?.id ?? ""} />
      {here && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useHere}
            disabled={locating}
            className="min-h-9 rounded-full bg-secondary-soft px-3 text-sm font-bold text-secondary disabled:opacity-60"
          >
            {locating ? here.finding : here.label}
          </button>
          <span className="text-xs font-normal text-muted">{hereNote ?? here.why}</span>
        </div>
      )}
      {shown && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-line bg-background shadow-lg">
          {options.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={`flex w-full min-h-11 flex-col items-start px-4 py-2 text-start ${i === active ? "bg-accent-soft/60" : "hover:bg-surface"}`}
              >
                <span className="font-bold">📍 {p.name}</span>
                {p.context && <span className="text-xs text-muted">{p.context}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

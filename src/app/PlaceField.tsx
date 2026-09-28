"use client";

import { useEffect, useId, useRef, useState } from "react";

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
}: {
  textName?: string;
  idName?: string;
  placeholder: string;
  className: string;
  onPick?: (place: PlaceOption | null) => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PlaceOption | null>(null);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
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

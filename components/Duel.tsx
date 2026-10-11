import { useState } from "react";
import { champion, createBracket, nextMatch, pick, roundName, votesLeft } from "@/lib/bracket";
import type { Place } from "@/lib/types";

interface Props {
  options: Place[];
  onChampion: (place: Place) => void;
  onCancel: () => void;
}

const choiceClass =
  "min-h-16 flex-1 rounded-2xl bg-white px-4 py-3 text-lg font-extrabold text-indigo-950 shadow ring-2 ring-indigo-200 transition hover:bg-indigo-100 hover:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

/** Head-to-head elimination: two options at a time, you pick, until one is left. An alternative to the wheel. */
export default function Duel({ options, onChampion, onCancel }: Props) {
  const [bracket, setBracket] = useState(() => createBracket(options.map((o) => o.id)));
  const byId = new Map(options.map((o) => [o.id, o]));
  const match = nextMatch(bracket);
  if (!match) return null; // the champion has been handed to the page

  const choose = (id: string) => {
    const next = pick(bracket, id);
    const won = champion(next);
    if (won) onChampion(byId.get(won)!);
    else setBracket(next);
  };
  const a = byId.get(match.a)!;
  const b = byId.get(match.b)!;
  const left = votesLeft(bracket);

  return (
    <section aria-label="Head-to-head" className="w-full max-w-md rounded-2xl bg-indigo-50 p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-900">
        {roundName(bracket, match.round)} · {left} {left === 1 ? "choice" : "choices"} to go
      </p>
      <p className="mt-1 text-sm text-indigo-900">Which would you rather?</p>
      <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <button type="button" onClick={() => choose(a.id)} className={choiceClass}>
          {a.name}
        </button>
        <span aria-hidden className="text-sm font-bold text-indigo-900">
          vs
        </span>
        <button type="button" onClick={() => choose(b.id)} className={choiceClass}>
          {b.name}
        </button>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-3 min-h-11 px-3 text-sm font-semibold text-indigo-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Back to the wheel
      </button>
    </section>
  );
}

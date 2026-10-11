import { useState } from "react";
import type { Place } from "@/lib/types";

interface Props {
  options: Place[];
  onRemove: (id: string) => void;
  onClose: () => void;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

const secondary =
  "min-h-11 rounded-xl border-2 border-indigo-600 bg-white px-4 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

/** Pass the phone around: each person in turn removes one option they cannot stand (or passes), then you spin. */
export default function VetoRound({ options, onRemove, onClose }: Props) {
  const [players, setPlayers] = useState(3);
  const [turn, setTurn] = useState<number | null>(null); // null = choosing how many people

  if (turn === null) {
    return (
      <section aria-label="Take turns vetoing" className="w-full max-w-md rounded-2xl bg-indigo-50 p-4">
        <p className="text-sm text-indigo-950">
          Pass the phone around. Each person removes <b>one</b> option they really don&apos;t want, then you spin what&apos;s left.
        </p>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-indigo-950">
          How many people?
          <select
            value={players}
            onChange={(e) => setPlayers(Number(e.target.value))}
            className="min-h-11 rounded-lg border-2 border-indigo-200 bg-white px-2"
          >
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTurn(0)}
            className="min-h-11 rounded-xl bg-indigo-600 px-5 font-semibold text-white shadow hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Start
          </button>
          <button type="button" onClick={onClose} className={secondary}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  // Never veto the wheel down below two options.
  const finished = turn >= players || options.length <= 2;
  if (finished) {
    return (
      <section aria-label="Take turns vetoing" role="status" className="w-full max-w-md rounded-2xl bg-indigo-50 p-4 text-center">
        <p className="font-semibold text-indigo-950">
          {options.length <= 2 && turn < players ? "Down to two: " : "Everyone has had a say: "}
          {options.length} {options.length === 1 ? "option" : "options"} left. Time to spin!
        </p>
        <button type="button" onClick={onClose} className={`${secondary} mt-3`}>
          Done
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Take turns vetoing" className="w-full max-w-md rounded-2xl bg-indigo-50 p-4">
      <p aria-live="polite" className="text-center text-xs font-bold uppercase tracking-widest text-indigo-900">
        Person {turn + 1} of {players}
      </p>
      <p className="mt-1 text-center text-sm text-indigo-950">Remove the one you want least.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => {
                onRemove(o.id);
                setTurn(turn + 1);
              }}
              className="min-h-11 w-full rounded-xl bg-white px-4 text-left font-semibold text-indigo-950 shadow-sm ring-1 ring-indigo-200 hover:bg-red-50 hover:ring-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <span className="sr-only">Veto </span>
              {o.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between gap-2">
        <button type="button" onClick={() => setTurn(turn + 1)} className={secondary}>
          Pass
        </button>
        <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm font-semibold text-indigo-700 underline">
          Stop
        </button>
      </div>
    </section>
  );
}

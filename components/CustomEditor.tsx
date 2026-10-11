import { MAX_ITEMS, MAX_NAME, MAX_WEIGHT, parseCustomText } from "@/lib/custom";

interface Props {
  text: string;
  onTextChange: (text: string) => void;
  /** Called with the list the person typed when they press "Put on the wheel". */
  onApply: (text: string) => void;
  notes: string[];
  disabled?: boolean;
}

/** Type or paste your own options, one per line. */
export default function CustomEditor({ text, onTextChange, onApply, notes, disabled }: Props) {
  const count = parseCustomText(text).items.length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply(text);
      }}
      className="flex flex-col gap-3 rounded-3xl bg-white/80 p-4 shadow-lg backdrop-blur sm:p-6"
    >
      <label htmlFor="custom-options" className="text-sm font-bold uppercase tracking-wider text-indigo-900">
        Your options
      </label>
      <textarea
        id="custom-options"
        value={text}
        onChange={(e) => onTextChange(e.target.value.slice(0, 2000))}
        rows={6}
        placeholder={"Pizza\nTacos x2\nSushi\n(one per line; add x2 to double the chance)"}
        className="w-full rounded-xl border-2 border-indigo-200 bg-white px-4 py-3 text-indigo-950 placeholder:text-indigo-900/50 focus:border-indigo-500 focus:outline-none"
      />
      <p className="text-xs text-indigo-900/70">
        Up to {MAX_ITEMS} options, {MAX_NAME} characters each. Add <b>x2</b> to <b>x{MAX_WEIGHT}</b> after a name to give it
        a bigger slice. You can also paste a comma-separated list.
      </p>
      {notes.length > 0 && (
        <ul role="status" className="list-disc pl-5 text-sm text-amber-900">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={disabled || count < 2}
        className="min-h-11 self-start rounded-xl bg-indigo-600 px-5 font-semibold text-white shadow transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Put on the wheel{count >= 2 ? ` (${count})` : ""}
      </button>
      {count < 2 && <p className="text-xs text-indigo-900/70">Add at least two options.</p>}
    </form>
  );
}

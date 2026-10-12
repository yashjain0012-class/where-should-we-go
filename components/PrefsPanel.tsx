import { useState } from "react";
import { forgetLastWheel } from "@/lib/lastWheel";
import {
  SKIP_DAY_CHOICES, clearPrefs, hasAnyData, setSkipDays, toggleFavourite, unhidePlace, type Prefs,
} from "@/lib/prefs";
import type { Translate } from "@/lib/i18n";
import { useT } from "@/lib/useT";

/** "today", "yesterday", "5 days ago". */
export function ago(at: number, now: number, t: Translate): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return t("today");
  if (days === 1) return t("yesterday");
  return t("{n} days ago", { n: days });
}

interface Props {
  prefs: Prefs;
  disabled?: boolean;
}

const linkButton =
  "min-h-11 px-2 text-sm font-semibold text-indigo-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";

/** What this browser remembers, in the open: favourites, hidden places, recent winners, and a way to wipe it all. */
export default function PrefsPanel({ prefs, disabled }: Props) {
  const t = useT();
  const favourites = Object.entries(prefs.favourites);
  const hidden = Object.entries(prefs.hidden);
  const [now] = useState(Date.now); // when the panel opened, for "3 days ago"

  return (
    <details className="w-full rounded-2xl bg-indigo-50 p-4">
      <summary className="min-h-11 cursor-pointer text-sm font-bold uppercase tracking-wider text-indigo-900">
        {t("My picks and preferences")}
      </summary>
      <div className="mt-3 flex flex-col gap-4 text-sm text-indigo-950">
        <p className="text-indigo-900/80">
          {t("Remembered in this browser only. There is no account, and nothing is sent anywhere.")}
        </p>

        <label className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t("Skip places that won in the last")}</span>
          <select
            value={prefs.skipDays}
            disabled={disabled}
            onChange={(e) => setSkipDays(Number(e.target.value))}
            className="min-h-11 rounded-lg border-2 border-indigo-200 bg-white px-2"
          >
            {SKIP_DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? t("never skip") : t("{n} days", { n: d })}
              </option>
            ))}
          </select>
        </label>

        <section aria-label={t("Recent winners")}>
          <h3 className="font-semibold">{t("Where you went lately")}</h3>
          {prefs.history.length === 0 ? (
            <p className="text-indigo-900/70">{t("Nothing yet. Spin the wheel and your winners appear here.")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {prefs.history.slice(0, 10).map((h) => (
                <li key={`${h.id}-${h.at}`} className="flex justify-between gap-3">
                  <span className="truncate">{h.name}</span>
                  <span className="shrink-0 text-indigo-900/70">{ago(h.at, now, t)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {favourites.length > 0 && (
          <section aria-label={t("Favourites")}>
            <h3 className="font-semibold">★ {t("Favourites (bigger slice on the wheel)")}</h3>
            <ul className="mt-1 flex flex-col">
              {favourites.map(([id, name]) => (
                <li key={id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{name}</span>
                  <button type="button" disabled={disabled} className={linkButton} onClick={() => toggleFavourite({ id, name })}>
                    {t("Remove")}
                    <span className="sr-only"> {t("{name} from favourites", { name })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hidden.length > 0 && (
          <section aria-label={t("Hidden places")}>
            <h3 className="font-semibold">🚫 {t("Never shown")}</h3>
            <ul className="mt-1 flex flex-col">
              {hidden.map(([id, name]) => (
                <li key={id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{name}</span>
                  <button type="button" disabled={disabled} className={linkButton} onClick={() => unhidePlace(id)}>
                    {t("Show again")}
                    <span className="sr-only"> {name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          disabled={disabled || !hasAnyData(prefs)}
          onClick={() => {
            if (window.confirm(t("Forget your favourites, hidden places and history in this browser?"))) {
              clearPrefs();
              forgetLastWheel();
            }
          }}
          className="min-h-11 self-start rounded-xl border-2 border-red-700 bg-white px-4 font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("Clear my data")}
        </button>
      </div>
    </details>
  );
}

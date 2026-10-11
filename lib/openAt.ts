import type { OpenAt } from "./hours";

export type { OpenAt };

export interface OpenAtPreset {
  id: string;
  label: string;
  at: OpenAt | null;
}

/** Quick choices for "open when?". null = right now. */
export const OPEN_AT_PRESETS: OpenAtPreset[] = [
  { id: "now", label: "Now", at: null },
  { id: "dinner", label: "Tonight 7 pm", at: { dayOffset: 0, hour: 19, minute: 0 } },
  { id: "evening", label: "Tonight 9 pm", at: { dayOffset: 0, hour: 21, minute: 0 } },
  { id: "late", label: "Late, 11 pm", at: { dayOffset: 0, hour: 23, minute: 0 } },
  { id: "lunch", label: "Tomorrow 1 pm", at: { dayOffset: 1, hour: 13, minute: 0 } },
];

export function sameOpenAt(a: OpenAt | null, b: OpenAt | null): boolean {
  if (a === null || b === null) return a === b;
  return a.dayOffset === b.dayOffset && a.hour === b.hour && a.minute === b.minute;
}

export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** "now", "today at 6:30 pm", "tomorrow at 1:00 pm" (used in labels). */
export function describeOpenAt(at: OpenAt | null): string {
  if (!at) return "now";
  return `${at.dayOffset === 1 ? "tomorrow" : "today"} at ${formatClock(at.hour, at.minute)}`;
}

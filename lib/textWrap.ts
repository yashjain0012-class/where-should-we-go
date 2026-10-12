/**
 * Greedy word wrap for drawing text on a canvas. `measure` says how wide a string is (canvas `measureText`),
 * which is passed in so this can be tested without a browser. A single word wider than the line is broken by
 * character, and if the text needs more than `maxLines`, the last line ends in an ellipsis.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  const push = (value: string) => {
    lines.push(value);
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) push(line);
    line = "";
    // A word that is too wide on its own: break it by character.
    let rest = word;
    while (measure(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
      push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) push(line);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 0 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

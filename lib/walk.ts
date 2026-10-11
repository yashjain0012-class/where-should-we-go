/** Average walking pace: about 4.8 km/h. A straight-line estimate, not a route. */
export const WALK_METRES_PER_MINUTE = 80;

export function walkMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / WALK_METRES_PER_MINUTE));
}

/** "4 min walk", "1 h 3 min walk". */
export function formatWalk(metres: number): string {
  const total = walkMinutes(metres);
  if (total < 60) return `${total} min walk`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min walk` : `${h} h walk`;
}

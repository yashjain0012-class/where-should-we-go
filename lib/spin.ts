const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

export function pickIndex(count: number): number {
  return Math.floor(Math.random() * count);
}

/**
 * Slice i covers [i*s, (i+1)*s) degrees clockwise from the top, where s = 360/count.
 * The wheel is rotated clockwise by `rotation`, and the pointer sits at the top.
 * Returns the new absolute rotation that leaves the middle of slice `index`
 * (plus a little jitter, so it never lands dead centre) under the pointer,
 * after at least `minTurns` full spins from `current`.
 */
export function targetRotation(
  current: number,
  index: number,
  count: number,
  minTurns = 5,
): number {
  const slice = 360 / count;
  const jitter = (Math.random() - 0.5) * slice * 0.7;
  const desired = -((index + 0.5) * slice + jitter);
  const extraTurns = Math.floor(Math.random() * 3);
  return current + (minTurns + extraTurns) * 360 + mod360(desired - current);
}

/** Which slice is under the pointer for a given rotation. */
export function sliceUnderPointer(rotation: number, count: number): number {
  const slice = 360 / count;
  return Math.floor(mod360(-rotation) / slice) % count;
}

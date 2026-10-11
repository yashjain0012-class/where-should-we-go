const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

/** A wheel is either `count` equal slices, or one slice per weight (a weight of 2 is twice as big and twice as likely). */
export type Slices = number | readonly number[];

const weightsOf = (slices: Slices): number[] => (typeof slices === "number" ? Array(slices).fill(1) : [...slices]);

/**
 * Where each slice starts, in degrees clockwise from the top, plus where the last one ends (360).
 * Slice i covers [edges[i], edges[i+1]).
 */
export function sliceEdges(slices: Slices): number[] {
  const weights = weightsOf(slices);
  const total = weights.reduce((a, b) => a + b, 0);
  const edges = [0];
  let sum = 0;
  for (const w of weights) {
    sum += w;
    edges.push((sum / total) * 360);
  }
  edges[edges.length - 1] = 360;
  return edges;
}

export function pickIndex(count: number): number {
  return Math.floor(Math.random() * count);
}

/** Choose a slice with probability proportional to its weight. `roll` is a number in [0, 1). */
export function pickWeighted(weights: readonly number[], roll = Math.random()): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let left = roll * total;
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i];
    if (left < 0) return i;
  }
  return weights.length - 1;
}

/**
 * The wheel is rotated clockwise by `rotation`, and the pointer sits at the top.
 * Returns the new absolute rotation that leaves the middle of slice `index`
 * (plus a little jitter, so it never lands dead centre) under the pointer,
 * after at least `minTurns` full spins from `current`.
 */
export function targetRotation(current: number, index: number, slices: Slices, minTurns = 5): number {
  const edges = sliceEdges(slices);
  const width = edges[index + 1] - edges[index];
  const jitter = (Math.random() - 0.5) * width * 0.7;
  const desired = -(edges[index] + width / 2 + jitter);
  const extraTurns = Math.floor(Math.random() * 3);
  return current + (minTurns + extraTurns) * 360 + mod360(desired - current);
}

/** Which slice is under the pointer for a given rotation. */
export function sliceUnderPointer(rotation: number, slices: Slices): number {
  const edges = sliceEdges(slices);
  const angle = mod360(-rotation);
  for (let i = 0; i < edges.length - 1; i++) if (angle < edges[i + 1]) return i;
  return edges.length - 2;
}

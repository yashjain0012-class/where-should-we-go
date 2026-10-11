/**
 * Head-to-head elimination, as an alternative to spinning. Options are shuffled, then paired up; with
 * a number of options that is not a power of two, the extra slots are byes (those options go straight through).
 * Pure functions: every change returns a new bracket.
 */

export interface Match {
  a: string | null;
  b: string | null;
  winner: string | null;
}

export interface Bracket {
  /** rounds[0] is the first round; the last round has one match, the final. */
  rounds: Match[][];
}

export const MIN_ENTRANTS = 2;
export const MAX_ENTRANTS = 16;

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fill in winners that need no vote (a match with a bye) and push every winner into the next round. */
function settle(bracket: Bracket): Bracket {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })));
  for (let r = 0; r < rounds.length; r++) {
    rounds[r].forEach((m, i) => {
      // Only the first round has byes: later on, a missing opponent just means the other match is not decided yet.
      if (r === 0 && m.winner === null && (m.a === null) !== (m.b === null)) m.winner = m.a ?? m.b;
      if (m.winner !== null && r + 1 < rounds.length) {
        const next = rounds[r + 1][Math.floor(i / 2)];
        if (i % 2 === 0) next.a = m.winner;
        else next.b = m.winner;
      }
    });
  }
  return { rounds };
}

export function createBracket(ids: string[], rand: () => number = Math.random): Bracket {
  const n = ids.length;
  if (n < MIN_ENTRANTS || n > MAX_ENTRANTS || new Set(ids).size !== n) throw new Error("A bracket needs 2 to 16 different options.");
  const size = 2 ** Math.ceil(Math.log2(n));
  const seeds: (string | null)[] = shuffle(ids, rand);
  while (seeds.length < size) seeds.push(null);
  // Spread the byes: seed i meets seed (size - 1 - i), so a bye never faces another bye.
  const first: Match[] = [];
  for (let i = 0; i < size / 2; i++) first.push({ a: seeds[i], b: seeds[size - 1 - i], winner: null });
  const rounds: Match[][] = [first];
  for (let m = size / 4; m >= 1; m /= 2) rounds.push(Array.from({ length: m }, () => ({ a: null, b: null, winner: null })));
  return settle({ rounds });
}

export interface Pending {
  round: number;
  index: number;
  a: string;
  b: string;
}

/** The next match that needs a decision, or null when the tournament is over. */
export function nextMatch(bracket: Bracket): Pending | null {
  for (let r = 0; r < bracket.rounds.length; r++) {
    for (let i = 0; i < bracket.rounds[r].length; i++) {
      const m = bracket.rounds[r][i];
      if (m.winner === null && m.a !== null && m.b !== null) return { round: r, index: i, a: m.a, b: m.b };
    }
  }
  return null;
}

/** Record who won the match `nextMatch` returned. Anything else is ignored. */
export function pick(bracket: Bracket, winnerId: string): Bracket {
  const m = nextMatch(bracket);
  if (!m || (winnerId !== m.a && winnerId !== m.b)) return bracket;
  const rounds = bracket.rounds.map((r) => r.map((x) => ({ ...x })));
  rounds[m.round][m.index].winner = winnerId;
  return settle({ rounds });
}

export function champion(bracket: Bracket): string | null {
  return bracket.rounds[bracket.rounds.length - 1][0].winner;
}

/** How many decisions are still needed (byes need none). */
export function votesLeft(bracket: Bracket): number {
  const entrants = bracket.rounds[0].reduce((n, m) => n + (m.a !== null ? 1 : 0) + (m.b !== null ? 1 : 0), 0);
  const total = entrants - 1;
  let done = 0;
  for (const round of bracket.rounds) {
    for (const m of round) if (m.winner !== null && m.a !== null && m.b !== null) done++;
  }
  return Math.max(0, total - done);
}

/** "Quarter-final", "Semi-final", "Final", or "Round 1". */
export function roundName(bracket: Bracket, round: number): string {
  const fromEnd = bracket.rounds.length - 1 - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-final";
  if (fromEnd === 2) return "Quarter-final";
  return `Round ${round + 1}`;
}

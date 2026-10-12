import type { CSSProperties } from "react";
import { sliceEdges } from "@/lib/spin";
import { cssSpinEasing } from "@/lib/ticks";
import type { Place } from "@/lib/types";

export const SLICE_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

const CX = 100;
const CY = 100;
const R = 96;

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(a), y: CY - radius * Math.cos(a) };
}

function slicePath(startDeg: number, endDeg: number): string {
  const p1 = polar(startDeg, R);
  const p2 = polar(endDeg, R);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${R} ${R} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
}

function truncate(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

interface WheelProps {
  places: Place[];
  /** Relative slice sizes, one per place (default: all equal). A favourite gets a bigger slice. */
  weights?: number[];
  rotation: number;
  spinning: boolean;
  durationMs: number;
  /** The slice that was landed on: it bounces (unless reduced motion) and gets an outline. */
  winnerId?: string | null;
}

/** How far (in SVG units) the winning slice pops outward during its bounce. */
const BOUNCE_DISTANCE = 7;

export default function Wheel({ places, weights, rotation, spinning, durationMs, winnerId = null }: WheelProps) {
  const n = places.length;
  const edges = sliceEdges(weights && weights.length === n ? weights : n || 1);
  const fontSize = n <= 4 ? 10 : 8.5;
  const maxChars = Math.floor(62 / (fontSize * 0.55));

  // The winner is drawn last so it sits on top of its neighbours while it bounces.
  const drawOrder = places
    .map((p, i) => ({ place: p, index: i }))
    .sort((a, b) => Number(a.place.id === winnerId) - Number(b.place.id === winnerId));

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
      {/* Fixed pointer */}
      <div
        aria-hidden
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
        style={{
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderTop: "26px solid var(--wheel-pointer, #1e1b4b)",
          filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))",
        }}
      />
      <div
        // The wheel is only ever looked at. Without this, the corners of its (square, rotating) box can sit over the button below it.
        className="pointer-events-none h-full w-full rounded-full shadow-xl ring-8 ring-white"
        style={{
          transform: `rotate(${rotation}deg)`,
          // The same curve lib/ticks.ts uses to time the ticking sound.
          transition: spinning ? `transform ${durationMs}ms ${cssSpinEasing()}` : "none",
          willChange: "transform",
        }}
      >
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          role="img"
          aria-label={
            n ? `Wheel with ${n} options: ${places.map((p) => p.name).join(", ")}` : "Empty wheel"
          }
        >
          {n === 0 && (
            <>
              <circle cx={CX} cy={CY} r={R} fill="#e5e7eb" />
              <text
                x={CX}
                y={CY + 14}
                textAnchor="middle"
                fontSize="44"
                fontWeight="700"
                fill="#9ca3af"
              >
                ?
              </text>
            </>
          )}
          {drawOrder.map(({ place: p, index: i }) => {
            const isWinner = p.id === winnerId;
            // Outward direction of this slice's middle, measured clockwise from the top.
            const mid = (((edges[i] + edges[i + 1]) / 2) * Math.PI) / 180;
            const bounce = isWinner
              ? ({
                  "--dx": `${(Math.sin(mid) * BOUNCE_DISTANCE).toFixed(2)}px`,
                  "--dy": `${(-Math.cos(mid) * BOUNCE_DISTANCE).toFixed(2)}px`,
                } as CSSProperties)
              : undefined;
            return (
              <g key={p.id} className={isWinner ? "slice-bounce" : undefined} style={bounce}>
                {n === 1 ? (
                  <circle cx={CX} cy={CY} r={R} fill={SLICE_COLORS[0]} />
                ) : (
                  <path
                    d={slicePath(edges[i], edges[i + 1])}
                    fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                    style={{ stroke: isWinner ? "var(--wheel-pointer, #1e1b4b)" : "#fff" }}
                    strokeWidth={isWinner ? 2.5 : 1}
                    strokeLinejoin="round"
                  />
                )}
                <text
                  x={CX + 24}
                  y={CY}
                  dominantBaseline="central"
                  fontSize={fontSize}
                  fontWeight="700"
                  fill="#fff"
                  stroke="rgba(0,0,0,.45)"
                  strokeWidth="0.6"
                  paintOrder="stroke"
                  transform={`rotate(${(edges[i] + edges[i + 1]) / 2 - 90} ${CX} ${CY})`}
                >
                  {truncate(p.name, maxChars)}
                </text>
              </g>
            );
          })}
          <circle cx={CX} cy={CY} r="9" fill="#fff" strokeWidth="2" style={{ stroke: "var(--wheel-pointer, #1e1b4b)" }} />
        </svg>
      </div>
    </div>
  );
}

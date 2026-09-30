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
  rotation: number;
  spinning: boolean;
  durationMs: number;
}

export default function Wheel({ places, rotation, spinning, durationMs }: WheelProps) {
  const n = places.length;
  const slice = 360 / Math.max(n, 1);
  const fontSize = n <= 4 ? 10 : 8.5;
  const maxChars = Math.floor(62 / (fontSize * 0.55));

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
          borderTop: "26px solid #1e1b4b",
          filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))",
        }}
      />
      <div
        className="h-full w-full rounded-full shadow-xl ring-8 ring-white"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? `transform ${durationMs}ms cubic-bezier(0.12, 0.6, 0.1, 1)`
            : "none",
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
          {n === 1 && <circle cx={CX} cy={CY} r={R} fill={SLICE_COLORS[0]} />}
          {n > 1 &&
            places.map((p, i) => (
              <path
                key={p.id}
                d={slicePath(i * slice, (i + 1) * slice)}
                fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                stroke="#fff"
                strokeWidth="1"
              />
            ))}
          {n > 0 &&
            places.map((p, i) => (
              <text
                key={`t-${p.id}`}
                x={CX + 24}
                y={CY}
                dominantBaseline="central"
                fontSize={fontSize}
                fontWeight="700"
                fill="#fff"
                stroke="rgba(0,0,0,.45)"
                strokeWidth="0.6"
                paintOrder="stroke"
                transform={`rotate(${(i + 0.5) * slice - 90} ${CX} ${CY})`}
              >
                {truncate(p.name, maxChars)}
              </text>
            ))}
          <circle cx={CX} cy={CY} r="9" fill="#fff" stroke="#1e1b4b" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

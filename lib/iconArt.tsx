/** The app icon, drawn as an SVG so it renders the same everywhere (no fonts or emoji needed). Used by next/og ImageResponse. */

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

function wedge(i: number, n: number, r: number): string {
  const a1 = ((i / n) * 360 * Math.PI) / 180;
  const a2 = (((i + 1) / n) * 360 * Math.PI) / 180;
  const p = (a: number) => `${(100 + r * Math.sin(a)).toFixed(2)} ${(100 - r * Math.cos(a)).toFixed(2)}`;
  return `M 100 100 L ${p(a1)} A ${r} ${r} 0 0 1 ${p(a2)} Z`;
}

/**
 * `safe` is the fraction of the icon the artwork may use. Maskable icons need it small (about 0.62),
 * because the operating system crops them to a circle or rounded square.
 */
export function WheelIcon({ size, safe = 0.86, rounded = true }: { size: number; safe?: number; rounded?: boolean }) {
  const artwork = Math.round(size * safe);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1b4b",
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}
    >
      <svg width={artwork} height={artwork} viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="98" fill="#ffffff" />
        {COLORS.map((color, i) => (
          <path key={color} d={wedge(i, COLORS.length, 92)} fill={color} stroke="#ffffff" strokeWidth="2" />
        ))}
        <circle cx="100" cy="100" r="16" fill="#ffffff" stroke="#1e1b4b" strokeWidth="4" />
        <path d="M 100 30 L 84 2 L 116 2 Z" fill="#ffffff" stroke="#1e1b4b" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

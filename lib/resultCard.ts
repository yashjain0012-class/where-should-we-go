import { wrapLines } from "./textWrap";

/** A picture of the result to send to friends: "Let's go to ...", drawn on a canvas in the browser. Nothing is uploaded. */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface CardContent {
  /** The small line above the name, e.g. "Let's go to". */
  heading: string;
  name: string;
  /** Short facts under the name (cuisine, walking time...). At most 3 are drawn. */
  details: string[];
  /** The slice colours, drawn as a little wheel. */
  colors: string[];
  /** Shown at the bottom, e.g. the site's address. */
  footer: string;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, colors: string[]) {
  ctx.save();
  ctx.shadowColor = "rgba(30, 27, 75, 0.25)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  colors.forEach((color, i) => {
    const a1 = (i / colors.length) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / colors.length) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a1, a2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#1e1b4b";
  ctx.stroke();
  // the pointer
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius + 36);
  ctx.lineTo(cx - 26, cy - radius - 26);
  ctx.lineTo(cx + 26, cy - radius - 26);
  ctx.closePath();
  ctx.fillStyle = "#1e1b4b";
  ctx.fill();
}

/** Draw the card onto a canvas that is already CARD_WIDTH by CARD_HEIGHT. */
export function drawCard(ctx: CanvasRenderingContext2D, content: CardContent): void {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#fde68a");
  bg.addColorStop(0.5, "#fbcfe8");
  bg.addColorStop(1, "#c7d2fe");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawWheel(ctx, W / 2, 360, 250, content.colors);

  // the white card
  const cardY = 700;
  ctx.save();
  ctx.shadowColor = "rgba(30, 27, 75, 0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#1e1b4b";
  roundedRect(ctx, 80, cardY, W - 160, 470, 48);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#c7d2fe";
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(content.heading.toUpperCase().split("").join(" "), W / 2, cardY + 88);

  // the name: as large as fits in three lines
  const maxWidth = W - 160 - 120;
  let size = 108;
  let lines: string[] = [];
  for (; size >= 56; size -= 6) {
    ctx.font = `800 ${size}px ${FONT}`;
    lines = wrapLines(content.name, maxWidth, (s) => ctx.measureText(s).width, 3);
    const fits = lines.every((l) => ctx.measureText(l).width <= maxWidth) && !lines[lines.length - 1].endsWith("…");
    if (fits) break;
  }
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  const lineHeight = size * 1.12;
  const blockTop = cardY + 120;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, blockTop + size * 0.9 + i * lineHeight));

  ctx.fillStyle = "#c7d2fe";
  ctx.font = `500 38px ${FONT}`;
  const detailTop = blockTop + lines.length * lineHeight + 40;
  content.details.slice(0, 3).forEach((d, i) => {
    const [text] = wrapLines(d, maxWidth, (s) => ctx.measureText(s).width, 1);
    ctx.fillText(text ?? "", W / 2, detailTop + i * 54);
  });

  ctx.fillStyle = "#1e1b4b";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(content.footer, W / 2, H - 70);
}

/** The card as a PNG. Rejects if the browser cannot make one. */
export function renderCard(content: CardContent): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no canvas"));
  drawCard(ctx, content);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

export type CardOutcome = "shared" | "saved" | "cancelled";

/** Open the share sheet with the picture where the device allows it, otherwise download it. */
export async function shareOrSaveCard(blob: Blob, fileName: string, text: string): Promise<CardOutcome> {
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Where should we go?", text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Fall through to a download if sharing failed for another reason.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

/** "Café Nöir!" becomes "where-should-we-go-cafe-noir.png". */
export function cardFileName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `where-should-we-go-${slug || "result"}.png`;
}

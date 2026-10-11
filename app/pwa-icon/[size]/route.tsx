import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { WheelIcon } from "@/lib/iconArt";

/** The installable app's icons: 192 and 512 pixels, plus a "maskable" 512 with extra padding for round and squircle masks. */
const ICONS: Record<string, { px: number; safe: number; rounded: boolean }> = {
  "192": { px: 192, safe: 0.86, rounded: true },
  "512": { px: 512, safe: 0.86, rounded: true },
  maskable: { px: 512, safe: 0.6, rounded: false },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const icon = ICONS[size];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<WheelIcon size={icon.px} safe={icon.safe} rounded={icon.rounded} />, {
    width: icon.px,
    height: icon.px,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

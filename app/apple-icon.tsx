import { ImageResponse } from "next/og";
import { WheelIcon } from "@/lib/iconArt";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS rounds the corners itself.
  return new ImageResponse(<WheelIcon size={180} safe={0.8} rounded={false} />, size);
}

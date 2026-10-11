import { ImageResponse } from "next/og";
import { WheelIcon } from "@/lib/iconArt";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<WheelIcon size={64} safe={0.94} />, size);
}

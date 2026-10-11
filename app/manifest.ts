import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Where should we go?",
    short_name: "Where to?",
    description: "Spin the wheel to decide where to eat, drink or hang out nearby, or spin your own list.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fde68a",
    theme_color: "#1e1b4b",
    categories: ["food", "lifestyle", "utilities"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Homeward",
    short_name: "Homeward",
    description: "Local-first family AI. Open chat on this house Wi‑Fi.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
  };
}

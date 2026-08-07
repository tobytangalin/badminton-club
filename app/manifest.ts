import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Social & Badminton Club",
    short_name: "Badminton Club",
    description: "Social & Badminton Club sessions, sign-ups and player rankings.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0d9488",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

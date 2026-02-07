import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#13c8ec",
        "primary-dark": "#0e9ab6",
        "background-light": "#f6f8f8",
        "background-dark": "#0f172a",
        "surface-dark": "#1e293b",
        "surface-darker": "#111827",
        danger: "#ef4444",
        warning: "#f59e0b",
        success: "#10b981",
      },
      fontFamily: {
        display: ["Space Grotesk", "Noto Sans SC", "sans-serif"],
        body: ["IBM Plex Sans", "Noto Sans SC", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
} satisfies Config;


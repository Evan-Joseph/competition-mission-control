import type { Config } from "tailwindcss";

// Tailwind config is loaded by Node (tailwindcss/jiti) even though this is TS.
// Avoid pulling in Node typings just for `require`.
declare const require: any;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#196ee6",
        "primary-dark": "#155cc0",
        "background-light": "#f6f8f8",
        "background-dark": "#111821",
        "surface-dark": "#1e293b",
        "surface-darker": "#111827",
        "border-dark": "#2a3b55",
        "text-secondary": "#93a9c8",
        danger: "#ef4444",
        warning: "#f59e0b",
        success: "#10b981",
      },
      fontFamily: {
        display: ["Inter", "Noto Sans SC", "sans-serif"],
        body: ["Inter", "Noto Sans SC", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
} satisfies Config;

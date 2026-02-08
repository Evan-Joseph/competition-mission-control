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
        // V3 tokens (Stitch prototype baseline)
        primary: "#2beead",
        "primary-dark": "#25dcb0",
        // Light token kept for legacy `bg-background-light dark:bg-background-dark` usage.
        "background-light": "#f6f8f7",

        // Theme-aware tokens (use CSS vars to make theme switching real).
        "background-dark": "rgb(var(--v3-bg) / <alpha-value>)",
        "panel-dark": "rgb(var(--v3-panel) / <alpha-value>)",
        "surface-dark": "rgb(var(--v3-surface) / <alpha-value>)",
        "surface-dark-alt": "rgb(var(--v3-surface-alt) / <alpha-value>)",
        "border-dark": "rgb(var(--v3-border) / <alpha-value>)",
        "text-secondary": "rgb(var(--v3-muted) / <alpha-value>)",
        "text-tertiary": "rgb(var(--v3-muted2) / <alpha-value>)",

        // Legacy token kept for backwards compatibility while V2 -> V3 refactor is in progress.
        "surface-darker": "rgb(var(--v3-surface-darker) / <alpha-value>)",
        danger: "#ef4444",
        warning: "#f59e0b",
        success: "#10b981",
        info: "#3b82f6",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "Noto Sans SC", "sans-serif"],
        body: ["Plus Jakarta Sans", "Noto Sans SC", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out forwards",
        "slide-in-right": "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-in-left": "slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        slideInLeft: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      borderRadius: {
        lg: "1rem",
        xl: "1.5rem",
      },
      boxShadow: {
        "glow-primary": "0 0 20px rgba(43, 238, 173, 0.18)",
        "glow-primary-sm": "0 0 12px rgba(43, 238, 173, 0.14)",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
} satisfies Config;

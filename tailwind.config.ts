import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#FAF6EE",
          warm: "#F4EEDF",
          deep: "#E8DFC9",
        },
        ink: {
          DEFAULT: "#1A1714",
          soft: "#3D3733",
          muted: "#6B635B",
          faint: "#A39A8E",
        },
        accent: {
          DEFAULT: "#7A1B1B",
          deep: "#5A1414",
          soft: "#A85050",
        },
        rule: "#D9CFB8",
      },
      fontFamily: {
        serif: ['"Source Serif 4"', '"Source Serif Pro"', "Charter", "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#1A1714",
            maxWidth: "none",
          },
        },
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out forwards",
        "soft-pulse": "pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

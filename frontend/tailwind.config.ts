import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#0d0a19",
        graphite: "#262238",
        mist: "#f5f7fa",
        brand: {
          DEFAULT: "#070021",
          hover: "#17243b",
          soft: "#edf1f6"
        },
        accent: {
          DEFAULT: "#070021",
          hover: "#17243b",
          soft: "#edf1f6"
        }
      }
    }
  },
  plugins: []
} satisfies Config;

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
        mist: "#f6f7fb",
        brand: {
          DEFAULT: "#070021",
          hover: "#12083e",
          soft: "#f0eff8"
        },
        accent: {
          DEFAULT: "#070021",
          hover: "#12083e",
          soft: "#f0eff8"
        }
      }
    }
  },
  plugins: []
} satisfies Config;

import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1280px"
      }
    },
    extend: {
      colors: {
        primary: "#0066CC",
        secondary: "#00A3E0",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        grayText: "#6B7280"
      },
      borderRadius: {
        lg: "0.5rem"
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0,0,0,0.05)"
      },
      fontFamily: {
        inter: ["var(--font-inter)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")]
}

export default config

import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        darkBg: "var(--color-bg-dark)",
        surface: "var(--color-surface)",
        overlay: "var(--color-overlay)"
      },
      fontFamily: {
        nunito: ['Nunito', 'sans-serif'],
        // font-ui  → Be Vietnam Pro (UI text, label, button)
        ui: ["var(--font-ui)", "Be Vietnam Pro", "Arial", "sans-serif"],
        // font-score → Barlow Condensed (điểm số, đồng hồ, mã)
        score: ["var(--font-score)", "Barlow Condensed", "Arial", "sans-serif"],
      },
      fontSize: {
        // Giữ lại alias cũ để không break code cũ
        largeScore: "4rem",
        caption: "0.8rem",
        // Thêm alias mới theo scale
        score: "var(--text-score)",
        clock: "var(--text-clock)",
        heading: "var(--text-heading)",
        micro: "var(--text-micro)",
      },
      fontWeight: {
        light: "300",
        regular: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      borderRadius: {
        medium: "var(--border-radius-medium)"
      },
      opacity: {
        medium: "0.5",
      },
    },
  },
  plugins: [],
} satisfies Config;
import type { Config } from "tailwindcss";

/**
 * @file tailwind.config.ts
 * @description Configuración de estilos y tokens visuales de Tailwind CSS.
 * Idéntica a la del sistema anterior para no cambiar la apariencia (paleta oscura industrial).
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#020617",
        surface: "#0f172a",
        card: "#1e293b",
        border: "#334155",
        accent: {
          emerald: "#10b981",
          rose: "#f43f5e",
          amber: "#f59e0b",
          cyan: "#06b6d4",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;

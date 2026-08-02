/**
 * @file layout.tsx
 * @description Diseño principal raíz de la aplicación web Next.js con modo oscuro por defecto.
 */

import React from "react";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

export const metadata = {
  title: "Shiitake-Lindo | Control Automatizado de Invernadero",
  description: "Plataforma industrial de monitoreo de humedad, temperatura y CO2 para invernaderos de Shiitake-Lindo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

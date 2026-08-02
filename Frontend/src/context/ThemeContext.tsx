"use client";

/**
 * @file ThemeContext.tsx
 * @description Proveedor de contexto para alternar entre Modo Oscuro Industrial y Modo Claro,
 * con persistencia en localStorage y sincronización con Tailwind CSS (class dark en <html>).
 */

import React, { createContext, useContext, useEffect, useState } from "react";

type TipoTema = "dark" | "light";

interface ContextoTema {
  tema: TipoTema;
  alternarTema: () => void;
}

const ThemeContext = createContext<ContextoTema>({
  tema: "dark",
  alternarTema: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<TipoTema>("dark");

  useEffect(() => {
    const guardado = localStorage.getItem("shiitake_tema") as TipoTema;
    if (guardado === "light" || guardado === "dark") {
      setTema(guardado);
      document.documentElement.classList.toggle("dark", guardado === "dark");
    } else {
      document.documentElement.classList.add("dark");
      setTema("dark");
    }
  }, []);

  const alternarTema = () => {
    const nuevoTema = tema === "dark" ? "light" : "dark";
    setTema(nuevoTema);
    localStorage.setItem("shiitake_tema", nuevoTema);
    document.documentElement.classList.toggle("dark", nuevoTema === "dark");
  };

  return (
    <ThemeContext.Provider value={{ tema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
}

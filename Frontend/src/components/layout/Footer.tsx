"use client";

import React from "react";

/**
 * @file Footer.tsx
 * @description Pie de página con créditos y año actual dinámico.
 */
export function Footer() {
  const anioActual = new Date().getFullYear();

  return (
    <footer className="w-full py-4 px-6 mt-auto border-t border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/60 backdrop-blur-md text-center text-xs font-mono text-slate-600 dark:text-slate-400 transition-colors duration-300 pb-20 md:pb-4">
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        <span className="font-medium tracking-wide">Desarrollado por German Marambio ©</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">{anioActual}</span>
      </div>
    </footer>
  );
}

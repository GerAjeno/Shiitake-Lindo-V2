"use client";

/**
 * @file Switch.tsx
 * @description Switch clásico (track + perilla deslizante) reusado donde antes había botones de
 * encendido/apagado con ícono — override manual en Configuración, activar/suspender en Usuarios.
 */

import React from "react";

interface Props {
  activo: boolean;
  disabled?: boolean;
  cargando?: boolean;
  onClick: () => void;
}

export function Switch({ activo, disabled, cargando, onClick }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={disabled || cargando}
      onClick={onClick}
      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        activo ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
          activo ? "translate-x-8" : "translate-x-1"
        } ${cargando ? "animate-pulse" : ""}`}
      />
    </button>
  );
}

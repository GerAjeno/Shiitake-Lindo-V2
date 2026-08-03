"use client";

/**
 * @file SystemStatusCard.tsx
 * @description Tarjeta de estado de los actuadores (relés) y conectividad del controlador.
 * Reconstruida a partir del sistema anterior (mismo diseño visual, datos desde el backend nuevo).
 */

import React from "react";
import { Power, Sliders, Wifi, Radio } from "lucide-react";
import type { TelemetriaActual } from "@shared/types";

interface Props {
  actual: TelemetriaActual | null;
  espOnline?: boolean;
  ultimaTelemetriaTs?: number | null;
}

function etiquetaModo(modo?: string) {
  if (modo === "TEMPORIZADO") return "TEMPORIZADO";
  if (modo === "AUTO") return "AUTOMÁTICO";
  return "MANUAL";
}

export function SystemStatusCard({ actual, espOnline = true, ultimaTelemetriaTs }: Props) {
  if (!actual) return null;

  return (
    <div className="p-6 glass-panel">
      <h3 className="text-sm font-bold tracking-wider text-slate-800 dark:text-slate-200 uppercase mb-4 pb-3 border-b border-slate-200 dark:border-slate-800/80 flex items-center gap-2 font-mono">
        <Radio className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Estado de Hardware y Actuadores
      </h3>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-mono mb-2">
            <Power className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Relé 1 (Atriles)
          </div>
          <div className={`text-sm md:text-base font-extrabold font-mono ${actual.atriles?.estadoHumidificador ? "text-cyan-600 dark:text-cyan-400 animate-pulse" : "text-slate-500 dark:text-slate-400"}`}>
            {actual.atriles?.estadoHumidificador ? "ENCENDIDO (ON)" : "APAGADO (OFF)"}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-mono mb-2">
            <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Modo Atriles
          </div>
          <div className="text-sm md:text-base font-extrabold font-mono text-cyan-700 dark:text-cyan-300">
            {etiquetaModo(actual.atriles?.modoControl)}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-mono mb-2">
            <Power className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Relé 2 (Descanso)
          </div>
          <div className={`text-sm md:text-base font-extrabold font-mono ${actual.descanso?.estadoHumidificador ? "text-emerald-600 dark:text-emerald-400 animate-pulse" : "text-slate-500 dark:text-slate-400"}`}>
            {actual.descanso?.estadoHumidificador ? "ENCENDIDO (ON)" : "APAGADO (OFF)"}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-mono mb-2">
            <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Modo Descanso
          </div>
          <div className="text-sm md:text-base font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
            {etiquetaModo(actual.descanso?.modoControl)}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-mono mb-2">
            <Wifi className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Red Microcontrolador
          </div>
          <div className={`text-sm font-bold font-mono truncate ${!espOnline ? "text-rose-500 dark:text-rose-400 animate-pulse" : "text-slate-800 dark:text-slate-200"}`}>
            {!espOnline ? "⚠️ DESCONECTADO" : (actual.estadoWifi ? String(actual.estadoWifi) : "Conectado")}
          </div>
          <span className={`text-[10px] font-mono ${!espOnline ? "text-rose-500" : "text-slate-500"}`}>
            {!espOnline ? "Sin señal >60s" : `${actual.rssiWifi ?? "-65"} dBm RSSI`}
          </span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-mono mb-2">
            <span>Sincronización</span>
          </div>
          <div className={`text-xs font-mono ${!espOnline ? "text-rose-500 dark:text-rose-400 font-bold" : "text-slate-800 dark:text-slate-300"}`}>
            {ultimaTelemetriaTs ? new Date(ultimaTelemetriaTs).toLocaleTimeString("es-CL", { timeZone: "America/Santiago" }) : "En vivo"}
          </div>
          <span className={`text-[10px] font-mono ${!espOnline ? "text-rose-500 font-bold" : "text-emerald-600 dark:text-emerald-400"}`}>
            {!espOnline ? "Pérdida de latido" : "Latido c/30s"}
          </span>
        </div>
      </div>
    </div>
  );
}

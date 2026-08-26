"use client";

/**
 * @file Header.tsx
 * @description Barra superior con indicador de conectividad al backend y latido del controlador.
 */

import { Wifi, WifiOff, Cpu, Clock, Server, ShieldCheck, LogOut, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { ShiitakeLogo } from "@/components/icons/ShiitakeLogo";

interface PropsHeader {
  conectadoRTDB: boolean; // conexión WebSocket con el backend (nombre histórico conservado)
  espOnline?: boolean;
  horaDispositivo?: string; // ISO 8601 UTC, reloj del propio ESP32 — visible para admin y operador
  horaServidor?: string; // ISO 8601 UTC, hora del backend al recibir la última telemetría — solo se muestra a admin
}

const FORMATO_HORA: Intl.DateTimeFormatOptions = {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

export function Header({ conectadoRTDB, espOnline = false, horaDispositivo, horaServidor }: PropsHeader) {
  const { usuario, rol, cerrarSesion } = useAuth();
  const { tema, alternarTema } = useTheme();

  return (
    <header className="h-16 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-3 md:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors duration-300">
      <div className="flex items-center gap-2.5 md:gap-4">
        <div className="md:hidden p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
          <ShiitakeLogo className="w-5 h-5 animate-pulse" />
        </div>
        <h2 className="text-xs md:text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-200 uppercase font-mono truncate max-w-[140px] sm:max-w-none">
          <span className="hidden md:inline">Invernadero Principal</span>
          <span className="md:hidden">Shiitake IoT</span>
        </h2>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-mono border ${
          conectadoRTDB
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
        }`}>
          {conectadoRTDB ? <Wifi className="w-3 md:w-3.5 h-3 md:h-3.5 animate-pulse shrink-0" /> : <WifiOff className="w-3 md:w-3.5 h-3 md:h-3.5 shrink-0" />}
          <span className="hidden sm:inline">{conectadoRTDB ? "SERVIDOR CONECTADO" : "SERVIDOR DESCONECTADO"}</span>
          <span className="sm:hidden">{conectadoRTDB ? "SRV OK" : "SRV OFF"}</span>
        </div>

        <div className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-mono border ${
          espOnline
            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400"
            : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
        }`}>
          <Cpu className="w-3 md:w-3.5 h-3 md:h-3.5 shrink-0" />
          <span className="hidden sm:inline">{espOnline ? "CONTROLADOR ONLINE" : "CONTROLADOR OFFLINE"}</span>
          <span className="sm:hidden">{espOnline ? "ESP OK" : "ESP OFF"}</span>
        </div>

        {(rol === "admin" || rol === "operador") && horaDispositivo && (
          <div
            title="Hora del reloj del ESP32 (RTC/NTP)"
            className="hidden md:flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-mono border bg-slate-500/10 border-slate-400/30 text-slate-600 dark:text-slate-400"
          >
            <Clock className="w-3 md:w-3.5 h-3 md:h-3.5 shrink-0" />
            <span className="opacity-60">ESP</span>
            <span>{new Date(horaDispositivo).toLocaleString("es-CL", FORMATO_HORA)}</span>
          </div>
        )}

        {rol === "admin" && horaServidor && (
          <div
            title="Hora del servidor al recibir la última telemetría — solo visible para administradores"
            className="hidden md:flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-mono border bg-violet-500/10 border-violet-400/30 text-violet-600 dark:text-violet-400"
          >
            <Server className="w-3 md:w-3.5 h-3 md:h-3.5 shrink-0" />
            <span className="opacity-60">SRV</span>
            <span>{new Date(horaServidor).toLocaleString("es-CL", FORMATO_HORA)}</span>
          </div>
        )}

        <button
          onClick={alternarTema}
          title={tema === "dark" ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
          className="p-1.5 md:p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-amber-500 dark:text-amber-400 hover:scale-105 transition-all shadow-sm shrink-0"
        >
          {tema === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>{usuario?.email || "Operador IoT"}</span>
        </div>

        <button
          onClick={cerrarSesion}
          title="Cerrar Sesión"
          className="md:hidden p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 hover:bg-rose-500/20 transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

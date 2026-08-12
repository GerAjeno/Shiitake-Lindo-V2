"use client";

/**
 * @file ZoneCard.tsx
 * @description Tarjeta visual Glassmorphism para el monitoreo completo y control de una zona
 * (Atriles / Descanso). Reconstruida a partir del sistema anterior — mismo diseño visual, con el
 * control manual del humidificador (confirmado por ACK real del ESP32, nunca éxito optimista).
 */

import React, { useState } from "react";
import type { TelemetriaZona, ConfiguracionZona } from "@shared/types";
import { Droplets, Thermometer, Wind, Power, Sliders, CheckCircle2, AlertTriangle, CircleAlert } from "lucide-react";

interface PropsTarjetaZona {
  nombreZona: string;
  subtitulo: string;
  telemetria?: TelemetriaZona;
  configuracion?: ConfiguracionZona;
  sensoresNombres: string[];
  co2Deshabilitado?: boolean;
  colorTema?: "cyan" | "emerald";
  puedeControlar: boolean;
  onToggleHumidificador: (encender: boolean) => Promise<void>;
}

export function ZoneCard({
  nombreZona,
  subtitulo,
  telemetria,
  configuracion,
  sensoresNombres,
  co2Deshabilitado = false,
  colorTema = "cyan",
  puedeControlar,
  onToggleHumidificador,
}: PropsTarjetaZona) {
  const [enviando, setEnviando] = useState(false);
  const [ultimoError, setUltimoError] = useState<string | null>(null);

  const humPromedio = telemetria && telemetria.humedadPromedio !== null ? telemetria.humedadPromedio.toFixed(1) : "--";
  const tempPromedio = telemetria && telemetria.temperaturaPromedio !== null ? telemetria.temperaturaPromedio.toFixed(1) : "--";

  const releEncendido = telemetria?.estadoHumidificador || false;
  const modoTexto = telemetria?.modoControl === "TEMPORIZADO" ? "TEMP" : telemetria?.modoControl === "AUTO" ? "AUTO" : "MANUAL";

  const falloDHT = telemetria?.falloCriticoDHT || false;

  const humMin = configuracion?.humedadMinima ?? 75;
  const humMax = configuracion?.humedadMaxima ?? 85;

  const puedeClickear = puedeControlar && telemetria?.modoControl === "MANUAL" && !enviando;

  const manejarToggle = async () => {
    if (!puedeClickear) return;
    setEnviando(true);
    setUltimoError(null);
    try {
      await onToggleHumidificador(!releEncendido);
    } catch (e) {
      setUltimoError("Error al enviar el comando.");
    } finally {
      setEnviando(false);
    }
  };

  const colorBorde =
    colorTema === "cyan"
      ? "border-cyan-500/40 hover:border-cyan-500/80 from-cyan-500/5 via-white to-slate-50 dark:from-cyan-950/30 dark:via-slate-900 dark:to-slate-950"
      : "border-emerald-500/40 hover:border-emerald-500/80 from-emerald-500/5 via-white to-slate-50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-950";

  const badgeColor =
    colorTema === "cyan"
      ? "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30"
      : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30";

  return (
    <div className={`p-6 md:p-8 glass-panel bg-gradient-to-br ${colorBorde} border transition-all duration-300 hover:shadow-2xl relative overflow-hidden group rounded-2xl`}>
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-emerald-500/5 dark:bg-white/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 dark:group-hover:bg-white/10 transition-all pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 font-sans">{nombreZona}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono border ${badgeColor}`}>{modoTexto}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">{subtitulo}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 self-start sm:self-auto">
          <button
            onClick={manejarToggle}
            disabled={!puedeClickear}
            title={telemetria?.modoControl !== "MANUAL" ? "Cambia a modo MANUAL en Configuración para controlar directamente" : ""}
            className={`flex flex-1 w-full sm:w-auto items-center gap-3 bg-slate-100 dark:bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner transition-opacity ${
              puedeClickear ? "cursor-pointer hover:border-emerald-500/50" : "cursor-default opacity-90"
            }`}
          >
            <Power className={`w-5 h-5 ${releEncendido ? "text-emerald-600 dark:text-emerald-400 animate-pulse" : "text-slate-400 dark:text-slate-500"}`} />
            <div className="text-left">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Humidificador</div>
              <div className={`text-sm font-extrabold font-mono ${releEncendido ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                {enviando ? "Enviando..." : releEncendido ? "ON" : "OFF"} <span className="text-[10px] font-normal opacity-70">({modoTexto})</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      {ultimoError && (
        <div className="mb-4 flex items-center gap-2 text-rose-400 text-[11px] font-mono">
          <CircleAlert className="w-3.5 h-3.5" /> {ultimoError}
        </div>
      )}

      {falloDHT && (
        <div className="mb-6 p-3 rounded-xl bg-rose-950/80 border border-rose-500/80 flex items-center gap-3 text-rose-200 text-xs font-mono shadow-lg animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>Atención: Fallo en los sensores ({sensoresNombres.join(", ")}). El control automático está suspendido temporalmente por seguridad.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Humedad Promedio
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 my-2">
            <span className="text-3xl lg:text-4xl font-extrabold text-slate-800 dark:text-slate-100 font-sans tracking-tight">{humPromedio}</span>
            <span className="text-lg font-bold text-slate-500 dark:text-slate-400 font-mono">% RH</span>
          </div>
          <div className="text-[11px] font-mono text-cyan-700 dark:text-cyan-300/80 border-t border-slate-200 dark:border-slate-800/60 pt-2 mt-1">
            Banda de Trabajo: {humMin}% (ON) - {humMax}% (OFF)
          </div>
        </div>

        <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Temperatura
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 my-2">
            <span className="text-3xl lg:text-4xl font-extrabold text-slate-800 dark:text-slate-100 font-sans tracking-tight">{tempPromedio}</span>
            <span className="text-lg font-bold text-slate-500 dark:text-slate-400 font-mono">°C</span>
          </div>
        </div>

        <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Wind className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Calidad de Aire
            </span>
          </div>
          <div className="my-2">
            <span className="text-2xl lg:text-3xl font-extrabold text-slate-800 dark:text-slate-100 font-sans tracking-tight">
              {co2Deshabilitado ? "Inactivo" : telemetria?.calidadAire || "Bajo"}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/60 pt-2 mt-1">
            {co2Deshabilitado ? "CO2 Deshabilitado" : `Tendencia: ${telemetria?.tendenciaAire || "Estable"}`}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800/60">
        <span className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-slate-500" />
          <span>
            Sensores asignados: <strong className="text-slate-800 dark:text-slate-300">{sensoresNombres.join(" + ")}</strong>
          </span>
        </span>
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> Promedio dual activo
        </span>
      </div>
    </div>
  );
}

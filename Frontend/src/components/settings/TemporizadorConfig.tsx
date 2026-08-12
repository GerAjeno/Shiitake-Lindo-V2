"use client";

/**
 * @file TemporizadorConfig.tsx
 * @description Editor visual de bloques horarios para el modo TEMPORIZADO — agregar, eliminar y
 * alternar habilitación de rangos, con indicación de trasnoche (cruce de medianoche). Solo edita
 * el estado local recibido por props; el guardado real ocurre al presionar "Guardar" en la página.
 */

import React, { useState } from "react";
import { Clock, Plus, Trash2, Moon, Sun, CheckCircle2, Circle } from "lucide-react";
import type { RangoHorario } from "@shared/types";

interface Props {
  nombreZona: string;
  colorTema: "cyan" | "emerald";
  rangos: RangoHorario[];
  soloLectura: boolean;
  onCambiarRangos: (nuevosRangos: RangoHorario[]) => void;
}

export function TemporizadorConfig({ nombreZona, colorTema, rangos = [], soloLectura, onCambiarRangos }: Props) {
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("10:00");
  const [error, setError] = useState<string | null>(null);

  const colorBorde = colorTema === "cyan" ? "border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-950/20" : "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20";
  const colorTexto = colorTema === "cyan" ? "text-cyan-600 dark:text-cyan-400" : "text-emerald-600 dark:text-emerald-400";
  const colorBoton = colorTema === "cyan" ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950";

  const esTrasnoche = (ini: string, fin: string) => {
    const [hIni, mIni] = ini.split(":").map(Number);
    const [hFin, mFin] = fin.split(":").map(Number);
    return hIni * 60 + mIni > hFin * 60 + mFin;
  };

  const agregarRango = () => {
    setError(null);
    if (!horaInicio || !horaFin) {
      setError("Debe especificar hora de inicio y hora de fin.");
      return;
    }
    if (horaInicio === horaFin) {
      setError("La hora de inicio y fin no pueden ser idénticas.");
      return;
    }
    const nuevoRango: RangoHorario = { id: `rango_${Date.now()}`, inicio: horaInicio, fin: horaFin, habilitado: true };
    onCambiarRangos([...rangos, nuevoRango]);
  };

  const eliminarRango = (id: string) => onCambiarRangos(rangos.filter((r) => r.id !== id));
  const alternarHabilitado = (id: string) => onCambiarRangos(rangos.map((r) => (r.id === id ? { ...r, habilitado: !r.habilitado } : r)));

  return (
    <div className={`p-5 rounded-2xl border ${colorBorde} space-y-5 transition-colors duration-300`}>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Clock className={`w-5 h-5 ${colorTexto}`} />
          <h4 className="text-sm font-bold font-mono uppercase text-slate-800 dark:text-slate-200">Horarios Programados ({nombreZona})</h4>
        </div>
        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm">
          Hora Oficial: Santiago de Chile (UTC-4 / UTC-3)
        </span>
      </div>

      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
        {rangos.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 font-mono text-xs">
            No hay bloques horarios configurados para esta área.
            <br /> El humidificador permanecerá apagado en modo temporizado.
          </div>
        ) : (
          rangos.map((rango) => {
            const trasnoche = esTrasnoche(rango.inicio, rango.fin);
            return (
              <div
                key={rango.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  rango.habilitado
                    ? "bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700 shadow-md"
                    : "bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/60 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={soloLectura}
                    onClick={() => alternarHabilitado(rango.id)}
                    className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors disabled:cursor-not-allowed"
                    title={rango.habilitado ? "Desactivar bloque" : "Activar bloque"}
                  >
                    {rango.habilitado ? <CheckCircle2 className={`w-5 h-5 ${colorTexto}`} /> : <Circle className="w-5 h-5 text-slate-400 dark:text-slate-600" />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2 font-mono font-extrabold text-sm md:text-base text-slate-800 dark:text-slate-100">
                      <span>{rango.inicio} hrs</span>
                      <span className="text-slate-400 dark:text-slate-500">➔</span>
                      <span>{rango.fin} hrs</span>
                      {trasnoche ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 font-sans font-medium" title="Cruza la medianoche hasta el día siguiente">
                          <Moon className="w-3 h-3 text-purple-600 dark:text-purple-400" /> Trasnoche (+1 día)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-sans font-medium">
                          <Sun className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Mismo día
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                      Estado: <strong className={rango.habilitado ? colorTexto : "text-slate-500"}>{rango.habilitado ? "ACTIVO" : "DESHABILITADO"}</strong>
                    </div>
                  </div>
                </div>

                {!soloLectura && (
                  <button
                    type="button"
                    onClick={() => eliminarRango(rango.id)}
                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                    title="Eliminar bloque horario"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {!soloLectura && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
          <label className="text-xs font-mono uppercase text-slate-700 dark:text-slate-300 block font-bold">➕ Agregar Nuevo Bloque Horario (24 Hrs / Militar)</label>
          {error && (
            <div className="p-2.5 bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-700 dark:text-rose-300 text-xs font-mono">⚠️ {error}</div>
          )}
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
              <div className="flex items-center justify-between bg-white dark:bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-800 shadow-sm min-w-0">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 font-bold shrink-0">Inicio:</span>
                <div className="flex items-center gap-1 font-mono text-xs sm:text-sm">
                  <select
                    value={horaInicio.split(":")[0] || "08"}
                    onChange={(e) => setHoraInicio(`${e.target.value}:${horaInicio.split(":")[1] || "00"}`)}
                    className="bg-transparent text-slate-800 dark:text-slate-100 font-bold focus:outline-none cursor-pointer p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")).map((h) => (
                      <option key={`ini-h-${h}`} value={h} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">{h}</option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-bold">:</span>
                  <select
                    value={horaInicio.split(":")[1] || "00"}
                    onChange={(e) => setHoraInicio(`${horaInicio.split(":")[0] || "08"}:${e.target.value}`)}
                    className="bg-transparent text-slate-800 dark:text-slate-100 font-bold focus:outline-none cursor-pointer p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map((m) => (
                      <option key={`ini-m-${m}`} value={m} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">{m}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-mono text-slate-400 ml-0.5">hrs</span>
                </div>
              </div>
              <div className="flex items-center justify-between bg-white dark:bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-800 shadow-sm min-w-0">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 font-bold shrink-0">Fin:</span>
                <div className="flex items-center gap-1 font-mono text-xs sm:text-sm">
                  <select
                    value={horaFin.split(":")[0] || "10"}
                    onChange={(e) => setHoraFin(`${e.target.value}:${horaFin.split(":")[1] || "00"}`)}
                    className="bg-transparent text-slate-800 dark:text-slate-100 font-bold focus:outline-none cursor-pointer p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")).map((h) => (
                      <option key={`fin-h-${h}`} value={h} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">{h}</option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-bold">:</span>
                  <select
                    value={horaFin.split(":")[1] || "00"}
                    onChange={(e) => setHoraFin(`${horaFin.split(":")[0] || "10"}:${e.target.value}`)}
                    className="bg-transparent text-slate-800 dark:text-slate-100 font-bold focus:outline-none cursor-pointer p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map((m) => (
                      <option key={`fin-m-${m}`} value={m} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">{m}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-mono text-slate-400 ml-0.5">hrs</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={agregarRango}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold font-mono text-xs shadow-lg transition-all ${colorBoton}`}
            >
              <Plus className="w-4 h-4 shrink-0" /> <span>Añadir Bloque Horario</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * @file TemporizadorConfig.tsx
 * @description Editor visual de bloques horarios para el modo TEMPORIZADO — agregar, editar,
 * eliminar y alternar habilitación de rangos, con indicación de trasnoche (cruce de medianoche) y
 * aviso de solapamiento entre bloques activos. Solo edita el estado local recibido por props; el
 * guardado real ocurre al presionar "Guardar" en la página.
 */

import React, { useState } from "react";
import { Clock, Plus, Trash2, Pencil, X, Moon, Sun, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { RangoHorario } from "@shared/types";

interface Props {
  nombreZona: string;
  colorTema: "cyan" | "emerald";
  rangos: RangoHorario[];
  soloLectura: boolean;
  onCambiarRangos: (nuevosRangos: RangoHorario[]) => void;
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Un rango que cruza medianoche (ej. 22:00 -> 06:00) ocupa dos tramos del día: [22:00, 24:00) y
// [00:00, 06:00). Partirlo así permite comparar solapamiento con la misma lógica sin importar si
// alguno de los dos bloques trasnocha o no.
function segmentosDelDia(inicio: number, fin: number): [number, number][] {
  if (inicio < fin) return [[inicio, fin]];
  if (inicio > fin) return [[inicio, 1440], [0, fin]];
  return [];
}

function seSuperponen(aIni: number, aFin: number, bIni: number, bFin: number): boolean {
  const segA = segmentosDelDia(aIni, aFin);
  const segB = segmentosDelDia(bIni, bFin);
  return segA.some(([s1, e1]) => segB.some(([s2, e2]) => s1 < e2 && s2 < e1));
}

export function TemporizadorConfig({ nombreZona, colorTema, rangos = [], soloLectura, onCambiarRangos }: Props) {
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("10:00");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const colorBorde = colorTema === "cyan" ? "border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-950/20" : "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20";
  const colorTexto = colorTema === "cyan" ? "text-cyan-600 dark:text-cyan-400" : "text-emerald-600 dark:text-emerald-400";
  const colorBoton = colorTema === "cyan" ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950";
  // Clases completas y literales (no armadas con .replace() en runtime) para que el JIT de
  // Tailwind las detecte al escanear el código fuente — una clase construida dinámicamente no
  // aparece en el CSS generado aunque el valor final sea correcto.
  const colorBordeEdicion = colorTema === "cyan" ? "border-cyan-500" : "border-emerald-500";

  const esTrasnoche = (ini: string, fin: string) => aMinutos(ini) > aMinutos(fin);

  // Un bloque se marca en amarillo si se superpone con otro bloque activo — no se bloquea el
  // guardado (dos bloques solapados no rompen nada, el control simplemente queda ON en la unión de
  // ambos), pero suele ser un error de tipeo que vale la pena señalar.
  const idsConSolapamiento = new Set(
    rangos
      .filter((r) => r.habilitado)
      .filter((r) =>
        rangos.some(
          (otro) => otro.id !== r.id && otro.habilitado && seSuperponen(aMinutos(r.inicio), aMinutos(r.fin), aMinutos(otro.inicio), aMinutos(otro.fin))
        )
      )
      .map((r) => r.id)
  );

  const cancelarEdicion = () => {
    setEditandoId(null);
    setHoraInicio("08:00");
    setHoraFin("10:00");
    setError(null);
  };

  const editarRango = (rango: RangoHorario) => {
    setEditandoId(rango.id);
    setHoraInicio(rango.inicio);
    setHoraFin(rango.fin);
    setError(null);
  };

  const guardarRango = () => {
    setError(null);
    if (!horaInicio || !horaFin) {
      setError("Debe especificar hora de inicio y hora de fin.");
      return;
    }
    if (horaInicio === horaFin) {
      setError("La hora de inicio y fin no pueden ser idénticas.");
      return;
    }
    // El firmware del ESP32 solo guarda 8 bloques por zona (arreglo de tamaño fijo) — un 9no bloque
    // se aceptaba en la web pero nunca se aplicaba en el controlador real, sin ningún aviso.
    if (!editandoId && rangos.length >= 8) {
      setError("Ya hay 8 bloques horarios (el máximo que soporta el firmware del ESP32). Eliminá uno para agregar otro.");
      return;
    }
    if (editandoId) {
      onCambiarRangos(rangos.map((r) => (r.id === editandoId ? { ...r, inicio: horaInicio, fin: horaFin } : r)));
    } else {
      const nuevoRango: RangoHorario = { id: `rango_${Date.now()}`, inicio: horaInicio, fin: horaFin, habilitado: true };
      onCambiarRangos([...rangos, nuevoRango]);
    }
    cancelarEdicion();
  };

  const eliminarRango = (id: string) => {
    onCambiarRangos(rangos.filter((r) => r.id !== id));
    if (editandoId === id) cancelarEdicion();
  };
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
            const solapado = idsConSolapamiento.has(rango.id);
            return (
              <div
                key={rango.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  editandoId === rango.id
                    ? `bg-white dark:bg-slate-900/80 shadow-md ${colorBordeEdicion}`
                    : rango.habilitado
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
                      {solapado && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-500/10 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-500/30 font-sans font-medium" title="Se superpone con otro bloque activo">
                          <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" /> Se solapa
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                      Estado: <strong className={rango.habilitado ? colorTexto : "text-slate-500"}>{rango.habilitado ? "ACTIVO" : "DESHABILITADO"}</strong>
                    </div>
                  </div>
                </div>

                {!soloLectura && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => editarRango(rango)}
                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all"
                      title="Editar horario del bloque"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarRango(rango.id)}
                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                      title="Eliminar bloque horario"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!soloLectura && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
          <label className="text-xs font-mono uppercase text-slate-700 dark:text-slate-300 block font-bold">
            {editandoId ? "✏️ Editando Bloque Horario" : "➕ Agregar Nuevo Bloque Horario"}
          </label>
          {error && (
            <div className="p-2.5 bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-700 dark:text-rose-300 text-xs font-mono">⚠️ {error}</div>
          )}
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
              <div className="flex items-center justify-between bg-white dark:bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-800 shadow-sm min-w-0">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 font-bold shrink-0">Inicio:</span>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="bg-transparent text-slate-800 dark:text-slate-100 font-bold font-mono focus:outline-none cursor-pointer p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="flex items-center justify-between bg-white dark:bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-800 shadow-sm min-w-0">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 font-bold shrink-0">Fin:</span>
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className="bg-transparent text-slate-800 dark:text-slate-100 font-bold font-mono focus:outline-none cursor-pointer p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={guardarRango}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold font-mono text-xs shadow-lg transition-all ${colorBoton}`}
              >
                {editandoId ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
                <span>{editandoId ? "Guardar Cambios" : "Añadir Bloque Horario"}</span>
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  className="p-3 rounded-xl border border-slate-300 dark:border-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  title="Cancelar edición"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

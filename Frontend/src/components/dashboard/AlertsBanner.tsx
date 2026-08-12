"use client";

/**
 * @file AlertsBanner.tsx
 * @description Banner superior para notificaciones informativas (verde) y alertas críticas (rojo).
 * Reconstruido a partir del sistema anterior — mismo diseño visual, ahora contra el backend nuevo
 * (PUT /api/alertas/:id/resolver en vez de escribir directo a Firebase RTDB).
 */

import React from "react";
import type { Alerta } from "@shared/types";
import { AlertOctagon, CheckCircle, Sparkles, Clock } from "lucide-react";

interface PropsAlertas {
  alertas: Alerta[];
  onResolver: (id: string) => void | Promise<void>;
  puedeResolver: boolean;
}

export function AlertsBanner({ alertas, onResolver, puedeResolver }: PropsAlertas) {
  const activas = alertas.filter((a) => !a.resuelta);
  if (activas.length === 0) return null;

  // El backend igual rechaza esto para rol "lectura" (autorización real), pero sin este catch la
  // promesa de onResolver (async) quedaba rechazada sin manejar si el PUT fallaba — el botón "no
  // hacía nada" sin avisar, en vez de loguear el error.
  const manejarResolver = (id: string) => {
    Promise.resolve(onResolver(id)).catch((err) => console.error("Error al resolver alerta:", err));
  };

  const formatearFechaHora = (ts: string) => {
    const fecha = new Date(ts);
    if (isNaN(fecha.getTime())) return "Fecha no disponible";
    return fecha.toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const notificacionesExito = activas.filter((a) => a.tipo === "INFO");
  const criticas = activas.filter((a) => a.tipo === "ADVERTENCIA" || a.tipo === "CRITICA");

  return (
    <div className="mb-6 space-y-3">
      {notificacionesExito.map((notif) => (
        <div
          key={notif.id}
          className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/25 to-emerald-500/15 dark:from-emerald-900/60 dark:via-teal-950/80 dark:to-emerald-900/60 border border-emerald-500/50 shadow-lg flex items-center justify-between transition-all gap-4"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide font-mono flex items-center gap-2 flex-wrap">
                <span>Notificación del Sistema</span>
                <span className="bg-emerald-500 text-slate-950 text-[9px] px-1.5 py-0.5 rounded font-bold">
                  {notif.tipo}
                </span>
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 font-mono mt-1 break-words">{notif.mensaje}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono text-emerald-900/80 dark:text-emerald-300/80">
                <Clock className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Registrado el: <strong className="font-semibold text-emerald-950 dark:text-emerald-100">{formatearFechaHora(notif.timestamp)}</strong>
                </span>
              </div>
            </div>
          </div>
          {puedeResolver && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => manejarResolver(notif.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs font-mono font-bold transition-colors cursor-pointer"
                title="Marcar como visto / cerrar"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Marcar visto</span>
              </button>
            </div>
          )}
        </div>
      ))}

      {criticas.map((critica) => (
        <div
          key={critica.id}
          className="p-4 rounded-xl bg-gradient-to-r from-rose-500/15 via-rose-500/25 to-rose-500/15 dark:from-rose-900/60 dark:via-rose-950/80 dark:to-rose-900/60 border border-rose-500/50 shadow-lg flex items-center justify-between animate-pulse transition-all gap-4"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 bg-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 shrink-0">
              <AlertOctagon className="w-6 h-6 animate-bounce" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wide font-mono flex items-center gap-2 flex-wrap">
                <span>Atención: Alerta Crítica Activa</span>
                <span className="bg-rose-500 text-slate-950 text-[9px] px-1.5 py-0.5 rounded font-bold">{critica.tipo}</span>
              </h4>
              <p className="text-xs text-rose-800 dark:text-rose-300/90 font-mono mt-1 break-words">{critica.mensaje}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono text-rose-900/80 dark:text-rose-300/80">
                <Clock className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>
                  Registrado el: <strong className="font-semibold text-rose-950 dark:text-rose-100">{formatearFechaHora(critica.timestamp)}</strong>
                </span>
              </div>
            </div>
          </div>
          {puedeResolver && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => manejarResolver(critica.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-900 dark:text-rose-200 text-xs font-mono font-bold transition-colors cursor-pointer"
                title="Marcar como resuelta"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Resolver</span>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

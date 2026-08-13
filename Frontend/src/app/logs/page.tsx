"use client";

/**
 * @file page.tsx (Auditoría / Logs)
 * @description Réplica visual del sistema anterior: tarjetas por evento con icono/nivel por
 * categoría, filtro por categoría y buscador. La auditoría es inmutable a propósito (sin endpoint
 * de borrado, ni para admin — decisión de seguridad explícita) por lo que, a diferencia del
 * sistema anterior, no hay botón de "vaciar logs".
 */

import React, { useState } from "react";
import { FileText, Filter, Search, Activity, Cpu, Wifi, ShieldAlert, CheckCircle2, Sliders } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useRealtimeData } from "@/hooks/useRealtimeData";

type CategoriaFiltro = "TODOS" | "CONFIG" | "ACTUADOR" | "SENSOR" | "SISTEMA" | "WIFI";

const CATEGORIAS_FILTRO: CategoriaFiltro[] = ["TODOS", "CONFIG", "ACTUADOR", "SENSOR", "SISTEMA", "WIFI"];

/** La categoría real guardada en sistema_logs (ACTUADOR/SENSOR/WIFI/CONFIGURACION/USUARIOS/ALERTA/OTA)
 * se agrupa en los 6 filtros visuales de siempre — USUARIOS/ALERTA/OTA caen bajo "SISTEMA". */
function normalizarCategoria(categoria: string): CategoriaFiltro {
  const c = (categoria || "").toUpperCase();
  if (c === "CONFIGURACION" || c === "CONFIG") return "CONFIG";
  if (c === "ACTUADOR") return "ACTUADOR";
  if (c === "SENSOR") return "SENSOR";
  if (c === "WIFI") return "WIFI";
  return "SISTEMA";
}

function obtenerIconoCategoria(categoriaNormalizada: CategoriaFiltro) {
  switch (categoriaNormalizada) {
    case "ACTUADOR":
      return <Activity className="w-4 h-4 text-emerald-400" />;
    case "SENSOR":
      return <ShieldAlert className="w-4 h-4 text-amber-400" />;
    case "WIFI":
      return <Wifi className="w-4 h-4 text-cyan-400" />;
    case "CONFIG":
      return <Sliders className="w-4 h-4 text-purple-400" />;
    default:
      return <Cpu className="w-4 h-4 text-indigo-400" />;
  }
}

function obtenerColorNivel(nivel: string) {
  switch ((nivel || "").toUpperCase()) {
    case "ERROR":
    case "CRITICA":
      return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    case "WARN":
    case "ADVERTENCIA":
      return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    default:
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  }
}

function formatearTimestamp(iso: string) {
  const fecha = new Date(iso);
  if (isNaN(fecha.getTime())) return "--:--:--";
  const opciones = { timeZone: "America/Santiago" } as const;
  return `${fecha.toLocaleDateString("es-CL", { ...opciones, day: "2-digit", month: "2-digit" })} ${fecha.toLocaleTimeString("es-CL", { ...opciones, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`;
}

export default function LogsPage() {
  const { sistemaLogs, conectado, espOnline } = useRealtimeData();
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<CategoriaFiltro>("TODOS");
  const [busqueda, setBusqueda] = useState("");

  const logsFiltrados = sistemaLogs.filter((item) => {
    if (categoriaSeleccionada !== "TODOS" && normalizarCategoria(item.categoria) !== categoriaSeleccionada) {
      return false;
    }
    if (busqueda.trim() !== "") {
      const b = busqueda.toLowerCase();
      return item.mensaje?.toLowerCase().includes(b) || item.categoria?.toLowerCase().includes(b) || item.usuarioEmail?.toLowerCase().includes(b);
    }
    return true;
  });

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6 max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-panel p-5 border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Auditoría / Historial de Eventos
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Registro inmutable de acciones desde la web y eventos automáticos del controlador (encendido/apagado, fallos de sensores).
              </p>
            </div>

            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar en logs..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Filtro por categoría */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-2 shrink-0">
              <Filter className="w-3.5 h-3.5 text-emerald-400" /> Categoría:
            </span>
            {CATEGORIAS_FILTRO.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaSeleccionada(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border shrink-0 ${
                  categoriaSeleccionada === cat
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                    : "bg-slate-900/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Lista de logs */}
          <div className="space-y-3">
            {logsFiltrados.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/80">
                <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-3 stroke-[1.5]" />
                <p className="text-sm font-medium text-slate-300">No hay registros de logs que coincidan</p>
                <p className="text-xs text-slate-500 mt-1">Los eventos automáticos y cambios de estado aparecerán aquí.</p>
              </div>
            ) : (
              logsFiltrados.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-900/50 hover:bg-slate-900/80 rounded-xl border border-slate-800/80 transition shadow-sm"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="p-2 bg-slate-800/60 rounded-lg shrink-0 mt-0.5 border border-slate-700/50">
                      {obtenerIconoCategoria(normalizarCategoria(log.categoria))}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700/60">
                          {log.categoria || "GENERIC"}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${obtenerColorNivel(log.nivel)}`}>
                          {log.nivel || "INFO"}
                        </span>
                        <span className="text-xs font-mono text-slate-400 sm:hidden">{formatearTimestamp(log.timestamp)}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed break-words">
                        {log.mensaje}
                        {log.usuarioEmail && <span className="text-slate-500"> | Cuenta: {log.usuarioEmail}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:block shrink-0 text-right">
                    <span className="text-xs font-mono text-slate-400 block">{formatearTimestamp(log.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

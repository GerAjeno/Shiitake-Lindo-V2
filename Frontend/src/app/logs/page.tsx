"use client";

/**
 * @file page.tsx (Auditoría / Logs)
 * @description Réplica visual del sistema anterior: tarjetas por evento con icono/nivel por
 * categoría, filtro por categoría (multi-selección) y buscador. La auditoría es inmutable a
 * propósito (sin endpoint de borrado, ni para admin — decisión de seguridad explícita) por lo que,
 * a diferencia del sistema anterior, no hay botón de "vaciar logs". Los logs se cargan paginados
 * desde el backend (no se traen todos a la vez: la retención es indefinida y puede haber miles).
 */

import React, { useEffect, useState } from "react";
import { FileText, Filter, Search, Activity, Cpu, Wifi, ShieldAlert, CheckCircle2, Sliders, ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { apiFetch } from "@/lib/api";
import type { LogSistema, RespuestaLogsPaginada } from "@shared/types";

type CategoriaFiltro = "CONFIG" | "ACTUADOR" | "SENSOR" | "SISTEMA" | "WIFI";

const CATEGORIAS_FILTRO: CategoriaFiltro[] = ["CONFIG", "ACTUADOR", "SENSOR", "SISTEMA", "WIFI"];
const OPCIONES_POR_PAGINA = [30, 50, 100] as const;

/** La categoría real guardada en sistema_logs (ACTUADOR/SENSOR/WIFI/CONFIGURACION/USUARIOS/ALERTA/OTA)
 * se agrupa en los 5 filtros visuales — USUARIOS/ALERTA/OTA caen bajo "SISTEMA". Debe reflejar
 * exactamente el mismo agrupamiento que hace el backend en routes/logs.ts. */
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

/** Ventana de números de página centrada en la actual (máx. 5 botones) para no listar cientos. */
function paginasVisibles(paginaActual: number, totalPaginas: number): number[] {
  const ventana = 5;
  let inicio = Math.max(1, paginaActual - Math.floor(ventana / 2));
  const fin = Math.min(totalPaginas, inicio + ventana - 1);
  inicio = Math.max(1, fin - ventana + 1);
  const paginas: number[] = [];
  for (let p = inicio; p <= fin; p++) paginas.push(p);
  return paginas;
}

export default function LogsPage() {
  const { conectado, espOnline } = useRealtimeData();

  const [logs, setLogs] = useState<LogSistema[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<number>(30);
  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<CategoriaFiltro[]>([]);
  const [fecha, setFecha] = useState(""); // "" = sin filtro de fecha, si no "YYYY-MM-DD"
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("pagina", String(pagina));
    params.set("porPagina", String(porPagina));
    if (categoriasSeleccionadas.length > 0) params.set("categorias", categoriasSeleccionadas.join(","));
    if (fecha) params.set("fecha", fecha);

    apiFetch<RespuestaLogsPaginada>(`/api/logs?${params.toString()}`)
      .then((respuesta) => {
        if (cancelado) return;
        setLogs(respuesta.logs);
        setTotal(respuesta.total);
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudieron cargar los logs.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [pagina, porPagina, categoriasSeleccionadas, fecha]);

  function alternarCategoria(cat: CategoriaFiltro) {
    setPagina(1);
    setCategoriasSeleccionadas((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  // La búsqueda de texto filtra solo dentro de la página ya cargada (los logs no se traen todos
  // a la vez); para buscar en otro rango hay que combinarla con el filtro de fecha/categoría.
  const logsFiltrados = logs.filter((item) => {
    if (busqueda.trim() === "") return true;
    const b = busqueda.toLowerCase();
    return item.mensaje?.toLowerCase().includes(b) || item.categoria?.toLowerCase().includes(b) || item.usuarioEmail?.toLowerCase().includes(b);
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

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-56">
                <CalendarDays className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => {
                    setPagina(1);
                    setFecha(e.target.value);
                  }}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
                {fecha && (
                  <button
                    onClick={() => {
                      setPagina(1);
                      setFecha("");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                    title="Quitar filtro de fecha"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
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

              <select
                value={porPagina}
                onChange={(e) => {
                  setPagina(1);
                  setPorPagina(Number(e.target.value));
                }}
                className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {OPCIONES_POR_PAGINA.map((n) => (
                  <option key={n} value={n}>
                    Mostrar {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtro por categoría (multi-selección) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-2 shrink-0">
              <Filter className="w-3.5 h-3.5 text-emerald-400" /> Categoría:
            </span>
            <button
              onClick={() => {
                setPagina(1);
                setCategoriasSeleccionadas([]);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border shrink-0 ${
                categoriasSeleccionadas.length === 0
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                  : "bg-slate-900/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              TODOS
            </button>
            {CATEGORIAS_FILTRO.map((cat) => (
              <button
                key={cat}
                onClick={() => alternarCategoria(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border shrink-0 ${
                  categoriasSeleccionadas.includes(cat)
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
            {error ? (
              <div className="text-center py-16 bg-rose-500/5 rounded-2xl border border-dashed border-rose-500/30">
                <p className="text-sm font-medium text-rose-300">{error}</p>
              </div>
            ) : cargando ? (
              <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/80">
                <p className="text-sm font-medium text-slate-400">Cargando logs...</p>
              </div>
            ) : logsFiltrados.length === 0 ? (
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

          {/* Paginación */}
          {!cargando && !error && total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <p className="text-xs text-slate-500">
                {total.toLocaleString("es-CL")} registro{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="p-2 rounded-lg border border-slate-800/80 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {paginasVisibles(pagina, totalPaginas)[0] > 1 && <span className="text-slate-600 px-1">…</span>}
                {paginasVisibles(pagina, totalPaginas).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPagina(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition border ${
                      p === pagina
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                        : "bg-slate-900/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {paginasVisibles(pagina, totalPaginas).slice(-1)[0] < totalPaginas && <span className="text-slate-600 px-1">…</span>}
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina >= totalPaginas}
                  className="p-2 rounded-lg border border-slate-800/80 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition"
                  title="Página siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}

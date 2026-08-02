"use client";

/**
 * @file Sidebar.tsx
 * @description Barra lateral de navegación industrial oscura.
 * La visibilidad de "Auditoría / Logs" ahora depende del ROL real resuelto por el backend
 * (Postgres), no de un email hardcodeado como en el sistema anterior.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LineChart, Sliders, Bell, LogOut, FileText, Wind } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ShiitakeLogo } from "@/components/icons/ShiitakeLogo";

export function Sidebar() {
  const pathname = usePathname();
  const { rol, cerrarSesion } = useAuth();

  const esAdmin = rol === "admin";

  const rutas = [
    { nombre: "Monitoreo Vivo", ruta: "/dashboard", icono: LayoutDashboard, nombreCorto: "Monitoreo" },
    { nombre: "Historial y Curvas", ruta: "/history", icono: LineChart, nombreCorto: "Historial" },
    { nombre: "Control A/C", ruta: "/ac-control", icono: Wind, nombreCorto: "A/C" },
    { nombre: "Registro Alertas", ruta: "/alerts", icono: Bell, nombreCorto: "Alertas" },
    ...(esAdmin ? [{ nombre: "Auditoría / Logs", ruta: "/logs", icono: FileText, nombreCorto: "Logs" }] : []),
    { nombre: "Configuración", ruta: "/settings", icono: Sliders, nombreCorto: "Config" },
  ];

  return (
    <>
      <aside className="w-64 bg-white/90 dark:bg-slate-950/90 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between hidden md:flex shrink-0 transition-colors duration-300">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800/80 gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400">
              <ShiitakeLogo className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wider text-slate-800 dark:text-slate-100 uppercase">Shiitake-Lindo</h1>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400/80 font-mono">CONTROLADOR IOT</p>
            </div>
          </div>

          <nav className="p-4 space-y-1.5">
            {rutas.map((item) => {
              const Icono = item.icono;
              const activa = pathname === item.ruta;
              return (
                <Link
                  key={item.ruta}
                  href={item.ruta}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activa
                      ? "bg-gradient-to-r from-emerald-600/20 to-transparent text-emerald-600 dark:text-emerald-400 border-l-4 border-emerald-500 font-semibold shadow-lg"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60"
                  }`}
                >
                  <Icono className={`w-5 h-5 ${activa ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`} />
                  {item.nombre}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-900 space-y-3">
          <button
            onClick={cerrarSesion}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-500 dark:text-rose-400/90 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-900/80 text-center font-mono">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tracking-tight">
              Desarrollado por German Marambio © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/80 px-2 py-1.5 flex items-center justify-around shadow-lg dark:shadow-[0_-4px_25px_rgba(0,0,0,0.7)] transition-colors duration-300">
        {rutas.map((item) => {
          const Icono = item.icono;
          const activa = pathname === item.ruta;
          return (
            <Link
              key={item.ruta}
              href={item.ruta}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition-all ${
                activa
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 font-bold scale-105 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/50"
              }`}
            >
              <Icono className={`w-5 h-5 ${activa ? "text-emerald-600 dark:text-emerald-400 animate-pulse" : "text-slate-500"}`} />
              <span className="text-[10px] tracking-tight font-mono">{item.nombreCorto}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

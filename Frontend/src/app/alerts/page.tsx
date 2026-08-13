"use client";

/**
 * @file page.tsx (Alertas)
 * @description Centro de alertas del sistema (sensores, actuadores, OTA). Resolver una alerta
 * requiere rol admin/operador (el backend ya lo exige; aquí solo se oculta el botón por UX).
 */

import React, { useState } from "react";
import { Bell, CheckCircle2, ShieldAlert, Info, AlertTriangle } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { apiFetch } from "@/lib/api";
import type { Alerta } from "@shared/types";

const ESTILOS_TIPO: Record<Alerta["tipo"], string> = {
  INFO: "bg-cyan-500/10 border-cyan-500/30 text-cyan-500",
  ADVERTENCIA: "bg-amber-500/10 border-amber-500/30 text-amber-500",
  CRITICA: "bg-rose-500/10 border-rose-500/30 text-rose-500",
};

const ICONO_TIPO: Record<Alerta["tipo"], React.ElementType> = {
  INFO: Info,
  ADVERTENCIA: AlertTriangle,
  CRITICA: ShieldAlert,
};

export default function AlertsPage() {
  const { rol } = useAuth();
  const { alertas, conectado, espOnline } = useRealtimeData();
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [soloActivas, setSoloActivas] = useState(true);
  const puedeResolver = rol === "admin" || rol === "operador";

  const resolver = async (id: string) => {
    setResolviendo(id);
    try {
      await apiFetch(`/api/alertas/${id}/resolver`, { method: "PUT" });
    } catch (err) {
      console.error(err);
    } finally {
      setResolviendo(null);
    }
  };

  const visibles = soloActivas ? alertas.filter((a) => !a.resuelta) : alertas;

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold flex items-center gap-2"><Bell className="w-5 h-5" /> Alertas del sistema</h1>
            <label className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} />
              Solo activas
            </label>
          </div>

          <div className="glass-panel divide-y divide-slate-200 dark:divide-slate-800">
            {visibles.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500 font-mono">Sin alertas {soloActivas ? "activas" : ""}.</p>
            )}
            {visibles.map((a) => {
              const Icono = ICONO_TIPO[a.tipo] ?? Info;
              return (
                <div key={a.id + a.timestamp} className={`p-4 flex items-start gap-3 ${a.resuelta ? "opacity-50" : ""}`}>
                  <div className={`p-2 rounded-xl border shrink-0 ${ESTILOS_TIPO[a.tipo]}`}>
                    <Icono className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.mensaje}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-1">
                      {a.categoria} · {new Date(a.timestamp).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false })}
                    </p>
                  </div>
                  {!a.resuelta && puedeResolver && (
                    <button
                      onClick={() => resolver(a.id)}
                      disabled={resolviendo === a.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

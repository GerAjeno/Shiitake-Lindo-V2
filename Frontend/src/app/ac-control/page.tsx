"use client";

/**
 * @file page.tsx (Control A/C)
 * @description Estado de los aires acondicionados Midea. Es una vista de SOLO LECTURA: cuando
 * el AC está en modo MANUAL, el sistema no envía ninguna orden (el operador usa el control
 * remoto físico del equipo); en AUTO, el sistema decide según los umbrales de Configuración.
 * No es prioritario (decisión explícita del usuario) — por eso queda simple.
 */

import React from "react";
import { Wind, Thermometer, Power, WifiOff } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import type { TelemetriaZona } from "@shared/types";

function TarjetaAC({ etiqueta, datos }: { etiqueta: string; datos?: TelemetriaZona }) {
  if (!datos) return <div className="glass-panel p-6 h-48 animate-pulse" />;
  const ac = datos.estadoDetalladoAC;

  return (
    <div className="glass-panel p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase">{etiqueta}</h3>
        <span className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
          datos.modoControlAc === "AUTO" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500"
        }`}>{datos.modoControlAc}</span>
      </div>

      {!ac.comunicacionOk && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
          <WifiOff className="w-4 h-4 shrink-0" /> Sin comunicación con el equipo (LAN local).
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Power className={`w-6 h-6 ${ac.power ? "text-emerald-500" : "text-slate-500"}`} />
          <div>
            <p className="text-lg font-bold font-mono">{ac.power ? "Encendido" : "Apagado"}</p>
            <p className="text-[10px] text-slate-500 uppercase font-mono">Estado</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Thermometer className="w-6 h-6 text-amber-500" />
          <div>
            <p className="text-lg font-bold font-mono">{ac.temperaturaInterior !== null ? `${ac.temperaturaInterior.toFixed(1)}°C` : "—"}</p>
            <p className="text-[10px] text-slate-500 uppercase font-mono">Temp. interior</p>
          </div>
        </div>
      </div>
      <p className="text-xs font-mono text-slate-500">Modo físico: {ac.modoFisico} · Objetivo: {ac.temperaturaObjetivo}°C</p>
    </div>
  );
}

export default function AcControlPage() {
  const { actual, conectado, espOnline } = useRealtimeData();

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <h1 className="text-lg font-bold flex items-center gap-2"><Wind className="w-5 h-5" /> Control de Aire Acondicionado</h1>
          <p className="text-xs text-slate-500 font-mono">
            En modo MANUAL el sistema no envía órdenes — usa el control remoto físico del equipo.
            En AUTO, los umbrales se ajustan en Configuración.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TarjetaAC etiqueta="Atriles" datos={actual?.atriles} />
            <TarjetaAC etiqueta="Descanso" datos={actual?.descanso} />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

"use client";

/**
 * @file page.tsx (Dashboard)
 * @description Monitoreo en vivo de ambas zonas. Datos vía WebSocket (useRealtimeData),
 * comandos manuales confirmados por ACK real del ESP32 (nunca se asume éxito optimista).
 */

import React, { useState } from "react";
import { Droplets, Thermometer, Power, ShieldAlert, Wind, CircleAlert } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { SystemStatusCard } from "@/components/dashboard/SystemStatusCard";
import { SensorHealthMatrix } from "@/components/dashboard/SensorHealthMatrix";
import type { NombreZona, TelemetriaZona } from "@shared/types";

function TarjetaZona({
  nombreZona, etiqueta, datos, puedeControlar, onToggle,
}: {
  nombreZona: NombreZona;
  etiqueta: string;
  datos?: TelemetriaZona;
  puedeControlar: boolean;
  onToggle: (encender: boolean) => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [ultimoError, setUltimoError] = useState<string | null>(null);

  if (!datos) {
    return (
      <div className="glass-panel p-6 animate-pulse h-64 flex items-center justify-center text-slate-500 text-sm font-mono">
        Esperando telemetría de {etiqueta}...
      </div>
    );
  }

  const manejarToggle = async () => {
    setEnviando(true);
    setUltimoError(null);
    try {
      await onToggle(!datos.estadoHumidificador);
    } catch (e) {
      setUltimoError("Error al enviar el comando.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">{etiqueta}</h3>
        <span className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
          datos.modoControl === "AUTO" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
          datos.modoControl === "MANUAL" ? "bg-amber-500/10 border-amber-500/30 text-amber-500" :
          "bg-cyan-500/10 border-cyan-500/30 text-cyan-500"
        }`}>{datos.modoControl}</span>
      </div>

      {datos.falloCriticoDHT && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          Fallo crítico de sensores — humidificador en apagado de seguridad.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <Droplets className="w-8 h-8 text-cyan-500" />
          <div>
            <p className="text-2xl font-bold font-mono">{datos.humedadPromedio.toFixed(1)}%</p>
            <p className="text-[10px] text-slate-500 uppercase font-mono">Humedad</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Thermometer className="w-8 h-8 text-amber-500" />
          <div>
            <p className="text-2xl font-bold font-mono">{datos.temperaturaPromedio.toFixed(1)}°C</p>
            <p className="text-[10px] text-slate-500 uppercase font-mono">Temperatura</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <Wind className="w-4 h-4" /> Calidad aire: {datos.calidadAire}
        </div>
        <button
          onClick={manejarToggle}
          disabled={!puedeControlar || enviando || datos.modoControl !== "MANUAL"}
          title={datos.modoControl !== "MANUAL" ? "Cambia a modo MANUAL en Configuración para controlar directamente" : ""}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all disabled:opacity-40 ${
            datos.estadoHumidificador
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-slate-700 text-slate-200 hover:bg-slate-600"
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          {enviando ? "Enviando..." : datos.estadoHumidificador ? "Encendido" : "Apagado"}
        </button>
      </div>
      {ultimoError && (
        <div className="flex items-center gap-2 text-rose-400 text-[11px] font-mono">
          <CircleAlert className="w-3.5 h-3.5" /> {ultimoError}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { rol } = useAuth();
  const { actual, sensores, conectado, espOnline, ultimaTelemetriaTs, enviarComando } = useRealtimeData();
  const puedeControlar = rol === "admin" || rol === "operador";

  const manejarToggleZona = (zona: NombreZona) => async (encender: boolean) => {
    const resultado = await enviarComando({ tipo: "humidificador", zona, encender });
    if (!resultado.ejecutado) throw new Error(resultado.error ?? "El dispositivo no confirmó la orden.");
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TarjetaZona
              nombreZona="atriles" etiqueta="Atriles (Fructificación)" datos={actual?.atriles}
              puedeControlar={puedeControlar} onToggle={manejarToggleZona("atriles")}
            />
            <TarjetaZona
              nombreZona="descanso" etiqueta="Descanso (Micelio)" datos={actual?.descanso}
              puedeControlar={puedeControlar} onToggle={manejarToggleZona("descanso")}
            />
          </div>

          <SystemStatusCard actual={actual} espOnline={espOnline} ultimaTelemetriaTs={ultimaTelemetriaTs} />
          <SensorHealthMatrix sensores={sensores} />
        </main>
        <Footer />
      </div>
    </div>
  );
}

"use client";

/**
 * @file page.tsx (Dashboard)
 * @description Monitoreo en vivo de ambas zonas. Datos vía WebSocket (useRealtimeData),
 * comandos manuales confirmados por ACK real del ESP32 (nunca se asume éxito optimista).
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { SystemStatusCard } from "@/components/dashboard/SystemStatusCard";
import { SensorHealthMatrix } from "@/components/dashboard/SensorHealthMatrix";
import { AlertsBanner } from "@/components/dashboard/AlertsBanner";
import { ZoneCard } from "@/components/dashboard/ZoneCard";
import type { NombreZona } from "@shared/types";

export default function DashboardPage() {
  const { rol } = useAuth();
  const {
    actual, sensores, configuracion, alertas, conectado, espOnline,
    ultimaTelemetriaTs, enviarComando, resolverAlerta,
  } = useRealtimeData();
  const puedeControlar = rol === "admin" || rol === "operador";

  const manejarToggleZona = (zona: NombreZona) => async (encender: boolean) => {
    const resultado = await enviarComando({ tipo: "humidificador", zona, encender });
    if (!resultado.ejecutado) throw new Error(resultado.error ?? "El dispositivo no confirmó la orden.");
  };

  const co2Deshabilitados =
    configuracion?.sensoresHabilitados && configuracion.sensoresHabilitados.mq1 === false && configuracion.sensoresHabilitados.mq2 === false;

  // Alertas de calidad de aire (MQ135) ocultas solo en este banner en vivo — a pedido del usuario,
  // por falsos positivos con la niebla de los humidificadores. Siguen visibles en /alerts.
  const alertasSinAire = alertas.filter((a) => !a.id.startsWith("AIRE_"));

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <AlertsBanner alertas={alertasSinAire} onResolver={resolverAlerta} puedeResolver={puedeControlar} />

          {!espOnline && ultimaTelemetriaTs && (
            <div className="bg-rose-950/90 border-2 border-rose-500/80 p-4 rounded-xl flex items-center gap-3 text-rose-200 font-mono text-xs shadow-xl">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 animate-bounce" />
              <div className="space-y-0.5">
                <div className="font-bold text-sm text-rose-300 uppercase tracking-wide">
                  ⚠️ Alerta de conectividad: microcontrolador desconectado / sin señal
                </div>
                <div>
                  El microcontrolador dejó de enviar telemetría en tiempo real (última lectura registrada:{" "}
                  <strong className="text-white bg-rose-900/80 px-1.5 py-0.5 rounded border border-rose-700">
                    {new Date(ultimaTelemetriaTs).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour12: false })}
                  </strong>
                  ). Verifique la alimentación eléctrica y la señal WiFi del módulo en el invernadero.
                </div>
              </div>
            </div>
          )}

          {co2Deshabilitados && (
            <div className="bg-amber-950/80 border border-amber-500/80 p-4 rounded-xl flex items-center gap-3 text-amber-200 font-mono text-xs shadow-lg">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 animate-pulse" />
              <span>
                Precaución: los sensores de CO2 (MQ-135 #1 y #2) se encuentran desactivados en configuración. El monitoreo de calidad del
                aire está suspendido.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ZoneCard
              nombreZona="Área 1: Atriles"
              subtitulo="Cultivo Principal y Crecimiento de Hongos Shiitake"
              telemetria={actual?.atriles}
              configuracion={configuracion?.atriles}
              sensoresNombres={["DHT #1", "DHT #2", "MQ-135 #1"]}
              co2Deshabilitado={configuracion?.sensoresHabilitados?.mq1 === false}
              colorTema="cyan"
              puedeControlar={puedeControlar}
              onToggleHumidificador={manejarToggleZona("atriles")}
            />
            <ZoneCard
              nombreZona="Área 2: Descanso"
              subtitulo="Zona de Reposo, Incubación y Mantenimiento"
              telemetria={actual?.descanso}
              configuracion={configuracion?.descanso}
              sensoresNombres={["DHT #3", "DHT #4", "MQ-135 #2"]}
              co2Deshabilitado={configuracion?.sensoresHabilitados?.mq2 === false}
              colorTema="emerald"
              puedeControlar={puedeControlar}
              onToggleHumidificador={manejarToggleZona("descanso")}
            />
          </div>

          <SystemStatusCard actual={actual} espOnline={espOnline} ultimaTelemetriaTs={ultimaTelemetriaTs} />
          <SensorHealthMatrix sensores={sensores} />

          <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-4">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Actualización bidireccional continua
            </span>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

"use client";

/**
 * @file page.tsx (Historial)
 * @description Curvas históricas de humedad/temperatura por zona. El backend elige
 * automáticamente la resolución (30s/5min/hora) según el rango pedido.
 */

import React, { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { useHistoricalData, FiltroRangoTiempo } from "@/hooks/useHistoricalData";

const RANGOS: { valor: FiltroRangoTiempo; etiqueta: string }[] = [
  { valor: "1h", etiqueta: "1 hora" },
  { valor: "6h", etiqueta: "6 horas" },
  { valor: "24h", etiqueta: "1 día" },
  { valor: "7d", etiqueta: "1 semana" },
  { valor: "30d", etiqueta: "1 mes" },
  { valor: "1y", etiqueta: "1 año" },
  { valor: "3y", etiqueta: "3 años" },
];

function TarjetaStat({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-[10px] uppercase text-slate-500 font-mono">{etiqueta}</p>
      <p className="text-xl font-bold font-mono">{valor}</p>
    </div>
  );
}

export default function HistoryPage() {
  const { conectado, espOnline } = useRealtimeData();
  const [rango, setRango] = useState<FiltroRangoTiempo>("24h");
  const { datosHistoricos, estadisticas, cargando } = useHistoricalData(rango);

  const datosGrafico = datosHistoricos.map((p) => ({
    ...p,
    horaLabel: new Date(p.timestamp).toLocaleString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
  }));

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-bold flex items-center gap-2"><LineChartIcon className="w-5 h-5" /> Histórico y curvas</h1>
            <div className="flex gap-1.5 flex-wrap">
              {RANGOS.map((r) => (
                <button
                  key={r.valor}
                  onClick={() => setRango(r.valor)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    rango === r.valor ? "bg-emerald-600 text-white" : "bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {r.etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TarjetaStat etiqueta="Humedad prom. Atriles" valor={`${estadisticas.atriles.humedadPromedio}%`} />
            <TarjetaStat etiqueta="Temp. prom. Atriles" valor={`${estadisticas.atriles.tempPromedio}°C`} />
            <TarjetaStat etiqueta="Humedad prom. Descanso" valor={`${estadisticas.descanso.humedadPromedio}%`} />
            <TarjetaStat etiqueta="Temp. prom. Descanso" valor={`${estadisticas.descanso.tempPromedio}°C`} />
          </div>

          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold mb-3">Humedad (%)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={datosGrafico}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="horaLabel" tick={{ fontSize: 10 }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="humedadAtriles" name="Atriles" stroke="#06b6d4" dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="humedadDescanso" name="Descanso" stroke="#10b981" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold mb-3">Temperatura (°C)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={datosGrafico}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="horaLabel" tick={{ fontSize: 10 }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tempAtriles" name="Atriles" stroke="#f59e0b" dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="tempDescanso" name="Descanso" stroke="#f43f5e" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {cargando && <p className="text-center text-xs text-slate-500 font-mono">Cargando datos históricos...</p>}
        </main>
        <Footer />
      </div>
    </div>
  );
}

"use client";

/**
 * @file page.tsx (Historial)
 * @description Curvas históricas de humedad/temperatura por zona. El backend elige
 * automáticamente la resolución (30s/5min/hora) según el rango pedido.
 */

import React, { useState } from "react";
import { LineChart as LineChartIcon, FileSpreadsheet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ExcelJS from "exceljs";
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
  const [rango, setRango] = useState<FiltroRangoTiempo>("1h");
  const [exportando, setExportando] = useState(false);
  const { datosHistoricos, estadisticas, cargando } = useHistoricalData(rango);

  const datosGrafico = datosHistoricos.map((p) => ({
    ...p,
    horaLabel: new Date(p.timestamp).toLocaleString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
  }));

  const exportarExcel = async () => {
    if (exportando || datosHistoricos.length === 0) return;
    setExportando(true);
    try {
      const libro = new ExcelJS.Workbook();
      libro.creator = "Shiitake Lindo";
      libro.created = new Date();

      const hojaDatos = libro.addWorksheet("Registros");
      hojaDatos.columns = [
        { header: "Fecha y hora", key: "fecha", width: 22 },
        { header: "Humedad Atriles (%)", key: "humAt", width: 20 },
        { header: "Temp. Atriles (°C)", key: "tempAt", width: 18 },
        { header: "Humidificador Atriles", key: "releAt", width: 20 },
        { header: "Humedad Descanso (%)", key: "humDe", width: 20 },
        { header: "Temp. Descanso (°C)", key: "tempDe", width: 18 },
        { header: "Humidificador Descanso", key: "releDe", width: 20 },
      ];
      hojaDatos.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      hojaDatos.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

      datosHistoricos.forEach((p) => {
        hojaDatos.addRow({
          fecha: new Date(p.timestamp).toLocaleString("es-CL", { timeZone: "America/Santiago" }),
          humAt: p.humedadAtriles,
          tempAt: p.tempAtriles,
          releAt: p.releAtriles === 1 ? "ENCENDIDO" : p.releAtriles === 0 ? "APAGADO" : "",
          humDe: p.humedadDescanso,
          tempDe: p.tempDescanso,
          releDe: p.releDescanso === 1 ? "ENCENDIDO" : p.releDescanso === 0 ? "APAGADO" : "",
        });
      });

      const hojaResumen = libro.addWorksheet("Resumen");
      hojaResumen.columns = [
        { header: "Parámetro", key: "param", width: 32 },
        { header: "Valor", key: "val", width: 30 },
      ];
      hojaResumen.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      hojaResumen.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      const rangoEtiqueta = RANGOS.find((r) => r.valor === rango)?.etiqueta ?? rango;
      [
        { param: "Rango exportado", val: rangoEtiqueta },
        { param: "Total de registros", val: estadisticas.totalRegistros },
        { param: "Duración del rango (horas)", val: estadisticas.rangoHorasTotal },
        { param: "", val: "" },
        { param: "--- ATRILES ---", val: "" },
        { param: "Humedad promedio (%)", val: estadisticas.atriles.humedadPromedio },
        { param: "Humedad mín / máx (%)", val: `${estadisticas.atriles.humedadMin} - ${estadisticas.atriles.humedadMax}` },
        { param: "Temp. promedio (°C)", val: estadisticas.atriles.tempPromedio },
        { param: "Temp. mín / máx (°C)", val: `${estadisticas.atriles.tempMin} - ${estadisticas.atriles.tempMax}` },
        {
          param: "Humidificador encendido",
          val: `${Math.floor(estadisticas.atriles.minutosHumidificadorON / 60)}h ${estadisticas.atriles.minutosHumidificadorON % 60}m (${estadisticas.atriles.porcentajeHumidificadorON}%)`,
        },
        { param: "", val: "" },
        { param: "--- DESCANSO ---", val: "" },
        { param: "Humedad promedio (%)", val: estadisticas.descanso.humedadPromedio },
        { param: "Humedad mín / máx (%)", val: `${estadisticas.descanso.humedadMin} - ${estadisticas.descanso.humedadMax}` },
        { param: "Temp. promedio (°C)", val: estadisticas.descanso.tempPromedio },
        { param: "Temp. mín / máx (°C)", val: `${estadisticas.descanso.tempMin} - ${estadisticas.descanso.tempMax}` },
        {
          param: "Humidificador encendido",
          val: `${Math.floor(estadisticas.descanso.minutosHumidificadorON / 60)}h ${estadisticas.descanso.minutosHumidificadorON % 60}m (${estadisticas.descanso.porcentajeHumidificadorON}%)`,
        },
      ].forEach((f) => hojaResumen.addRow(f));

      const buffer = await libro.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Historial_Shiitake_Lindo_${rango}_${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error al exportar Excel:", err);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-bold flex items-center gap-2"><LineChartIcon className="w-5 h-5" /> Histórico y curvas</h1>
            <div className="flex gap-1.5 flex-wrap items-center">
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
              <div className="w-px h-5 bg-slate-300 dark:bg-slate-800 mx-1" />
              <button
                onClick={exportarExcel}
                disabled={exportando || cargando || datosHistoricos.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exportando ? "Generando..." : "Exportar Excel"}
              </button>
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
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
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
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
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

"use client";

/**
 * @file page.tsx (Historial y Curvas Agronómicas)
 * @description Réplica del diseño del sistema anterior: selector de zona (Atriles/Descanso/Vista
 * completa), KPIs del periodo y curvas independientes por zona (humedad con banda objetivo,
 * temperatura, ciclos ON/OFF del humidificador y CO2/calidad de aire), contra el backend nuevo
 * (REST /api/historial, resolución 30s/5min/hora elegida automáticamente por el servidor).
 */

import React, { useState, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine, Legend,
} from "recharts";
import { Calendar, FileSpreadsheet, Database, Droplets, Thermometer, Zap, Activity, Clock, Wind } from "lucide-react";
import ExcelJS from "exceljs";
import { toPng } from "html-to-image";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { useHistoricalData, FiltroRangoTiempo, EstadisticasZona, PuntoHistorico } from "@/hooks/useHistoricalData";

type PestañaZona = "atriles" | "descanso" | "ambas";

const RANGOS: { valor: FiltroRangoTiempo; etiqueta: string }[] = [
  { valor: "1h", etiqueta: "1H" },
  { valor: "6h", etiqueta: "6H" },
  { valor: "24h", etiqueta: "24H" },
  { valor: "7d", etiqueta: "7D" },
  { valor: "30d", etiqueta: "30D" },
  { valor: "3m", etiqueta: "3M" },
  { valor: "1y", etiqueta: "1Y" },
  { valor: "3y", etiqueta: "3Y" },
];

interface VisualZona {
  emoji: string;
  nombre: string;
  colorHex: string;
  claseTextoBase: string;
  claseBotonActivo: string;
  claseBordeSeccion: string;
  claseBordeIzq: string;
  campoHum: "humedadAtriles" | "humedadDescanso";
  campoTemp: "tempAtriles" | "tempDescanso";
  campoRele: "releAtriles" | "releDescanso";
  campoCo2: "co2Atriles" | "co2Descanso";
}

const VISUAL_ATRILES: VisualZona = {
  emoji: "🌾", nombre: "Área 1: Atriles (Fructificación)", colorHex: "#06b6d4",
  claseTextoBase: "text-cyan-400", claseBotonActivo: "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950/50",
  claseBordeSeccion: "border-cyan-500/30", claseBordeIzq: "border-l-cyan-500",
  campoHum: "humedadAtriles", campoTemp: "tempAtriles", campoRele: "releAtriles", campoCo2: "co2Atriles",
};

const VISUAL_DESCANSO: VisualZona = {
  emoji: "🌱", nombre: "Área 2: Descanso (Incubación)", colorHex: "#10b981",
  claseTextoBase: "text-emerald-400", claseBotonActivo: "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950/50",
  claseBordeSeccion: "border-emerald-500/30", claseBordeIzq: "border-l-emerald-500",
  campoHum: "humedadDescanso", campoTemp: "tempDescanso", campoRele: "releDescanso", campoCo2: "co2Descanso",
};

function TarjetaKpi({ etiqueta, valor, unidad, icono, colorValor, pie }: { etiqueta: string; valor: string; unidad?: string; icono: React.ReactNode; colorValor: string; pie: React.ReactNode }) {
  return (
    <div className="glass-panel p-4 border-slate-800 flex flex-col justify-between">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span>{etiqueta}</span>
        {icono}
      </div>
      <div className={`text-2xl font-bold font-mono mt-2 ${colorValor}`}>
        {valor} {unidad && <span className="text-xs font-normal text-slate-500">{unidad}</span>}
      </div>
      <div className="text-[11px] font-mono text-slate-500 mt-2 flex justify-between border-t border-slate-800 pt-1.5">
        {pie}
      </div>
    </div>
  );
}

function CurvasZona({ v, datos, humMin, humMax, formatearEjeX }: { v: VisualZona; datos: PuntoHistorico[]; humMin: number; humMax: number; formatearEjeX: (t: number) => string }) {
  const gradHum = `grad-${v.campoHum}-hum`;
  const gradRele = `grad-${v.campoRele}-rele`;

  return (
    <div className="space-y-6">
      <div className={`flex items-center gap-2 border-b ${v.claseBordeSeccion} pb-2`}>
        <span className={`w-3 h-3 rounded-full animate-pulse`} style={{ backgroundColor: v.colorHex }} />
        <h2 className={`text-base font-bold font-mono tracking-wider uppercase ${v.claseTextoBase}`}>
          {v.emoji} Curvas independientes: {v.nombre}
        </h2>
      </div>

      {/* Humedad relativa */}
      <div className={`p-6 glass-panel border-l-4 ${v.claseBordeIzq}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-bold font-mono uppercase flex items-center gap-2 ${v.claseTextoBase}`}>
            <Droplets className="w-4 h-4" style={{ color: v.colorHex }} /> Humedad relativa - {v.nombre} (% RH)
          </h3>
          <span className="text-xs font-mono text-slate-400">Banda objetivo: [{humMin}% - {humMax}%]</span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datos}>
              <defs>
                <linearGradient id={gradHum} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={v.colorHex} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={v.colorHex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
              <YAxis domain={[40, 100]} stroke="#475569" fontSize={11} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", fontSize: "12px" }} labelFormatter={(t) => new Date(t).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false })} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <ReferenceLine y={humMin} stroke={v.colorHex} strokeDasharray="3 3" label={{ value: `Mín (${humMin}%)`, fill: v.colorHex, fontSize: 10 }} />
              <ReferenceLine y={humMax} stroke={v.colorHex} strokeDasharray="3 3" label={{ value: `Máx (${humMax}%)`, fill: v.colorHex, fontSize: 10 }} />
              <Area type="monotone" dataKey={v.campoHum} name={`Humedad ${v.nombre}`} stroke={v.colorHex} strokeWidth={2.5} fillOpacity={1} fill={`url(#${gradHum})`} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Temperatura */}
      <div className={`p-6 glass-panel border-l-4 ${v.claseBordeIzq}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-bold font-mono uppercase flex items-center gap-2 ${v.claseTextoBase}`}>
            <Thermometer className="w-4 h-4" style={{ color: v.colorHex }} /> Temperatura - {v.nombre} (°C)
          </h3>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos}>
              <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
              <YAxis domain={["auto", "auto"]} stroke="#475569" fontSize={11} unit="°C" />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", fontSize: "12px" }} labelFormatter={(t) => new Date(t).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false })} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line type="monotone" dataKey={v.campoTemp} name={`Temp. ${v.nombre} (°C)`} stroke={v.colorHex} strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ciclos ON/OFF del humidificador */}
      <div className="p-6 glass-panel border-l-4 border-l-amber-500">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold font-mono text-amber-400 uppercase flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Ciclos de trabajo humidificador - {v.nombre} (ON / OFF)
          </h3>
          <span className="text-xs font-mono text-amber-300 font-bold">1 = ENCENDIDO | 0 = APAGADO</span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datos}>
              <defs>
                <linearGradient id={gradRele} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
              <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v2) => (v2 === 1 ? "ON" : "OFF")} stroke="#475569" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", fontSize: "12px" }}
                labelFormatter={(t) => new Date(t).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false })}
                formatter={(val) => [val === 1 ? "ENCENDIDO (ON)" : "APAGADO (OFF)", "Estado relé"]}
              />
              <Area type="stepAfter" dataKey={v.campoRele} name={`Estado humidificador ${v.nombre}`} stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill={`url(#${gradRele})`} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CO2 / calidad de aire */}
      <div className="p-6 glass-panel border-l-4 border-l-purple-500">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold font-mono text-purple-400 uppercase flex items-center gap-2">
            <Wind className="w-4 h-4 text-purple-400" /> Calidad del aire y respiración (CO2) - {v.nombre}
          </h3>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos}>
              <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
              <YAxis domain={["auto", "auto"]} stroke="#475569" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", fontSize: "12px" }} labelFormatter={(t) => new Date(t).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false })} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line type="monotone" dataKey={v.campoCo2} name={`CO2 / Aire ${v.nombre} (PPM/ADC)`} stroke="#a855f7" strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [rango, setRango] = useState<FiltroRangoTiempo>("1h");
  const [pestañaZona, setPestañaZona] = useState<PestañaZona>("atriles");
  const [exportando, setExportando] = useState(false);

  const chartHumRef = useRef<HTMLDivElement>(null);
  const chartTempRef = useRef<HTMLDivElement>(null);
  const chartReleRef = useRef<HTMLDivElement>(null);

  const [fechaInicioStr, setFechaInicioStr] = useState<string>(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [fechaFinStr, setFechaFinStr] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const inicioCustom = new Date(fechaInicioStr).getTime();
  const finCustom = new Date(fechaFinStr).getTime();

  const { datosHistoricos, estadisticas, cargando } = useHistoricalData(rango, inicioCustom, finCustom);
  const { configuracion, conectado, espOnline } = useRealtimeData();

  const atHumMin = configuracion?.atriles.humedadMinima ?? 75;
  const atHumMax = configuracion?.atriles.humedadMaxima ?? 85;
  const deHumMin = configuracion?.descanso.humedadMinima ?? 75;
  const deHumMax = configuracion?.descanso.humedadMaxima ?? 85;

  const formatearEjeX = (tick: number) => {
    const fecha = new Date(tick);
    const zonaHoraria = "America/Santiago";
    if (rango === "1h" || rango === "6h" || rango === "24h") {
      return fecha.toLocaleTimeString("es-CL", { timeZone: zonaHoraria, hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (rango === "1y" || rango === "3y") {
      return fecha.toLocaleDateString("es-CL", { timeZone: zonaHoraria, month: "short", year: "numeric" });
    }
    return fecha.toLocaleDateString("es-CL", { timeZone: zonaHoraria, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const estZona: EstadisticasZona = pestañaZona === "descanso" ? estadisticas.descanso : estadisticas.atriles;

  const exportarExcel = async () => {
    if (exportando || datosHistoricos.length === 0) return;
    setExportando(true);
    try {
      const libro = new ExcelJS.Workbook();
      libro.creator = "Shiitake Lindo SCADA";
      libro.created = new Date();

      const hojaDatos = libro.addWorksheet("Registros");
      hojaDatos.columns = [
        { header: "Fecha y hora", key: "fecha", width: 22 },
        { header: "Humedad Atriles (%)", key: "humAt", width: 20 },
        { header: "Temp. Atriles (°C)", key: "tempAt", width: 18 },
        { header: "CO2 Atriles (PPM/ADC)", key: "co2At", width: 20 },
        { header: "Humidificador Atriles", key: "releAt", width: 20 },
        { header: "Humedad Descanso (%)", key: "humDe", width: 20 },
        { header: "Temp. Descanso (°C)", key: "tempDe", width: 18 },
        { header: "CO2 Descanso (PPM/ADC)", key: "co2De", width: 20 },
        { header: "Humidificador Descanso", key: "releDe", width: 20 },
      ];
      hojaDatos.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      hojaDatos.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

      datosHistoricos.forEach((p) => {
        hojaDatos.addRow({
          fecha: new Date(p.timestamp).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false }),
          humAt: p.humedadAtriles, tempAt: p.tempAtriles, co2At: p.co2Atriles,
          releAt: p.releAtriles === 1 ? "ENCENDIDO" : p.releAtriles === 0 ? "APAGADO" : "",
          humDe: p.humedadDescanso, tempDe: p.tempDescanso, co2De: p.co2Descanso,
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
        { param: "--- ÁREA 1: ATRILES ---", val: "" },
        { param: "Humedad promedio (%)", val: estadisticas.atriles.humedadPromedio },
        { param: "Humedad mín / máx (%)", val: `${estadisticas.atriles.humedadMin} - ${estadisticas.atriles.humedadMax}` },
        { param: "Temp. promedio (°C)", val: estadisticas.atriles.tempPromedio },
        { param: "Temp. mín / máx (°C)", val: `${estadisticas.atriles.tempMin} - ${estadisticas.atriles.tempMax}` },
        { param: "CO2 / calidad aire promedio", val: estadisticas.atriles.co2Promedio },
        { param: "Humidificador encendido", val: `${Math.floor(estadisticas.atriles.minutosHumidificadorON / 60)}h ${estadisticas.atriles.minutosHumidificadorON % 60}m (${estadisticas.atriles.porcentajeHumidificadorON}%)` },
        { param: "", val: "" },
        { param: "--- ÁREA 2: DESCANSO ---", val: "" },
        { param: "Humedad promedio (%)", val: estadisticas.descanso.humedadPromedio },
        { param: "Humedad mín / máx (%)", val: `${estadisticas.descanso.humedadMin} - ${estadisticas.descanso.humedadMax}` },
        { param: "Temp. promedio (°C)", val: estadisticas.descanso.tempPromedio },
        { param: "Temp. mín / máx (°C)", val: `${estadisticas.descanso.tempMin} - ${estadisticas.descanso.tempMax}` },
        { param: "CO2 / calidad aire promedio", val: estadisticas.descanso.co2Promedio },
        { param: "Humidificador encendido", val: `${Math.floor(estadisticas.descanso.minutosHumidificadorON / 60)}h ${estadisticas.descanso.minutosHumidificadorON % 60}m (${estadisticas.descanso.porcentajeHumidificadorON}%)` },
      ].forEach((f) => hojaResumen.addRow(f));

      // Hoja 3: Curvas y Gráficos (3 gráficas incrustadas como imágenes, capturadas desde el
      // contenedor oculto renderizado más abajo en el JSX).
      const hojaGraficos = libro.addWorksheet("Curvas_y_Graficos");
      hojaGraficos.views = [{ showGridLines: true }];
      hojaGraficos.columns = [{ width: 5 }, { width: 120 }];

      await new Promise((res) => setTimeout(res, 100));

      if (chartHumRef.current && chartTempRef.current && chartReleRef.current) {
        const confImg = { backgroundColor: "#0f172a", quality: 0.95, pixelRatio: 2 };
        const base64Hum = await toPng(chartHumRef.current, confImg);
        const base64Temp = await toPng(chartTempRef.current, confImg);
        const base64Rele = await toPng(chartReleRef.current, confImg);

        const imgId1 = libro.addImage({ base64: base64Hum, extension: "png" });
        hojaGraficos.addImage(imgId1, { tl: { col: 1, row: 1 }, ext: { width: 920, height: 320 } });

        const imgId2 = libro.addImage({ base64: base64Temp, extension: "png" });
        hojaGraficos.addImage(imgId2, { tl: { col: 1, row: 19 }, ext: { width: 920, height: 320 } });

        const imgId3 = libro.addImage({ base64: base64Rele, extension: "png" });
        hojaGraficos.addImage(imgId3, { tl: { col: 1, row: 37 }, ext: { width: 920, height: 320 } });
      }

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
          {/* Cabecera, selector de zona y exportación */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 glass-panel p-6 border-slate-800">
            <div>
              <h1 className="text-lg font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" /> Historial y curvas agronómicas
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Visualización independiente sin superposición por área, con cálculo de KPIs y consumo de humidificadores.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-300 dark:border-slate-800 shadow-inner">
                <button
                  onClick={() => setPestañaZona("atriles")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all flex items-center gap-1.5 ${pestañaZona === "atriles" ? VISUAL_ATRILES.claseBotonActivo : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
                >
                  🌾 Área 1: Atriles
                </button>
                <button
                  onClick={() => setPestañaZona("descanso")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all flex items-center gap-1.5 ${pestañaZona === "descanso" ? VISUAL_DESCANSO.claseBotonActivo : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
                >
                  🌱 Área 2: Descanso
                </button>
                <button
                  onClick={() => setPestañaZona("ambas")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all flex items-center gap-1.5 ${pestañaZona === "ambas" ? "bg-purple-500 text-slate-950 font-bold shadow-md shadow-purple-950/50" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
                >
                  📋 Vista completa (desglosada)
                </button>
              </div>

              <div className="h-6 w-px bg-slate-300 dark:bg-slate-800 hidden sm:block" />

              <button
                onClick={exportarExcel}
                disabled={exportando || cargando || datosHistoricos.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition-all shadow-lg shadow-emerald-950/40"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exportando ? "Generando Excel..." : "Exportar Excel (.xlsx)"}
              </button>
            </div>
          </div>

          {/* Selector de rango + fechas personalizadas */}
          <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              {RANGOS.map((r) => (
                <button
                  key={r.valor}
                  onClick={() => setRango(r.valor)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all ${rango === r.valor ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950/50" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 shadow-sm"}`}
                >
                  {r.etiqueta}
                </button>
              ))}
              <button
                onClick={() => setRango("custom")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all ${rango === "custom" ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950/50" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 shadow-sm"}`}
              >
                🗓️ Personalizado
              </button>
            </div>

            {rango === "custom" && (
              <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900/90 p-2 rounded-xl border border-emerald-500/50">
                <span className="text-xs font-mono text-emerald-500 font-bold">Desde:</span>
                <input type="datetime-local" value={fechaInicioStr} onChange={(e) => setFechaInicioStr(e.target.value)} className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500" />
                <span className="text-xs font-mono text-emerald-500 font-bold">Hasta:</span>
                <input type="datetime-local" value={fechaFinStr} onChange={(e) => setFechaFinStr(e.target.value)} className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500" />
              </div>
            )}
          </div>

          {cargando ? (
            <div className="p-12 glass-panel flex flex-col items-center justify-center text-center border-slate-800">
              <Activity className="w-10 h-10 text-emerald-400 animate-pulse mb-4" />
              <h3 className="text-sm font-bold tracking-wider text-slate-800 dark:text-slate-100 uppercase font-mono">Sincronizando historial...</h3>
            </div>
          ) : datosHistoricos.length === 0 ? (
            <div className="p-16 glass-panel flex flex-col items-center justify-center text-center border-slate-800">
              <Database className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-4" />
              <h3 className="text-sm font-bold tracking-wider text-slate-800 dark:text-slate-300 uppercase font-mono">Sin registros en este intervalo</h3>
              <p className="text-xs text-slate-600 dark:text-slate-500 font-mono mt-2 max-w-md">No hay datos almacenados para el rango o fechas seleccionadas.</p>
            </div>
          ) : (
            <>
              {/* KPIs del periodo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <TarjetaKpi
                  etiqueta="HUMEDAD PROMEDIO" valor={`${estZona.humedadPromedio}%`} icono={<Droplets className="w-4 h-4 text-cyan-400" />} colorValor="text-cyan-400"
                  pie={<><span>Mín: <strong className="text-slate-300">{estZona.humedadMin}%</strong></span><span>Máx: <strong className="text-slate-300">{estZona.humedadMax}%</strong></span></>}
                />
                <TarjetaKpi
                  etiqueta="TEMP. PROMEDIO" valor={`${estZona.tempPromedio}°C`} icono={<Thermometer className="w-4 h-4 text-emerald-400" />} colorValor="text-emerald-400"
                  pie={<><span>Mín: <strong className="text-slate-300">{estZona.tempMin}°C</strong></span><span>Máx: <strong className="text-slate-300">{estZona.tempMax}°C</strong></span></>}
                />
                <TarjetaKpi
                  etiqueta="HUMIDIFICADOR ACTIVO" valor={`${Math.floor(estZona.minutosHumidificadorON / 60)}h ${estZona.minutosHumidificadorON % 60}m`} icono={<Clock className="w-4 h-4 text-amber-400" />} colorValor="text-amber-400"
                  pie={<><span>Ciclo trabajo:</span><strong className="text-amber-300">{estZona.porcentajeHumidificadorON}% del tiempo</strong></>}
                />
                <TarjetaKpi
                  etiqueta="CALIDAD AIRE / CO2" valor={`${estZona.co2Promedio}`} unidad="PPM/ADC" icono={<Wind className="w-4 h-4 text-purple-400" />} colorValor="text-purple-400"
                  pie={<><span>Estado muestras:</span><strong className="text-emerald-400">{estadisticas.totalRegistros} pts</strong></>}
                />
              </div>

              {(pestañaZona === "atriles" || pestañaZona === "ambas") && (
                <CurvasZona v={VISUAL_ATRILES} datos={datosHistoricos} humMin={atHumMin} humMax={atHumMax} formatearEjeX={formatearEjeX} />
              )}
              {(pestañaZona === "descanso" || pestañaZona === "ambas") && (
                <CurvasZona v={VISUAL_DESCANSO} datos={datosHistoricos} humMin={deHumMin} humMax={deHumMax} formatearEjeX={formatearEjeX} />
              )}
            </>
          )}

          {/* Contenedor oculto para capturar las 3 gráficas incrustadas en el Excel (off-screen) */}
          <div className="fixed -left-[9999px] top-0 w-[960px] bg-slate-900 p-6 space-y-8 text-slate-100 font-mono pointer-events-none">
            <div ref={chartHumRef} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl w-[920px] h-[320px]">
              <h3 className="text-sm font-bold font-mono text-cyan-400 uppercase mb-4 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-400" /> Curva de humedad relativa - Atriles vs Descanso (% RH)
              </h3>
              <AreaChart width={870} height={230} data={datosHistoricos}>
                <defs>
                  <linearGradient id="gradExHumAt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExHumDe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
                <YAxis domain={[40, 100]} stroke="#475569" fontSize={11} unit="%" />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area type="monotone" dataKey="humedadAtriles" name="Humedad Atriles (%)" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#gradExHumAt)" />
                <Area type="monotone" dataKey="humedadDescanso" name="Humedad Descanso (%)" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gradExHumDe)" />
              </AreaChart>
            </div>

            <div ref={chartTempRef} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl w-[920px] h-[320px]">
              <h3 className="text-sm font-bold font-mono text-amber-400 uppercase mb-4 flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-400" /> Curva de temperatura - Atriles vs Descanso (°C)
              </h3>
              <LineChart width={870} height={230} data={datosHistoricos}>
                <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
                <YAxis domain={["auto", "auto"]} stroke="#475569" fontSize={11} unit="°C" />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line type="monotone" dataKey="tempAtriles" name="Temp. Atriles (°C)" stroke="#06b6d4" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="tempDescanso" name="Temp. Descanso (°C)" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </LineChart>
            </div>

            <div ref={chartReleRef} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl w-[920px] h-[320px]">
              <h3 className="text-sm font-bold font-mono text-emerald-400 uppercase mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" /> Tiempo de operación humidificadores - Ciclos ON/OFF
              </h3>
              <LineChart width={870} height={230} data={datosHistoricos}>
                <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatearEjeX} stroke="#475569" fontSize={11} />
                <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => (v === 1 ? "ON (1)" : "OFF (0)")} stroke="#475569" fontSize={11} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line type="stepAfter" dataKey="releAtriles" name="Relé Atriles" stroke="#06b6d4" strokeWidth={2.5} dot={false} />
                <Line type="stepAfter" dataKey="releDescanso" name="Relé Descanso" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </LineChart>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

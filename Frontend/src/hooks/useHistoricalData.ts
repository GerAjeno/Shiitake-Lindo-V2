"use client";

/**
 * @file useHistoricalData.ts
 * @description Hook para consultar el historial contra el backend nuevo (REST /api/historial),
 * en reemplazo de las consultas directas a Firebase RTDB. La resolución (30s/5min/hora) la
 * elige automáticamente el backend según el largo del rango pedido.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type FiltroRangoTiempo = "1h" | "6h" | "24h" | "7d" | "30d" | "3m" | "6m" | "1y" | "3y" | "custom";

export interface PuntoHistorico {
  timestamp: number;
  humedadAtriles: number | null;
  tempAtriles: number | null;
  releAtriles: number | null;
  co2Atriles: number | null;
  humedadDescanso: number | null;
  tempDescanso: number | null;
  releDescanso: number | null;
  co2Descanso: number | null;
}

export interface EstadisticasZona {
  humedadPromedio: number;
  humedadMin: number;
  humedadMax: number;
  tempPromedio: number;
  tempMin: number;
  tempMax: number;
  co2Promedio: number;
  minutosHumidificadorON: number;
  porcentajeHumidificadorON: number;
}

export interface EstadisticasHistorial {
  totalRegistros: number;
  rangoHorasTotal: number;
  atriles: EstadisticasZona;
  descanso: EstadisticasZona;
}

const ESTADISTICAS_VACIAS_ZONA: EstadisticasZona = {
  humedadPromedio: 0, humedadMin: 0, humedadMax: 0,
  tempPromedio: 0, tempMin: 0, tempMax: 0, co2Promedio: 0,
  minutosHumidificadorON: 0, porcentajeHumidificadorON: 0,
};

function inicioMillisPorRango(rango: FiltroRangoTiempo, ahora: number): number {
  const HORA = 3600 * 1000, DIA = 24 * HORA;
  switch (rango) {
    case "1h": return ahora - HORA;
    case "6h": return ahora - 6 * HORA;
    case "24h": return ahora - DIA;
    case "7d": return ahora - 7 * DIA;
    case "30d": return ahora - 30 * DIA;
    case "3m": return ahora - 90 * DIA;
    case "6m": return ahora - 180 * DIA;
    case "1y": return ahora - 365 * DIA;
    case "3y": return ahora - 1095 * DIA;
    default: return ahora - HORA;
  }
}

function calcularStats(puntos: PuntoHistorico[], campoHum: "humedadAtriles" | "humedadDescanso", campoTemp: "tempAtriles" | "tempDescanso", campoRele: "releAtriles" | "releDescanso", campoCo2: "co2Atriles" | "co2Descanso", rangoMs: number): EstadisticasZona {
  const validos = puntos.filter((p) => p[campoHum] !== null);
  if (validos.length === 0) return ESTADISTICAS_VACIAS_ZONA;

  const humedades = validos.map((p) => p[campoHum] as number);
  const temps = validos.map((p) => p[campoTemp] as number);
  const co2s = puntos.filter((p) => p[campoCo2] !== null).map((p) => p[campoCo2] as number);
  let millisOn = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    const delta = puntos[i + 1].timestamp - puntos[i].timestamp;
    if (delta > 0 && delta < 600_000 && puntos[i][campoRele] === 1) millisOn += delta;
  }

  return {
    humedadPromedio: Number((humedades.reduce((a, b) => a + b, 0) / humedades.length).toFixed(1)),
    humedadMin: Number(Math.min(...humedades).toFixed(1)),
    humedadMax: Number(Math.max(...humedades).toFixed(1)),
    tempPromedio: Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
    tempMin: Number(Math.min(...temps).toFixed(1)),
    tempMax: Number(Math.max(...temps).toFixed(1)),
    co2Promedio: co2s.length > 0 ? Number((co2s.reduce((a, b) => a + b, 0) / co2s.length).toFixed(0)) : 0,
    minutosHumidificadorON: Math.round(millisOn / 60000),
    porcentajeHumidificadorON: Math.min(Math.round((millisOn / Math.max(rangoMs, 1)) * 100), 100),
  };
}

export function useHistoricalData(rango: FiltroRangoTiempo, inicioCustom?: number, finCustom?: number) {
  const [datosHistoricos, setDatosHistoricos] = useState<PuntoHistorico[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasHistorial>({
    totalRegistros: 0, rangoHorasTotal: 0, atriles: ESTADISTICAS_VACIAS_ZONA, descanso: ESTADISTICAS_VACIAS_ZONA,
  });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const ahora = Date.now();
      const desde = rango === "custom" && inicioCustom ? inicioCustom : inicioMillisPorRango(rango, ahora);
      const hasta = rango === "custom" && finCustom ? finCustom : ahora;

      try {
        const [resAtriles, resDescanso] = await Promise.all([
          apiFetch<{ puntos: any[] }>(`/api/historial?zona=atriles&desde=${new Date(desde).toISOString()}&hasta=${new Date(hasta).toISOString()}`),
          apiFetch<{ puntos: any[] }>(`/api/historial?zona=descanso&desde=${new Date(desde).toISOString()}&hasta=${new Date(hasta).toISOString()}`),
        ]);
        if (cancelado) return;

        const porTs = new Map<number, PuntoHistorico>();
        const upsert = (ts: number) => {
          if (!porTs.has(ts)) {
            porTs.set(ts, { timestamp: ts, humedadAtriles: null, tempAtriles: null, releAtriles: null, co2Atriles: null, humedadDescanso: null, tempDescanso: null, releDescanso: null, co2Descanso: null });
          }
          return porTs.get(ts)!;
        };
        for (const p of resAtriles.puntos) {
          const ts = new Date(p.ts).getTime();
          const punto = upsert(ts);
          punto.humedadAtriles = p.humedad ?? null;
          punto.tempAtriles = p.temperatura ?? null;
          punto.releAtriles = p.releEncendido !== undefined ? (p.releEncendido ? 1 : 0) : null;
          punto.co2Atriles = p.co2 ?? null;
        }
        for (const p of resDescanso.puntos) {
          const ts = new Date(p.ts).getTime();
          const punto = upsert(ts);
          punto.humedadDescanso = p.humedad ?? null;
          punto.tempDescanso = p.temperatura ?? null;
          punto.releDescanso = p.releEncendido !== undefined ? (p.releEncendido ? 1 : 0) : null;
          punto.co2Descanso = p.co2 ?? null;
        }

        const ordenados = Array.from(porTs.values()).sort((a, b) => a.timestamp - b.timestamp);
        setDatosHistoricos(ordenados);

        const rangoMs = hasta - desde;
        setEstadisticas({
          totalRegistros: ordenados.length,
          rangoHorasTotal: Number((rangoMs / 3600000).toFixed(1)),
          atriles: calcularStats(ordenados, "humedadAtriles", "tempAtriles", "releAtriles", "co2Atriles", rangoMs),
          descanso: calcularStats(ordenados, "humedadDescanso", "tempDescanso", "releDescanso", "co2Descanso", rangoMs),
        });
      } catch (err) {
        console.error("Error consultando historial:", err);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, [rango, inicioCustom, finCustom]);

  return { datosHistoricos, estadisticas, cargando };
}

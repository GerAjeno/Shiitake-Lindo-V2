"use client";

/**
 * @file SensorHealthMatrix.tsx
 * @description Matriz de salud individual para cada sensor (DHT #1-4, MQ #1-2). Reconstruida
 * a partir del sistema anterior — indica claramente cuál sensor específico falló.
 */

import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Activity } from "lucide-react";
import type { MatrizSensores, EstadoSensor } from "@shared/types";

interface Props {
  sensores: MatrizSensores | null;
}

export function SensorHealthMatrix({ sensores }: Props) {
  if (!sensores) {
    return (
      <div className="p-6 glass-panel flex items-center justify-center text-slate-500 font-mono text-sm">
        Esperando paquete de diagnóstico de sensores del controlador...
      </div>
    );
  }

  const listaSensores = [
    { id: "Humedad DHT #1", tipo: "Temp / Humedad (Atriles)", estado: sensores.dht1.estado, valor: `${sensores.dht1.humedad}% RH | ${sensores.dht1.temperatura}°C` },
    { id: "Humedad DHT #2", tipo: "Temp / Humedad (Atriles)", estado: sensores.dht2.estado, valor: `${sensores.dht2.humedad}% RH | ${sensores.dht2.temperatura}°C` },
    { id: "Humedad DHT #3", tipo: "Temp / Humedad (Descanso)", estado: sensores.dht3.estado, valor: `${sensores.dht3.humedad}% RH | ${sensores.dht3.temperatura}°C` },
    { id: "Humedad DHT #4", tipo: "Temp / Humedad (Descanso)", estado: sensores.dht4.estado, valor: `${sensores.dht4.humedad}% RH | ${sensores.dht4.temperatura}°C` },
    { id: "Calidad de Aire MQ-135 #1", tipo: "Calidad Aire (Atriles)", estado: sensores.mq1.estado, valor: `Analógico: ${sensores.mq1.valorCrudo} ADC (${sensores.mq1.nivel})` },
    { id: "Calidad de Aire MQ-135 #2", tipo: "Calidad Aire (Descanso)", estado: sensores.mq2.estado, valor: `Analógico: ${sensores.mq2.valorCrudo} ADC (${sensores.mq2.nivel})` },
  ];

  const badgeEstado = (est: EstadoSensor) => {
    if (est === "OK") {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" /> OK
        </span>
      );
    }
    if (est === "Offline") {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-mono animate-pulse">
          <XCircle className="w-3.5 h-3.5" /> Desconectado
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-mono">
        <AlertTriangle className="w-3.5 h-3.5" /> Fallo Lectura
      </span>
    );
  };

  return (
    <div className="p-6 glass-panel">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-800/80">
        <h3 className="text-sm font-bold tracking-wider text-slate-800 dark:text-slate-200 uppercase flex items-center gap-2 font-mono">
          <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Diagnóstico Individual de Sensores
        </h3>
        <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">Lectura c/5 segundos</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {listaSensores.map((sn) => (
          <div
            key={sn.id}
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
              sn.estado === "OK"
                ? "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
                : "bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/40 shadow-sm dark:shadow-lg dark:shadow-rose-950/30"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{sn.id}</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-mono">{sn.tipo}</p>
                </div>
                {badgeEstado(sn.estado)}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 font-mono text-xs text-slate-600 dark:text-slate-400">
                {sn.valor}
              </div>
            </div>

            {sn.estado !== "OK" && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 dark:bg-rose-900/40 border border-rose-500/50 text-[11px] text-rose-700 dark:text-rose-200 font-mono flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <span><strong className="text-rose-800 dark:text-rose-300">Acción requerida:</strong> Sensor averiado o desconectado. Revise el cable de datos o reemplace esta unidad física.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

/**
 * @file SensorHealthMatrix.tsx
 * @description Matriz de salud individual para cada sensor del pool de 6 (DHT1/DHT2 + SHT1-4,
 * ver Shared/types.ts) más los MQ #1-2. Indica claramente cuál sensor específico falló, y a qué
 * zona está asignado hoy (la asignación es config libre del usuario, no una relación fija).
 */

import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Activity } from "lucide-react";
import type { MatrizSensores, EstadoSensor, ConfiguracionSistema, IdSensorTempHum } from "@shared/types";

interface Props {
  sensores: MatrizSensores | null;
  asignacionSensores?: ConfiguracionSistema["asignacionSensores"];
}

export function SensorHealthMatrix({ sensores, asignacionSensores }: Props) {
  if (!sensores) {
    return (
      <div className="p-6 glass-panel flex items-center justify-center text-slate-500 font-mono text-sm">
        Esperando paquete de diagnóstico de sensores del controlador...
      </div>
    );
  }

  const lecturaDe: Record<IdSensorTempHum, MatrizSensores["dht1"]> = {
    DHT1: sensores.dht1, DHT2: sensores.dht2,
    SHT1: sensores.sht1, SHT2: sensores.sht2, SHT3: sensores.sht3, SHT4: sensores.sht4,
  };

  const entradaSensor = (id: IdSensorTempHum, tipo: string) => {
    const l = lecturaDe[id];
    return { id: `Humedad ${id}`, tipo, estado: l.estado, valor: `${l.humedad}% RH | ${l.temperatura}°C` };
  };

  // Agrupado por zona (todo Atriles primero, después todo Descanso) en vez de por número fijo de
  // sensor — con la asignación configurable, el número ya no indica la zona. Solo se muestran los
  // sensores del pool que hoy están asignados a alguna zona (uno sin asignar no se lee ni se usa
  // para control). Los MQ135 no son parte de este pool, van siempre al final de su zona.
  const listaSensores = [
    ...(asignacionSensores?.atriles ?? []).map((id) => entradaSensor(id, "Temp / Humedad (Atriles)")),
    { id: "Calidad de Aire MQ-135 #1", tipo: "Calidad Aire (Atriles)", estado: sensores.mq1.estado, valor: `Analógico: ${sensores.mq1.valorCrudo} ADC (${sensores.mq1.nivel})` },
    ...(asignacionSensores?.descanso ?? []).map((id) => entradaSensor(id, "Temp / Humedad (Descanso)")),
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

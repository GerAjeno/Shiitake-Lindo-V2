"use client";

/**
 * @file AsignacionSensoresPanel.tsx
 * @description Elegí libremente qué sensores del pool de 6 (2 DHT22 físicos en GPIO 4/5 + 4
 * SHT35-RS485 por dirección Modbus) alimentan cada zona — reemplaza el mapeo fijo que existía
 * cuando los 4 sensores de humedad/temperatura eran todos SHT35 (direcciones 1,2->Atriles,
 * 3,4->Descanso). Los SHT35 de Descanso dieron problemas, así que ahora se puede, por ejemplo,
 * poner DHT1 y SHT4 en Atriles, y SHT2 y SHT1 en Descanso — cualquier combinación, sin relación
 * fija entre el número del sensor y la zona.
 *
 * Cada sensor solo puede estar en una zona a la vez (o en ninguna) — se modela con un selector por
 * sensor en vez de checkboxes por zona, así la exclusión mutua queda garantizada por construcción,
 * no por validación aparte.
 */

import { useEffect, useState } from "react";
import { GitBranch, Loader2, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ConfiguracionSistema, IdSensorTempHum } from "@shared/types";
import { IDS_SENSOR_TEMP_HUM } from "@shared/types";

interface Props {
  configuracion: ConfiguracionSistema | null;
}

type Destino = "atriles" | "descanso" | "";

const ETIQUETAS: Record<IdSensorTempHum, string> = {
  DHT1: "DHT1 (GPIO 4)",
  DHT2: "DHT2 (GPIO 5)",
  SHT1: "SHT1 (Modbus 1)",
  SHT2: "SHT2 (Modbus 2)",
  SHT3: "SHT3 (Modbus 3)",
  SHT4: "SHT4 (Modbus 4)",
};

function asignacionAMapa(asignacion: ConfiguracionSistema["asignacionSensores"] | undefined): Record<IdSensorTempHum, Destino> {
  const mapa = Object.fromEntries(IDS_SENSOR_TEMP_HUM.map((id) => [id, "" as Destino])) as Record<IdSensorTempHum, Destino>;
  for (const id of asignacion?.atriles ?? []) mapa[id] = "atriles";
  for (const id of asignacion?.descanso ?? []) mapa[id] = "descanso";
  return mapa;
}

export function AsignacionSensoresPanel({ configuracion }: Props) {
  const [mapa, setMapa] = useState<Record<IdSensorTempHum, Destino> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configuracion) setMapa(asignacionAMapa(configuracion.asignacionSensores));
  }, [configuracion]);

  if (!mapa) return null;

  const original = asignacionAMapa(configuracion?.asignacionSensores);
  const hayDiferencias = JSON.stringify(mapa) !== JSON.stringify(original);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const asignacionSensores = {
        atriles: IDS_SENSOR_TEMP_HUM.filter((id) => mapa[id] === "atriles"),
        descanso: IDS_SENSOR_TEMP_HUM.filter((id) => mapa[id] === "descanso"),
      };
      await apiFetch("/api/config", { method: "PUT", body: JSON.stringify({ asignacionSensores }) });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <GitBranch className="w-4 h-4" />
        <h3 className="text-sm font-mono font-bold">Asignación de sensores por zona</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
        Elegí qué sensor va en cada zona — cualquier combinación de los 6 disponibles (2 DHT22 + 4 SHT35).
        Un sensor sin asignar no se lee ni se usa para el control de ninguna zona.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {IDS_SENSOR_TEMP_HUM.map((id) => (
          <label key={id} className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
            <span>{ETIQUETAS[id]}</span>
            <select
              value={mapa[id]}
              onChange={(e) => setMapa({ ...mapa, [id]: e.target.value as Destino })}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono"
            >
              <option value="">Sin asignar</option>
              <option value="atriles">Atriles</option>
              <option value="descanso">Descanso</option>
            </select>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={guardar} disabled={guardando || !hayDiferencias}
          className="flex items-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-mono font-bold"
        >
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Guardar
        </button>
        {guardado && <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">✓ Guardado</span>}
        {error && <span className="text-xs font-mono text-rose-600 dark:text-rose-400">✗ {error}</span>}
      </div>
    </div>
  );
}

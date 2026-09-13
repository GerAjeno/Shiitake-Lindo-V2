"use client";

/**
 * @file SensoresHabilitadosPanel.tsx
 * @description Habilita/deshabilita sensores SHT35 individuales — útil cuando uno queda
 * defectuoso (ver caso sensor 4 de Descanso) y hace falta que la zona opere solo con el otro de
 * la pareja mientras se repara/reemplaza, sin disparar "fallo crítico" ni "discrepancia excesiva".
 *
 * Escribe `sensoresHabilitados` completo en PUT /api/config — ese endpoint REEMPLAZA el objeto
 * entero (no mergea por clave), así que este componente parte siempre del `configuracion` cargado
 * y solo cambia los campos que el usuario toca, para no pisar mq1/mq2 sin querer.
 */

import { useEffect, useState } from "react";
import { Power, Loader2, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Switch } from "@/components/ui/Switch";
import type { ConfiguracionSistema } from "@shared/types";

interface Props {
  configuracion: ConfiguracionSistema | null;
}

const ETIQUETAS: { clave: "dht1" | "dht2" | "dht3" | "dht4"; nombre: string; zona: string }[] = [
  { clave: "dht1", nombre: "SHT35 #1", zona: "Atriles" },
  { clave: "dht2", nombre: "SHT35 #2", zona: "Atriles" },
  { clave: "dht3", nombre: "SHT35 #3", zona: "Descanso" },
  { clave: "dht4", nombre: "SHT35 #4", zona: "Descanso" },
];

export function SensoresHabilitadosPanel({ configuracion }: Props) {
  const [local, setLocal] = useState<ConfiguracionSistema["sensoresHabilitados"] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configuracion) setLocal(configuracion.sensoresHabilitados);
  }, [configuracion]);

  if (!local) return null;

  const hayDiferencias = configuracion && JSON.stringify(local) !== JSON.stringify(configuracion.sensoresHabilitados);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/api/config", { method: "PUT", body: JSON.stringify({ sensoresHabilitados: local }) });
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
        <Power className="w-4 h-4" />
        <h3 className="text-sm font-mono font-bold">Sensores SHT35 habilitados</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
        Deshabilitá un sensor puntual si está defectuoso — la zona sigue operando con el otro de su pareja,
        sin generar alertas de fallo crítico ni de discrepancia por ese sensor.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ETIQUETAS.map(({ clave, nombre, zona }) => (
          <label key={clave} className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
            <span>{nombre} <span className="text-slate-400 dark:text-slate-500">({zona})</span></span>
            <Switch activo={local[clave]} onClick={() => setLocal({ ...local, [clave]: !local[clave] })} />
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

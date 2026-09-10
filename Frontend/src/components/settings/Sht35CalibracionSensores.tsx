"use client";

/**
 * @file Sht35CalibracionSensores.tsx
 * @description PERMANENTE — corrige el offset de fábrica de un sensor SHT35 puntual (a diferencia
 * de Sht35DireccionadorTemporal.tsx, que se va a quitar una vez asignadas las 4 direcciones). Útil
 * si al comparar sensores lado a lado uno reporta consistentemente distinto de los demás (más allá
 * de la tolerancia de fábrica, ±3%RH según el datasheet) — o si en el futuro se reemplaza algún
 * sensor y el nuevo necesita el mismo ajuste.
 *
 * Escribe el registro de corrección del propio sensor (0x0104 temperatura / 0x0105 humedad, ver
 * Sht35Direccionador::calibrar) — la corrección queda guardada en el sensor mismo, no en la web.
 */

import { useState } from "react";
import { SlidersHorizontal, Loader2 } from "lucide-react";
import type { TipoComandoManual } from "@shared/types";

interface Props {
  enviarComando: (comando: TipoComandoManual) => Promise<{
    ejecutado: boolean;
    error?: string;
    sht35Lectura?: { temperaturaC: number; humedadPct: number; direccion: number };
  }>;
}

export function Sht35CalibracionSensores({ enviarComando }: Props) {
  const [direccion, setDireccion] = useState(1);
  const [variable, setVariable] = useState<"humedad" | "temperatura">("humedad");
  const [correccion, setCorreccion] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const calibrar = async () => {
    setEnviando(true);
    setResultado(null);
    const r = await enviarComando({ tipo: "sht35_calibrar", direccion, variable, correccion });
    if (r.ejecutado && r.sht35Lectura) {
      setResultado({
        ok: true,
        texto: `Corrección aplicada al sensor ${direccion}. Nueva lectura: ${r.sht35Lectura.temperaturaC.toFixed(1)}°C, ${r.sht35Lectura.humedadPct.toFixed(1)}% HR.`,
      });
    } else {
      setResultado({ ok: false, texto: r.error ?? "Falló sin detalle." });
    }
    setEnviando(false);
  };

  return (
    <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 dark:bg-sky-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
        <SlidersHorizontal className="w-4 h-4" />
        <h3 className="text-sm font-mono font-bold">Calibración de sensores SHT35</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
        Si un sensor lee consistentemente distinto de los demás (más allá de ±3%RH / ±0.3°C, la tolerancia
        de fábrica), corregilo acá — el ajuste queda guardado en el sensor mismo. Usá el signo correcto:
        si lee de más, poné un valor negativo; si lee de menos, positivo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
          Dirección del sensor
          <input
            type="number" min={1} max={247} value={direccion}
            onChange={(e) => setDireccion(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
          Variable
          <select
            value={variable} onChange={(e) => setVariable(e.target.value as "humedad" | "temperatura")}
            className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono"
          >
            <option value="humedad">Humedad (%RH)</option>
            <option value="temperatura">Temperatura (°C)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
          Corrección
          <input
            type="number" step={0.1} min={-50} max={50} value={correccion}
            onChange={(e) => setCorreccion(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <button
          onClick={calibrar} disabled={enviando}
          className="flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-mono font-bold"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
          Aplicar corrección
        </button>
      </div>
      {resultado && (
        <p className={`text-xs font-mono ${resultado.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {resultado.ok ? "✓ " : "✗ "}{resultado.texto}
        </p>
      )}
    </div>
  );
}

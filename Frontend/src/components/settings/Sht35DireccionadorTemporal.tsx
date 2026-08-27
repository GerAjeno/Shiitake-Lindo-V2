"use client";

/**
 * @file Sht35DireccionadorTemporal.tsx
 * @description TEMPORAL — apartado de puesta en marcha para asignar dirección Modbus a cada
 * sensor SHT35-RS485 (vienen de fábrica sin DIP switches, todos con la misma dirección). Se usa
 * una sola vez por sensor: se conecta físicamente UN sensor al bus, se le asigna una dirección
 * (1-4) acá, se confirma con la lectura de temperatura/humedad, y se pasa al siguiente.
 *
 * Quitar este componente (y su uso en settings/page.tsx + el comando "sht35_asignar_direccion"
 * en Shared/types.ts, Backend/src/ws/hub.ts y el firmware) una vez asignadas las 4 direcciones.
 */

import { useState } from "react";
import { Wrench, Loader2 } from "lucide-react";
import type { TipoComandoManual } from "@shared/types";

interface Props {
  enviarComando: (comando: TipoComandoManual) => Promise<{
    ejecutado: boolean;
    error?: string;
    sht35Lectura?: { temperaturaC: number; humedadPct: number };
  }>;
}

export function Sht35DireccionadorTemporal({ enviarComando }: Props) {
  const [direccionActual, setDireccionActual] = useState(1);
  const [nuevaDireccion, setNuevaDireccion] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const asignar = async () => {
    setEnviando(true);
    setResultado(null);
    const r = await enviarComando({ tipo: "sht35_asignar_direccion", direccionActual, nuevaDireccion });
    if (r.ejecutado && r.sht35Lectura) {
      setResultado({
        ok: true,
        texto: `Dirección ${nuevaDireccion} asignada. El sensor respondió: ${r.sht35Lectura.temperaturaC.toFixed(1)}°C, ${r.sht35Lectura.humedadPct.toFixed(1)}% HR.`,
      });
    } else {
      setResultado({ ok: false, texto: r.error ?? "Falló sin detalle." });
    }
    setEnviando(false);
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <Wrench className="w-4 h-4" />
        <h3 className="text-sm font-mono font-bold">Configuración de sensores SHT35 (temporal)</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
        Conectá <strong>un solo sensor físico</strong> al bus RS-485 por vez. Los módulos vienen de fábrica
        con dirección <strong>1</strong> — asignale una definitiva (1-4), verificá la lectura, desconectalo,
        y repetí con el siguiente.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
          Dirección actual del sensor
          <input
            type="number" min={1} max={247} value={direccionActual}
            onChange={(e) => setDireccionActual(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
          Nueva dirección
          <select
            value={nuevaDireccion} onChange={(e) => setNuevaDireccion(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono"
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button
          onClick={asignar} disabled={enviando}
          className="flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-mono font-bold"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
          Asignar dirección
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

"use client";

/**
 * @file page.tsx (Configuración)
 * @description Réplica visual del sistema anterior: selector de modo tipo pills, banner de
 * histéresis + sliders, editor de horarios enriquecido y un solo botón Guardar/Descartar para
 * ambas zonas. Edición restringida a admin/operador (el backend ya lo exige; aquí se deshabilitan
 * los controles para "lectura"). El panel OTA vive arriba, visible solo para admin.
 */

import React, { useEffect, useState } from "react";
import { Save, Check, RefreshCw, Clock, Droplets, Sliders as SlidersIcon, ShieldAlert, CircleAlert } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { apiFetch } from "@/lib/api";
import { FirmwareManager } from "@/components/scada/FirmwareManager";
import { TemporizadorConfig } from "@/components/settings/TemporizadorConfig";
import type { ConfiguracionZona, RangoHorario } from "@shared/types";

interface VisualZona {
  emoji: string;
  titulo: string;
  subtitulo: string;
  colorTexto: string;
  colorBorde: string;
  colorGradiente: string;
  colorBanner: string;
  colorTemaTemporizador: "cyan" | "emerald";
  colorActivoAuto: string;
  releLabel: string;
}

const VISUAL_ATRILES: VisualZona = {
  emoji: "🌾",
  titulo: "Área 1: Atriles (Cultivo Principal)",
  subtitulo: "Sensores asignados: DHT #1, DHT #2, MQ-135 #1",
  colorTexto: "text-cyan-700 dark:text-cyan-400",
  colorBorde: "border-cyan-500/40",
  colorGradiente: "from-cyan-500/5 via-white to-slate-50 dark:from-cyan-950/20 dark:via-slate-900 dark:to-slate-950",
  colorBanner: "bg-cyan-500/10 dark:bg-cyan-950/30 border-cyan-500/30 text-cyan-900 dark:text-cyan-200",
  colorTemaTemporizador: "cyan",
  colorActivoAuto: "bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 shadow-lg shadow-cyan-950/50",
  releLabel: "Relé 1",
};

const VISUAL_DESCANSO: VisualZona = {
  emoji: "🌱",
  titulo: "Área 2: Descanso (Zonas de Reposo)",
  subtitulo: "Sensores asignados: DHT #3, DHT #4, MQ-135 #2",
  colorTexto: "text-emerald-700 dark:text-emerald-400",
  colorBorde: "border-emerald-500/40",
  colorGradiente: "from-emerald-500/5 via-white to-slate-50 dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-950",
  colorBanner: "bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-900 dark:text-emerald-200",
  colorTemaTemporizador: "emerald",
  colorActivoAuto: "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-lg shadow-emerald-950/50",
  releLabel: "Relé 2",
};

function PillModo({ activo, colorActivo, onClick, disabled, children }: { activo: boolean; colorActivo: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`p-2.5 rounded-xl border font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60 ${
        activo ? colorActivo : "bg-white dark:bg-slate-900/50 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

/** Switch clásico (track + perilla deslizante) — usado para el override manual, que aplica al
 * toque en vez de esperar al botón "Guardar" general de la página. */
function InterruptorSwitch({ activo, disabled, cargando, onClick }: { activo: boolean; disabled: boolean; cargando: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={disabled || cargando}
      onClick={onClick}
      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        activo ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
          activo ? "translate-x-8" : "translate-x-1"
        } ${cargando ? "animate-pulse" : ""}`}
      />
    </button>
  );
}

function TarjetaZona({ v, local, soloLectura, onCambiar, onOverrideInmediato }: {
  v: VisualZona; local: ConfiguracionZona; soloLectura: boolean;
  onCambiar: (cambios: Partial<ConfiguracionZona>) => void;
  onOverrideInmediato: (nuevoValor: boolean) => Promise<void>;
}) {
  const margen = local.humedadMaxima - local.humedadMinima;
  const [aplicandoOverride, setAplicandoOverride] = useState(false);
  const [errorOverride, setErrorOverride] = useState<string | null>(null);

  const manejarOverride = async () => {
    setErrorOverride(null);
    setAplicandoOverride(true);
    try {
      await onOverrideInmediato(!local.humidificadorManual);
    } catch (err: any) {
      setErrorOverride(err?.message ?? "No se pudo aplicar el cambio.");
    } finally {
      setAplicandoOverride(false);
    }
  };

  return (
    <div className={`p-6 glass-panel min-w-0 overflow-hidden ${v.colorBorde} bg-gradient-to-br ${v.colorGradiente} space-y-6 rounded-2xl`}>
      <div className="border-b border-slate-200 dark:border-slate-800/80 pb-3">
        <h3 className={`text-base font-black uppercase tracking-wide font-sans flex items-center gap-2 ${v.colorTexto}`}>
          <Droplets className="w-5 h-5" /> {v.emoji} {v.titulo}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-0.5">{v.subtitulo}</p>
      </div>

      {/* Modo de control */}
      <div className="space-y-2">
        <label className="text-xs font-mono uppercase text-slate-700 dark:text-slate-300 block font-bold">Modo de Control ({v.releLabel})</label>
        <div className="grid grid-cols-3 gap-2">
          <PillModo
            activo={local.modo === "AUTO"}
            colorActivo={v.colorActivoAuto}
            disabled={soloLectura}
            onClick={() => onCambiar({ modo: "AUTO" })}
          >
            AUTOMÁTICO
          </PillModo>
          <PillModo
            activo={local.modo === "MANUAL"}
            colorActivo="bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 shadow-lg shadow-amber-950/50"
            disabled={soloLectura}
            onClick={() => onCambiar({ modo: "MANUAL" })}
          >
            MANUAL
          </PillModo>
          <PillModo
            activo={local.modo === "TEMPORIZADO"}
            colorActivo="bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300 shadow-lg shadow-purple-950/50"
            disabled={soloLectura}
            onClick={() => onCambiar({ modo: "TEMPORIZADO" })}
          >
            <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> TEMPORIZADO
          </PillModo>
        </div>
      </div>

      {local.modo === "TEMPORIZADO" && (
        <TemporizadorConfig
          nombreZona={v.titulo.split(":")[0].replace("Área", "").trim()}
          colorTema={v.colorTemaTemporizador}
          rangos={local.rangosHorarios}
          soloLectura={soloLectura}
          onCambiarRangos={(rangosHorarios: RangoHorario[]) => onCambiar({ rangosHorarios })}
        />
      )}

      {local.modo === "MANUAL" && (
        <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-amber-800 dark:text-amber-200 font-bold block">{v.releLabel} Override</span>
              <span className={`text-[11px] font-mono ${local.humidificadorManual ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                {aplicandoOverride ? "Aplicando..." : local.humidificadorManual ? "ENCENDIDO" : "APAGADO"}
              </span>
            </div>
            <InterruptorSwitch activo={local.humidificadorManual} disabled={soloLectura} cargando={aplicandoOverride} onClick={manejarOverride} />
          </div>
          {errorOverride && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-rose-600 dark:text-rose-400">
              <CircleAlert className="w-3.5 h-3.5 shrink-0" /> {errorOverride}
            </div>
          )}
        </div>
      )}

      {/* Histéresis + sliders (siempre visibles, independiente del modo) */}
      <div className="space-y-4 pt-2">
        <div className={`p-3.5 rounded-xl border text-xs font-mono shadow-sm ${v.colorBanner}`}>
          <span className="font-bold">⚡ Control con Histéresis (Banda de Trabajo):</span> {v.releLabel} se encenderá al bajar de la mínima (ej. {local.humedadMinima}%) y se apagará solo al alcanzar la máxima (ej. {local.humedadMaxima}%), previniendo oscilaciones y desgaste prematuro del contactor.
        </div>

        <div>
          <label className="block text-xs font-mono text-cyan-700 dark:text-cyan-400 uppercase mb-2 font-bold">
            Humedad Mínima para Encender Relé: <strong className="text-slate-800 dark:text-slate-100 text-sm">{local.humedadMinima}%</strong>
          </label>
          <input
            type="range" min={50} max={90} step={1} disabled={soloLectura}
            value={local.humedadMinima}
            onChange={(e) => onCambiar({ humedadMinima: Number(e.target.value) })}
            className="w-full accent-cyan-600 dark:accent-cyan-400 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-emerald-700 dark:text-emerald-400 uppercase mb-2 font-bold">
            Humedad Máxima para Apagar Relé: <strong className="text-slate-800 dark:text-slate-100 text-sm">{local.humedadMaxima}%</strong>
          </label>
          <input
            type="range" min={60} max={100} step={1} disabled={soloLectura}
            value={local.humedadMaxima}
            onChange={(e) => onCambiar({ humedadMaxima: Number(e.target.value) })}
            className="w-full accent-emerald-600 dark:accent-emerald-400 disabled:opacity-60"
          />
        </div>

        {margen <= 5 && (
          <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">⚠️ La banda de trabajo es de solo {margen}% — se exige más de 5 puntos porcentuales de separación.</p>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { rol } = useAuth();
  const { actual, configuracion, conectado, espOnline } = useRealtimeData();
  const soloLectura = rol === "lectura" || !rol;

  const [localAtriles, setLocalAtriles] = useState<ConfiguracionZona | null>(null);
  const [localDescanso, setLocalDescanso] = useState<ConfiguracionZona | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  useEffect(() => {
    if (configuracion) {
      setLocalAtriles(configuracion.atriles);
      setLocalDescanso(configuracion.descanso);
    }
  }, [configuracion]);

  const guardarTodo = async () => {
    if (!localAtriles || !localDescanso) return;
    setErrorValidacion(null);

    if (localAtriles.humedadMaxima - localAtriles.humedadMinima <= 5) {
      setErrorValidacion(`Protección Electromecánica (Atriles): la diferencia entre apagar (${localAtriles.humedadMaxima}%) y encender (${localAtriles.humedadMinima}%) es de solo ${localAtriles.humedadMaxima - localAtriles.humedadMinima}%. Debe mantener más de 5 puntos porcentuales de separación.`);
      return;
    }
    if (localDescanso.humedadMaxima - localDescanso.humedadMinima <= 5) {
      setErrorValidacion(`Protección Electromecánica (Descanso): la diferencia entre apagar (${localDescanso.humedadMaxima}%) y encender (${localDescanso.humedadMinima}%) es de solo ${localDescanso.humedadMaxima - localDescanso.humedadMinima}%. Debe mantener más de 5 puntos porcentuales de separación.`);
      return;
    }

    setGuardando(true);
    setGuardado(false);
    try {
      await Promise.all([
        apiFetch("/api/config/atriles", { method: "PUT", body: JSON.stringify(localAtriles) }),
        apiFetch("/api/config/descanso", { method: "PUT", body: JSON.stringify(localDescanso) }),
      ]);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setGuardando(false);
    }
  };

  /**
   * A diferencia del resto de los campos (que esperan al botón "Guardar" general), el override
   * manual aplica al toque — igual que en el sistema anterior. Manda un PUT parcial e inmediato
   * con { modo: 'MANUAL', humidificadorManual }, sin depender de si hay otros cambios sin guardar
   * en la tarjeta (sliders, horarios) para no aplicarlos de rebote.
   */
  const overrideInmediato = async (zona: "atriles" | "descanso", nuevoValor: boolean) => {
    // El endpoint devuelve la ConfiguracionSistema completa (ambas zonas), no solo la editada.
    const completa = await apiFetch<{ atriles: ConfiguracionZona; descanso: ConfiguracionZona }>(`/api/config/${zona}`, {
      method: "PUT",
      body: JSON.stringify({ modo: "MANUAL", humidificadorManual: nuevoValor }),
    });
    setLocalAtriles(completa.atriles);
    setLocalDescanso(completa.descanso);
  };

  const descartarEdicion = () => {
    setErrorValidacion(null);
    if (configuracion) {
      setLocalAtriles(configuracion.atriles);
      setLocalDescanso(configuracion.descanso);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6 max-w-5xl">
          {errorValidacion && (
            <div className="bg-rose-500/10 dark:bg-rose-950/80 border border-rose-500/80 p-4 rounded-xl flex items-center gap-3 text-rose-800 dark:text-rose-200 font-mono text-xs shadow-lg">
              <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{errorValidacion}</span>
            </div>
          )}

          <div className="flex items-center justify-between glass-panel p-6">
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <SlidersIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> Configuración Remota Dual en Tiempo Real
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">Los parámetros y modos se gestionan y transmiten de forma independiente por área</p>
            </div>
            {guardado && (
              <span className="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-lg text-xs font-mono font-bold">
                ✓ Sincronizado en Cloud
              </span>
            )}
          </div>

          {rol === "admin" && <FirmwareManager actual={actual} />}

          {!localAtriles || !localDescanso ? (
            <p className="text-sm text-slate-500 font-mono">Cargando configuración...</p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TarjetaZona v={VISUAL_ATRILES} local={localAtriles} soloLectura={soloLectura} onCambiar={(c) => setLocalAtriles({ ...localAtriles, ...c })} onOverrideInmediato={(v) => overrideInmediato("atriles", v)} />
                <TarjetaZona v={VISUAL_DESCANSO} local={localDescanso} soloLectura={soloLectura} onCambiar={(c) => setLocalDescanso({ ...localDescanso, ...c })} onOverrideInmediato={(v) => overrideInmediato("descanso", v)} />
              </div>

              {!soloLectura && (
                <div className="p-6 glass-panel">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      type="button"
                      onClick={guardarTodo}
                      disabled={guardando}
                      className={`flex-1 py-4 rounded-xl font-black shadow-lg transition-all duration-200 text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 ${
                        guardado
                          ? "bg-emerald-500 text-slate-950 shadow-emerald-500/50 ring-4 ring-emerald-400/50"
                          : "bg-gradient-to-r from-cyan-600 via-emerald-600 to-cyan-500 hover:from-cyan-500 hover:to-emerald-500 text-slate-950 hover:shadow-xl"
                      }`}
                    >
                      {guardando ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" /> <span>Guardando...</span>
                        </>
                      ) : guardado ? (
                        <>
                          <Check className="w-6 h-6" /> <span>¡Guardado!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" /> <span>Guardar</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={descartarEdicion}
                      className="px-6 py-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 shrink-0 shadow-sm"
                      title="Restablecer los campos con los valores actuales en la nube"
                    >
                      <RefreshCw className="w-4 h-4" /> <span>Descartar Edición</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}

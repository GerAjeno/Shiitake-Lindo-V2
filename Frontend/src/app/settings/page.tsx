"use client";

/**
 * @file page.tsx (Configuración)
 * @description Réplica visual del sistema anterior: selector de modo tipo pills, banner de
 * histéresis + sliders, editor de horarios enriquecido y un solo botón Guardar/Descartar para
 * ambas zonas. Edición restringida a admin/operador (el backend ya lo exige; aquí se deshabilitan
 * los controles para "lectura"). El panel OTA vive arriba, visible solo para admin.
 */

import React, { useEffect, useRef, useState } from "react";
import { Save, Check, RefreshCw, Clock, Droplets, Sliders as SlidersIcon, ShieldAlert, CircleAlert, KeyRound, Download, Upload } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { apiFetch } from "@/lib/api";
import { FirmwareManager } from "@/components/scada/FirmwareManager";
import { Sht35DireccionadorTemporal } from "@/components/settings/Sht35DireccionadorTemporal";
import { TemporizadorConfig } from "@/components/settings/TemporizadorConfig";
import { Switch } from "@/components/ui/Switch";
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

function csvEscaparCelda(valor: unknown): string {
  const texto = String(valor ?? "");
  return `"${texto.replace(/"/g, '""')}"`;
}

/** CSV con los bloques horarios (TEMPORIZADO) de ambas zonas — export exclusivo de admin, ver
 * SettingsPage. Se arma en el cliente a partir de la config ya cargada, no requiere un endpoint
 * nuevo (el mismo dato ya se muestra en pantalla al resto de los roles, solo sin editar). */
function construirCsvHorarios(atriles: ConfiguracionZona, descanso: ConfiguracionZona): string {
  const encabezado = ["Zona", "ID", "Inicio", "Fin", "Habilitado"];
  const filas: string[][] = [];
  for (const [nombreZona, zona] of [["Atriles", atriles], ["Descanso", descanso]] as [string, ConfiguracionZona][]) {
    for (const r of zona.rangosHorarios) {
      filas.push([nombreZona, r.id, r.inicio, r.fin, r.habilitado ? "Sí" : "No"]);
    }
  }
  const lineas = [encabezado, ...filas].map((fila) => fila.map(csvEscaparCelda).join(","));
  return "﻿" + lineas.join("\r\n");
}

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NOMBRE_A_ZONA: Record<string, "atriles" | "descanso"> = {
  atriles: "atriles",
  descanso: "descanso",
};

function normalizarCabecera(celda: string): string {
  return celda.trim().toLowerCase();
}

function parsearLineaCsv(linea: string): string[] {
  return linea.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

/** true si el valor de la columna Habilitado debe interpretarse como deshabilitado — todo lo demás
 * (incluida la columna vacía/ausente) se toma como habilitado, para que agregar un bloque nuevo en
 * el archivo sea tan simple como escribir una línea con solo zona/inicio/fin. */
function esDeshabilitado(valor: string | undefined): boolean {
  const v = (valor ?? "").trim().toLowerCase();
  return v === "no" || v === "false" || v === "0";
}

interface ResultadoImportacion {
  atriles?: RangoHorario[];
  descanso?: RangoHorario[];
  advertencias: string[];
}

/**
 * Parsea el CSV de horarios (mismo formato que construirCsvHorarios: columnas Zona/Inicio/Fin y
 * opcionalmente ID/Habilitado, en cualquier orden — así un archivo exportado se puede re-importar
 * tal cual). Solo devuelve las zonas presentes en el archivo; una zona ausente queda intacta.
 * Los bloques de una zona se reemplazan por completo por los del archivo (no se fusionan con los
 * existentes), y las líneas inválidas se saltean en vez de abortar toda la importación.
 */
function parsearCsvHorarios(texto: string): ResultadoImportacion {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const advertencias: string[] = [];
  if (lineas.length === 0) return { advertencias: ["El archivo está vacío."] };

  const cabecera = parsearLineaCsv(lineas[0]).map(normalizarCabecera);
  const idxZona = cabecera.indexOf("zona");
  const idxInicio = cabecera.indexOf("inicio");
  const idxFin = cabecera.indexOf("fin");
  const idxHabilitado = cabecera.indexOf("habilitado");
  if (idxZona < 0 || idxInicio < 0 || idxFin < 0) {
    return { advertencias: ['La primera línea debe ser el encabezado con al menos las columnas "Zona,Inicio,Fin" (ver botón Exportar Horario para un ejemplo).'] };
  }

  const porZona: Record<"atriles" | "descanso", RangoHorario[]> = { atriles: [], descanso: [] };
  const zonasPresentes = new Set<"atriles" | "descanso">();

  lineas.slice(1).forEach((linea, i) => {
    const numeroLinea = i + 2; // +1 por el encabezado, +1 porque las líneas se cuentan desde 1
    const celdas = parsearLineaCsv(linea);
    const nombreZona = normalizarCabecera(celdas[idxZona] ?? "");
    const zona = NOMBRE_A_ZONA[nombreZona];
    if (!zona) {
      advertencias.push(`Línea ${numeroLinea}: zona "${celdas[idxZona] ?? ""}" no reconocida (debe ser "Atriles" o "Descanso"), se ignoró.`);
      return;
    }
    const inicio = celdas[idxInicio] ?? "";
    const fin = celdas[idxFin] ?? "";
    if (!HORA_REGEX.test(inicio) || !HORA_REGEX.test(fin)) {
      advertencias.push(`Línea ${numeroLinea}: horario "${inicio}"-"${fin}" inválido (debe ser HH:mm), se ignoró.`);
      return;
    }
    zonasPresentes.add(zona);
    if (porZona[zona].length >= 40) {
      advertencias.push(`Línea ${numeroLinea}: la zona ${nombreZona} ya llegó a 40 bloques (el máximo del firmware), se ignoró el resto.`);
      return;
    }
    porZona[zona].push({
      id: `rango_${Date.now()}_${porZona[zona].length}`,
      inicio,
      fin,
      habilitado: !esDeshabilitado(idxHabilitado >= 0 ? celdas[idxHabilitado] : undefined),
    });
  });

  const resultado: ResultadoImportacion = { advertencias };
  if (zonasPresentes.has("atriles")) resultado.atriles = porZona.atriles;
  if (zonasPresentes.has("descanso")) resultado.descanso = porZona.descanso;
  return resultado;
}

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
            <Switch activo={local.humidificadorManual} disabled={soloLectura} cargando={aplicandoOverride} onClick={manejarOverride} />
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

/**
 * Autoservicio de contraseña — disponible para CUALQUIER rol (incluido "lectura"), a diferencia
 * del resto de esta página que solo admin/operador pueden editar. Exige la contraseña actual
 * (ver Backend/src/routes/me.ts) — no es un reseteo administrativo, es la propia cuenta.
 */
function CambiarPasswordPropia() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(false);
    if (nueva !== confirmar) {
      setError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    if (nueva.length < 8) {
      setError("La contraseña nueva debe tener al menos 8 caracteres.");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/me/password", {
        method: "PUT",
        body: JSON.stringify({ passwordActual: actual, passwordNueva: nueva }),
      });
      setActual("");
      setNueva("");
      setConfirmar("");
      setExito(true);
      setTimeout(() => setExito(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo cambiar la contraseña.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2 text-slate-700 dark:text-slate-200">
        <KeyRound className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Cambiar mi contraseña
      </h3>

      {error && (
        <div className="flex items-center gap-2 text-xs font-mono text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          <CircleAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {exito && (
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          <Check className="w-4 h-4 shrink-0" /> Contraseña actualizada.
        </div>
      )}

      <form onSubmit={manejarSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Contraseña actual
          <input
            type="password" required value={actual} onChange={(e) => setActual(e.target.value)}
            className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Contraseña nueva
          <input
            type="password" required minLength={8} value={nueva} onChange={(e) => setNueva(e.target.value)}
            placeholder="Mín. 8 caracteres"
            className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Confirmar contraseña nueva
          <div className="mt-1 flex gap-2">
            <input
              type="password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={guardando}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold font-mono bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors"
            >
              {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {guardando ? "..." : "Guardar"}
            </button>
          </div>
        </label>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { rol } = useAuth();
  const { actual, configuracion, conectado, espOnline, enviarComando } = useRealtimeData();
  const soloLectura = rol === "lectura" || !rol;

  const [localAtriles, setLocalAtriles] = useState<ConfiguracionZona | null>(null);
  const [localDescanso, setLocalDescanso] = useState<ConfiguracionZona | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [mensajeImportacion, setMensajeImportacion] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const inputImportarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (configuracion) {
      setLocalAtriles(configuracion.atriles);
      setLocalDescanso(configuracion.descanso);
    }
  }, [configuracion]);

  const guardarTodo = async () => {
    if (!localAtriles || !localDescanso) return;
    setErrorValidacion(null);
    setMensajeImportacion(null);

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

  const exportarHorario = () => {
    if (!configuracion) return;
    const csv = construirCsvHorarios(configuracion.atriles, configuracion.descanso);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Horario_Shiitake_Lindo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  /**
   * Importa horarios desde un CSV (mismo formato de Exportar Horario, ver parsearCsvHorarios).
   * Solo carga los cambios en el estado local — igual que editar un bloque a mano en
   * TemporizadorConfig, hace falta apretar "Guardar" para que se aplique de verdad. Así el usuario
   * puede revisar el resultado (y el mensaje de advertencias, si hubo líneas inválidas) antes de
   * que se le mande al controlador.
   */
  const manejarArchivoImportado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si se corrige y reintenta
    if (!archivo) return;
    setMensajeImportacion(null);

    let texto: string;
    try {
      texto = await archivo.text();
    } catch {
      setMensajeImportacion({ tipo: "error", texto: "No se pudo leer el archivo." });
      return;
    }

    const resultado = parsearCsvHorarios(texto);
    if (!resultado.atriles && !resultado.descanso) {
      setMensajeImportacion({
        tipo: "error",
        texto: resultado.advertencias.length > 0 ? resultado.advertencias.join(" ") : "El archivo no tiene bloques horarios válidos.",
      });
      return;
    }

    if (resultado.atriles && localAtriles) setLocalAtriles({ ...localAtriles, rangosHorarios: resultado.atriles });
    if (resultado.descanso && localDescanso) setLocalDescanso({ ...localDescanso, rangosHorarios: resultado.descanso });

    const zonasImportadas = [
      resultado.atriles ? `Atriles (${resultado.atriles.length})` : null,
      resultado.descanso ? `Descanso (${resultado.descanso.length})` : null,
    ].filter(Boolean).join(", ");
    const resumen = `Horario importado: ${zonasImportadas}. Revisá los bloques abajo y apretá "Guardar" para aplicarlos.`;
    setMensajeImportacion({
      tipo: resultado.advertencias.length > 0 ? "error" : "ok",
      texto: resultado.advertencias.length > 0 ? `${resumen} Se ignoraron algunas líneas: ${resultado.advertencias.join(" ")}` : resumen,
    });
  };

  const descartarEdicion = () => {
    setErrorValidacion(null);
    setMensajeImportacion(null);
    if (configuracion) {
      setLocalAtriles(configuracion.atriles);
      setLocalDescanso(configuracion.descanso);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} horaDispositivo={actual?.horaDispositivo} horaServidor={actual?.ultimaActualizacion} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6 max-w-5xl">
          {errorValidacion && (
            <div className="bg-rose-500/10 dark:bg-rose-950/80 border border-rose-500/80 p-4 rounded-xl flex items-center gap-3 text-rose-800 dark:text-rose-200 font-mono text-xs shadow-lg">
              <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{errorValidacion}</span>
            </div>
          )}

          {mensajeImportacion && (
            <div
              className={`p-4 rounded-xl flex items-center gap-3 font-mono text-xs shadow-lg border ${
                mensajeImportacion.tipo === "ok"
                  ? "bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-800 dark:text-emerald-200"
                  : "bg-amber-500/10 dark:bg-amber-950/60 border-amber-500/60 text-amber-800 dark:text-amber-200"
              }`}
            >
              {mensajeImportacion.tipo === "ok" ? <Check className="w-5 h-5 shrink-0" /> : <CircleAlert className="w-5 h-5 shrink-0" />}
              <span>{mensajeImportacion.texto}</span>
            </div>
          )}

          <div className="flex items-center justify-between glass-panel p-6">
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <SlidersIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> Configuración Remota Dual en Tiempo Real
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">Los parámetros y modos se gestionan y transmiten de forma independiente por área</p>
            </div>
            <div className="flex items-center gap-2">
              {!soloLectura && (
                <>
                  <input
                    ref={inputImportarRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    onChange={manejarArchivoImportado}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => inputImportarRef.current?.click()}
                    disabled={!localAtriles || !localDescanso}
                    title='Importar bloques horarios desde un CSV con columnas "Zona,Inicio,Fin,Habilitado" (mismo formato de Exportar Horario). Reemplaza los bloques de las zonas que aparezcan en el archivo — hace falta apretar "Guardar" después para aplicarlo.'
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-3.5 h-3.5" /> Importar Horario
                  </button>
                </>
              )}
              {rol === "admin" && (
                <button
                  type="button"
                  onClick={exportarHorario}
                  disabled={!configuracion}
                  title="Exportar los bloques horarios (TEMPORIZADO) de ambas zonas a CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar Horario
                </button>
              )}
              {guardado && (
                <span className="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-lg text-xs font-mono font-bold">
                  ✓ Sincronizado en Cloud
                </span>
              )}
            </div>
          </div>

          {rol === "admin" && <FirmwareManager actual={actual} />}
          {rol === "admin" && <Sht35DireccionadorTemporal enviarComando={enviarComando} />}

          {!localAtriles || !localDescanso ? (
            <p className="text-sm text-slate-500 font-mono">Cargando configuración...</p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TarjetaZona v={VISUAL_ATRILES} local={localAtriles} soloLectura={soloLectura} onCambiar={(c) => setLocalAtriles({ ...localAtriles, ...c })} onOverrideInmediato={(v) => overrideInmediato("atriles", v)} />
                <TarjetaZona v={VISUAL_DESCANSO} local={localDescanso} soloLectura={soloLectura} onCambiar={(c) => setLocalDescanso({ ...localDescanso, ...c })} onOverrideInmediato={(v) => overrideInmediato("descanso", v)} />
              </div>

              {/* Fuera del gate !soloLectura a propósito: cualquier rol (incluido "lectura") puede
                  cambiar su propia contraseña, aunque no pueda editar el resto de esta página. */}
              <CambiarPasswordPropia />

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

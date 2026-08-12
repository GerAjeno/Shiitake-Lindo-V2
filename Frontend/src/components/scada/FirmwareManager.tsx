"use client";

/**
 * @file FirmwareManager.tsx
 * @description Panel de actualización OTA — visible solo para admin (gateado en settings/page.tsx).
 * El endpoint exige sesión (cookie httpOnly) y el backend firma el binario (SHA-256 + Ed25519)
 * antes de notificar al ESP32, a diferencia del sistema anterior que no tenía autenticación aquí.
 */

import React, { useState } from "react";
import { Upload, Settings as SettingsIcon, CheckCircle2, AlertCircle, RefreshCw, HardDrive, ShieldCheck } from "lucide-react";
import type { TelemetriaActual } from "@shared/types";

interface Props {
  actual?: TelemetriaActual | null;
}

export const FirmwareManager: React.FC<Props> = ({ actual }) => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "exito" | "error" | "info" } | null>(null);

  const versionActual = actual?.firmwareVersion ?? "desconocida";
  const otaEstado = actual?.otaEstado ?? "INACTIVO";
  const otaProgreso = actual?.otaProgreso ?? 0;

  const manejarCambioArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".bin")) {
      setMensaje({ texto: "Selecciona un archivo .bin válido.", tipo: "error" });
      return;
    }
    setArchivo(file);
    setMensaje(null);
  };

  const manejarSubida = async () => {
    if (!archivo) return;
    setSubiendo(true);
    setMensaje({ texto: "Subiendo firmware y firmando en el servidor...", tipo: "info" });

    try {
      const version = `OTA_${new Date().toISOString().replace(/[:.]/g, "-")}`;

      const res = await fetch("/api/firmware", {
        method: "POST",
        credentials: "include",
        headers: { "x-firmware-version": version },
        body: archivo,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir el firmware.");

      setMensaje({
        texto: data.dispositivoNotificado
          ? "Firmware firmado y enviado. El controlador iniciará la descarga en segundos."
          : "Firmware firmado y guardado, pero el controlador está desconectado — se aplicará cuando reconecte.",
        tipo: "exito",
      });
      setArchivo(null);
    } catch (err: any) {
      setMensaje({ texto: err.message ?? "Error al subir el firmware.", tipo: "error" });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500"><SettingsIcon className="w-5 h-5" /></div>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              Actualización Remota de Firmware (OTA)
              <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">Dual-Bank 16MB</span>
            </h3>
            <p className="text-xs text-slate-500">Despliegue inalámbrico sin cables de programación sobre microcontrolador desde servidor</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono shrink-0">
          Firmware activo: <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> {versionActual}</span>
        </div>
      </div>

      {otaEstado !== "INACTIVO" && (
        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <div className="flex justify-between text-xs font-mono mb-1"><span>{otaEstado}</span><span>{otaProgreso}%</span></div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-500 h-full transition-all" style={{ width: `${Math.max(otaProgreso, 3)}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 text-xs text-slate-600 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
        <span>
          <strong className="text-slate-800 dark:text-slate-200">Protección Anti-Bricking:</strong> si el firmware subido no logra validarse como sano (sensores, relés, WiFi y contacto con el servidor) dentro de los primeros 2 minutos tras el arranque, el microcontrolador revertirá automáticamente el flasheo regresando a la partición segura previa (<strong>{versionActual}</strong>). El firmware se firma en el servidor antes de enviarse; el ESP32 rechaza cualquier binario sin firma válida.
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-mono text-slate-600 dark:text-slate-400">Seleccionar archivo binario (.bin) compilado para actualizar microcontrolador:</p>
        <input
          type="file" accept=".bin" onChange={manejarCambioArchivo} disabled={subiendo}
          className="block w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-500/10 file:text-blue-500 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 disabled:opacity-50"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={manejarSubida} disabled={!archivo || subiendo}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs disabled:opacity-50 transition-all"
        >
          {subiendo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {subiendo ? "Subiendo..." : "Subir e Iniciar Actualización"}
        </button>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
          mensaje.tipo === "exito" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" :
          mensaje.tipo === "error" ? "bg-rose-500/10 border-rose-500/30 text-rose-600" :
          "bg-blue-500/10 border-blue-500/30 text-blue-600"
        }`}>
          {mensaje.tipo === "exito" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {mensaje.texto}
        </div>
      )}
    </div>
  );
};

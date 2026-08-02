"use client";

/**
 * @file page.tsx (Configuración)
 * @description Umbrales, modos, horarios y sensores por zona. Edición restringida a
 * admin/operador (el backend ya lo exige; aquí se deshabilitan los controles para "lectura").
 * El panel OTA vive aquí dentro, visible solo para admin (requisito explícito del usuario).
 */

import React, { useEffect, useState } from "react";
import { Save, Plus, Trash2, Settings as SettingsIcon } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { apiFetch } from "@/lib/api";
import { FirmwareManager } from "@/components/scada/FirmwareManager";
import type { ConfiguracionZona, NombreZona, RangoHorario } from "@shared/types";

function EditorZona({ nombreZona, etiqueta, config, soloLectura, onGuardado }: {
  nombreZona: NombreZona; etiqueta: string; config: ConfiguracionZona; soloLectura: boolean; onGuardado: () => void;
}) {
  const [local, setLocal] = useState<ConfiguracionZona>(config);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => setLocal(config), [config]);

  const guardar = async () => {
    setGuardando(true);
    setGuardado(false);
    try {
      await apiFetch(`/api/config/${nombreZona}`, { method: "PUT", body: JSON.stringify(local) });
      setGuardado(true);
      onGuardado();
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setGuardando(false);
    }
  };

  const agregarRango = () => {
    const nuevo: RangoHorario = { id: `rango_${Date.now()}`, inicio: "08:00", fin: "18:00", habilitado: true };
    setLocal({ ...local, rangosHorarios: [...local.rangosHorarios, nuevo] });
  };
  const quitarRango = (id: string) => setLocal({ ...local, rangosHorarios: local.rangosHorarios.filter((r) => r.id !== id) });
  const actualizarRango = (id: string, cambios: Partial<RangoHorario>) =>
    setLocal({ ...local, rangosHorarios: local.rangosHorarios.map((r) => (r.id === id ? { ...r, ...cambios } : r)) });

  return (
    <div className="glass-panel p-6 space-y-5">
      <h3 className="text-sm font-bold uppercase">{etiqueta}</h3>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs font-mono text-slate-500">Humedad mínima %
          <input type="number" disabled={soloLectura} value={local.humedadMinima}
            onChange={(e) => setLocal({ ...local, humedadMinima: Number(e.target.value) })}
            className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
        </label>
        <label className="text-xs font-mono text-slate-500">Humedad máxima %
          <input type="number" disabled={soloLectura} value={local.humedadMaxima}
            onChange={(e) => setLocal({ ...local, humedadMaxima: Number(e.target.value) })}
            className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
        </label>
      </div>

      <label className="block text-xs font-mono text-slate-500">Modo de control
        <select disabled={soloLectura} value={local.modo} onChange={(e) => setLocal({ ...local, modo: e.target.value as any })}
          className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
          <option value="AUTO">AUTO (histéresis)</option>
          <option value="MANUAL">MANUAL</option>
          <option value="TEMPORIZADO">TEMPORIZADO</option>
        </select>
      </label>

      {local.modo === "MANUAL" && (
        <label className="flex items-center gap-2 text-xs font-mono">
          <input type="checkbox" disabled={soloLectura} checked={local.humidificadorManual}
            onChange={(e) => setLocal({ ...local, humidificadorManual: e.target.checked })} />
          Humidificador encendido (manual)
        </label>
      )}

      {local.modo === "TEMPORIZADO" && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-slate-500">Ventanas horarias diarias</p>
          {local.rangosHorarios.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <input type="checkbox" disabled={soloLectura} checked={r.habilitado} onChange={(e) => actualizarRango(r.id, { habilitado: e.target.checked })} />
              <input type="time" disabled={soloLectura} value={r.inicio} onChange={(e) => actualizarRango(r.id, { inicio: e.target.value })}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs" />
              <span className="text-xs text-slate-500">a</span>
              <input type="time" disabled={soloLectura} value={r.fin} onChange={(e) => actualizarRango(r.id, { fin: e.target.value })}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs" />
              {!soloLectura && (
                <button onClick={() => quitarRango(r.id)} className="text-rose-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          {!soloLectura && (
            <button onClick={agregarRango} className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <Plus className="w-3.5 h-3.5" /> Agregar ventana
            </button>
          )}
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
        <p className="text-xs font-mono text-slate-500 uppercase">Aire acondicionado</p>
        <label className="block text-xs font-mono text-slate-500">Modo AC
          <select disabled={soloLectura} value={local.aireAcondicionado.modo}
            onChange={(e) => setLocal({ ...local, aireAcondicionado: { ...local.aireAcondicionado, modo: e.target.value as any } })}
            className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
            <option value="AUTO">AUTO</option>
            <option value="MANUAL">MANUAL (solo lectura, se controla con su propio remoto)</option>
          </select>
        </label>
        {local.aireAcondicionado.modo === "AUTO" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs font-mono text-slate-500">Temp. mínima °C
              <input type="number" disabled={soloLectura} value={local.aireAcondicionado.temperaturaMinima}
                onChange={(e) => setLocal({ ...local, aireAcondicionado: { ...local.aireAcondicionado, temperaturaMinima: Number(e.target.value) } })}
                className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
            </label>
            <label className="text-xs font-mono text-slate-500">Temp. máxima °C
              <input type="number" disabled={soloLectura} value={local.aireAcondicionado.temperaturaMaxima}
                onChange={(e) => setLocal({ ...local, aireAcondicionado: { ...local.aireAcondicionado, temperaturaMaxima: Number(e.target.value) } })}
                className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
            </label>
          </div>
        )}
      </div>

      {!soloLectura && (
        <div className="flex justify-end">
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs disabled:opacity-50">
            <Save className="w-4 h-4" /> {guardando ? "Guardando..." : guardado ? "¡Guardado!" : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { rol } = useAuth();
  const { actual, configuracion, conectado, espOnline } = useRealtimeData();
  const soloLectura = rol === "lectura" || !rol;

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <h1 className="text-lg font-bold flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Configuración</h1>

          {!configuracion ? (
            <p className="text-sm text-slate-500 font-mono">Cargando configuración...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EditorZona nombreZona="atriles" etiqueta="Atriles" config={configuracion.atriles} soloLectura={soloLectura} onGuardado={() => {}} />
              <EditorZona nombreZona="descanso" etiqueta="Descanso" config={configuracion.descanso} soloLectura={soloLectura} onGuardado={() => {}} />
            </div>
          )}

          {rol === "admin" && <FirmwareManager actual={actual} />}
        </main>
        <Footer />
      </div>
    </div>
  );
}

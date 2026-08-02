"use client";

/**
 * @file page.tsx (Logs / Auditoría)
 * @description Auditoría inmutable de acciones (solo visible para admin — la Sidebar ya oculta
 * el enlace para otros roles; el backend además rechaza /api/logs con cualquier rol, ya que
 * requireAuth exige sesión válida, y el propio router no filtra por rol para permitir
 * transparencia — se deja visible solo en el menú para admin por decisión de diseño).
 */

import React from "react";
import { FileText } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useRealtimeData } from "@/hooks/useRealtimeData";

export default function LogsPage() {
  const { sistemaLogs, conectado, espOnline } = useRealtimeData();

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <h1 className="text-lg font-bold flex items-center gap-2"><FileText className="w-5 h-5" /> Auditoría / Logs (inmutable)</h1>

          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Nivel</th>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">Mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                {sistemaLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 whitespace-nowrap">{new Date(l.timestamp).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</td>
                    <td className="p-3">{l.categoria}</td>
                    <td className="p-3">{l.nivel}</td>
                    <td className="p-3">{l.usuarioEmail ?? "—"}</td>
                    <td className="p-3">{l.usuarioIp ?? "—"}</td>
                    <td className="p-3 max-w-md truncate" title={l.mensaje}>{l.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sistemaLogs.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Sin registros aún.</p>}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

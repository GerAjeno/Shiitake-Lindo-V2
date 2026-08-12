"use client";

/**
 * @file page.tsx (Login)
 * @description Pantalla de autenticación industrial oscura. Login 100% local: el backend verifica
 * el correo/contraseña contra Postgres y devuelve una cookie httpOnly de sesión — no depende de
 * ningún proveedor externo, funciona incluso sin conexión a internet.
 */

import React, { useState } from "react";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { ShiitakeLogo } from "@/components/icons/ShiitakeLogo";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { iniciarSesion } = useAuth();

  const manejarLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCargando(true);

    try {
      // AuthContext actualiza `usuario`/`rol` acá adentro; su propio efecto se encarga de
      // redirigir a /dashboard una vez que el estado refleja la sesión real.
      await iniciarSesion(email, password);
    } catch (err: any) {
      console.error("Error autenticando:", err);
      setError(err.message ?? "Error de autenticación. Verifica tu conexión con el servidor.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 border-slate-800 relative z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-500 dark:text-emerald-400 mb-4 shadow-lg">
            <ShiitakeLogo className="w-10 h-10" />
          </div>
          <h1 className="text-xl font-bold tracking-wider text-slate-800 dark:text-slate-100 uppercase">
            Plataforma Shiitake-Lindo
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Sistema de Control Ambiental y Telemetría
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs font-mono leading-relaxed">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={manejarLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@empresa.com"
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 pl-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 pl-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-950/40 transition-all text-sm uppercase tracking-wider disabled:opacity-50 font-mono"
          >
            {cargando ? "Verificando Sesión..." : "Acceder al Sistema"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-900 text-center font-mono">
          <p className="text-[11px] text-slate-500">
            Plataforma Industrial Shiitake-Lindo v2.0 | Monitoreo IoT
          </p>
          <p className="mt-1.5 text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-300">
            Desarrollado por German Marambio © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * @file error.tsx
 * @description Capturador global de excepciones en componentes de cliente (Next.js Error Boundary).
 */

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Excepción capturada por Error Boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full glass-panel p-8 border-rose-500/50 bg-gradient-to-b from-rose-950/20 to-slate-900 shadow-2xl">
        <div className="flex items-center gap-3 text-rose-400 mb-4 pb-4 border-b border-rose-500/30">
          <AlertTriangle className="w-8 h-8 animate-bounce" />
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wider font-mono">Excepción de Cliente Capturada</h1>
            <p className="text-xs text-rose-300 font-mono">Diagnóstico en tiempo real de React / Next.js</p>
          </div>
        </div>

        <div className="space-y-4 my-6">
          <div>
            <span className="text-xs font-mono text-slate-400 uppercase">Mensaje Técnico del Error:</span>
            <div className="mt-1 p-4 bg-slate-950 rounded-xl border border-rose-500/30 text-rose-300 font-mono text-sm break-all font-semibold select-all">
              {error.message || "Error desconocido en componente React"}
            </div>
          </div>

          {error.digest && (
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Digest ID: {error.digest}</span>
            </div>
          )}

          {error.stack && (
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase">Stack Trace (Pila de Ejecución):</span>
              <pre className="mt-1 p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 font-mono text-[11px] overflow-auto max-h-64 select-all">
                {error.stack}
              </pre>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold font-mono text-xs uppercase rounded-xl transition-all shadow-lg shadow-rose-950/50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Intentar Recuperar Pantalla</span>
          </button>
        </div>
      </div>
    </div>
  );
}

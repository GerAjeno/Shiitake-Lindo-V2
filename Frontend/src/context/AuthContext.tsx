"use client";

/**
 * @file AuthContext.tsx
 * @description Proveedor de contexto para la sesión de usuario autenticado en Firebase Auth.
 * Protege las rutas privadas del panel web. El rol (admin/operador/lectura) se obtiene del
 * backend nuevo (Postgres), no de Firebase — Firebase solo identifica quién es el usuario.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { obtenerRolPropio } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import type { RolUsuario } from "@shared/types";

interface ContextoAuth {
  usuario: User | null;
  rol: RolUsuario | null;
  cargando: boolean;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<ContextoAuth>({
  usuario: null,
  rol: null,
  cargando: true,
  cerrarSesion: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [rol, setRol] = useState<RolUsuario | null>(null);

  const [cargando, setCargando] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("shiitake_logged_in") !== "true";
    }
    return true;
  });

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const cancelarSuscripcion = onAuthStateChanged(auth, async (usr) => {
      setUsuario(usr);

      if (usr) {
        localStorage.setItem("shiitake_logged_in", "true");
        try {
          const { rol: rolResuelto } = await obtenerRolPropio();
          setRol(rolResuelto);
        } catch (err) {
          console.error("No se pudo resolver el rol del usuario contra el backend:", err);
          setRol(null);
        }
      } else {
        localStorage.removeItem("shiitake_logged_in");
        setRol(null);
      }
      setCargando(false);
    });

    return () => cancelarSuscripcion();
  }, []);

  useEffect(() => {
    if (cargando) return;

    if (!usuario && pathname !== "/login") {
      router.push("/login");
    } else if (usuario && pathname === "/login") {
      router.push("/dashboard");
    }
  }, [usuario, cargando, pathname, router]);

  const cerrarSesion = async () => {
    localStorage.removeItem("shiitake_logged_in");
    await firebaseSignOut(auth);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ usuario, rol, cargando, cerrarSesion }}>
      {cargando ? (
        pathname !== "/login" ? (
          <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Header conectadoRTDB={false} espOnline={false} />
              <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                  <span className="text-sm font-mono text-slate-500 animate-pulse">Autenticando sesión segura...</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-64 bg-slate-200 dark:bg-slate-900/50 rounded-2xl animate-pulse"></div>
                  <div className="h-64 bg-slate-200 dark:bg-slate-900/50 rounded-2xl animate-pulse"></div>
                </div>
                <div className="h-40 bg-slate-200 dark:bg-slate-900/50 rounded-2xl animate-pulse mt-6"></div>
              </main>
            </div>
          </div>
        ) : (
          <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-500">
            <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium tracking-wide font-mono animate-pulse">Iniciando plataforma...</p>
          </div>
        )
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

"use client";

/**
 * @file page.tsx (Usuarios)
 * @description Gestión de cuentas — exclusiva de admin (el backend ya lo exige en todo
 * usuariosRouter; acá se gatea además la vista completa, ya que expone correos de otras cuentas).
 * Crear un usuario genera una contraseña temporal de un solo uso (no hay envío de email — se
 * muestra una vez en pantalla para que el admin se la pase al operador).
 */

import React, { useEffect, useState } from "react";
import { Users, UserPlus, ShieldOff, KeyRound, Copy, Check, X, RefreshCw, CircleAlert } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Switch } from "@/components/ui/Switch";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import { apiFetch } from "@/lib/api";
import type { RolUsuario } from "@shared/types";

interface Usuario {
  uid: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string;
}

const ROLES: { valor: RolUsuario; etiqueta: string }[] = [
  { valor: "admin", etiqueta: "Admin" },
  { valor: "operador", etiqueta: "Operador" },
  { valor: "lectura", etiqueta: "Lectura" },
];

function formatearFecha(iso: string) {
  const fecha = new Date(iso);
  if (isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function UsuariosPage() {
  const { rol: rolPropio, usuario: propio } = useAuth();
  const { actual, conectado, espOnline } = useRealtimeData();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uidEnAccion, setUidEnAccion] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoRol, setNuevoRol] = useState<RolUsuario>("operador");
  const [creando, setCreando] = useState(false);
  const [credencialNueva, setCredencialNueva] = useState<{ email: string; password: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [resetUid, setResetUid] = useState<string | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  const cargarUsuarios = async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await apiFetch<Usuario[]>("/api/usuarios");
      setUsuarios(datos);
    } catch (err: any) {
      setError(err.message ?? "No se pudo cargar la lista de usuarios.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (rolPropio === "admin") cargarUsuarios();
  }, [rolPropio]);

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      const res = await apiFetch<{ uid: string; email: string; rol: RolUsuario; passwordTemporal: string }>("/api/usuarios", {
        method: "POST",
        body: JSON.stringify({ email: nuevoEmail.trim(), rol: nuevoRol }),
      });
      setCredencialNueva({ email: res.email, password: res.passwordTemporal });
      setNuevoEmail("");
      setNuevoRol("operador");
      setMostrarForm(false);
      await cargarUsuarios();
    } catch (err: any) {
      setError(err.message ?? "No se pudo crear el usuario.");
    } finally {
      setCreando(false);
    }
  };

  const cambiarRol = async (uid: string, rol: RolUsuario) => {
    setUidEnAccion(uid);
    setError(null);
    try {
      await apiFetch(`/api/usuarios/${uid}/rol`, { method: "PUT", body: JSON.stringify({ rol }) });
      setUsuarios((prev) => prev.map((u) => (u.uid === uid ? { ...u, rol } : u)));
    } catch (err: any) {
      setError(err.message ?? "No se pudo cambiar el rol.");
    } finally {
      setUidEnAccion(null);
    }
  };

  const cambiarActivo = async (uid: string, activo: boolean, email: string) => {
    // Suspender le corta el acceso a alguien de inmediato (incluida la posibilidad de que sea el
    // único operador disponible en ese momento) — antes un solo clic en el switch ya lo hacía.
    if (!activo && !window.confirm(`¿Confirmás suspender la cuenta de ${email}? No va a poder iniciar sesión hasta que la reactives.`)) {
      return;
    }
    setUidEnAccion(uid);
    setError(null);
    try {
      await apiFetch(`/api/usuarios/${uid}/activo`, { method: "PUT", body: JSON.stringify({ activo }) });
      setUsuarios((prev) => prev.map((u) => (u.uid === uid ? { ...u, activo } : u)));
    } catch (err: any) {
      setError(err.message ?? "No se pudo actualizar el estado.");
    } finally {
      setUidEnAccion(null);
    }
  };

  const guardarNuevaPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUid) return;
    setGuardandoPassword(true);
    setError(null);
    try {
      await apiFetch(`/api/usuarios/${resetUid}/password`, { method: "PUT", body: JSON.stringify({ nuevaPassword }) });
      setResetUid(null);
      setNuevaPassword("");
    } catch (err: any) {
      setError(err.message ?? "No se pudo cambiar la contraseña.");
    } finally {
      setGuardandoPassword(false);
    }
  };

  const copiarCredencial = () => {
    if (!credencialNueva) return;
    navigator.clipboard.writeText(`Correo: ${credencialNueva.email}\nContraseña temporal: ${credencialNueva.password}`).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  if (rolPropio !== "admin") {
    return (
      <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header conectadoRTDB={conectado} espOnline={espOnline} horaDispositivo={actual?.horaDispositivo} horaServidor={actual?.ultimaActualizacion} />
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="glass-panel p-8 max-w-md text-center">
              <ShieldOff className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Acceso restringido</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">La gestión de usuarios es exclusiva del rol admin.</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header conectadoRTDB={conectado} espOnline={espOnline} />
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8 overflow-y-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 glass-panel p-6">
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wide flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" /> Usuarios
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">Crear, ver y editar las cuentas que acceden al sistema.</p>
            </div>
            <button
              onClick={() => setMostrarForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-mono bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-lg shadow-emerald-950/40"
            >
              {mostrarForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {mostrarForm ? "Cancelar" : "Nuevo usuario"}
            </button>
          </div>

          {error && (
            <div className="bg-rose-500/10 dark:bg-rose-950/80 border border-rose-500/80 p-4 rounded-xl flex items-center gap-3 text-rose-800 dark:text-rose-200 font-mono text-xs shadow-lg">
              <CircleAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {credencialNueva && (
            <div className="glass-panel p-5 border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 font-mono flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Cuenta creada — contraseña temporal (se muestra una sola vez)
                </h3>
                <button onClick={() => setCredencialNueva(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                No hay envío de correo automático — pasale esta contraseña a <strong className="text-slate-800 dark:text-slate-200">{credencialNueva.email}</strong> por un canal seguro. Va a poder cambiarla después de iniciar sesión.
              </p>
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-3">
                <code className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100 flex-1 break-all">{credencialNueva.password}</code>
                <button onClick={copiarCredencial} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/30 transition-colors">
                  {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          {mostrarForm && (
            <form onSubmit={crearUsuario} className="glass-panel p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 font-mono">Nuevo usuario</h3>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
                <label className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Correo electrónico
                  <input
                    type="email"
                    required
                    value={nuevoEmail}
                    onChange={(e) => setNuevoEmail(e.target.value)}
                    placeholder="operador@empresa.com"
                    className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Rol
                  <select
                    value={nuevoRol}
                    onChange={(e) => setNuevoRol(e.target.value as RolUsuario)}
                    className="mt-1 w-full sm:w-auto bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  >
                    {ROLES.map((r) => (
                      <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={creando}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                >
                  {creando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {creando ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          )}

          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Correo</th>
                  <th className="p-3">Rol</th>
                  <th className="p-3">Activo</th>
                  <th className="p-3">Creado</th>
                  <th className="p-3">Contraseña</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                {usuarios.map((u) => {
                  const esUnoMismo = u.uid === propio?.uid;
                  return (
                    <tr key={u.uid} className={!u.activo ? "opacity-50" : ""}>
                      <td className="p-3 whitespace-nowrap">
                        {u.email} {esUnoMismo && <span className="text-slate-400">(vos)</span>}
                      </td>
                      <td className="p-3">
                        <select
                          value={u.rol}
                          disabled={esUnoMismo || uidEnAccion === u.uid}
                          onChange={(e) => cambiarRol(u.uid, e.target.value as RolUsuario)}
                          title={esUnoMismo ? "No podés cambiar tu propio rol" : ""}
                          className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {ROLES.map((r) => (
                            <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <Switch
                          activo={u.activo}
                          disabled={esUnoMismo}
                          cargando={uidEnAccion === u.uid}
                          onClick={() => cambiarActivo(u.uid, !u.activo, u.email)}
                        />
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-500">{formatearFecha(u.creadoEn)}</td>
                      <td className="p-3">
                        {resetUid === u.uid ? (
                          <form onSubmit={guardarNuevaPassword} className="flex items-center gap-1.5">
                            <input
                              type="password"
                              required
                              minLength={8}
                              autoFocus
                              value={nuevaPassword}
                              onChange={(e) => setNuevaPassword(e.target.value)}
                              placeholder="Mín. 8 caracteres"
                              className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs w-32 focus:outline-none focus:border-emerald-500"
                            />
                            <button type="submit" disabled={guardandoPassword} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 disabled:opacity-50" title="Guardar">
                              {guardandoPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button type="button" onClick={() => { setResetUid(null); setNuevaPassword(""); }} className="text-slate-400 hover:text-rose-500" title="Cancelar">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => { setResetUid(u.uid); setNuevaPassword(""); setError(null); }}
                            className="flex items-center gap-1.5 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Cambiar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cargando && <p className="p-6 text-center text-sm text-slate-500">Cargando usuarios...</p>}
            {!cargando && usuarios.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Sin usuarios registrados.</p>}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

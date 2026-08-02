/**
 * @file api.ts
 * @description Cliente REST + helper de WebSocket hacia el backend nuevo. Usa rutas relativas
 * (/api/..., /ws) porque Caddy sirve frontend y backend bajo el mismo dominio — evita CORS.
 */
import { auth } from "./firebase";
import type { RolUsuario } from "@shared/types";

async function obtenerIdToken(): Promise<string> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("No hay sesión activa.");
  return usuario.getIdToken();
}

export async function apiFetch<T = unknown>(path: string, opciones: RequestInit = {}): Promise<T> {
  const token = await obtenerIdToken();
  const res = await fetch(path, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opciones.headers ?? {}),
    },
  });

  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    throw new Error(cuerpo.error ?? `Error HTTP ${res.status} en ${path}`);
  }
  return res.json();
}

export async function obtenerRolPropio(): Promise<{ uid: string; email: string; rol: RolUsuario }> {
  return apiFetch("/api/me");
}

/** Construye la URL wss:// del hub de WebSocket para el navegador, con el ID token en la query. */
export async function construirUrlWebSocketNavegador(): Promise<string> {
  const token = await obtenerIdToken();
  const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocolo}//${window.location.host}/ws?tipo=navegador&token=${encodeURIComponent(token)}`;
}

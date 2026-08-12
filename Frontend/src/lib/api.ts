/**
 * @file api.ts
 * @description Cliente REST + helper de WebSocket hacia el backend nuevo. Usa rutas relativas
 * (/api/..., /ws) porque Caddy sirve frontend y backend bajo el mismo dominio — evita CORS.
 * La sesión viaja en una cookie httpOnly (ver auth/local.ts del backend); el navegador la manda
 * solo con `credentials: "include"`, no hay ningún token que manejar a mano en el cliente.
 */
import type { RolUsuario } from "@shared/types";

export async function apiFetch<T = unknown>(path: string, opciones: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opciones,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
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

/** Construye la URL wss:// del hub de WebSocket para el navegador. La cookie de sesión viaja
 * sola en la petición de upgrade (mismo origen, vía Caddy) — no hace falta pasar ningún token. */
export function construirUrlWebSocketNavegador(): string {
  const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocolo}//${window.location.host}/ws?tipo=navegador`;
}

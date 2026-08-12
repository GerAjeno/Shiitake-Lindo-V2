/**
 * @file local.ts
 * @description Autenticación 100% local (sin Firebase ni ningún proveedor externo): hashing de
 * contraseñas, firma/verificación de la sesión (JWT) y las opciones de la cookie httpOnly donde
 * viaja. Todo se verifica contra Postgres — el sistema sigue funcionando aunque no haya internet.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RolUsuario } from '../shared/types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    '[AUTH] Falta la variable de entorno JWT_SECRET (firma las sesiones). Generar una con ' +
      "`node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"` y agregarla al .env."
  );
}

export const NOMBRE_COOKIE_SESION = 'sesion';
const DURACION_SESION = '30d';
const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;
const RONDAS_BCRYPT = 12;

export interface PayloadSesion {
  uid: string;
  email: string;
  rol: RolUsuario;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, RONDAS_BCRYPT);
}

export function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function firmarSesion(payload: PayloadSesion): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: DURACION_SESION });
}

/** Lanza si el token es inválido, expiró o fue alterado. */
export function verificarSesion(token: string): PayloadSesion {
  return jwt.verify(token, JWT_SECRET as string) as PayloadSesion;
}

export function opcionesCookieSesion() {
  return {
    httpOnly: true,
    // Detrás de Caddy + Cloudflare Tunnel siempre es HTTPS; en `npm run dev` local (sin Docker) es
    // http://localhost, por eso se relaja solo fuera de NODE_ENV=production (ver Backend/Dockerfile).
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: DURACION_SESION_MS,
    path: '/',
  };
}

export function opcionesLimpiarCookieSesion() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
}

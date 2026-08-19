import { Router } from 'express';
import { pool } from '../db/pool';
import { verificarPassword, firmarSesion, opcionesCookieSesion, opcionesLimpiarCookieSesion, NOMBRE_COOKIE_SESION } from '../auth/local';
import type { RolUsuario } from '../shared/types';

export const authRouter = Router();

interface FilaUsuario {
  uid: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  password_hash: string | null;
}

// Rate limiting simple en memoria — el backend corre en una sola instancia (sin réplicas), así
// que no hace falta un store compartido (Redis, etc.) para esto. Sin esto, el login (que controla
// acceso a actuadores físicos de 220V) no tenía ninguna protección contra fuerza bruta.
const VENTANA_MS = 15 * 60 * 1000;
const INTENTOS_MAXIMOS = 10;
// Sin esto el Map crecía sin límite: cada IP nueva que intentaba loguearse (aunque fuera solo una
// vez, sin llegar a bloquearse) dejaba una entrada que nunca se borraba hasta que volvía a
// consultarse esa misma IP — un escaneo lento con muchas IPs distintas era una fuga de memoria lenta.
const MAX_ENTRADAS_MAPA = 5000;
const intentosPorIp = new Map<string, { intentos: number; desde: number }>();

function podarEntradasExpiradas() {
  const ahora = Date.now();
  for (const [ip, entrada] of intentosPorIp) {
    if (ahora - entrada.desde > VENTANA_MS) intentosPorIp.delete(ip);
  }
  // Última red de seguridad si por lo que sea la poda por expiración no alcanza a mantenerlo
  // chico (ej. un ataque con miles de IPs distintas dentro de la misma ventana de 15 min):
  // se descartan las entradas más viejas antes de seguir creciendo indefinidamente.
  if (intentosPorIp.size > MAX_ENTRADAS_MAPA) {
    const exceso = intentosPorIp.size - MAX_ENTRADAS_MAPA;
    const claves = intentosPorIp.keys();
    for (let i = 0; i < exceso; i++) {
      const clave = claves.next().value;
      if (clave !== undefined) intentosPorIp.delete(clave);
    }
  }
}

function ipBloqueada(ip: string): boolean {
  const entrada = intentosPorIp.get(ip);
  if (!entrada) return false;
  if (Date.now() - entrada.desde > VENTANA_MS) {
    intentosPorIp.delete(ip);
    return false;
  }
  return entrada.intentos >= INTENTOS_MAXIMOS;
}

function registrarIntentoFallido(ip: string) {
  podarEntradasExpiradas();
  const entrada = intentosPorIp.get(ip);
  if (!entrada || Date.now() - entrada.desde > VENTANA_MS) {
    intentosPorIp.set(ip, { intentos: 1, desde: Date.now() });
  } else {
    entrada.intentos++;
  }
}

authRouter.post('/login', async (req, res) => {
  const ip = (req.ip ?? '').replace('::ffff:', '');
  if (ipBloqueada(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
  }

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Se requiere correo y contraseña.' });
  }

  const { rows } = await pool.query<FilaUsuario>(
    'SELECT uid, email, rol, activo, password_hash FROM usuarios WHERE email = $1',
    [email]
  );
  const usuario = rows[0];

  // Mismo mensaje genérico para "no existe" y "contraseña incorrecta" — no revelar cuáles
  // correos están registrados.
  const credencialesInvalidas = () => {
    registrarIntentoFallido(ip);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  };

  if (!usuario || !usuario.password_hash) return credencialesInvalidas();
  if (!usuario.activo) return res.status(403).json({ error: 'Esta cuenta fue suspendida por un administrador.' });

  const passwordOk = await verificarPassword(password, usuario.password_hash);
  if (!passwordOk) return credencialesInvalidas();

  intentosPorIp.delete(ip);
  const token = firmarSesion({ uid: usuario.uid, email: usuario.email, rol: usuario.rol });
  res.cookie(NOMBRE_COOKIE_SESION, token, opcionesCookieSesion());
  res.json({ uid: usuario.uid, email: usuario.email, rol: usuario.rol });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(NOMBRE_COOKIE_SESION, opcionesLimpiarCookieSesion());
  res.json({ ok: true });
});

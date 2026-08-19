// auth/local.ts revienta al importarse si falta JWT_SECRET (por diseño, ver ese archivo) — varios
// módulos lo importan transitivamente (ws/hub.ts, routes/config.ts vía auth/middleware.ts), así
// que hace falta un valor antes de que vitest cargue CUALQUIER archivo de test.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'clave-de-prueba-no-usar-en-produccion';

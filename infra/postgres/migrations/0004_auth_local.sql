-- Se elimina la dependencia de Firebase Authentication — el login ahora se verifica 100% local
-- (bcrypt + JWT propio, ver Backend/src/auth/local.ts), sin depender de ningún servicio externo.
--
-- Las cuentas que ya existían fueron creadas en Firebase, así que no hay una contraseña local
-- que migrar: quedan con password_hash NULL (no pueden loguearse) hasta que un admin les asigne
-- una contraseña nueva desde el panel de Usuarios (PUT /api/usuarios/:uid/password).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;

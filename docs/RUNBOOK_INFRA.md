# Runbook de infraestructura (Fase 0 — antes de las 9 horas)

Esto lo hace German en el servidor/Proxmox, **antes** de empezar el cronómetro de migración.

## 1. VM en Proxmox

- Ubuntu Server 24.04/26.04 LTS, 4 vCPU / 8GB RAM / 60GB disco (sobra para este proyecto).
- Red con salida a internet, SSH habilitado.

## 2. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # cerrar sesión y volver a entrar para que aplique
docker compose version          # viene incluido en versiones recientes de Docker
```

## 3. Cloudflare Tunnel

1. En [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*).
2. Nombrarlo `shiitake-lindo-v2`, copiar el **token** que entrega (va en `CLOUDFLARE_TUNNEL_TOKEN` del `.env`).
3. En la misma pantalla, agregar un **Public Hostname**:
   - Subdomain: `shiitake` (dominio `ger-cloud.cc`, ya administrado en Cloudflare).
   - Service: `HTTP` → `caddy:80` (el nombre del servicio Docker, **no** una IP — cloudflared corre en el mismo docker-compose y resuelve por nombre de servicio).
4. No es necesario abrir ningún puerto en el firewall de la VM: todo el tráfico entra por el túnel saliente.

## 4. Repo GitHub

```bash
gh auth login                 # o configurar una clave SSH si prefieres ese método
gh repo create Shiitake-Lindo-V2 --private --source=. --remote=origin
git add -A && git commit -m "feat: scaffold inicial Shiitake-Lindo V2" && git push -u origin main
```

## 5. Secreto de sesión (login 100% local, sin proveedores externos)

El login se verifica contra Postgres (bcrypt + JWT propio, ver `Backend/src/auth/local.ts`) — no
depende de ningún servicio externo. Solo hace falta un secreto largo y aleatorio para firmar las
sesiones, y (opcional) una contraseña fija para la cuenta admin inicial:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# copiar el resultado como JWT_SECRET en infra/.env
```

Si dejas `ADMIN_BOOTSTRAP_PASSWORD` vacío en `infra/.env`, el backend genera una contraseña al
azar para `ADMIN_BOOTSTRAP_EMAIL` la primera vez que arranca y la imprime una sola vez en sus
logs (`docker compose logs backend`) — cámbiala después del primer login.

## 6. Clave de firma OTA (Ed25519)

```bash
cd Backend && npm install
npm run ota:generar-clave
```

Esto crea `infra/secrets/ota-signing-key.pem` (queda solo en el servidor) e imprime la llave pública en formato C — pegarla en `Firmware/GreenhouseController/Config.h` como `OTA_PUBLIC_KEY_ED25519`.

## 7. Provisionar el dispositivo (token del ESP32)

Con Postgres ya arriba (`docker compose up -d postgres` primero, o después de levantar todo):

```bash
cd Backend
DATABASE_URL=postgres://shiitake:TU_CLAVE@localhost:5432/shiitake npm run dispositivo:provisionar invernadero_principal
```

Copiar el `ID_DISPOSITIVO` y `DEVICE_TOKEN` impresos al `Config.h` del firmware.

## 8. Completar `infra/.env` y desplegar

```bash
cp infra/.env.example infra/.env
# editar infra/.env: POSTGRES_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN, credenciales públicas de Firebase, etc.
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
docker compose -f infra/docker-compose.yml logs -f backend
```

Verificar `https://shiitake.ger-cloud.cc/api/health` → `{"ok":true}` antes de seguir con el resto de la migración.

## 9. Migrar configuración e historial reciente desde el Firebase viejo

Este es el único punto de todo el despliegue que todavía toca Firebase — es un script de
**uso único** que lee el RTDB del proyecto anterior (`invernadero-shiitake-iot`) para traer datos
existentes; no tiene relación con el login (100% local ahora) ni queda instalado en el stack
permanente.

Descargar una service account key **solo para correr este script**: Firebase Console → proyecto
`invernadero-shiitake-iot` → ⚙️ **Project settings** → **Service accounts** → **Generate new
private key**, y guardar el JSON en cualquier ruta temporal (no dentro del repo):

```bash
mkdir -p /tmp/migracion-firebase
mv ~/Downloads/invernadero-shiitake-iot-*.json /tmp/migracion-firebase/service-account.json
```

```bash
cd Backend
DATABASE_URL=postgres://shiitake:TU_CLAVE@localhost:5432/shiitake \
FIREBASE_SERVICE_ACCOUNT_PATH=/tmp/migracion-firebase/service-account.json \
DIAS_HISTORIAL_RECIENTE=7 \
npm run migrar:firebase
```

Migra config de ambas zonas + últimos 7 días de historial + alertas activas. Los 3 años
completos de histórico quedan para después (aprobado explícitamente). El RTDB viejo no se toca.
Al terminar, borrar `/tmp/migracion-firebase/` — esa clave ya no se necesita para nada más.

## 10. Respaldo de emergencia

Confirmar que el `.bin` del firmware estable actual está accesible localmente para reflashear por USB si algo falla durante las pruebas de hoy.

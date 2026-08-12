#!/usr/bin/env node
/**
 * Migración de una sola vez: config actual + un tramo reciente del historial desde el Firebase
 * RTDB viejo hacia Postgres. Los 3 años completos de histórico se importan más adelante (el
 * usuario aprobó explícitamente dejar la importación completa para después de hoy).
 *
 * Usa el service account de ese mismo proyecto Firebase (ya no usado por el backend en producción,
 * que ahora autentica localmente — ver Backend/src/auth/local.ts). Este script solo lee el RTDB
 * viejo, es de un solo uso; `firebase-admin` ya no es dependencia del proyecto, así que si vuelves
 * a correr esto instálalo aparte: `npm install --no-save firebase-admin`.
 *
 * Uso:
 *   DATABASE_URL=postgres://... \
 *   FIREBASE_SERVICE_ACCOUNT_PATH=../infra/secrets/firebase-service-account.json \
 *   FIREBASE_DATABASE_URL=https://invernadero-shiitake-iot-default-rtdb.firebaseio.com \
 *   DIAS_HISTORIAL_RECIENTE=7 \
 *   node scripts/migrar-datos-firebase.js
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { Client } = require('pg');

const ID_INVERNADERO = 'invernadero_principal';
const DIAS_RECIENTES = Number(process.env.DIAS_HISTORIAL_RECIENTE || 7);

async function main() {
  const rutaCredencial = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', '..', 'infra', 'secrets', 'firebase-service-account.json');
  const credencial = JSON.parse(fs.readFileSync(rutaCredencial, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(credencial),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://invernadero-shiitake-iot-default-rtdb.firebaseio.com',
  });
  const rtdb = admin.database();

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  console.log('== 1/3 Migrando configuración ==');
  const snapConfig = await rtdb.ref(`invernaderos/${ID_INVERNADERO}/configuracion`).once('value');
  const config = snapConfig.val() || {};

  for (const zona of ['atriles', 'descanso']) {
    const z = config[zona] || {};
    const rangos = z.rangosHorarios ? Object.values(z.rangosHorarios) : [];
    // INSERT ... ON CONFLICT (no UPDATE a secas): si la fila de la zona aún no existe
    // (ej. la migración 0002 todavía no corrió), un UPDATE plano matchea 0 filas y
    // reporta "éxito" sin escribir nada — ya nos pasó una vez.
    const { rowCount } = await pg.query(
      `INSERT INTO configuracion_zona (zona, humedad_minima, humedad_maxima, modo, humidificador_manual,
                                        temporizador_encendido, rangos_horarios, ac_modo, ac_temp_minima,
                                        ac_temp_maxima, ac_manual_encendido, actualizado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (zona) DO UPDATE SET
         humedad_minima = $2, humedad_maxima = $3, modo = $4, humidificador_manual = $5,
         temporizador_encendido = $6, rangos_horarios = $7,
         ac_modo = $8, ac_temp_minima = $9, ac_temp_maxima = $10, ac_manual_encendido = $11,
         actualizado_en = now()`,
      [
        zona,
        z.humedadMinima ?? 75, z.humedadMaxima ?? 85, (z.modo || 'AUTO').toString().toUpperCase(),
        !!z.humidificadorManual, !!z.temporizadorEncendido, JSON.stringify(rangos),
        (z.aireAcondicionado?.modo || 'AUTO').toString().toUpperCase(),
        z.aireAcondicionado?.temperaturaMinima ?? 22, z.aireAcondicionado?.temperaturaMaxima ?? 26,
        !!z.aireAcondicionado?.manualEncendido,
      ]
    );
    console.log(`  zona ${zona}: ${rowCount} fila escrita (humedad ${z.humedadMinima ?? 75}-${z.humedadMaxima ?? 85}%, modo ${(z.modo || 'AUTO').toUpperCase()})`);
  }
  console.log('  OK: configuración de ambas zonas migrada.');

  console.log(`== 2/3 Migrando historial reciente (últimos ${DIAS_RECIENTES} días) ==`);
  const desdeMillis = Date.now() - DIAS_RECIENTES * 24 * 60 * 60 * 1000;
  const snapHist = await rtdb
    .ref(`invernaderos/${ID_INVERNADERO}/historial`)
    .orderByChild('timestamp')
    .startAt(desdeMillis)
    .once('value');

  const registros = snapHist.val() ? Object.values(snapHist.val()) : [];
  let insertados = 0;
  for (const r of registros) {
    if (!r || typeof r.timestamp !== 'number') continue;
    const ts = new Date(r.timestamp);
    const humAt = r.humedadAtriles ?? r.humedadPromedio;
    const tempAt = r.tempAtriles ?? r.temperaturaPromedio;
    const releAt = !!(r.releAtriles ?? r.estadoHumidificador);
    const humDe = r.humedadDescanso ?? r.humedadPromedio;
    const tempDe = r.tempDescanso ?? r.temperaturaPromedio;
    const releDe = !!(r.releDescanso ?? r.estadoHumidificador);

    await pg.query(`INSERT INTO historial (zona, humedad, temperatura, rele_encendido, ts) VALUES ('atriles',$1,$2,$3,$4)`, [humAt, tempAt, releAt, ts]);
    await pg.query(`INSERT INTO historial (zona, humedad, temperatura, rele_encendido, ts) VALUES ('descanso',$1,$2,$3,$4)`, [humDe, tempDe, releDe, ts]);
    insertados += 2;
  }
  console.log(`  OK: ${insertados} filas insertadas en \`historial\` (RTDB original queda intacto como respaldo).`);

  console.log('== 3/3 Migrando alertas activas (no resueltas) ==');
  const snapAlertas = await rtdb.ref(`invernaderos/${ID_INVERNADERO}/alertas`).once('value');
  const alertas = snapAlertas.val() || {};
  let alertasMigradas = 0;
  for (const [id, a] of Object.entries(alertas)) {
    if (!a || a.resuelta) continue;
    await pg.query(
      `INSERT INTO alertas (id, tipo, categoria, mensaje, resuelta, ts) VALUES ($1,$2,$3,$4,false,$5)
       ON CONFLICT (id) DO NOTHING`,
      [id, a.tipo || 'INFO', a.id || 'MIGRACION', a.mensaje || '', new Date(a.timestamp || Date.now())]
    );
    alertasMigradas++;
  }
  console.log(`  OK: ${alertasMigradas} alertas activas migradas.`);

  await pg.end();
  console.log('\n✅ Migración completa. El RTDB de Firebase NO fue modificado ni borrado.');
}

main().catch((err) => {
  console.error('❌ Error en la migración:', err);
  process.exit(1);
});

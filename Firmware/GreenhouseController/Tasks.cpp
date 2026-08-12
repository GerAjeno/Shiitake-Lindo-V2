#include "Tasks.h"
#include "Config.h"
#include "OtaManager.h"

SemaphoreHandle_t g_mutexEstado;
ConfiguracionSistema g_config;
TelemetriaActual g_telemetria;
MatrizSensores g_matrizSensores;
bool g_falloCriticoAtriles = false, g_falloCriticoDescanso = false;
String g_loteHistorialPendiente;
bool g_loteHistorialListo = false;

SensorManager g_sensores;
RelayModbusClient g_releClient(Config::PIN_RELE_TX, Config::PIN_RELE_RX, Config::RELE_UART_BAUDIOS, Config::RELE_DIRECCION_MODBUS);
HumidifierController g_humidificador(&g_releClient);
ConfigCache g_configCache;
CloudClient g_cloud(&g_configCache, &g_config);
WiFiManagerHelper g_wifi(Config::WIFI_SSID_DEFAULT, Config::WIFI_PASSWORD_DEFAULT);

static NivelCalidadAire mqANivel(const LecturaMQ& mq) { return mq.nivel; }

static const char* estadoATexto(EstadoSensor e) {
    switch (e) {
        case EstadoSensor::OK: return "OK";
        case EstadoSensor::OFFLINE: return "OFFLINE";
        default: return "INVALIDO";
    }
}

static const char* modoATexto(ModoControl m) {
    switch (m) {
        case ModoControl::MANUAL: return "MANUAL";
        case ModoControl::TEMPORIZADO: return "TEMPORIZADO";
        default: return "AUTO";
    }
}

static String timestampIso() {
    time_t ahora = time(nullptr);
    struct tm ti;
    gmtime_r(&ahora, &ti);
    char buf[25];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    return String(buf);
}

void iniciarTareas() {
    g_mutexEstado = xSemaphoreCreateMutex();

    pinMode(Config::PIN_LED_ATRILES, OUTPUT);
    pinMode(Config::PIN_LED_DESCANSO, OUTPUT);
    digitalWrite(Config::PIN_LED_ATRILES, LOW);
    digitalWrite(Config::PIN_LED_DESCANSO, LOW);

    g_sensores.inicializar();
    g_humidificador.inicializar();
    g_humidificador.establecerNotificador(&g_cloud);
    g_configCache.inicializar();

    // Arranque seguro: cargar config de NVS (si existe) ANTES de crear las tareas.
    if (g_configCache.cargarConfiguracion(g_config)) {
        Serial.println("[ARRANQUE] Configuración cargada desde NVS.");
    } else {
        Serial.println("[ARRANQUE] Sin configuración previa en NVS, usando valores por defecto.");
    }

    g_sensores.leerTodos();
    g_sensores.aplicarSensoresHabilitados(g_config);
    ResultadoZonaDHT at = g_sensores.calcularAtriles();
    ResultadoZonaDHT de = g_sensores.calcularDescanso();
    g_humidificador.evaluarEstadoInicial(at, de, g_config);

    xTaskCreatePinnedToCore(tareaSensores, "Sensores", Config::STACK_TAREA_SENSORES, nullptr, Config::PRIORIDAD_TAREA_SENSORES, nullptr, 1);
    xTaskCreatePinnedToCore(tareaControl, "Control", Config::STACK_TAREA_CONTROL, nullptr, Config::PRIORIDAD_TAREA_CONTROL, nullptr, 1);
    xTaskCreatePinnedToCore(tareaRed, "Red", Config::STACK_TAREA_RED, nullptr, Config::PRIORIDAD_TAREA_RED, nullptr, 0);
    xTaskCreatePinnedToCore(tareaWatchdog, "Watchdog", Config::STACK_TAREA_WATCHDOG, nullptr, Config::PRIORIDAD_TAREA_WATCHDOG, nullptr, 0);
}

void tareaSensores(void* parametro) {
    (void)parametro;
    // Acumulador de 6 muestras de 5s (30s totales) por zona, para el lote de historial.
    JsonDocument muestrasAtriles, muestrasDescanso;
    JsonArray arrAt = muestrasAtriles.to<JsonArray>();
    JsonArray arrDe = muestrasDescanso.to<JsonArray>();
    uint8_t contadorLote = 0;

    for (;;) {
        g_sensores.leerTodos();

        if (xSemaphoreTake(g_mutexEstado, pdMS_TO_TICKS(200)) == pdTRUE) {
            g_sensores.aplicarSensoresHabilitados(g_config);
            g_matrizSensores = g_sensores.obtenerMatriz();
            ResultadoZonaDHT at = g_sensores.calcularAtriles();
            ResultadoZonaDHT de = g_sensores.calcularDescanso();
            g_falloCriticoAtriles = at.falloCritico;
            g_falloCriticoDescanso = de.falloCritico;

            if (at.discrepanciaExcesiva) {
                g_cloud.registrarAlerta("DISCREPANCIA_ATRILES", "ADVERTENCIA",
                    "DHT1 y DHT2 de Atriles difieren más de lo permitido — revisar sensores.");
            }
            if (de.discrepanciaExcesiva) {
                g_cloud.registrarAlerta("DISCREPANCIA_DESCANSO", "ADVERTENCIA",
                    "DHT3 y DHT4 de Descanso difieren más de lo permitido — revisar sensores.");
            }

            String ts = timestampIso();
            JsonObject mAt = arrAt.add<JsonObject>();
            mAt["ts"] = ts; mAt["humedad"] = at.humedadPromedio; mAt["temperatura"] = at.temperaturaPromedio;
            mAt["releEncendido"] = g_humidificador.estadoAtriles();
            mAt["co2"] = g_sensores.lecturaMQAtriles().valorCrudo;

            JsonObject mDe = arrDe.add<JsonObject>();
            mDe["ts"] = ts; mDe["humedad"] = de.humedadPromedio; mDe["temperatura"] = de.temperaturaPromedio;
            mDe["releEncendido"] = g_humidificador.estadoDescanso();
            mDe["co2"] = g_sensores.lecturaMQDescanso().valorCrudo;

            contadorLote++;
            if (contadorLote >= Config::INTERVALO_LOTE_HISTORIAL_MUESTRAS) {
                JsonDocument lote;
                JsonArray arr = lote.to<JsonArray>();
                JsonObject loteAt = arr.add<JsonObject>();
                loteAt["zona"] = "atriles";
                loteAt["muestras"] = arrAt;

                JsonObject loteDe = arr.add<JsonObject>();
                loteDe["zona"] = "descanso";
                loteDe["muestras"] = arrDe;

                String envelope;
                JsonDocument mensaje;
                mensaje["tipo"] = "historial_lote";
                mensaje["datos"] = arr;
                serializeJson(mensaje, envelope);

                g_loteHistorialPendiente = envelope;
                g_loteHistorialListo = true;

                muestrasAtriles.clear(); arrAt = muestrasAtriles.to<JsonArray>();
                muestrasDescanso.clear(); arrDe = muestrasDescanso.to<JsonArray>();
                contadorLote = 0;
            }

            xSemaphoreGive(g_mutexEstado);
        }

        vTaskDelay(pdMS_TO_TICKS(Config::INTERVALO_LECTURA_SENSORES_MS));
    }
}

void tareaControl(void* parametro) {
    (void)parametro;

    for (;;) {
        if (xSemaphoreTake(g_mutexEstado, pdMS_TO_TICKS(200)) == pdTRUE) {
            ResultadoZonaDHT at = g_sensores.calcularAtriles();
            ResultadoZonaDHT de = g_sensores.calcularDescanso();

            bool offlineFallback = g_cloud.millisDesdeUltimoContactoExitoso() > Config::TIMEOUT_OFFLINE_FALLBACK_MS;
            g_humidificador.actualizarControl(at, de, g_config, offlineFallback);

            // LED indicador: refleja el estado REAL del relé (confirmado por Modbus), no una intención.
            digitalWrite(Config::PIN_LED_ATRILES, g_humidificador.estadoAtriles() ? HIGH : LOW);
            digitalWrite(Config::PIN_LED_DESCANSO, g_humidificador.estadoDescanso() ? HIGH : LOW);

            // Aplicar comando manual pendiente recibido por WS.
            ComandoEntrante cmd = g_cloud.tomarComandoPendiente();
            if (cmd.pendiente && cmd.tipo == "humidificador") {
                bool exito = g_releClient.escribirCanal(
                    cmd.zona == "atriles" ? Config::RELE_CANAL_ATRILES : Config::RELE_CANAL_DESCANSO,
                    cmd.valorBool
                );
                g_cloud.enviarAck(cmd.orderId, exito, exito ? "" : "El módulo de relés no confirmó la orden.");
            } else if (cmd.pendiente) {
                g_cloud.enviarAck(cmd.orderId, false, "Tipo de comando no reconocido en esta versión.");
            }

            // Construir snapshot de telemetría para que la tarea de red lo suba.
            g_telemetria.atriles.humedadPromedio = at.humedadPromedio;
            g_telemetria.atriles.temperaturaPromedio = at.temperaturaPromedio;
            g_telemetria.atriles.falloCriticoDHT = at.falloCritico;
            g_telemetria.atriles.estadoHumidificador = g_humidificador.estadoAtriles();
            g_telemetria.atriles.modoActual = g_config.atriles.modo;
            g_telemetria.atriles.calidadAire = mqANivel(g_sensores.lecturaMQAtriles());
            g_telemetria.atriles.tendenciaAire = g_sensores.tendenciaAtriles();

            g_telemetria.descanso.humedadPromedio = de.humedadPromedio;
            g_telemetria.descanso.temperaturaPromedio = de.temperaturaPromedio;
            g_telemetria.descanso.falloCriticoDHT = de.falloCritico;
            g_telemetria.descanso.estadoHumidificador = g_humidificador.estadoDescanso();
            g_telemetria.descanso.modoActual = g_config.descanso.modo;
            g_telemetria.descanso.calidadAire = mqANivel(g_sensores.lecturaMQDescanso());
            g_telemetria.descanso.tendenciaAire = g_sensores.tendenciaDescanso();

            g_telemetria.firmwareVersion = Config::FIRMWARE_VERSION;

            xSemaphoreGive(g_mutexEstado);
        }

        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void tareaRed(void* parametro) {
    (void)parametro;
    g_wifi.inicializar();

    bool ntpSincronizado = false;
    uint32_t ultimoEnvioTelemetriaMillis = 0;
    uint32_t ultimoEnvioSensoresMillis = 0;

    for (;;) {
        g_wifi.procesarConexion();

        if (g_wifi.estaConectado()) {
            if (!ntpSincronizado) {
                configTzTime(Config::ZONA_HORARIA_POSIX, "pool.ntp.org", "time.google.com");
                ntpSincronizado = true;
                g_cloud.inicializar(Config::BACKEND_HOST_DEFAULT, 443, Config::ID_DISPOSITIVO, Config::DEVICE_TOKEN);
            }
            g_cloud.procesar();

            uint32_t ahora = millis();
            if (xSemaphoreTake(g_mutexEstado, pdMS_TO_TICKS(200)) == pdTRUE) {
                g_telemetria.estadoWifi = g_wifi.obtenerSsid();
                g_telemetria.rssiWifi = g_wifi.obtenerRssi();

                if (ahora - ultimoEnvioTelemetriaMillis >= Config::INTERVALO_TELEMETRIA_MS) {
                    ultimoEnvioTelemetriaMillis = ahora;
                    g_cloud.enviarTelemetria(g_telemetria);
                }
                if (ahora - ultimoEnvioSensoresMillis >= Config::INTERVALO_ENVIO_SENSORES_MS) {
                    ultimoEnvioSensoresMillis = ahora;
                    g_cloud.enviarSensores(g_matrizSensores);
                }

                OtaEntrante ota = g_cloud.tomarOtaPendiente();

                String loteAEnviar;
                bool hayLote = g_loteHistorialListo;
                if (hayLote) {
                    loteAEnviar = g_loteHistorialPendiente;
                    g_loteHistorialListo = false;
                }
                xSemaphoreGive(g_mutexEstado);

                if (hayLote) g_cloud.enviarLoteHistorial(loteAEnviar);

                if (ota.pendiente) {
                    OtaManager::procesarActualizacion(ota, &g_cloud, Config::FIRMWARE_VERSION);
                }
            }
        }

        vTaskDelay(pdMS_TO_TICKS(200));
    }
}

void tareaWatchdog(void* parametro) {
    (void)parametro;
    uint32_t inicioMillis = millis();
    bool firmwareValidado = !OtaManager::estaPendienteDeValidacion();

    for (;;) {
        uint32_t heapLibre = ESP.getFreeHeap();
        if (heapLibre < 20000) {
            Serial.printf("[WATCHDOG] Memoria crítica: %u bytes libres.\n", heapLibre);
        }

        // Heartbeat de estado completo cada ~10s, para tener visibilidad en el monitor serie
        // sin esperar a que ocurra un cambio de relé o de conexión.
        if (xSemaphoreTake(g_mutexEstado, pdMS_TO_TICKS(200)) == pdTRUE) {
            TelemetriaZona& at = g_telemetria.atriles;
            TelemetriaZona& de = g_telemetria.descanso;
            MatrizSensores& ms = g_matrizSensores;

            Serial.println("--------------------------------------------------------------------");
            Serial.printf("[ESTADO] WiFi:%s (RSSI %d dBm) | Backend:%s | Heap:%u bytes | PSRAM:%u bytes (libre:%u)\n",
                          g_wifi.estaConectado() ? "OK" : "SIN CONEXION", g_wifi.obtenerRssi(),
                          g_cloud.estaConectado() ? "OK" : "SIN CONEXION", heapLibre,
                          ESP.getPsramSize(), ESP.getFreePsram());

            Serial.printf("[ATRILES]  Hum=%.1f%% Temp=%.1fC Rele=%s Modo=%s Fallo=%s | DHT1=%s(%.1f%%,%.1fC) DHT2=%s(%.1f%%,%.1fC) MQ1=%d\n",
                          at.humedadPromedio, at.temperaturaPromedio, at.estadoHumidificador ? "ON" : "OFF",
                          modoATexto(at.modoActual), at.falloCriticoDHT ? "SI" : "no",
                          estadoATexto(ms.dht1.estado), ms.dht1.humedad, ms.dht1.temperatura,
                          estadoATexto(ms.dht2.estado), ms.dht2.humedad, ms.dht2.temperatura,
                          ms.mq1.valorCrudo);

            Serial.printf("[DESCANSO] Hum=%.1f%% Temp=%.1fC Rele=%s Modo=%s Fallo=%s | DHT3=%s(%.1f%%,%.1fC) DHT4=%s(%.1f%%,%.1fC) MQ2=%d\n",
                          de.humedadPromedio, de.temperaturaPromedio, de.estadoHumidificador ? "ON" : "OFF",
                          modoATexto(de.modoActual), de.falloCriticoDHT ? "SI" : "no",
                          estadoATexto(ms.dht3.estado), ms.dht3.humedad, ms.dht3.temperatura,
                          estadoATexto(ms.dht4.estado), ms.dht4.humedad, ms.dht4.temperatura,
                          ms.mq2.valorCrudo);
            Serial.println("--------------------------------------------------------------------");
            xSemaphoreGive(g_mutexEstado);
        }

        // Criterios de salud para confirmar el firmware tras una actualización OTA:
        // 2 minutos de uptime sin reinicio + heap sano + módulo de relés respondiendo + WiFi ok
        // + backend contactado al menos una vez. Un solo DHT caído NO bloquea la validación.
        if (!firmwareValidado && (millis() - inicioMillis) > 120000) {
            bool releOk = g_humidificador.releModuloResponde();
            bool wifiOk = g_wifi.estaConectado();
            bool memoriaOk = heapLibre > 20000;
            if (releOk && wifiOk && memoriaOk) {
                OtaManager::confirmarFirmwareSano();
                firmwareValidado = true;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(Config::INTERVALO_IMPRESION_ESTADO_MS));
    }
}

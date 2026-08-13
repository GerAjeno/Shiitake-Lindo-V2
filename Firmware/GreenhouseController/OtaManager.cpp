#include "OtaManager.h"
#include "Config.h"
#include "Tasks.h" // extern g_telemetria/g_mutexEstado — Tasks.h no incluye OtaManager.h, no hay ciclo
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <mbedtls/sha256.h>
#include <mbedtls/version.h>
#include <mbedtls/base64.h>
#include <Ed25519.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>

bool OtaManager::_enActualizacion = false;

void OtaManager::controlarLed(uint8_t r, uint8_t g, uint8_t b) {
#ifdef RGB_BUILTIN
    neopixelWrite(RGB_BUILTIN, r, g, b);
#endif
}

namespace {

String bytesAHex(const uint8_t* datos, size_t longitud) {
    String salida;
    salida.reserve(longitud * 2);
    const char* alfabeto = "0123456789abcdef";
    for (size_t i = 0; i < longitud; i++) {
        salida += alfabeto[(datos[i] >> 4) & 0x0F];
        salida += alfabeto[datos[i] & 0x0F];
    }
    return salida;
}

// procesarActualizacion() corre en tareaRed de forma síncrona/bloqueante durante todo el proceso
// (hasta ~60s) — el resto de esa tarea (que es la única que manda telemetría) no vuelve a correr
// hasta que termina, así que sin esto la web no ve ningún cambio hasta el reinicio. Reporta el
// progreso empujando la telemetría de inmediato en vez de esperar al próximo ciclo normal.
void actualizarProgreso(CloudClient* cloud, const char* estado, int progreso) {
    if (!cloud) return;
    if (xSemaphoreTake(g_mutexEstado, pdMS_TO_TICKS(500)) == pdTRUE) {
        g_telemetria.otaEstado = estado;
        g_telemetria.otaProgreso = progreso;
        cloud->enviarTelemetria(g_telemetria);
        xSemaphoreGive(g_mutexEstado);
    }
}

} // namespace

bool OtaManager::verificarYFlashear(uint8_t* buffer, size_t tamano, const String& sha256Esperado, const String& firmaBase64,
                                     String& motivoFalla) {
    // 1) Verificar SHA-256
    uint8_t digest[32];
#if MBEDTLS_VERSION_NUMBER >= 0x03000000
    mbedtls_sha256(buffer, tamano, digest, 0);
#else
    mbedtls_sha256_ret(buffer, tamano, digest, 0);
#endif
    String sha256Calculado = bytesAHex(digest, 32);
    if (!sha256Calculado.equalsIgnoreCase(sha256Esperado)) {
        Serial.printf("[OTA ERROR] SHA-256 no coincide. Esperado=%s Calculado=%s\n", sha256Esperado.c_str(), sha256Calculado.c_str());
        motivoFalla = "SHA-256 no coincide (esperado " + sha256Esperado + ", calculado " + sha256Calculado + ")";
        return false;
    }

    // 2) Verificar firma Ed25519 sobre el binario completo
    uint8_t firma[64];
    size_t longitudDecodificada = 0;
    int rc = mbedtls_base64_decode(firma, sizeof(firma), &longitudDecodificada,
                                    (const unsigned char*)firmaBase64.c_str(), firmaBase64.length());
    if (rc != 0 || longitudDecodificada != 64) {
        Serial.println("[OTA ERROR] Firma Ed25519 con formato inválido.");
        motivoFalla = "Firma Ed25519 con formato inválido";
        return false;
    }
    bool firmaValida = Ed25519::verify(firma, Config::OTA_PUBLIC_KEY_ED25519, buffer, tamano);
    if (!firmaValida) {
        Serial.println("[OTA ERROR] Firma Ed25519 inválida — el binario NO proviene del servidor confiable. Se rechaza.");
        motivoFalla = "Firma Ed25519 inválida — el binario no proviene del servidor confiable";
        return false;
    }
    Serial.println("[OTA] SHA-256 y firma Ed25519 verificados correctamente. Procediendo a flashear...");

    // 3) Flashear a la partición OTA inactiva usando la API de bajo nivel (permite dejarla en
    //    estado "pendiente de verificación" para el rollback automático del bootloader).
    const esp_partition_t* destino = esp_ota_get_next_update_partition(NULL);
    if (!destino) {
        Serial.println("[OTA ERROR] No se encontró partición OTA de destino.");
        motivoFalla = "No se encontró partición OTA de destino";
        return false;
    }
    esp_ota_handle_t handle;
    if (esp_ota_begin(destino, tamano, &handle) != ESP_OK) {
        Serial.println("[OTA ERROR] esp_ota_begin falló (¿tamaño excede la partición?).");
        motivoFalla = "esp_ota_begin falló (¿tamaño excede la partición?)";
        return false;
    }
    if (esp_ota_write(handle, buffer, tamano) != ESP_OK) {
        Serial.println("[OTA ERROR] esp_ota_write falló.");
        esp_ota_abort(handle);
        motivoFalla = "esp_ota_write falló";
        return false;
    }
    if (esp_ota_end(handle) != ESP_OK) {
        Serial.println("[OTA ERROR] esp_ota_end falló (imagen inválida).");
        motivoFalla = "esp_ota_end falló (imagen inválida)";
        return false;
    }
    if (esp_ota_set_boot_partition(destino) != ESP_OK) {
        Serial.println("[OTA ERROR] No se pudo fijar la partición de arranque.");
        motivoFalla = "No se pudo fijar la partición de arranque";
        return false;
    }
    return true;
}

void OtaManager::procesarActualizacion(const OtaEntrante& ota, CloudClient* cloud, const char* versionActual) {
    if (_enActualizacion || ota.version == versionActual) return;
    _enActualizacion = true;
    controlarLed(0, 0, 255);
    if (cloud) {
        cloud->registrarAlerta("OTA", "INFO", "Iniciando descarga de firmware " + ota.version);
    }
    actualizarProgreso(cloud, "DESCARGANDO", 0);

    Serial.printf("[OTA] Descargando %s (version %s)\n", ota.url.c_str(), ota.version.c_str());

    WiFiClientSecure clienteSeguro;
    clienteSeguro.setInsecure(); // ver nota de seguridad en CloudClient.h — mitigado por firma Ed25519
    HTTPClient http;
    http.setTimeout(20000);
    if (!http.begin(clienteSeguro, ota.url)) {
        Serial.println("[OTA ERROR] No se pudo iniciar la conexión HTTPS.");
        if (cloud) cloud->registrarAlerta("OTA", "CRITICA", "Descarga abortada: no se pudo iniciar la conexión HTTPS con " + ota.url);
        actualizarProgreso(cloud, "ERROR", 0);
        controlarLed(255, 0, 0);
        _enActualizacion = false;
        return;
    }

    int codigo = http.GET();
    if (codigo != HTTP_CODE_OK) {
        Serial.printf("[OTA ERROR] HTTP %d\n", codigo);
        if (cloud) cloud->registrarAlerta("OTA", "CRITICA", "Descarga abortada: el servidor respondió HTTP " + String(codigo));
        actualizarProgreso(cloud, "ERROR", 0);
        http.end();
        controlarLed(255, 0, 0);
        _enActualizacion = false;
        return;
    }

    int tamano = http.getSize();
    // Debe caber en una sola partición OTA (app0/app1 = 0x300000 = 3MB, ver partitions.csv) —
    // antes se aceptaba hasta 8MB, que pasaba este chequeo pero fallaba recién en esp_ota_begin()
    // tras gastar tiempo/ancho de banda descargando el binario completo a PSRAM.
    if (tamano <= 0 || tamano > 3 * 1024 * 1024) {
        Serial.println("[OTA ERROR] Tamaño de firmware inválido (excede el tamaño de partición de 3MB).");
        if (cloud) cloud->registrarAlerta("OTA", "CRITICA", "Descarga abortada: tamaño de firmware inválido (" + String(tamano) + " bytes).");
        actualizarProgreso(cloud, "ERROR", 0);
        http.end();
        controlarLed(255, 0, 0);
        _enActualizacion = false;
        return;
    }

    uint8_t* buffer = (uint8_t*)heap_caps_malloc(tamano, MALLOC_CAP_SPIRAM);
    if (!buffer) {
        Serial.println("[OTA ERROR] Sin memoria PSRAM suficiente para el buffer de descarga.");
        if (cloud) cloud->registrarAlerta("OTA", "CRITICA", "Descarga abortada: sin memoria PSRAM suficiente para " + String(tamano) + " bytes.");
        actualizarProgreso(cloud, "ERROR", 0);
        http.end();
        controlarLed(255, 0, 0);
        _enActualizacion = false;
        return;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t leidos = 0;
    uint32_t inicio = millis();
    int ultimoProgresoReportado = -1;
    // Reservamos 0-90% para la descarga y 90-100% para verificación/flasheo (mucho más rápidos
    // en comparación) — reportar cada byte sería ruido; solo se empuja al cruzar cada 10%.
    while (leidos < (size_t)tamano && (millis() - inicio) < 60000) {
        if (stream->available()) {
            int n = stream->readBytes(buffer + leidos, min((size_t)stream->available(), (size_t)tamano - leidos));
            leidos += n;
            inicio = millis();
            int progreso = (int)((leidos * 90ULL) / (size_t)tamano);
            if (progreso >= ultimoProgresoReportado + 10) {
                actualizarProgreso(cloud, "DESCARGANDO", progreso);
                ultimoProgresoReportado = progreso;
            }
        } else {
            delay(5);
        }
    }
    http.end();

    if (leidos != (size_t)tamano) {
        Serial.println("[OTA ERROR] Descarga incompleta (timeout).");
        if (cloud) cloud->registrarAlerta("OTA", "CRITICA", "Descarga incompleta por timeout: " + String(leidos) + "/" + String(tamano) + " bytes.");
        actualizarProgreso(cloud, "ERROR", 0);
        free(buffer);
        controlarLed(255, 0, 0);
        _enActualizacion = false;
        return;
    }

    actualizarProgreso(cloud, "VERIFICANDO", 90);
    String motivoFalla;
    bool ok = verificarYFlashear(buffer, tamano, ota.sha256, ota.firmaBase64, motivoFalla);
    free(buffer);

    if (!ok) {
        controlarLed(255, 0, 0);
        if (cloud) cloud->registrarAlerta("OTA", "CRITICA", "Actualización rechazada: " + motivoFalla);
        actualizarProgreso(cloud, "ERROR", 0);
        _enActualizacion = false;
        return;
    }

    controlarLed(0, 255, 0);
    if (cloud) cloud->registrarAlerta("OTA", "INFO", "Firmware " + ota.version + " verificado y flasheado. Reiniciando...");
    actualizarProgreso(cloud, "REINICIANDO", 100);
    delay(1500);
    esp_restart();
}

bool OtaManager::estaPendienteDeValidacion() {
    const esp_partition_t* actual = esp_ota_get_running_partition();
    esp_ota_img_states_t estado;
    if (esp_ota_get_state_partition(actual, &estado) != ESP_OK) return false;
    return estado == ESP_OTA_IMG_PENDING_VERIFY;
}

void OtaManager::confirmarFirmwareSano() {
    if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
        Serial.println("[OTA] Firmware confirmado como sano — rollback automático cancelado.");
    }
}

void OtaManager::revertirPorFallo(const char* motivo) {
    Serial.printf("[OTA] Revirtiendo a la versión anterior por: %s\n", motivo);
    esp_ota_mark_app_invalid_rollback_and_reboot();
    // Si el bootloader no soporta rollback, la llamada anterior no hace nada — como último
    // recurso, al menos reiniciamos para intentar recuperarnos de un estado posiblemente inestable.
    esp_restart();
}

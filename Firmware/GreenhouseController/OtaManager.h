/**
 * @file OtaManager.h
 * @description OTA reescrita desde cero: descarga el firmware COMPLETO a un buffer en PSRAM
 * (el ESP32-S3 N16R8 tiene 8MB), verifica SHA-256 y firma Ed25519 ANTES de escribir un solo
 * byte a flash (a diferencia del firmware anterior, que escribía mientras descargaba sin
 * verificar nada). Solo si ambas verificaciones pasan se procede a flashear.
 *
 * Rollback: se usa la API de bajo nivel esp_ota_ops para dejar la partición nueva en estado
 * "pendiente de verificación" (ESP_OTA_IMG_PENDING_VERIFY). El sketch principal debe llamar a
 * confirmarFirmwareSano() tras pasar los criterios de salud (ver GreenhouseController.ino), o a
 * revertirPorFallo() si algo crítico falla temprano. Esto depende de que el bootloader del board
 * package tenga habilitado CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE (por defecto en la mayoría de
 * las definiciones recientes de placas ESP32-S3 en Arduino IDE) — si no lo tuviera, estas
 * llamadas son no-op seguras y el reflasheo manual por USB sigue siendo el respaldo real de hoy.
 */
#ifndef OTAMANAGER_H
#define OTAMANAGER_H

#include <Arduino.h>
#include "CloudClient.h"

class OtaManager {
public:
    static void procesarActualizacion(const OtaEntrante& ota, CloudClient* cloud, const char* versionActual);

    /** Llamar una vez, temprano en setup(), para conocer si esta imagen está pendiente de validar. */
    static bool estaPendienteDeValidacion();

    /** Llamar tras pasar todos los criterios de salud (ver .ino) — cancela el rollback automático. */
    static void confirmarFirmwareSano();

    /** Llamar si algo crítico falla durante la ventana de validación — fuerza vuelta a la versión anterior. */
    static void revertirPorFallo(const char* motivo);

private:
    static bool verificarYFlashear(uint8_t* buffer, size_t tamano, const String& sha256Esperado, const String& firmaBase64);
    static void controlarLed(uint8_t r, uint8_t g, uint8_t b);
    static bool _enActualizacion;
};

#endif // OTAMANAGER_H

/**
 * @file GreenhouseController.ino
 * @description Punto de entrada del firmware ESP32-S3 de Shiitake-Lindo V2. Reescrito desde
 * cero (ver docs/PLAN_MIGRACION.md). Secuencia de arranque segura:
 *   relés apagados -> cargar config NVS -> validar sensores -> iniciar control local ->
 *   al conectar, sincronizar con el servidor (que siempre gana, sin comparar versiones).
 * Todo el trabajo real ocurre en las 4 tareas FreeRTOS de Tasks.cpp; loop() queda vacío.
 */
#include "Tasks.h"

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println("\n========================================================");
    Serial.printf("  Shiitake-Lindo V2 — Firmware %s\n", Config::FIRMWARE_VERSION);
    Serial.println("========================================================");
    Serial.printf("[DIAGNOSTICO] PSRAM detectada: %u bytes | PSRAM libre: %u bytes | Heap libre: %u bytes\n",
                  ESP.getPsramSize(), ESP.getFreePsram(), ESP.getFreeHeap());
    if (ESP.getPsramSize() == 0) {
        Serial.println("[DIAGNOSTICO] *** PSRAM NO DETECTADA *** — revisar Tools > PSRAM en Arduino IDE, o esta placa no tiene PSRAM física.");
    }

    iniciarTareas();

    Serial.println("[ARRANQUE] Tareas iniciadas. Control local activo de forma autónoma.");
}

void loop() {
    // Todo el trabajo ocurre en las tareas FreeRTOS (ver Tasks.cpp).
    vTaskDelay(pdMS_TO_TICKS(60000));
}

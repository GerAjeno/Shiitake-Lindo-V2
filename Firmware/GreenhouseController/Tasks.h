/**
 * @file Tasks.h
 * @description Declaraciones de las 4 tareas FreeRTOS y el estado global compartido entre ellas.
 * Núcleo 1: SensorTask (prioridad 3) y ControlTask (prioridad 4, la más alta — control real-time
 * local, autónomo, no debe bloquearse nunca por red). Núcleo 0: CloudTask (prioridad 2) y
 * WatchdogTask (prioridad 1). Todo acceso a `g_config` y `g_telemetria` debe ir protegido por
 * `g_mutexEstado` porque se leen/escriben desde ambos núcleos.
 */
#ifndef TASKS_H
#define TASKS_H

#include <Arduino.h>
#include "SensorManager.h"
#include "HumidifierController.h"
#include "RelayModbusClient.h"
#include "CloudClient.h"
#include "ConfigCache.h"
#include "WiFiManager.h"
#include "Ds1307Rtc.h"
#include "Types.h"

extern SemaphoreHandle_t g_mutexEstado;
extern ConfiguracionSistema g_config;
extern TelemetriaActual g_telemetria;
extern MatrizSensores g_matrizSensores;
extern bool g_falloCriticoAtriles, g_falloCriticoDescanso;
extern String g_loteHistorialPendiente; // JSON ya serializado, listo para enviarLoteHistorial()
extern bool g_loteHistorialListo;

extern SensorManager g_sensores;
extern RelayModbusClient g_releClient;
extern HumidifierController g_humidificador;
extern ConfigCache g_configCache;
extern CloudClient g_cloud;
extern WiFiManagerHelper g_wifi;
extern Ds1307Rtc g_rtc;

void iniciarTareas();
void tareaSensores(void* parametro);
void tareaControl(void* parametro);
void tareaRed(void* parametro);
void tareaWatchdog(void* parametro);

#endif // TASKS_H

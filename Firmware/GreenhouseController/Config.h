/**
 * @file Config.h
 * @description Configuración global, pines GPIO y credenciales del controlador ESP32-S3.
 * Firmware reescrito desde cero para Shiitake-Lindo V2 (no reutiliza el firmware anterior).
 *
 * IMPORTANTE: las credenciales reales (WiFi, token de dispositivo) NO deben quedar commiteadas.
 * En este archivo van solo los DEFAULTS de compilación; en producción se recomienda sobrescribirlas
 * vía NVS (ver WiFiProvisioning, pendiente para v1.1) o reemplazarlas aquí localmente sin commitear
 * el cambio (usar `git update-index --skip-worktree Config.h` si hace falta editarlo en el servidor).
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

namespace Config {

    // ========================================================================
    // PINES GPIO (ESP32-S3 WROOM1 N16R8)
    // ========================================================================
    constexpr uint8_t PIN_DHT1 = 4;   // Atriles
    constexpr uint8_t PIN_DHT2 = 5;   // Atriles (redundante)
    constexpr uint8_t PIN_DHT3 = 18;  // Descanso
    constexpr uint8_t PIN_DHT4 = 17;  // Descanso (redundante)

    constexpr uint8_t PIN_MQ1 = 6;    // ADC1_CH5 — Atriles
    constexpr uint8_t PIN_MQ2 = 7;    // ADC1_CH6 — Descanso

    // Módulo de relés Modbus RTU sobre UART/TTL (NO RS-485). Confirmado con el usuario:
    // no hay conversor RS-485, es UART directo TX/RX al módulo (mcielectronics 2 canales).
    constexpr uint8_t PIN_RELE_TX = 15;
    constexpr uint8_t PIN_RELE_RX = 16;
    constexpr uint32_t RELE_UART_BAUDIOS = 9600;
    constexpr uint8_t RELE_DIRECCION_MODBUS = 0xFF; // Broadcast, confirmado con el manual del fabricante
    constexpr uint8_t RELE_CANAL_ATRILES = 0x00;    // Dirección de bobina (coil) 0x0000
    constexpr uint8_t RELE_CANAL_DESCANSO = 0x01;   // Dirección de bobina (coil) 0x0001

    // ========================================================================
    // INTERVALOS DE TIEMPO (MILISEGUNDOS)
    // ========================================================================
    constexpr uint32_t INTERVALO_LECTURA_SENSORES_MS = 5000;
    constexpr uint32_t INTERVALO_LOTE_TELEMETRIA_MS = 30000;   // 6 muestras de 5s por lote
    constexpr uint32_t INTERVALO_HEARTBEAT_MS = 30000;
    constexpr uint32_t TIEMPO_MINIMO_CONMUTACION_RELE_MS = 120000;
    constexpr uint32_t TIMEOUT_OFFLINE_FALLBACK_MS = 30UL * 60UL * 1000UL; // 30 min -> fallback a TEMPORIZADO

    // ========================================================================
    // RED Y NUBE (reemplazar por los valores reales de despliegue — ver docs/RUNBOOK_INFRA.md)
    // ========================================================================
    const char* const WIFI_SSID_DEFAULT = "Invernadero";
    const char* const WIFI_PASSWORD_DEFAULT = "CAMBIAR_ANTES_DE_COMPILAR";

    // Dominio público del backend (detrás de Cloudflare Tunnel). Durante la marcha blanca: prueba.ger-cloud.cc
    const char* const BACKEND_HOST_DEFAULT = "prueba.ger-cloud.cc";
    constexpr bool BACKEND_USA_TLS = true;

    // Identidad del dispositivo (generada por `npm run dispositivo:provisionar` en el Backend)
    const char* const ID_DISPOSITIVO = "invernadero_principal";
    const char* const DEVICE_TOKEN = "CAMBIAR_POR_EL_TOKEN_GENERADO";

    const char* const FIRMWARE_VERSION = "2.0.0";

    // Llave pública Ed25519 para verificar la firma del firmware OTA (generada por
    // `npm run ota:generar-clave` en el Backend — NUNCA la llave privada va aquí).
    constexpr uint8_t OTA_PUBLIC_KEY_ED25519[32] = {
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
    }; // <- REEMPLAZAR antes de compilar la versión de producción

    const char* const ZONA_HORARIA_POSIX = "CLT3CLST,M9.1.6/24,M4.1.6/24"; // America/Santiago con DST

    // ========================================================================
    // FREERTOS
    // ========================================================================
    constexpr uint32_t STACK_TAREA_SENSORES = 6144;
    constexpr uint32_t STACK_TAREA_CONTROL = 6144;
    constexpr uint32_t STACK_TAREA_RED = 16384; // WSS + HTTPS + AES Midea conviven aquí
    constexpr uint32_t STACK_TAREA_WATCHDOG = 3072;

    constexpr UBaseType_t PRIORIDAD_TAREA_CONTROL = 4;
    constexpr UBaseType_t PRIORIDAD_TAREA_SENSORES = 3;
    constexpr UBaseType_t PRIORIDAD_TAREA_RED = 2;
    constexpr UBaseType_t PRIORIDAD_TAREA_WATCHDOG = 1;

    // ========================================================================
    // VALIDACIÓN DE SENSORES (ver docs/PLAN_MIGRACION.md, sección firmware)
    // ========================================================================
    constexpr float SALTO_MAXIMO_HUMEDAD_5S = 15.0f;      // puntos %RH en 5s vs. mediana de últimas 5
    constexpr float SALTO_MAXIMO_TEMPERATURA_5S = 5.0f;   // °C en 5s vs. mediana de últimas 5
    constexpr float DISCREPANCIA_MAXIMA_HUMEDAD = 20.0f;  // puntos %RH entre pareja de sensores de una zona
    constexpr float DISCREPANCIA_MAXIMA_TEMPERATURA = 5.0f; // °C entre pareja de sensores de una zona
    constexpr uint8_t LECTURAS_PARA_DECLARAR_FALLO = 4;
    constexpr uint8_t LECTURAS_PARA_RECUPERAR = 4;

    // ========================================================================
    // AIRE ACONDICIONADO MIDEA (Khöne) — LAN local, discovery por Device ID
    // ========================================================================
    // No hay reserva DHCP posible (confirmado); se descubre por broadcast UDP + Device ID.
    const char* const AC_ATRILES_DEVICE_ID = "CAMBIAR_DEVICE_ID_ATRILES";
    const char* const AC_DESCANSO_DEVICE_ID = "CAMBIAR_DEVICE_ID_DESCANSO";
    // Token/Key obtenidos con get_ac_credentials.sh (ver README) — reemplazar antes de compilar.
    const char* const AC_ATRILES_TOKEN = "CAMBIAR";
    const char* const AC_ATRILES_KEY = "CAMBIAR";
    const char* const AC_DESCANSO_TOKEN = "CAMBIAR";
    const char* const AC_DESCANSO_KEY = "CAMBIAR";

} // namespace Config

#endif // CONFIG_H

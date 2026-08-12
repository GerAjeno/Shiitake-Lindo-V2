/**
 * @file Types.h
 * @description Estructuras de datos compartidas entre módulos del firmware. Los nombres de
 * campo espejan (en la medida de lo posible) Shared/types.ts para que la serialización JSON
 * hacia el backend sea directa.
 */
#ifndef TYPES_H
#define TYPES_H

#include <Arduino.h>

enum class EstadoSensor : uint8_t { OK, OFFLINE, LECTURA_INVALIDA };
enum class ModoControl : uint8_t { AUTOMATICO, MANUAL, TEMPORIZADO };
enum class NivelCalidadAire : uint8_t { BAJO, MEDIO, ALTO, MUY_ALTO };
enum class TendenciaAire : uint8_t { SUBIENDO, ESTABLE, BAJANDO };

// Conversión a los strings exactos que espera Shared/types.ts — el JSON hacia el backend/frontend
// nunca debe llevar el índice numérico crudo del enum (frágil y no coincide con el protocolo).
inline const char* aTexto(EstadoSensor v) {
    switch (v) {
        case EstadoSensor::OK: return "OK";
        case EstadoSensor::OFFLINE: return "Offline";
        default: return "Lectura Inválida";
    }
}
inline const char* aTexto(ModoControl v) {
    switch (v) {
        case ModoControl::AUTOMATICO: return "AUTO";
        case ModoControl::TEMPORIZADO: return "TEMPORIZADO";
        default: return "MANUAL";
    }
}
inline const char* aTexto(NivelCalidadAire v) {
    switch (v) {
        case NivelCalidadAire::BAJO: return "Bajo";
        case NivelCalidadAire::MEDIO: return "Medio";
        case NivelCalidadAire::ALTO: return "Alto";
        default: return "Muy Alto";
    }
}
inline const char* aTexto(TendenciaAire v) {
    switch (v) {
        case TendenciaAire::SUBIENDO: return "Subiendo";
        case TendenciaAire::BAJANDO: return "Bajando";
        default: return "Estable";
    }
}

struct LecturaDHT {
    EstadoSensor estado = EstadoSensor::OFFLINE;
    float temperatura = NAN;
    float humedad = NAN;
};

struct LecturaMQ {
    EstadoSensor estado = EstadoSensor::OFFLINE;
    int valorCrudo = 0;
    NivelCalidadAire nivel = NivelCalidadAire::BAJO;
};

struct MatrizSensores {
    LecturaDHT dht1, dht2, dht3, dht4;
    LecturaMQ mq1, mq2;
};

struct RangoHorario {
    String id;
    String inicio; // "HH:mm"
    String fin;    // "HH:mm"
    bool habilitado = false;
};

struct ConfiguracionZona {
    float humedadMinima = 75.0f;
    float humedadMaxima = 85.0f;
    ModoControl modo = ModoControl::AUTOMATICO;
    bool humidificadorManual = false;
    bool temporizadorEncendido = false;
    RangoHorario rangosHorarios[8];
    uint8_t cantidadRangos = 0;
    int umbralAdvertenciaMQ = 1500;
    int umbralAlarmaMQ = 2800;
};

struct ConfiguracionSistema {
    ConfiguracionZona atriles;
    ConfiguracionZona descanso;
    uint32_t intervaloConmutacionMinimoSeg = 120;
    bool dht1Habilitado = true, dht2Habilitado = true, dht3Habilitado = true, dht4Habilitado = true;
    bool mq1Habilitado = true, mq2Habilitado = true;
    // Versión monotónica local (solo para detectar "hubo cambios que persistir en NVS", NO se usa
    // para arbitrar conflictos con el servidor: el servidor SIEMPRE gana, decisión explícita del usuario).
    uint32_t versionLocal = 0;
};

struct TelemetriaZona {
    float humedadPromedio = NAN;
    float temperaturaPromedio = NAN;
    NivelCalidadAire calidadAire = NivelCalidadAire::BAJO;
    TendenciaAire tendenciaAire = TendenciaAire::ESTABLE;
    bool estadoHumidificador = false;
    ModoControl modoActual = ModoControl::AUTOMATICO;
    bool falloCriticoDHT = false;
};

struct TelemetriaActual {
    TelemetriaZona atriles;
    TelemetriaZona descanso;
    String estadoWifi;
    int rssiWifi = -100;
    bool espOnline = true;
    String firmwareVersion;
    String otaEstado = "INACTIVO";
    int otaProgreso = 0;
};

#endif // TYPES_H

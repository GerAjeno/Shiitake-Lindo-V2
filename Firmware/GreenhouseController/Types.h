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

// Pool de hasta 6 sensores de humedad/temperatura: 2 DHT22 físicos (GPIO 4/5, reincorporados
// porque los SHT35 de Descanso dieron problemas) + 4 SHT35-RS485 (direcciones Modbus 1-4). Qué
// sensor va a cada zona es config libre del usuario (ver ConfiguracionSistema::asignacionAtriles
// /asignacionDescanso), no una relación fija.
struct MatrizSensores {
    LecturaDHT dht1, dht2; // GPIO 4, GPIO 5
    LecturaDHT sht1, sht2, sht3, sht4; // direcciones Modbus 1-4
    LecturaMQ mq1, mq2;
};

struct RangoHorario {
    String id;
    String inicio; // "HH:mm"
    String fin;    // "HH:mm"
    bool habilitado = false;
};

// Tamaño fijo del arreglo de bloques horarios por zona (modo TEMPORIZADO) — usado también como
// tope de validación en Backend/src/routes/config.ts y en el mensaje de aviso de
// CloudClient::aplicarConfiguracionZona. Si se sube este número hay que subirlo en esos dos
// lugares también (no hay forma de compartir la constante entre el firmware en C++ y el backend
// en TypeScript).
constexpr uint8_t MAX_RANGOS_HORARIOS = 40;

struct ConfiguracionZona {
    float humedadMinima = 75.0f;
    float humedadMaxima = 85.0f;
    ModoControl modo = ModoControl::AUTOMATICO;
    bool humidificadorManual = false;
    bool temporizadorEncendido = false;
    RangoHorario rangosHorarios[MAX_RANGOS_HORARIOS];
    uint8_t cantidadRangos = 0;
    int umbralAdvertenciaMQ = 1500;
    int umbralAlarmaMQ = 2800;
};

// Tope de sensores que se le pueden asignar a una zona — típicamente 2, pero no forzado por el
// tipo (el usuario elige libremente desde la web cuáles del pool de 6 van en cada zona).
constexpr uint8_t MAX_SENSORES_POR_ZONA = 4;

struct AsignacionZona {
    String sensores[MAX_SENSORES_POR_ZONA]; // ids: "DHT1","DHT2","SHT1".."SHT4"
    uint8_t cantidad = 0;
};

struct ConfiguracionSistema {
    ConfiguracionZona atriles;
    ConfiguracionZona descanso;
    uint32_t intervaloConmutacionMinimoSeg = 120;
    AsignacionZona asignacionAtriles;
    AsignacionZona asignacionDescanso;
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
    String horaDispositivo; // ISO 8601 UTC, hora actual del reloj del sistema (RTC o NTP), ver timestampIso()
};

#endif // TYPES_H

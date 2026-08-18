/**
 * @file HumidifierController.h
 * @description Control de humedad con histéresis (reescrito desde cero). AUTO/MANUAL/TEMPORIZADO,
 * anti-rebote de 120s configurable, apagado de seguridad si ambos DHT de una zona fallan, y
 * reinicio del anti-rebote al cambiar de modo para permitir conmutación inmediata (<100ms).
 */
#ifndef HUMIDIFIERCONTROLLER_H
#define HUMIDIFIERCONTROLLER_H

#include "RelayModbusClient.h"
#include "INotificadorEventos.h"
#include "SensorManager.h"
#include "Types.h"

class HumidifierController {
public:
    explicit HumidifierController(RelayModbusClient* relayClient);

    void inicializar();
    void establecerNotificador(INotificadorEventos* notificador) { _notificador = notificador; }

    /** Evaluación inicial al arrancar (relés parten en OFF; esto decide el primer estado real). */
    void evaluarEstadoInicial(const ResultadoZonaDHT& atriles, const ResultadoZonaDHT& descanso, ConfiguracionSistema& config);

    /**
     * Ciclo de control (llamar cada ~1s). `offlineFallbackActivo` fuerza tratar el modo como
     * TEMPORIZADO (usando el horario ya cacheado) cuando llevan >30min sin contacto con el backend,
     * sin perder el modo real configurado por el usuario (se restaura solo al reconectar).
     */
    void actualizarControl(const ResultadoZonaDHT& atriles, const ResultadoZonaDHT& descanso,
                            ConfiguracionSistema& config, bool offlineFallbackActivo);

    bool estadoAtriles() const { return _estadoAtriles; }
    bool estadoDescanso() const { return _estadoDescanso; }
    void apagarEmergencia();

    /** true si el módulo de relés respondió a la última confirmación de estado pedida (para el health-check de OTA). */
    bool releModuloResponde() const { return _releModuloResponde; }

private:
    RelayModbusClient* _relayClient;
    INotificadorEventos* _notificador = nullptr;

    bool _estadoAtriles = false;
    bool _estadoDescanso = false;
    uint32_t _ultimoCambioAtrilesMillis = 0;
    uint32_t _ultimoCambioDescansoMillis = 0;
    ModoControl _modoAnteriorAtriles = ModoControl::AUTOMATICO;
    ModoControl _modoAnteriorDescanso = ModoControl::AUTOMATICO;
    bool _releModuloResponde = false;
    uint32_t _ultimaLecturaEstadoMillis = 0;

    ModoControl modoEfectivo(ModoControl modoConfigurado, bool offlineFallbackActivo) const;
    /** Evalúa los rangosHorarios de la zona contra la hora local actual (RTC/NTP + TZ Santiago). */
    bool evaluarRangoHorario(const ConfiguracionZona& zona) const;
    void aplicarCanal(uint8_t canal, bool encender, const char* zonaNombre);
    void notificarCambio(uint8_t canal, bool nuevoEstado, ModoControl modo, float humedad, float temperatura,
                          float humMin, float humMax, const char* motivoEspecial = nullptr);
};

#endif // HUMIDIFIERCONTROLLER_H

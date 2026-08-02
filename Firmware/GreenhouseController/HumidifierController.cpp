#include "HumidifierController.h"
#include "Config.h"

HumidifierController::HumidifierController(RelayModbusClient* relayClient) : _relayClient(relayClient) {}

void HumidifierController::inicializar() {
    _relayClient->inicializar();
    // Arranque seguro: forzar ambos canales apagados antes de evaluar cualquier configuración.
    _relayClient->escribirCanal(Config::RELE_CANAL_ATRILES, false);
    _relayClient->escribirCanal(Config::RELE_CANAL_DESCANSO, false);
    _estadoAtriles = false;
    _estadoDescanso = false;
}

ModoControl HumidifierController::modoEfectivo(ModoControl modoConfigurado, bool offlineFallbackActivo) const {
    if (offlineFallbackActivo && modoConfigurado != ModoControl::TEMPORIZADO) {
        return ModoControl::TEMPORIZADO;
    }
    return modoConfigurado;
}

void HumidifierController::notificarCambio(uint8_t canal, bool nuevoEstado, ModoControl modo, float humedad,
                                            float temperatura, float humMin, float humMax, const char* motivoEspecial) {
    if (!_notificador) return;
    const char* zonaNombre = (canal == Config::RELE_CANAL_ATRILES) ? "Atriles" : "Descanso";
    const char* idAlerta = nuevoEstado
        ? (canal == Config::RELE_CANAL_ATRILES ? "REL_ATRILES_ON" : "REL_DESCANSO_ON")
        : (canal == Config::RELE_CANAL_ATRILES ? "REL_ATRILES_OFF" : "REL_DESCANSO_OFF");

    String motivo;
    if (motivoEspecial) {
        motivo = motivoEspecial;
    } else if (nuevoEstado) {
        motivo = (modo == ModoControl::MANUAL) ? "Modo Manual activado por operador"
               : (modo == ModoControl::TEMPORIZADO) ? "Inicio de ventana programada"
               : "Humedad bajo el umbral mínimo (" + String(humedad, 1) + "% < " + String(humMin, 1) + "%)";
    } else {
        motivo = (modo == ModoControl::MANUAL) ? "Modo Manual apagado por operador"
               : (modo == ModoControl::TEMPORIZADO) ? "Fin de ventana programada"
               : "Humedad alcanzó el umbral máximo (" + String(humedad, 1) + "% >= " + String(humMax, 1) + "%)";
    }

    String mensaje = String("Humidificador ") + zonaNombre + " " + (nuevoEstado ? "ENCENDIDO" : "APAGADO") +
                      " | Humedad: " + String(humedad, 1) + "% | Temp: " + String(temperatura, 1) + "C | " + motivo;
    _notificador->registrarAlerta(idAlerta, "INFO", mensaje);
    _notificador->registrarLog("ACTUADOR", "INFO", mensaje);
}

void HumidifierController::evaluarEstadoInicial(const ResultadoZonaDHT& atriles, const ResultadoZonaDHT& descanso,
                                                 ConfiguracionSistema& config) {
    bool encenderAt = false;
    if (config.atriles.modo == ModoControl::MANUAL) encenderAt = config.atriles.humidificadorManual;
    else if (config.atriles.modo == ModoControl::TEMPORIZADO) encenderAt = config.atriles.temporizadorEncendido;
    else if (!atriles.falloCritico) encenderAt = atriles.humedadPromedio < config.atriles.humedadMinima;

    if (_relayClient->escribirCanal(Config::RELE_CANAL_ATRILES, encenderAt)) {
        _estadoAtriles = encenderAt;
    }
    _ultimoCambioAtrilesMillis = millis();
    notificarCambio(Config::RELE_CANAL_ATRILES, _estadoAtriles, config.atriles.modo, atriles.humedadPromedio,
                     atriles.temperaturaPromedio, config.atriles.humedadMinima, config.atriles.humedadMaxima,
                     "Evaluación de arranque del controlador");

    bool encenderDe = false;
    if (config.descanso.modo == ModoControl::MANUAL) encenderDe = config.descanso.humidificadorManual;
    else if (config.descanso.modo == ModoControl::TEMPORIZADO) encenderDe = config.descanso.temporizadorEncendido;
    else if (!descanso.falloCritico) encenderDe = descanso.humedadPromedio < config.descanso.humedadMinima;

    if (_relayClient->escribirCanal(Config::RELE_CANAL_DESCANSO, encenderDe)) {
        _estadoDescanso = encenderDe;
    }
    _ultimoCambioDescansoMillis = millis();
    notificarCambio(Config::RELE_CANAL_DESCANSO, _estadoDescanso, config.descanso.modo, descanso.humedadPromedio,
                     descanso.temperaturaPromedio, config.descanso.humedadMinima, config.descanso.humedadMaxima,
                     "Evaluación de arranque del controlador");

    _modoAnteriorAtriles = config.atriles.modo;
    _modoAnteriorDescanso = config.descanso.modo;
}

void HumidifierController::actualizarControl(const ResultadoZonaDHT& atriles, const ResultadoZonaDHT& descanso,
                                              ConfiguracionSistema& config, bool offlineFallbackActivo) {
    uint32_t ahora = millis();
    uint32_t intervaloMinimoMs = config.intervaloConmutacionMinimoSeg * 1000UL;

    ModoControl modoEfAt = modoEfectivo(config.atriles.modo, offlineFallbackActivo);
    ModoControl modoEfDe = modoEfectivo(config.descanso.modo, offlineFallbackActivo);
    bool cambioModoAt = modoEfAt != _modoAnteriorAtriles;
    bool cambioModoDe = modoEfDe != _modoAnteriorDescanso;

    if (cambioModoAt) _ultimoCambioAtrilesMillis = (ahora > intervaloMinimoMs) ? ahora - intervaloMinimoMs : 0;
    if (cambioModoDe) _ultimoCambioDescansoMillis = (ahora > intervaloMinimoMs) ? ahora - intervaloMinimoMs : 0;

    // ==================== ZONA ATRILES ====================
    if (atriles.falloCritico && modoEfAt == ModoControl::AUTOMATICO) {
        if (_estadoAtriles && _relayClient->escribirCanal(Config::RELE_CANAL_ATRILES, false)) {
            _estadoAtriles = false;
            _ultimoCambioAtrilesMillis = ahora;
            notificarCambio(Config::RELE_CANAL_ATRILES, false, modoEfAt, NAN, NAN, config.atriles.humedadMinima,
                             config.atriles.humedadMaxima, "Apagado de seguridad: ambos DHT de Atriles sin lectura válida");
        }
    } else {
        bool nuevoEstado = _estadoAtriles;
        if (modoEfAt == ModoControl::MANUAL) nuevoEstado = config.atriles.humidificadorManual;
        else if (modoEfAt == ModoControl::TEMPORIZADO) nuevoEstado = config.atriles.temporizadorEncendido;
        else if (!isnan(atriles.humedadPromedio)) {
            if (atriles.humedadPromedio < config.atriles.humedadMinima) nuevoEstado = true;
            else if (atriles.humedadPromedio >= config.atriles.humedadMaxima) nuevoEstado = false;
        }

        if (nuevoEstado != _estadoAtriles) {
            bool puedeConmutar = cambioModoAt || modoEfAt == ModoControl::MANUAL || modoEfAt == ModoControl::TEMPORIZADO ||
                                  (ahora - _ultimoCambioAtrilesMillis) >= intervaloMinimoMs;
            if (puedeConmutar && _relayClient->escribirCanal(Config::RELE_CANAL_ATRILES, nuevoEstado)) {
                _estadoAtriles = nuevoEstado;
                _ultimoCambioAtrilesMillis = ahora;
                notificarCambio(Config::RELE_CANAL_ATRILES, nuevoEstado, modoEfAt, atriles.humedadPromedio,
                                 atriles.temperaturaPromedio, config.atriles.humedadMinima, config.atriles.humedadMaxima);
            }
        }
    }

    // ==================== ZONA DESCANSO ====================
    if (descanso.falloCritico && modoEfDe == ModoControl::AUTOMATICO) {
        if (_estadoDescanso && _relayClient->escribirCanal(Config::RELE_CANAL_DESCANSO, false)) {
            _estadoDescanso = false;
            _ultimoCambioDescansoMillis = ahora;
            notificarCambio(Config::RELE_CANAL_DESCANSO, false, modoEfDe, NAN, NAN, config.descanso.humedadMinima,
                             config.descanso.humedadMaxima, "Apagado de seguridad: ambos DHT de Descanso sin lectura válida");
        }
    } else {
        bool nuevoEstado = _estadoDescanso;
        if (modoEfDe == ModoControl::MANUAL) nuevoEstado = config.descanso.humidificadorManual;
        else if (modoEfDe == ModoControl::TEMPORIZADO) nuevoEstado = config.descanso.temporizadorEncendido;
        else if (!isnan(descanso.humedadPromedio)) {
            if (descanso.humedadPromedio < config.descanso.humedadMinima) nuevoEstado = true;
            else if (descanso.humedadPromedio >= config.descanso.humedadMaxima) nuevoEstado = false;
        }

        if (nuevoEstado != _estadoDescanso) {
            bool puedeConmutar = cambioModoDe || modoEfDe == ModoControl::MANUAL || modoEfDe == ModoControl::TEMPORIZADO ||
                                  (ahora - _ultimoCambioDescansoMillis) >= intervaloMinimoMs;
            if (puedeConmutar && _relayClient->escribirCanal(Config::RELE_CANAL_DESCANSO, nuevoEstado)) {
                _estadoDescanso = nuevoEstado;
                _ultimoCambioDescansoMillis = ahora;
                notificarCambio(Config::RELE_CANAL_DESCANSO, nuevoEstado, modoEfDe, descanso.humedadPromedio,
                                 descanso.temperaturaPromedio, config.descanso.humedadMinima, config.descanso.humedadMaxima);
            }
        }
    }

    _modoAnteriorAtriles = modoEfAt;
    _modoAnteriorDescanso = modoEfDe;

    // Confirmación periódica de estado real del módulo (cada ~10s) — usada por el health-check de OTA.
    if (ahora - _ultimaLecturaEstadoMillis > 10000) {
        _ultimaLecturaEstadoMillis = ahora;
        bool c0, c1;
        _releModuloResponde = _relayClient->leerEstado(c0, c1);
    }
}

void HumidifierController::apagarEmergencia() {
    if (_relayClient->escribirCanal(Config::RELE_CANAL_ATRILES, false)) _estadoAtriles = false;
    if (_relayClient->escribirCanal(Config::RELE_CANAL_DESCANSO, false)) _estadoDescanso = false;
    _ultimoCambioAtrilesMillis = millis();
    _ultimoCambioDescansoMillis = millis();
}

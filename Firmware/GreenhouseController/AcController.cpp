#include "AcController.h"

AcController::AcController(const char* ipAtriles, uint64_t idAtriles, const char* tokenAtriles, const char* keyAtriles,
                            const char* ipDescanso, uint64_t idDescanso, const char* tokenDescanso, const char* keyDescanso)
    : _acAtriles(ipAtriles, idAtriles, tokenAtriles, keyAtriles),
      _acDescanso(ipDescanso, idDescanso, tokenDescanso, keyDescanso) {}

void AcController::inicializar() {
    _acAtriles.begin();
    _acDescanso.begin();
}

void AcController::evaluarZona(MideaLANClient& ac, ConfiguracionZona& config, bool& estadoActual,
                                uint32_t& ultimoCambioMillis, uint32_t intervaloMinimoMs, const char* nombreZona) {
    // Siempre se consulta el estado real (incluso en MANUAL) para reflejar en el dashboard
    // exactamente lo que el equipo está haciendo, sin interferir con su propio control remoto.
    bool consultaOk = ac.actualizarEstado();
    if (!consultaOk) return;

    if (config.aireAcondicionado.modo == ModoControlAc::MANUAL) {
        // MANUAL: el sistema NUNCA envía órdenes, solo refleja lo que ya reportó actualizarEstado().
        estadoActual = ac.obtenerPower();
        return;
    }

    // AUTO: histéresis simple sobre temperatura interior real reportada por el equipo.
    uint32_t ahora = millis();
    float interior = ac.obtenerTemperaturaInterior();
    if (isnan(interior)) return; // sin lectura válida, no tomar decisiones esta vuelta

    bool nuevoEstado = estadoActual;
    if (interior >= config.aireAcondicionado.temperaturaMaxima) nuevoEstado = true;
    else if (interior <= config.aireAcondicionado.temperaturaMinima) nuevoEstado = false;

    if (nuevoEstado != estadoActual && (ahora - ultimoCambioMillis) >= intervaloMinimoMs) {
        ac.establecerTemperatura((config.aireAcondicionado.temperaturaMinima + config.aireAcondicionado.temperaturaMaxima) / 2.0f);
        ac.establecerModo(2); // Cool
        ac.encender(nuevoEstado);
        estadoActual = nuevoEstado;
        ultimoCambioMillis = ahora;

        if (_notificador) {
            String msg = String("Aire acondicionado ") + nombreZona + " " + (nuevoEstado ? "ENCENDIDO" : "APAGADO") +
                         " | Temp. interior: " + String(interior, 1) + "C";
            _notificador->registrarAlerta(nuevoEstado ? "AC_ON" : "AC_OFF", "INFO", msg);
            _notificador->registrarLog("AC", "INFO", msg);
        }
    }
}

void AcController::actualizarControl(ConfiguracionZona& configAtriles, ConfiguracionZona& configDescanso,
                                      uint32_t intervaloConmutacionMinimoSeg) {
    uint32_t intervaloMs = intervaloConmutacionMinimoSeg * 1000UL;
    evaluarZona(_acAtriles, configAtriles, _estadoAtriles, _ultimoCambioAtrilesMillis, intervaloMs, "Atriles");
    evaluarZona(_acDescanso, configDescanso, _estadoDescanso, _ultimoCambioDescansoMillis, intervaloMs, "Descanso");
}

static EstadoDetalladoAC construirEstado(const MideaLANClient& ac, bool conectado) {
    EstadoDetalladoAC e;
    e.power = ac.obtenerPower();
    e.temperaturaObjetivo = ac.obtenerTemperaturaObjetivo();
    e.temperaturaInterior = ac.obtenerTemperaturaInterior();
    e.comunicacionOk = conectado;
    uint8_t m = ac.obtenerModo();
    e.modoFisico = (m >= 1 && m <= 5) ? m : 1;
    uint8_t f = ac.obtenerVentilador();
    e.velocidadVentilador = f;
    return e;
}

EstadoDetalladoAC AcController::obtenerEstadoAtriles() const { return construirEstado(_acAtriles, _acAtriles.estaConectado()); }
EstadoDetalladoAC AcController::obtenerEstadoDescanso() const { return construirEstado(_acDescanso, _acDescanso.estaConectado()); }

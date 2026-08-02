/**
 * @file AcController.h
 * @description Control de los aires acondicionados Midea/Khöne de ambas zonas. Solo dos modos
 * (AUTO/MANUAL, sin TEMPORIZADO — decisión explícita del usuario, el AC no comparte horario con
 * el humidificador). En MANUAL el sistema NUNCA envía órdenes, solo consulta el estado del
 * equipo para mostrarlo en el dashboard (el usuario controla el AC con su propio control remoto).
 */
#ifndef ACCONTROLLER_H
#define ACCONTROLLER_H

#include "MideaLANClient.h"
#include "INotificadorEventos.h"
#include "Types.h"

class AcController {
public:
    AcController(const char* ipAtriles, uint64_t idAtriles, const char* tokenAtriles, const char* keyAtriles,
                 const char* ipDescanso, uint64_t idDescanso, const char* tokenDescanso, const char* keyDescanso);

    void inicializar();
    void establecerNotificador(INotificadorEventos* notificador) { _notificador = notificador; }

    /** Llamar cada ciclo (~5-10s, no más seguido: el protocolo LAN de Midea es relativamente lento). */
    void actualizarControl(ConfiguracionZona& configAtriles, ConfiguracionZona& configDescanso,
                            uint32_t intervaloConmutacionMinimoSeg);

    EstadoDetalladoAC obtenerEstadoAtriles() const;
    EstadoDetalladoAC obtenerEstadoDescanso() const;
    bool comunicacionOkAtriles() const { return _acAtriles.estaConectado(); }
    bool comunicacionOkDescanso() const { return _acDescanso.estaConectado(); }

private:
    MideaLANClient _acAtriles;
    MideaLANClient _acDescanso;
    INotificadorEventos* _notificador = nullptr;

    bool _estadoAtriles = false, _estadoDescanso = false;
    uint32_t _ultimoCambioAtrilesMillis = 0, _ultimoCambioDescansoMillis = 0;

    void evaluarZona(MideaLANClient& ac, ConfiguracionZona& config, bool& estadoActual,
                      uint32_t& ultimoCambioMillis, uint32_t intervaloMinimoMs, const char* nombreZona);
};

#endif // ACCONTROLLER_H

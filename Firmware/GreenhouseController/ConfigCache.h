/**
 * @file ConfigCache.h
 * @description Persistencia de la configuración en NVS (memoria no volátil) para que el
 * ESP32 arranque de forma autónoma sin depender del backend. El servidor SIEMPRE tiene
 * prioridad cuando hay conexión (decisión explícita del usuario: no se comparan versiones).
 */
#ifndef CONFIGCACHE_H
#define CONFIGCACHE_H

#include <Preferences.h>
#include "Types.h"

class ConfigCache {
public:
    void inicializar();
    void guardarConfiguracion(const ConfiguracionSistema& config);
    bool cargarConfiguracion(ConfiguracionSistema& config);

private:
    Preferences _prefs;
    static constexpr const char* NAMESPACE = "shiitake";
    static constexpr const char* CLAVE_CONFIG = "cfg_json";
};

#endif // CONFIGCACHE_H

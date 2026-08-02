#ifndef WIFIMANAGER_H
#define WIFIMANAGER_H

#include <WiFi.h>

class WiFiManagerHelper {
public:
    WiFiManagerHelper(const char* ssid, const char* password);
    void inicializar();
    void procesarConexion();
    bool estaConectado() const;
    int obtenerRssi() const;
    String obtenerSsid() const;

private:
    const char* _ssid;
    const char* _password;
    uint32_t _ultimoIntentoMillis = 0;
    static constexpr uint32_t INTERVALO_RECONEXION_MS = 15000;
};

#endif // WIFIMANAGER_H

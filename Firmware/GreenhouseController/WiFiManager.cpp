#include "WiFiManager.h"

WiFiManagerHelper::WiFiManagerHelper(const char* ssid, const char* password) : _ssid(ssid), _password(password) {}

void WiFiManagerHelper::inicializar() {
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    _ultimoIntentoMillis = 0;
    Serial.printf("[WIFI] Conectando a SSID: %s\n", _ssid);
    procesarConexion();
}

void WiFiManagerHelper::procesarConexion() {
    bool conectadoAhora = (WiFi.status() == WL_CONNECTED);
    if (conectadoAhora && !_estabaConectado) {
        Serial.printf("[WIFI] Conectado a '%s' | IP: %s | RSSI: %d dBm\n",
                      WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
    } else if (!conectadoAhora && _estabaConectado) {
        Serial.println("[WIFI] Conexión perdida, reintentando...");
    }
    _estabaConectado = conectadoAhora;

    if (conectadoAhora) return;

    uint32_t ahora = millis();
    if (ahora - _ultimoIntentoMillis >= INTERVALO_RECONEXION_MS || _ultimoIntentoMillis == 0) {
        _ultimoIntentoMillis = ahora;
        Serial.println("[WIFI] Intentando conectar...");
        WiFi.disconnect(true);
        delay(100);
        WiFi.mode(WIFI_STA);
        delay(100);
        WiFi.begin(_ssid, _password);
    }
}

bool WiFiManagerHelper::estaConectado() const { return WiFi.status() == WL_CONNECTED; }
int WiFiManagerHelper::obtenerRssi() const { return estaConectado() ? WiFi.RSSI() : -100; }
String WiFiManagerHelper::obtenerSsid() const { return estaConectado() ? WiFi.SSID() : String("Desconectado"); }

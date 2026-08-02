/**
 * @file MideaLANClient.h
 * @description Cliente TCP local (protocolo Midea/Khöne V3, LAN, puerto 6444) reescrito desde
 * cero para Shiitake-Lindo V2. El protocolo en sí (handshake AES-CBC de 256 bits + comandos
 * AES-ECB de 128 bits + firma MD5, ya reverse-engineered en el proyecto anterior) se conserva
 * porque es conocimiento de hardware válido y no depende de nada del código viejo — se
 * reimplementa la clase completa sin copiar archivos, con nombres y estructura propios de V2.
 *
 * Nota de alcance: no hay reserva DHCP posible para estos equipos (confirmado con el usuario),
 * así que igual que el sistema anterior, la IP se configura de forma estática en Config.h. Si el
 * router le asigna otra IP al AC, hay que actualizarla manualmente — implementar discovery UDP
 * real por Device ID queda para v1.1 (no es prioritario: el usuario marcó el control de AC como
 * lo único no crítico para hoy).
 */
#ifndef MIDEALANCLIENT_H
#define MIDEALANCLIENT_H

#include <Arduino.h>
#include <WiFiClient.h>
#include <mbedtls/aes.h>
#include <mbedtls/md5.h>
#include <mbedtls/sha256.h>

class MideaLANClient {
public:
    MideaLANClient(const char* ip, uint64_t deviceId, const char* tokenHex, const char* keyHex);

    bool begin();
    bool estaConectado() { return _cliente.connected() && _autenticado; }

    bool encender(bool on);
    bool establecerTemperatura(float temp);
    bool establecerModo(uint8_t modo);   // 1 Auto, 2 Cool, 3 Dry, 4 Heat, 5 Fan
    bool establecerVentilador(uint8_t v); // 102 Auto, 80 High, 60 Medium, 40 Low
    bool actualizarEstado();             // consulta al equipo y refresca los getters

    bool obtenerPower() const { return _power; }
    float obtenerTemperaturaObjetivo() const { return _temperaturaObjetivo; }
    float obtenerTemperaturaInterior() const { return _temperaturaInterior; }
    uint8_t obtenerModo() const { return _modo; }
    uint8_t obtenerVentilador() const { return _ventilador; }

private:
    String _ip;
    uint16_t _puerto = 6444;
    uint64_t _deviceId;
    uint8_t _token[64] = { 0 };
    uint8_t _key[32] = { 0 };

    bool _power = false;
    float _temperaturaObjetivo = 24.0f;
    float _temperaturaInterior = NAN;
    uint8_t _modo = 1;
    uint8_t _ventilador = 102;

    WiFiClient _cliente;
    uint8_t _claveSesionTcp[32] = { 0 };
    bool _autenticado = false;
    uint16_t _idPaquete = 1;

    bool conectarYAutenticar();
    bool enviarHandshake();
    bool leerRespuestaHandshake();
    bool enviarComandoCifrado(const uint8_t* comando, size_t longitud);
    bool leerRespuestaCifrada(uint8_t* buffer, size_t& longitudSalida);

    void cifrarAesCbc(const uint8_t* clave, const uint8_t* datos, size_t len, uint8_t* salida);
    void descifrarAesCbc(const uint8_t* clave, const uint8_t* datos, size_t len, uint8_t* salida);
    void cifrarAesEcb(const uint8_t* datos, size_t len, uint8_t* salida);
    void calcularMd5(const uint8_t* datos, size_t len, uint8_t* hash);
    void calcularSha256(const uint8_t* datos, size_t len, uint8_t* hash);
    size_t construirPaqueteV2(const uint8_t* comando, size_t len, uint8_t* salida);
};

#endif // MIDEALANCLIENT_H

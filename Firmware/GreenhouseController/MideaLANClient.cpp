#include "MideaLANClient.h"
#include <string.h>

// Llaves estáticas del protocolo Midea V2/V3 (públicas en el ecosistema de integraciones LAN
// Midea, no son secretas del usuario — igual que en cualquier implementación de este protocolo).
static const uint8_t LLAVE_FIRMA[] = "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S";
static const uint8_t LLAVE_CIFRADO_V2[16] = {
    0xcb, 0x85, 0x99, 0x7e, 0x1e, 0xc5, 0xfb, 0xde,
    0x3f, 0xc1, 0xec, 0xc1, 0xe6, 0xcb, 0xa4, 0xa6
}; // MD5(LLAVE_FIRMA)

static void hexAbytes(const char* hex, uint8_t* bytes, size_t longitud) {
    for (size_t i = 0; i < longitud; i++) sscanf(hex + 2 * i, "%2hhx", &bytes[i]);
}

MideaLANClient::MideaLANClient(const char* ip, uint64_t deviceId, const char* tokenHex, const char* keyHex)
    : _ip(ip), _deviceId(deviceId) {
    _cliente.setTimeout(1500);
    if (tokenHex && strlen(tokenHex) >= 128) hexAbytes(tokenHex, _token, 64);
    if (keyHex && strlen(keyHex) >= 64) hexAbytes(keyHex, _key, 32);
}

bool MideaLANClient::begin() { return conectarYAutenticar(); }

bool MideaLANClient::conectarYAutenticar() {
    if (_cliente.connected()) _cliente.stop();
    _autenticado = false;

    if (!_cliente.connect(_ip.c_str(), _puerto)) return false;
    _cliente.setTimeout(2);

    if (!enviarHandshake()) return false;
    if (!leerRespuestaHandshake()) return false;

    _autenticado = true;
    return true;
}

bool MideaLANClient::enviarHandshake() {
    uint8_t payload[66];
    payload[0] = (_idPaquete >> 8) & 0xFF;
    payload[1] = _idPaquete & 0xFF;
    memcpy(payload + 2, _token, 64);

    uint8_t header[6] = { 0x83, 0x70, 0, 0, 0x20, 0x00 };
    uint16_t tam = 66;
    header[2] = (tam >> 8) & 0xFF;
    header[3] = tam & 0xFF;

    _cliente.write(header, 6);
    _cliente.write(payload, 66);
    _idPaquete++;
    return true;
}

bool MideaLANClient::leerRespuestaHandshake() {
    uint32_t inicio = millis();
    while (_cliente.available() < 72 && millis() - inicio < 3000) delay(10);
    if (_cliente.available() < 72) return false;

    uint8_t buffer[128];
    _cliente.read(buffer, sizeof(buffer));
    if (buffer[0] != 0x83 || buffer[1] != 0x70 || buffer[4] != 0x20) return false;
    if ((buffer[5] & 0x0F) != 1) return false; // 1 = HANDSHAKE_RESPONSE

    uint8_t payload[64];
    memcpy(payload, buffer + 8, 64);

    uint8_t cifrado[32], hashRecibido[32], descifrado[32], hashCalculado[32];
    memcpy(cifrado, payload, 32);
    memcpy(hashRecibido, payload + 32, 32);
    descifrarAesCbc(_key, cifrado, 32, descifrado);
    calcularSha256(descifrado, 32, hashCalculado);
    if (memcmp(hashCalculado, hashRecibido, 32) != 0) return false;

    for (int i = 0; i < 32; i++) _claveSesionTcp[i] = descifrado[i] ^ _key[i];
    return true;
}

size_t MideaLANClient::construirPaqueteV2(const uint8_t* comando, size_t len, uint8_t* salida) {
    size_t relleno = 16 - (len % 16);
    size_t lenConRelleno = len + relleno;
    uint8_t comandoConRelleno[256];
    memcpy(comandoConRelleno, comando, len);
    for (size_t i = 0; i < relleno; i++) comandoConRelleno[len + i] = relleno;

    uint8_t comandoCifrado[256];
    cifrarAesEcb(comandoConRelleno, lenConRelleno, comandoCifrado);

    size_t v2Len = 40 + lenConRelleno + 16;
    memset(salida, 0, v2Len);
    salida[0] = 0x5A; salida[1] = 0x5A; salida[2] = 0x01; salida[3] = 0x11;
    salida[4] = v2Len & 0xFF; salida[5] = (v2Len >> 8) & 0xFF;
    salida[6] = 0x20; salida[7] = 0x00;

    // Timestamp fijo (no crítico para el protocolo, el equipo no lo valida estrictamente).
    uint8_t ts[8] = { 20, 1, 1, 0, 0, 0, 0, 0 };
    memcpy(salida + 12, ts, 8);

    for (int i = 0; i < 8; i++) salida[20 + i] = (_deviceId >> (8 * i)) & 0xFF;
    memcpy(salida + 40, comandoCifrado, lenConRelleno);

    uint8_t bufferHash[512];
    size_t lenAHashear = v2Len - 16;
    memcpy(bufferHash, salida, lenAHashear);
    memcpy(bufferHash + lenAHashear, LLAVE_FIRMA, 36);
    uint8_t md5[16];
    calcularMd5(bufferHash, lenAHashear + 36, md5);
    memcpy(salida + 40 + lenConRelleno, md5, 16);

    return v2Len;
}

bool MideaLANClient::enviarComandoCifrado(const uint8_t* comando, size_t longitud) {
    if (!estaConectado() && !conectarYAutenticar()) return false;

    uint8_t paqueteV2[256];
    size_t v2Len = construirPaqueteV2(comando, longitud, paqueteV2);

    size_t resto = (v2Len + 2) % 16;
    size_t relleno = resto == 0 ? 0 : 16 - resto;
    size_t lenPayload = v2Len + relleno + 2;

    uint8_t payload[256];
    payload[0] = (_idPaquete >> 8) & 0xFF;
    payload[1] = _idPaquete & 0xFF;
    memcpy(payload + 2, paqueteV2, v2Len);
    memset(payload + 2 + v2Len, 0, relleno);

    size_t longitudTotal = lenPayload + 32;
    uint8_t header[6] = { 0x83, 0x70, 0, 0, 0x20, (uint8_t)((relleno << 4) | 0x06) };
    header[2] = (longitudTotal >> 8) & 0xFF;
    header[3] = longitudTotal & 0xFF;

    uint8_t payloadCifrado[256];
    cifrarAesCbc(_claveSesionTcp, payload, lenPayload, payloadCifrado);

    uint8_t bufferHash[512];
    memcpy(bufferHash, header, 6);
    memcpy(bufferHash + 6, payload, lenPayload);
    uint8_t hash[32];
    calcularSha256(bufferHash, 6 + lenPayload, hash);

    _cliente.write(header, 6);
    _cliente.write(payloadCifrado, lenPayload);
    _cliente.write(hash, 32);
    _idPaquete++;
    return true;
}

bool MideaLANClient::leerRespuestaCifrada(uint8_t* buffer, size_t& longitudSalida) {
    if (!_cliente.connected()) return false;
    uint32_t inicio = millis();
    while (!_cliente.available() && millis() - inicio < 1500) delay(10);
    if (!_cliente.available()) return false;

    uint8_t header[6];
    if (_cliente.read(header, 6) != 6) return false;
    if (header[0] != 0x83 || header[1] != 0x70) return false;

    size_t largoPaquete = (header[2] << 8) | header[3];
    if (largoPaquete < 32 || largoPaquete > 512) return false;
    size_t largoPayload = largoPaquete - 32;

    uint8_t payloadCifrado[512];
    size_t leidos = 0;
    while (leidos < largoPayload && millis() - inicio < 2000) {
        if (_cliente.available()) payloadCifrado[leidos++] = _cliente.read();
        else delay(5);
    }
    if (leidos != largoPayload) return false;

    uint8_t hashEsperado[32];
    leidos = 0;
    while (leidos < 32 && millis() - inicio < 2000) {
        if (_cliente.available()) hashEsperado[leidos++] = _cliente.read();
        else delay(5);
    }

    descifrarAesCbc(_claveSesionTcp, payloadCifrado, largoPayload, buffer);
    longitudSalida = largoPayload;
    return true;
}

void MideaLANClient::cifrarAesCbc(const uint8_t* clave, const uint8_t* datos, size_t len, uint8_t* salida) {
    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    mbedtls_aes_setkey_enc(&aes, clave, 256);
    uint8_t iv[16] = { 0 };
    mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_ENCRYPT, len, iv, datos, salida);
    mbedtls_aes_free(&aes);
}

void MideaLANClient::descifrarAesCbc(const uint8_t* clave, const uint8_t* datos, size_t len, uint8_t* salida) {
    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    mbedtls_aes_setkey_dec(&aes, clave, 256);
    uint8_t iv[16] = { 0 };
    mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_DECRYPT, len, iv, datos, salida);
    mbedtls_aes_free(&aes);
}

void MideaLANClient::cifrarAesEcb(const uint8_t* datos, size_t len, uint8_t* salida) {
    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    mbedtls_aes_setkey_enc(&aes, LLAVE_CIFRADO_V2, 128);
    for (size_t i = 0; i < len; i += 16) mbedtls_aes_crypt_ecb(&aes, MBEDTLS_AES_ENCRYPT, datos + i, salida + i);
    mbedtls_aes_free(&aes);
}

void MideaLANClient::calcularMd5(const uint8_t* datos, size_t len, uint8_t* hash) {
    mbedtls_md5_context ctx;
    mbedtls_md5_init(&ctx);
    mbedtls_md5_starts(&ctx);
    mbedtls_md5_update(&ctx, datos, len);
    mbedtls_md5_finish(&ctx, hash);
    mbedtls_md5_free(&ctx);
}

void MideaLANClient::calcularSha256(const uint8_t* datos, size_t len, uint8_t* hash) {
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);
    mbedtls_sha256_update(&ctx, datos, len);
    mbedtls_sha256_finish(&ctx, hash);
    mbedtls_sha256_free(&ctx);
}

bool MideaLANClient::encender(bool on) { _power = on; return establecerModo(_modo); }
bool MideaLANClient::establecerTemperatura(float temp) { _temperaturaObjetivo = temp; return establecerModo(_modo); }
bool MideaLANClient::establecerVentilador(uint8_t v) { _ventilador = v; return establecerModo(_modo); }

bool MideaLANClient::establecerModo(uint8_t modo) {
    _modo = modo;
    uint8_t cmd[23] = { 0 };
    cmd[0] = 0xAA; cmd[1] = 0x23; cmd[2] = 0xAC;
    cmd[8] = 0x03; cmd[9] = 0x40; cmd[10] = 0x40;
    cmd[11] = (_power ? 0x01 : 0x00) | (_modo << 5);

    uint8_t byteTemp = ((int)_temperaturaObjetivo - 16) & 0x0F;
    if (_temperaturaObjetivo - (int)_temperaturaObjetivo >= 0.5f) byteTemp |= 0x10;
    cmd[12] = 0x40 | byteTemp;
    cmd[13] = _ventilador;

    uint8_t crc = 0;
    for (int i = 10; i < 22; i++) crc += cmd[i];
    cmd[22] = (~crc) + 1;

    return enviarComandoCifrado(cmd, 23);
}

bool MideaLANClient::actualizarEstado() {
    uint8_t consulta[21] = {
        0xAA, 0x20, 0xAC, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x03, 0x41, 0x81, 0x00, 0xFF, 0x03, 0xFF, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00
    };
    uint8_t crc = 0;
    for (int i = 10; i < 20; i++) crc += consulta[i];
    consulta[20] = (~crc) + 1;

    if (!enviarComandoCifrado(consulta, 21)) return false;

    uint8_t resp[512];
    size_t respLen;
    if (!leerRespuestaCifrada(resp, respLen)) return false;

    uint8_t* trama = nullptr;
    for (size_t i = 2; i + 10 < respLen; i++) {
        if (resp[i] == 0xAA && resp[i + 2] == 0xAC) { trama = &resp[i]; break; }
    }
    if (!trama || trama[10] != 0xC0) return false;

    uint8_t* cuerpo = &trama[11];
    _power = (cuerpo[1] & 0x01) > 0;
    _modo = (cuerpo[1] & 0xE0) >> 5;
    _temperaturaObjetivo = (cuerpo[2] & 0x0F) + 16.0f;
    if (cuerpo[2] & 0x10) _temperaturaObjetivo += 0.5f;
    _ventilador = cuerpo[3] & 0x7F;
    _temperaturaInterior = (cuerpo[11] - 50.0f) / 2.0f;
    if (_temperaturaInterior < -10.0f || _temperaturaInterior > 100.0f) _temperaturaInterior = NAN;

    return true;
}

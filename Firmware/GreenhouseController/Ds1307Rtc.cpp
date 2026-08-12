#include "Ds1307Rtc.h"

Ds1307Rtc::Ds1307Rtc(uint8_t pinSda, uint8_t pinScl) : _pinSda(pinSda), _pinScl(pinScl) {}

uint8_t Ds1307Rtc::bcdADec(uint8_t bcd) { return (bcd >> 4) * 10 + (bcd & 0x0F); }
uint8_t Ds1307Rtc::decABcd(uint8_t dec) { return ((dec / 10) << 4) | (dec % 10); }

bool Ds1307Rtc::leerRegistros(uint8_t registroInicial, uint8_t* buffer, uint8_t cantidad) {
    Wire.beginTransmission(DIRECCION_I2C);
    Wire.write(registroInicial);
    if (Wire.endTransmission(false) != 0) return false; // repeated start — el módulo no respondió
    if (Wire.requestFrom((int)DIRECCION_I2C, (int)cantidad) != cantidad) return false;
    for (uint8_t i = 0; i < cantidad; i++) buffer[i] = Wire.read();
    return true;
}

bool Ds1307Rtc::escribirRegistros(uint8_t registroInicial, const uint8_t* buffer, uint8_t cantidad) {
    Wire.beginTransmission(DIRECCION_I2C);
    Wire.write(registroInicial);
    Wire.write(buffer, cantidad);
    return Wire.endTransmission() == 0;
}

bool Ds1307Rtc::inicializar() {
    Wire.begin(_pinSda, _pinScl);
    Wire.setClock(100000); // DS1307 solo soporta Standard Mode (100kHz), no Fast Mode

    uint8_t segundos;
    if (!leerRegistros(0x00, &segundos, 1)) {
        Serial.println("[RTC] DS1307 no responde en el bus I2C — módulo desconectado o mal cableado.");
        return false;
    }

    // Bit 7 del registro de segundos = CH (Clock Halt). En 1: el oscilador está detenido
    // (batería agotada/nunca tuvo hora puesta) y la hora leída no es confiable.
    _horaValida = !(segundos & 0x80);
    if (!_horaValida) {
        Serial.println("[RTC] DS1307 detectado pero sin hora válida (CH=1) — se ajustará en el próximo sync NTP.");
    }
    return true;
}

bool Ds1307Rtc::horaValida() const {
    return _horaValida;
}

/**
 * Días desde 1970-01-01 hasta una fecha civil dada (algoritmo de Howard Hinnant,
 * days_from_civil) — evita depender de timegm()/mktime(), cuya disponibilidad e interacción con
 * la zona horaria configurada por configTzTime() no conviene asumir acá: el RTC siempre guarda
 * UTC (se calibra con la época UTC de NTP, ver ajustarEpocaUtc), nunca hora local.
 */
static time_t utcDesdeCivil(int anio, int mes, int dia, int hora, int minuto, int segundo) {
    anio -= mes <= 2;
    long era = (anio >= 0 ? anio : anio - 399) / 400;
    unsigned yoe = (unsigned)(anio - era * 400);
    unsigned doy = (153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5 + dia - 1;
    unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    long dias = era * 146097 + (long)doe - 719468;
    return (time_t)dias * 86400L + hora * 3600L + minuto * 60L + segundo;
}

time_t Ds1307Rtc::obtenerEpocaUtc() {
    uint8_t datos[7];
    if (!leerRegistros(0x00, datos, 7)) return 0;

    int segundo = bcdADec(datos[0] & 0x7F);
    int minuto = bcdADec(datos[1] & 0x7F);
    int hora = bcdADec(datos[2] & 0x3F); // formato 24h — bit6 del registro de horas queda en 0 al escribir
    int dia = bcdADec(datos[4] & 0x3F);
    int mes = bcdADec(datos[5] & 0x1F);
    int anio = bcdADec(datos[6]) + 2000; // el DS1307 solo guarda 2 dígitos de año

    return utcDesdeCivil(anio, mes, dia, hora, minuto, segundo);
}

bool Ds1307Rtc::ajustarEpocaUtc(time_t epocaUtc) {
    struct tm t;
    gmtime_r(&epocaUtc, &t); // gmtime_r siempre interpreta/devuelve UTC, sin depender de TZ

    uint8_t datos[7] = {
        decABcd((uint8_t)t.tm_sec),
        decABcd((uint8_t)t.tm_min),
        decABcd((uint8_t)t.tm_hour), // bit6=0 -> formato 24h
        decABcd((uint8_t)(t.tm_wday + 1)), // DS1307: 1-7, struct tm: 0-6 (domingo=0)
        decABcd((uint8_t)t.tm_mday),
        decABcd((uint8_t)(t.tm_mon + 1)),
        decABcd((uint8_t)(t.tm_year + 1900 - 2000)),
    };

    if (!escribirRegistros(0x00, datos, 7)) return false;
    _horaValida = true;
    return true;
}

"use client";

/**
 * @file useRealtimeData.ts
 * @description Hook de React para tiempo real contra el backend nuevo (WebSocket + REST),
 * en reemplazo de la lectura directa a Firebase RTDB del sistema anterior.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch, construirUrlWebSocketNavegador } from "@/lib/api";
import type {
  TelemetriaActual,
  MatrizSensores,
  ConfiguracionSistema,
  Alerta,
  LogSistema,
  MensajeServidorACliente,
  TipoComandoManual,
} from "@shared/types";

const RECONEXION_MS = 3000;

export function useRealtimeData() {
  const [actual, setActual] = useState<TelemetriaActual | null>(null);
  const [sensores, setSensores] = useState<MatrizSensores | null>(null);
  const [configuracion, setConfiguracion] = useState<ConfiguracionSistema | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [sistemaLogs, setSistemaLogs] = useState<LogSistema[]>([]);
  const [conectado, setConectado] = useState(false);
  const [ultimaTelemetriaTs, setUltimaTelemetriaTs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ackPendienteRef = useRef<((ejecutado: boolean, error?: string) => void) | null>(null);

  // Snapshot inicial por REST (config + alertas + logs no dependen del WS para la primera carga).
  useEffect(() => {
    apiFetch<ConfiguracionSistema>("/api/config").then(setConfiguracion).catch(console.error);
    apiFetch<Alerta[]>("/api/alertas").then(setAlertas).catch(console.error);
    apiFetch<LogSistema[]>("/api/logs").then(setSistemaLogs).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelado = false;
    let timeoutReconexion: ReturnType<typeof setTimeout>;

    async function conectar() {
      if (cancelado) return;
      const url = construirUrlWebSocketNavegador();
      if (cancelado) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConectado(true);
      ws.onclose = () => {
        setConectado(false);
        if (!cancelado) timeoutReconexion = setTimeout(conectar, RECONEXION_MS);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (evt) => {
        let mensaje: MensajeServidorACliente;
        try {
          mensaje = JSON.parse(evt.data);
        } catch {
          return;
        }
        switch (mensaje.tipo) {
          case "telemetria":
            setActual(mensaje.datos);
            setUltimaTelemetriaTs(Date.now());
            break;
          case "sensores":
            setSensores(mensaje.datos);
            break;
          case "configuracion":
            setConfiguracion(mensaje.datos);
            break;
          case "alerta":
            setAlertas((prev) => [mensaje.datos, ...prev].slice(0, 500));
            break;
          case "ack":
            ackPendienteRef.current?.(mensaje.datos.ejecutado, mensaje.datos.error);
            ackPendienteRef.current = null;
            break;
        }
      };
    }

    conectar();
    return () => {
      cancelado = true;
      clearTimeout(timeoutReconexion);
      wsRef.current?.close();
    };
  }, []);

  // El controlador está online si llegó telemetría en los últimos 60s (heartbeat normal cada 5-30s).
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const intervalo = setInterval(() => setAhora(Date.now()), 3000);
    return () => clearInterval(intervalo);
  }, []);
  const espOnline = Boolean(ahora !== null && ultimaTelemetriaTs && ahora - ultimaTelemetriaTs <= 60000);

  /**
   * Envía un comando manual y espera la confirmación real del ESP32 (máx. 5s, ver backend).
   * Nunca asume éxito: si no llega ACK a tiempo, el backend igual responde con ejecutado:false.
   */
  const resolverAlerta = useCallback(async (id: string) => {
    await apiFetch(`/api/alertas/${id}/resolver`, { method: "PUT" });
    setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, resuelta: true } : a)));
  }, []);

  const enviarComando = useCallback((comando: TipoComandoManual): Promise<{ ejecutado: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        resolve({ ejecutado: false, error: "Sin conexión con el servidor." });
        return;
      }
      const timeout = setTimeout(() => {
        ackPendienteRef.current = null;
        resolve({ ejecutado: false, error: "Tiempo de espera agotado." });
      }, 6000);
      ackPendienteRef.current = (ejecutado, error) => {
        clearTimeout(timeout);
        resolve({ ejecutado, error });
      };
      wsRef.current.send(JSON.stringify({ tipo: "comando", datos: comando }));
    });
  }, []);

  return { actual, sensores, configuracion, alertas, sistemaLogs, conectado, espOnline, ultimaTelemetriaTs, enviarComando, resolverAlerta };
}

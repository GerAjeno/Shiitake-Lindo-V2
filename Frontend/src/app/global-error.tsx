"use client";

/**
 * @file global-error.tsx
 * @description Capturador de excepciones fatales en el RootLayout de Next.js.
 */

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" className="dark">
      <body style={{ backgroundColor: "#020617", color: "#f1f5f9", fontFamily: "monospace", padding: "32px" }}>
        <div style={{ border: "2px solid #f43f5e", padding: "24px", borderRadius: "12px", backgroundColor: "#1e1b4b" }}>
          <h1 style={{ color: "#fb7185", fontSize: "20px", fontWeight: "bold" }}>EXCEPCIÓN FATAL EN ROOT LAYOUT</h1>
          <p style={{ marginTop: "16px", fontSize: "16px", fontWeight: "bold", backgroundColor: "#0f172a", padding: "12px" }}>
            {error.message || "Error desconocido"}
          </p>
          <pre style={{ marginTop: "16px", fontSize: "12px", overflow: "auto", maxHeight: "400px", color: "#94a3b8" }}>
            {error.stack}
          </pre>
          <button
            onClick={() => reset()}
            style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#e11d48", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}

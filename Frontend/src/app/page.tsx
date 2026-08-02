import { redirect } from "next/navigation";

/**
 * @file page.tsx
 * @description Redirige automáticamente la raíz de la web hacia el dashboard principal de monitoreo.
 */
export default function PageRaiz() {
  redirect("/dashboard");
}

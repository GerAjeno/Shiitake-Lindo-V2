import React from "react";

interface PropsLogo {
  className?: string;
}

/**
 * @component ShiitakeLogo
 * @description Logotipo vectorial SVG de un hongo Shiitake.
 */
export function ShiitakeLogo({ className = "w-6 h-6" }: PropsLogo) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14C19 9 15.87 5 12 5C8.13 5 5 9 5 14H19Z" />
      <path d="M10 14V19C10 20.1 10.9 21 12 21C13.1 21 14 20.1 14 19V14" />
      <circle cx="10" cy="9.5" r="0.75" fill="currentColor" />
      <circle cx="14" cy="9.5" r="0.75" fill="currentColor" />
      <circle cx="12" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

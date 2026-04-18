/**
 * Central frontend configuration.
 *
 * API_BASE_URL is the absolute origin of the backend API server.
 * - VITE_API_BASE_URL env var lets you override it at build time.
 * - Falls back to the deployed production domain so Capacitor / static builds
 *   work out of the box without any extra env setup.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "https://dora-dungeons.replit.app";

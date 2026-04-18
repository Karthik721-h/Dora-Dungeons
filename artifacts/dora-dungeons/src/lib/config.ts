/**
 * Central frontend configuration.
 *
 * API_BASE_URL is the absolute origin of the backend API server.
 *
 * Resolution order:
 *  1. VITE_API_BASE_URL build-time env var (always wins when set)
 *  2. In production / Capacitor builds: hardcoded deployed domain
 *  3. In development: empty string → relative paths routed by the Replit proxy
 *
 * Using an empty string in dev avoids CORS issues (the API only allows
 * localhost origins; the Replit dev domain is not in that list).
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.DEV ? "" : "https://dora-dungeons.replit.app");

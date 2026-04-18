import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// When building for Capacitor (iOS/Android), set VITE_API_BASE_URL to the
// fully-qualified deployed API origin, e.g. https://your-app.replit.app
// On web the env var is absent and customFetch falls back to relative paths
// routed by the Replit proxy, so no change in behaviour.
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
if (apiBase) setBaseUrl(apiBase);

// Attach the stored JWT to every generated API client call automatically.
setAuthTokenGetter(() => localStorage.getItem("dd_jwt"));

createRoot(document.getElementById("root")!).render(<App />);

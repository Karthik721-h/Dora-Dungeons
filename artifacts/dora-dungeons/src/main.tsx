import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/lib/config";
import App from "./App";
import "./index.css";

// Point every generated API client call at the deployed backend.
// Works for both Capacitor (no proxy) and web (same domain, absolute URL is fine).
setBaseUrl(API_BASE_URL);

// Attach the stored JWT to every generated API client call automatically.
setAuthTokenGetter(() => localStorage.getItem("dd_jwt"));

createRoot(document.getElementById("root")!).render(<App />);
